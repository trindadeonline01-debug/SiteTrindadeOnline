import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { moduleActive } from '@/lib/modules'
import { normalizePhone } from '@/lib/phone'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evo.trindadeonline.com.br'

const PAY_LABEL: Record<string, string> = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão' }

type OrderItem = { name: string; qty: number; unitPrice: number; modifiers?: { name: string; price: number }[] }
type OrderInfo = {
  items: OrderItem[]
  subtotal: number; deliveryFee: number; total: number
  paymentMethod: string | null; deliveryType: string | null; address: string | null; notes: string | null
  orderNumber: number | string | null
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
  const parts = ['🧾 *Pedido recebido!*']
  if (opts.orderNumber != null) parts.push(`📦 Pedido nº ${opts.orderNumber}`)
  parts.push('', ...itemLines(opts.items), '', `Subtotal: ${fmt(opts.subtotal)}`)
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
    ...(opts.orderNumber != null ? [`📦 Pedido nº ${opts.orderNumber}`] : []),
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
      companyId, pedidoId, phone: rawPhone, name, address, total, items,
      subtotal, deliveryFee, paymentMethod, deliveryType, notes,
    } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'companyId obrigatório' }, { status: 400 })
    const phone = rawPhone ? normalizePhone(rawPhone) : null

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

    // Contador "total_pedidos" de cada produto — antes fazia 1 leitura + 1
    // gravação POR ITEM, em sequência (pedido de 5 itens = 10 idas ao banco
    // uma esperando a outra, achado numa auditoria de performance, set/2026).
    // Agora: 1 leitura só (todos os produtos de uma vez) + gravações em
    // paralelo. Soma as quantidades por produto antes de ler — se o mesmo
    // produto aparecer 2x no carrinho (variações diferentes), sem isso as
    // duas gravações partiriam do mesmo valor lido e uma pisaria na outra.
    if (Array.isArray(items)) {
      const qtyByProduto = new Map<string, number>()
      for (const it of items) {
        if (!it?.produtoId || !it?.qty) continue
        qtyByProduto.set(it.produtoId, (qtyByProduto.get(it.produtoId) || 0) + Number(it.qty))
      }
      if (qtyByProduto.size > 0) {
        const { data: produtos } = await supabase.from('loja_produtos').select('id, total_pedidos').in('id', [...qtyByProduto.keys()])
        await Promise.all((produtos || []).map(p =>
          supabase.from('loja_produtos').update({ total_pedidos: (p.total_pedidos || 0) + (qtyByProduto.get(p.id) || 0) }).eq('id', p.id)
        ))
      }
    }

    // Confirmação do pedido por WhatsApp de verdade — só quando a loja tem o
    // CRM ativo e conectado, e a gente recebeu os itens com nome/preço (o
    // avulso, o pedido pela conversa e o checkout público mandam isso;
    // chamadas antigas sem esses campos simplesmente pulam essa parte, sem
    // quebrar o resto da rota).
    if (Array.isArray(items) && items.length > 0 && items.every((it: any) => it.name && it.unitPrice != null)) {
      const { data: company } = await supabase.from('companies').select('owner_id, crm_whatsapp_enabled, trial_modules_until').eq('id', companyId).maybeSingle()
      if (company && moduleActive(company.crm_whatsapp_enabled, company.trial_modules_until)) {
        const { data: instance } = await supabase
          .from('crm_whatsapp_instances').select('instance_name, api_key')
          .eq('company_id', companyId).eq('status', 'connected').limit(1).maybeSingle()
        if (instance) {
          const { data: pedidoRow } = pedidoId
            ? await supabase.from('loja_pedidos').select('order_number').eq('id', pedidoId).maybeSingle()
            : { data: null }
          const orderInfo = {
            items, subtotal: Number(subtotal ?? total ?? 0), deliveryFee: Number(deliveryFee || 0), total: Number(total || 0),
            paymentMethod: paymentMethod || null, deliveryType: deliveryType || null, address: address || null, notes: notes || null,
            orderNumber: pedidoRow?.order_number ?? null,
          }

          // Pro cliente — vira mensagem na conversa do CRM também. Erro aqui
          // era engolido em silêncio (`catch {}`) — sem log nenhum não dava
          // pra saber se a confirmação não chegava porque falhou de verdade
          // (Evolution fora do ar, número errado) ou porque nunca tentou
          // (achado do Ricardo, set/2026 — Crepe Cone com CRM conectado e
          // módulo ativo, mas confirmação nunca registrada em crm_messages).
          if (phone) {
            try {
              const text = buildCustomerMessage(orderInfo)
              const res = await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(instance.instance_name)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: instance.api_key },
                body: JSON.stringify({ number: phone, text }),
              })
              if (!res.ok) {
                const body = await res.text().catch(() => '')
                console.error(`[registrar-pedido] confirmação pro cliente falhou (${res.status}): ${body.slice(0, 300)}`)
              } else {
                const { data: contact } = await supabase.from('crm_contacts').select('id').eq('company_id', companyId).eq('phone', phone).maybeSingle()
                if (contact) {
                  await supabase.from('crm_messages').insert({
                    company_id: companyId, contact_id: contact.id, direction: 'out', body: text, status: 'sent', sent_at: new Date().toISOString(),
                  })
                  await supabase.from('crm_contacts').update({
                    last_message_at: new Date().toISOString(), last_message_preview: text, last_message_direction: 'out',
                  }).eq('id', contact.id)
                }
              }
            } catch (err: any) {
              console.error('[registrar-pedido] falha ao chamar Evolution API (cliente):', err?.message || err)
            }
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
              const res = await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(instance.instance_name)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: instance.api_key },
                body: JSON.stringify({ number: normalizePhone(owner.phone), text: ownerText }),
              })
              if (!res.ok) {
                const body = await res.text().catch(() => '')
                console.error(`[registrar-pedido] aviso pro dono falhou (${res.status}): ${body.slice(0, 300)}`)
              }
            }
          } catch (err: any) {
            console.error('[registrar-pedido] falha ao chamar Evolution API (dono):', err?.message || err)
          }
        }
      }
    }

    // Chama o motoboy da PLATAFORMA (Trindade Entrega), quando a loja usa
    // esse módulo — roda por último e isolado (import dinâmico) de propósito.
    // Achado nesta rodada: essa chamada estava importada no topo do arquivo
    // (`import { criarEntregaEChamarMotoboy } from '@/lib/entregaDispatch'`),
    // e entregaDispatch.ts importa `sharp` (binário nativo) pra recortar a
    // foto da loja na oferta pro motoboy. Desde que esse import entrou aqui
    // (04/09), a confirmação de pedido por WhatsApp parou de sair — pra
    // NENHUMA loja, entrega ou não — indício forte de que o carregamento do
    // módulo falhava e derrubava a function inteira antes de chegar no bloco
    // acima (mesma família de crash já documentada no opengraph-image.tsx,
    // KNOWLEDGE_BASE.md §10). Import dinâmico + try/catch aqui garante que,
    // se esse módulo falhar de novo, só ele quebra — o resto da rota (que já
    // rodou acima) não é afetado.
    // Chavinha por empresa (Admin → Pedidos) — quem já tem motoboy próprio
    // pode desligar a chamada automática da plataforma sem perder o botão
    // manual "🏍️ Chamar motoboy" do card do pedido, que continua igual
    // (chama criarEntregaEChamarMotoboy direto por /api/entrega/criar, sem
    // passar por aqui). Pedido do Ricardo, set/2026.
    const { data: autoConfig } = await supabase.from('companies').select('entrega_chamada_automatica, owner_id').eq('id', companyId).maybeSingle()
    if (deliveryType === 'entrega' && address && pedidoId && autoConfig?.entrega_chamada_automatica !== false) {
      try {
        const { criarEntregaEChamarMotoboy } = await import('@/lib/entregaDispatch')
        const dispatch = await criarEntregaEChamarMotoboy({
          companyId, pedidoId, customerName: name || 'Cliente', customerPhone: phone, dropoffAddress: address,
        })
        // `dispatch.ok === false` (sem crédito, sem diária, área fora de
        // alcance etc.) era engolido em silêncio — o pedido saía normal, mas
        // nenhum motoboy era chamado e ninguém sabia (achado real, set/2026:
        // pedido de entrega da Fabiana na EMPADAY sem diária disponível na
        // carteira — sumiu sem aviso pra ninguém). Push pro dono avisa na
        // hora que precisa chamar manualmente ou comprar diária/crédito.
        if (!dispatch.ok && autoConfig?.owner_id) {
          const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.trindadeonline.com.br'
          fetch(`${site}/api/push/send`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: '⚠️ Motoboy não chamado',
              body: `Pedido de ${name || 'cliente'} com entrega: ${dispatch.error}`,
              target: 'external_user_id', userId: autoConfig.owner_id, url: `${site}/painel/entrega`,
            }),
          }).catch(() => {})
        }
      } catch (err: any) {
        console.error('[registrar-pedido] falha ao chamar motoboy da plataforma:', err?.message || err)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[registrar-pedido] falha geral:', err?.message || err)
    return NextResponse.json({ error: 'falha ao registrar' }, { status: 500 })
  }
}
