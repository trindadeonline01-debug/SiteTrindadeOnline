import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getMotoboyFromRequest } from '@/lib/motoboySession'
import { getEntregaPricing, matchBairroInAddress } from '@/lib/entregaPricing'
import { acceptOfferForMotoboy, declineOfferForMotoboy, confirmCodeForMotoboy } from '@/lib/entregaDispatch'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'

// Estado em tempo real do painel do motoboy (out/2026) — a oferta pendente
// (se tiver) e as corridas já aceitas em andamento. O painel faz polling
// nessa rota a cada poucos segundos em vez de WhatsApp — a MESMA engine de
// despacho (delivery_offers/delivery_orders) continua valendo, só muda a
// interface de quem responde. Nunca devolve pickup_code/delivery_code pro
// motoboy — ele só digita o código que pede pro lojista/cliente, nunca vê
// o valor de antemão (ver confirmCodeForMotoboy em entregaDispatch.ts).
export async function GET(req: NextRequest) {
  const motoboy = await getMotoboyFromRequest(req)
  if (!motoboy) return NextResponse.json({ error: 'sessão inválida' }, { status: 401 })

  const pricing = await getEntregaPricing()

  const { data: offerRow } = await supabase
    .from('delivery_offers').select('id, delivery_order_id, expires_at')
    .eq('motoboy_id', motoboy.id).eq('status', 'pendente')
    .order('offered_at', { ascending: false }).limit(1).maybeSingle()

  let offer: { deliveryOrderId: string; company: string; bairro: string | null; valueLabel: string; expiresAt: string } | null = null
  if (offerRow) {
    const { data: order } = await supabase.from('delivery_orders').select('company_id, dropoff_address, fee, status').eq('id', offerRow.delivery_order_id).maybeSingle()
    if (order && order.status === 'buscando_motoboy') {
      const { data: company } = await supabase.from('companies').select('name').eq('id', order.company_id).maybeSingle()
      offer = {
        deliveryOrderId: offerRow.delivery_order_id,
        company: company?.name || '—',
        bairro: matchBairroInAddress(order.dropoff_address),
        valueLabel: Math.max(0, Number(order.fee) - pricing.motoboy_corte_plataforma).toFixed(2).replace('.', ','),
        expiresAt: offerRow.expires_at,
      }
    }
  }

  const { data: orders } = await supabase
    .from('delivery_orders')
    .select('id, company_id, customer_name, dropoff_address, fee, picked_up_at, assigned_at')
    .eq('motoboy_id', motoboy.id).eq('status', 'a_caminho')
    .order('assigned_at', { ascending: true })

  const companyIds = Array.from(new Set((orders || []).map(o => o.company_id)))
  const { data: companies } = companyIds.length ? await supabase.from('companies').select('id, name').in('id', companyIds) : { data: [] as any[] }
  const nameByCompany = new Map((companies || []).map(c => [c.id, c.name]))

  const rides = (orders || []).map(o => ({
    id: o.id,
    company: nameByCompany.get(o.company_id) || '—',
    bairro: matchBairroInAddress(o.dropoff_address),
    customerName: o.customer_name,
    valueLabel: Math.max(0, Number(o.fee) - pricing.motoboy_corte_plataforma).toFixed(2).replace('.', ','),
    pickedUp: !!o.picked_up_at,
  }))

  return NextResponse.json({ offer, rides })
}

export async function POST(req: NextRequest) {
  try {
    const motoboy = await getMotoboyFromRequest(req)
    if (!motoboy) return NextResponse.json({ error: 'sessão inválida' }, { status: 401 })
    const body = await req.json()

    if (body.action === 'accept') {
      const r = await acceptOfferForMotoboy(motoboy.id)
      return NextResponse.json(r, { status: r.ok ? 200 : 400 })
    }

    if (body.action === 'decline') {
      const r = await declineOfferForMotoboy(motoboy.id)
      return NextResponse.json(r, { status: r.ok ? 200 : 400 })
    }

    if (body.action === 'confirm_code') {
      if (!body.orderId || !body.code) return NextResponse.json({ ok: false, error: 'dados faltando' }, { status: 400 })
      const r = await confirmCodeForMotoboy(motoboy.id, String(body.orderId), String(body.code))
      return NextResponse.json(r, { status: r.ok ? 200 : 400 })
    }

    // Retirada em grupo — várias corridas da MESMA loja confirmadas de uma
    // vez (achado real do Ricardo: 3 pedidos na Confeitaria da Juju na
    // mesma ida). Cada corrida continua com seu próprio código — não dá pra
    // unificar — então aqui só roda confirmCodeForMotoboy pra cada item e
    // devolve o resultado de cada um, sem perder os que já bateram quando
    // algum outro erra.
    if (body.action === 'confirm_group') {
      const items: { orderId?: string; code?: string }[] = Array.isArray(body.items) ? body.items : []
      const results: { orderId: string; ok: boolean; error?: string; phase?: string }[] = []
      for (const it of items) {
        if (!it?.orderId) continue
        if (!it.code) { results.push({ orderId: it.orderId, ok: false, error: 'falta digitar' }); continue }
        const r = await confirmCodeForMotoboy(motoboy.id, it.orderId, it.code)
        results.push(r.ok ? { orderId: it.orderId, ok: true, phase: r.phase } : { orderId: it.orderId, ok: false, error: r.error })
      }
      return NextResponse.json({ results })
    }

    return NextResponse.json({ error: 'ação inválida' }, { status: 400 })
  } catch (err: any) {
    console.error('[motoboy/corridas]', err)
    return NextResponse.json({ error: 'falha' }, { status: 500 })
  }
}
