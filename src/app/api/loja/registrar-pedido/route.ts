import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evo.trindadeonline.com.br'

const PAY_LABEL: Record<string, string> = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão' }

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : '55' + digits
}

type OrderItem = { name: string; qty: number; unitPrice: number; modifiers?: { name: string; price: number }[] }
type OrderInfo = {
  items: OrderItem[]
  subtotal: number; deliveryFee: number; total: number
  paymentMethod: string | null; deliveryType: string | null; address: string | null; notes: string | null
}

function itemLines(items: OrderItem[]): string[] {
  const fmt = (n: number) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',')
  return items.map(it => {
    const mods = (it.modifiers || []).map(m => m.name).join(', ')
    return `• ${it.qty}x ${it.name}${mods ? ` (${mods})` : ''} — ${fmt(it.unitPrice * it.qty)}`
  })
}

// Mensagem que o CLIENTE recebe, confirmando o pedido dele.
function buildCustomerMessage(opts: OrderInfo): string {
  const fmt = (n: number) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',')
  const parts = ['🧾 *Pedido recebido!*', '', ...itemLines(opts.items), '', `Subtotal: ${fmt(opts.subtotal)}`]
  if (opts.deliveryFee > 0) parts.push(`Taxa de entrega: ${fmt(opts.deliveryFee)}`)
  parts.push(`*Total: ${fmt(opts.total)}*`, '')
  if (opts.paymentMethod) parts.push(`💳 Pagamento: ${PAY_LABEL[opts.paymentMethod] || opts.paymentMethod}`)
  parts.push(opts.deliveryType === 'entrega' && opts.address ? `🚚 Entrega: ${opts.address}` : '🏪 Retirada no local')
  if (opts.notes) parts.push(`📝 Obs: ${opts.notes}`)
  parts.push('', 'Assim que confirmarmos, te avisamos por aqui!')
  return parts.join('\n')
}

// Mensagem que a LOJA recebe (no WhatsApp de verdade, além da notificação
// no app) — precisa dizer quem pediu, já que essa parte some na versão
// que vai pro cliente.
function buildOwnerMessage(opts: OrderInfo & { customerName: string; customerPhone: string | null }): string {
  const fmt = (n: number) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',')
  const parts = [
    '🔔 *Novo pedido!*',
    `👤 ${opts.customerName}${opts.customerPhone ? ` · ${opts.customerPhone}` : ''}`,
    '',
    ...itemLines(opts.items),
    '',
    `*Total: ${fmt(opts.total)}*`,
  ]
  if (opts.paymentMethod) parts.push(`💳 ${PAY_LABEL[opts.paymentMethod] || opts.paymentMethod}`)
  parts.push(opts.deliveryType === 'entrega' && opts.address ? `🚚 Entrega: ${opts.address}` : '🏪 Retirada no local')
  if (opts.notes) parts.push(`📝 Obs: ${opts.notes}`)
  return parts.join('\n')
}

// Chamado (fire-and-forget) logo após um pedido ser criado no cardápio público
// ou lançado avulso no painel. Roda com service role porque o cliente final não
// tem permissão de escrita em crm_contacts/loja_produtos (RLS restringe ao dono).
export async function POST(req: NextRequest) {
  try {
    const {
      companyId, phone, name, address, total, items,
      subtotal, deliveryFee, paymentMethod, deliveryType, notes,
    } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'companyId obrigatório' }, { status: 400 })

    if (phone) {
      const { data: existing } = await supabase
        .from('crm_contacts').select('total_orders, total_spent, address')
        .eq('company_id', companyId).eq('phone', phone).maybeSingle()
      await supabase.from('crm_contacts').upsert({
        company_id: companyId, phone, name: name || null,
        address: address || existing?.address || null,
        last_purchase_at: new Date().toISOString(),
        total_orders: (existing?.total_orders || 0) + 1,
        total_spent: Number(existing?.total_spent || 0) + Number(total || 0),
      }, { onConflict: 'company_id,phone' })
    }

    if (Array.isArray(items)) {
      for (const it of items) {
        if (!it?.produtoId || !it?.qty) continue
        const { data: prod } = await supabase.from('loja_produtos').select('total_pedidos').eq('id', it.produtoId).maybeSingle()
        if (prod) await supabase.from('loja_produtos').update({ total_pedidos: (prod.total_pedidos || 0) + Number(it.qty) }).eq('id', it.produtoId)
      }
    }

    // Confirmação do pedido por WhatsApp de verdade — só quando a loja tem o
    // CRM ativo e conectado, e a gente recebeu os itens com nome/preço (o
    // avulso, o pedido pela conversa e o checkout público mandam isso;
    // chamadas antigas sem esses campos simplesmente pulam essa parte, sem
    // quebrar o resto da rota).
    if (Array.isArray(items) && items.length > 0 && items.every((it: any) => it.name && it.unitPrice != null)) {
      const { data: company } = await supabase.from('companies').select('owner_id, crm_whatsapp_enabled').eq('id', companyId).maybeSingle()
      if (company?.crm_whatsapp_enabled) {
        const { data: instance } = await supabase
          .from('crm_whatsapp_instances').select('instance_name, api_key')
          .eq('company_id', companyId).eq('status', 'connected').limit(1).maybeSingle()
        if (instance) {
          const orderInfo = {
            items, subtotal: Number(subtotal ?? total ?? 0), deliveryFee: Number(deliveryFee || 0), total: Number(total || 0),
            paymentMethod: paymentMethod || null, deliveryType: deliveryType || null, address: address || null, notes: notes || null,
          }

          // Pro cliente — vira mensagem na conversa do CRM também.
          if (phone) {
            try {
              const text = buildCustomerMessage(orderInfo)
              await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(instance.instance_name)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: instance.api_key },
                body: JSON.stringify({ number: formatPhone(phone), text }),
              })
              const { data: contact } = await supabase.from('crm_contacts').select('id').eq('company_id', companyId).eq('phone', phone).maybeSingle()
              if (contact) {
                await supabase.from('crm_messages').insert({
                  company_id: companyId, contact_id: contact.id, direction: 'out', body: text, status: 'sent', sent_at: new Date().toISOString(),
                })
                await supabase.from('crm_contacts').update({
                  last_message_at: new Date().toISOString(), last_message_preview: text, last_message_direction: 'out',
                }).eq('id', contact.id)
              }
            } catch {}
          }

          // Pro WhatsApp da própria loja (número pessoal do dono cadastrado
          // no perfil) — assim o pedido chega no WhatsApp de verdade, não só
          // como notificação dentro do app.
          try {
            const { data: owner } = company.owner_id
              ? await supabase.from('profiles').select('phone').eq('id', company.owner_id).maybeSingle()
              : { data: null }
            if (owner?.phone) {
              const ownerText = buildOwnerMessage({ ...orderInfo, customerName: name || 'Cliente', customerPhone: phone || null })
              await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(instance.instance_name)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: instance.api_key },
                body: JSON.stringify({ number: formatPhone(owner.phone), text: ownerText }),
              })
            }
          } catch {}
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'falha ao registrar' }, { status: 500 })
  }
}
