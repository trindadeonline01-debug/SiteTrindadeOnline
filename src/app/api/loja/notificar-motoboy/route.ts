import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/phone'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evo.trindadeonline.com.br'

const PAY_LABEL: Record<string, string> = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão' }
function money(n: number) { return 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',') }
function mapsLink(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

// Chamado (fire-and-forget) quando o lojista marca "saiu pra entrega" com um
// motoboy PRÓPRIO cadastrado (loja_motoboys) — não tem nada a ver com o
// motoboy da plataforma (Trindade Entrega), que já tem seu próprio fluxo de
// WhatsApp. Manda pro WhatsApp do motoboy tudo que ele precisa pra fazer a
// corrida sem precisar ligar pra loja perguntando (pedido do Ricardo,
// set/2026): endereço com link do Maps, itens, forma de pagamento e valor.
export async function POST(req: NextRequest) {
  try {
    const { companyId, pedidoId, motoboyId } = await req.json()
    if (!companyId || !pedidoId || !motoboyId) return NextResponse.json({ error: 'dados obrigatórios' }, { status: 400 })

    const [{ data: pedido }, { data: motoboy }, { data: instance }] = await Promise.all([
      supabase.from('loja_pedidos')
        .select('order_number, customer_name, delivery_address, payment_method, total, delivery_fee, notes, itens:loja_pedido_itens(product_name, unit_price, qty, selected_options)')
        .eq('id', pedidoId).eq('company_id', companyId).maybeSingle(),
      supabase.from('loja_motoboys').select('whatsapp').eq('id', motoboyId).eq('company_id', companyId).maybeSingle(),
      supabase.from('crm_whatsapp_instances').select('instance_name, api_key').eq('company_id', companyId).eq('status', 'connected').limit(1).maybeSingle(),
    ])
    if (!pedido) { console.error('[notificar-motoboy] pedido não encontrado', { pedidoId, companyId }); return NextResponse.json({ ok: true }) }
    if (!motoboy?.whatsapp) { console.error('[notificar-motoboy] motoboy sem whatsapp cadastrado', { motoboyId }); return NextResponse.json({ ok: true }) }
    if (!instance) { console.error('[notificar-motoboy] sem instância de WhatsApp conectada', { companyId }); return NextResponse.json({ ok: true }) }

    const phone = normalizePhone(motoboy.whatsapp)
    const itens: { product_name: string; unit_price: number; qty: number; selected_options: { name: string }[] | null }[] = pedido.itens || []

    const lines: string[] = []
    lines.push('🏍️ *Nova entrega!*', '')
    lines.push(`📦 Pedido nº ${pedido.order_number ?? '—'}`)
    lines.push(`👤 Cliente: ${pedido.customer_name}`)
    if (pedido.delivery_address) {
      lines.push('', '📍 Endereço:', pedido.delivery_address, mapsLink(pedido.delivery_address))
    }
    lines.push('', '🍽️ *Itens:*')
    for (const it of itens) {
      lines.push(`${it.qty}x ${it.product_name}`)
      if (it.selected_options?.length) lines.push('   ' + it.selected_options.map(o => o.name).join(', '))
    }
    lines.push('')
    lines.push(`💳 Pagamento: ${PAY_LABEL[pedido.payment_method || ''] || pedido.payment_method || '—'}`)
    lines.push(`💰 Valor do pedido: ${money(pedido.total)}`)
    if (Number(pedido.delivery_fee) > 0) lines.push(`🏍️ Valor da entrega: ${money(pedido.delivery_fee)}`)
    if (pedido.notes) lines.push('', '📝 Obs: ' + pedido.notes)

    const text = lines.join('\n')

    const res = await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(instance.instance_name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: instance.api_key },
      body: JSON.stringify({ number: phone, text }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[notificar-motoboy] envio falhou (${res.status}): ${body.slice(0, 300)}`)
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[notificar-motoboy] falha geral:', err?.message || err)
    return NextResponse.json({ error: 'falha ao notificar motoboy' }, { status: 500 })
  }
}
