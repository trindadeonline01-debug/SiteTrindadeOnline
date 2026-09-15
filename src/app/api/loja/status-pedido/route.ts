import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { moduleActive } from '@/lib/modules'
import { normalizePhone } from '@/lib/phone'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evo.trindadeonline.com.br'

type Status = 'recebido' | 'em_preparo' | 'pronto' | 'saiu_entrega' | 'entregue' | 'cancelado'
const PAY_LABEL: Record<string, string> = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão' }
function money(n: number) { return 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',') }

function buildStatusMessage(status: Status, deliveryType: string | null): string | null {
  // Servidor roda em UTC (Vercel) — sem timeZone explícito aqui a mensagem
  // saía com a hora certa em Londres, não na Trindade.
  const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
  switch (status) {
    case 'em_preparo': return '👨‍🍳 Seu pedido já está em preparo!'
    case 'pronto': return deliveryType === 'retirada' ? '✅ Seu pedido está pronto! Pode vir retirar.' : '✅ Seu pedido está pronto e já vai sair para entrega!'
    case 'saiu_entrega': return '🚴 Seu pedido acabou de sair para entrega!'
    case 'entregue': return deliveryType === 'retirada'
      ? `📦 Retirada confirmada às ${hora}. Obrigado pela preferência!`
      : '🎉 Pedido entregue! Obrigado pela preferência, bom apetite!'
    case 'cancelado': return '❌ Seu pedido foi cancelado.'
    default: return null
  }
}

// Recibo completo — igual ao que o cliente recebe na hora de fazer o
// pedido (registrar-pedido), só muda a linha de abertura. É essa versão
// (com itens, pagamento, taxa e total) que precisa acompanhar a confirmação
// de "pedido aceito", não uma linha genérica — pedido do Ricardo, set/2026,
// comparando com o concorrente Anota Aí: o cliente precisa ver o pedido
// completo de novo no momento em que a loja confirma que vai preparar.
function buildAcceptedMessage(pedido: any, customerFirstName: string): string {
  const items = (pedido.itens || []) as { product_name: string; unit_price: number; qty: number; selected_options: { name: string }[] | null }[]
  const lines: string[] = [
    `${customerFirstName}, seu pedido foi aceito e já está em preparo! 👨‍🍳`,
    `📦 Pedido nº ${pedido.order_number ?? '—'}`,
    '',
  ]
  for (const it of items) {
    const mods = (it.selected_options || []).map(o => o.name).join(', ')
    lines.push(`• ${it.qty}x ${it.product_name}${mods ? ` (${mods})` : ''} — ${money(it.unit_price * it.qty)}`)
  }
  lines.push('', `Subtotal: ${money(pedido.subtotal)}`)
  if (Number(pedido.delivery_fee) > 0) lines.push(`Taxa de entrega: ${money(pedido.delivery_fee)}`)
  lines.push(`*Total: ${money(pedido.total)}*`, '')
  if (pedido.payment_method) lines.push(`💳 Pagamento: ${PAY_LABEL[pedido.payment_method] || pedido.payment_method}`)
  lines.push(pedido.delivery_type === 'entrega' && pedido.delivery_address ? `🚚 Entrega: ${pedido.delivery_address}` : '🏪 Retirada no local')
  if (pedido.notes) lines.push(`📝 Obs: ${pedido.notes}`)
  return lines.join('\n')
}

// Chamado (fire-and-forget) sempre que o lojista avança o status de um pedido
// em /painel/pedidos ou /painel/cozinha — manda a atualização como
// mensagem de WhatsApp de verdade pro cliente, além do push já existente.
export async function POST(req: NextRequest) {
  try {
    const { companyId, pedidoId, phone: rawPhone, status, deliveryType } = await req.json()
    if (!companyId || !rawPhone || !status) return NextResponse.json({ error: 'dados obrigatórios' }, { status: 400 })
    const phone = normalizePhone(rawPhone)

    let text: string | null = null
    if (status === 'em_preparo' && pedidoId) {
      const { data: pedido } = await supabase
        .from('loja_pedidos')
        .select('order_number, customer_name, delivery_address, delivery_type, payment_method, subtotal, delivery_fee, total, notes, itens:loja_pedido_itens(product_name, unit_price, qty, selected_options)')
        .eq('id', pedidoId).eq('company_id', companyId).maybeSingle()
      if (pedido) text = buildAcceptedMessage(pedido, (pedido.customer_name || 'Cliente').split(' ')[0])
    }
    if (!text) text = buildStatusMessage(status, deliveryType || null)
    if (!text) return NextResponse.json({ ok: true })

    const { data: company } = await supabase.from('companies').select('crm_whatsapp_enabled, trial_modules_until').eq('id', companyId).maybeSingle()
    if (!company || !moduleActive(company.crm_whatsapp_enabled, company.trial_modules_until)) return NextResponse.json({ ok: true })

    const { data: instance } = await supabase
      .from('crm_whatsapp_instances').select('instance_name, api_key')
      .eq('company_id', companyId).eq('status', 'connected').limit(1).maybeSingle()
    if (!instance) return NextResponse.json({ ok: true })

    const res = await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(instance.instance_name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: instance.api_key },
      body: JSON.stringify({ number: phone, text }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[status-pedido] envio falhou (${res.status}): ${body.slice(0, 300)}`)
      return NextResponse.json({ ok: true })
    }

    const { data: contact } = await supabase.from('crm_contacts').select('id').eq('company_id', companyId).eq('phone', phone).maybeSingle()
    if (contact) {
      await supabase.from('crm_messages').insert({
        company_id: companyId, contact_id: contact.id, direction: 'out', body: text, status: 'sent', sent_at: new Date().toISOString(),
      })
      await supabase.from('crm_contacts').update({
        last_message_at: new Date().toISOString(), last_message_preview: text, last_message_direction: 'out',
      }).eq('id', contact.id)
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[status-pedido] falha geral:', err?.message || err)
    return NextResponse.json({ error: 'falha ao notificar' }, { status: 500 })
  }
}
