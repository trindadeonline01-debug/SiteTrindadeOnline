import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { moduleActive } from '@/lib/modules'
import { normalizePhone } from '@/lib/phone'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evo.trindadeonline.com.br'

function fmt(n: number) { return 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',') }

// Chamado (fire-and-forget) só quando o lojista edita um pedido em
// /painel/pedidos (EditarPedidoPanel) e os ITENS ou o TOTAL de fato mudam —
// quem chama aqui já filtrou isso, não dispara em edição que só mexeu em
// dado interno (ex: observação). Antes disso o cliente não tinha nenhuma
// visibilidade de que o pedido dele foi alterado depois de confirmado
// (pedido do Ricardo, out/2026).
export async function POST(req: NextRequest) {
  try {
    const { companyId, pedidoId } = await req.json()
    if (!companyId || !pedidoId) return NextResponse.json({ error: 'dados obrigatórios' }, { status: 400 })

    const { data: pedido } = await supabase
      .from('loja_pedidos')
      .select('order_number, customer_phone, total, itens:loja_pedido_itens(product_name, qty, unit_price, peso_kg)')
      .eq('id', pedidoId).eq('company_id', companyId).maybeSingle()
    if (!pedido || !pedido.customer_phone) return NextResponse.json({ ok: true })
    const phone = normalizePhone(pedido.customer_phone)

    const { data: company } = await supabase.from('companies').select('crm_whatsapp_enabled, trial_modules_until, slug').eq('id', companyId).maybeSingle()
    if (!company || !moduleActive(company.crm_whatsapp_enabled, company.trial_modules_until)) return NextResponse.json({ ok: true })

    const { data: instance } = await supabase
      .from('crm_whatsapp_instances').select('instance_name, api_key')
      .eq('company_id', companyId).eq('status', 'connected').limit(1).maybeSingle()
    if (!instance) return NextResponse.json({ ok: true })

    const itens = (pedido.itens || []) as { product_name: string; qty: number; unit_price: number; peso_kg: number | null }[]
    const linhas = itens.map(it => {
      const qtdLabel = it.peso_kg != null ? `${it.peso_kg}kg` : `${it.qty}x`
      const valor = it.peso_kg != null ? it.unit_price : it.unit_price * it.qty
      return `• ${qtdLabel} ${it.product_name} — ${fmt(valor)}`
    })

    const parts = ['✏️ *Seu pedido foi atualizado pela loja*']
    if (pedido.order_number != null) parts.push(`📦 Pedido nº ${pedido.order_number}`)
    parts.push('', ...linhas, '', `*Novo total: ${fmt(Number(pedido.total))}*`)
    const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.trindadeonline.com.br'
    parts.push('', `📲 Confere os detalhes aqui: ${site}/pedido/${pedidoId}`)
    const text = parts.join('\n')

    const res = await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(instance.instance_name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: instance.api_key },
      body: JSON.stringify({ number: phone, text }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[pedido-editado] envio falhou (${res.status}): ${body.slice(0, 300)}`)
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
    console.error('[pedido-editado] falha geral:', err?.message || err)
    return NextResponse.json({ error: 'falha ao notificar' }, { status: 500 })
  }
}
