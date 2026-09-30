import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getMotoboyFromRequest } from '@/lib/motoboySession'
import { getEntregaPricing, matchBairroInAddress } from '@/lib/entregaPricing'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Nunca cacheado — o filtro de período muda a query a cada busca.
export const dynamic = 'force-dynamic'

// Dados do próprio motoboy pro painel dele — nunca de outro (o token da
// sessão já resolve pra um motoboy_id só, ver motoboySession.ts).
export async function GET(req: NextRequest) {
  const motoboy = await getMotoboyFromRequest(req)
  if (!motoboy) return NextResponse.json({ error: 'sessão inválida' }, { status: 401 })

  const { data: full } = await supabase.from('motoboys').select('id, name, phone, pix_key, pix_key_type, status, available, password_hash').eq('id', motoboy.id).maybeSingle()

  // Filtro de período (Hoje/Esta semana/Este mês/data específica etc, ver
  // PeriodFilterBar) — o motoboy pediu pra conseguir ver o que tem a
  // receber e o que já recebeu por período, não só os 15 últimos fixos
  // (Ricardo, set/2026). Sem from/to (1ª carga da tela) mantém o
  // comportamento antigo: só os 15 mais recentes.
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  let ordersQuery = supabase
    .from('delivery_orders')
    .select('id, company_id, customer_name, status, fee, created_at, payout_id, payout_status, dropoff_address, picked_up_at, delivered_at')
    .eq('motoboy_id', motoboy.id)
    .order('created_at', { ascending: false })
  if (from) ordersQuery = ordersQuery.gte('created_at', from)
  if (to) ordersQuery = ordersQuery.lt('created_at', to)
  if (!from && !to) ordersQuery = ordersQuery.limit(15)
  else ordersQuery = ordersQuery.limit(300)
  const { data: recentOrders } = await ordersQuery

  const companyIds = Array.from(new Set((recentOrders || []).map(o => o.company_id)))
  const { data: companies } = companyIds.length ? await supabase.from('companies').select('id, name').in('id', companyIds) : { data: [] as any[] }
  const nameByCompany = new Map((companies || []).map(c => [c.id, c.name]))

  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7)
  const { data: weekOrders } = await supabase.from('delivery_orders').select('fee, status').eq('motoboy_id', motoboy.id).gte('created_at', weekStart.toISOString())
  const entregasSemana = (weekOrders || []).filter(o => o.status === 'entregue').length

  // "A receber" é calculado na hora, direto das entregas já confirmadas
  // que ainda não viraram pagamento — não depende mais de nenhuma ação do
  // admin pra aparecer (antes só existia depois de alguém "gerar repasse",
  // e até lá o motoboy via zerado mesmo já tendo rodado — Ricardo, set/2026).
  const { data: pendentesOrders } = await supabase
    .from('delivery_orders').select('fee')
    .eq('motoboy_id', motoboy.id).eq('status', 'entregue').eq('payout_status', 'liberado').is('payout_id', null)
  const pricing = await getEntregaPricing()
  const aReceber = (pendentesOrders || []).reduce((a, o) => a + Math.max(0, Number(o.fee) - pricing.motoboy_corte_plataforma), 0)

  // Mesmos totais de cima, só que somados dentro do período filtrado (em vez
  // do saldo atual geral) — é o que responde "o que eu tenho a receber/já
  // recebi NESSE período" em vez de só o saldo de agora.
  const entreguesNoPeriodo = (recentOrders || []).filter(o => o.status === 'entregue')
  const periodAReceber = entreguesNoPeriodo
    .filter(o => o.payout_status === 'liberado' && !o.payout_id)
    .reduce((a, o) => a + Math.max(0, Number(o.fee) - pricing.motoboy_corte_plataforma), 0)
  const periodRecebido = entreguesNoPeriodo
    .filter(o => !!o.payout_id)
    .reduce((a, o) => a + Math.max(0, Number(o.fee) - pricing.motoboy_corte_plataforma), 0)

  const { data: payouts } = await supabase.from('motoboy_payouts').select('*').eq('motoboy_id', motoboy.id).eq('status', 'pago').order('paid_at', { ascending: false }).limit(10)
  const jaRecebido = (payouts || []).reduce((a, p) => a + Number(p.valor), 0)

  return NextResponse.json({
    motoboy: { name: full?.name, phone: full?.phone, pix_key: full?.pix_key, pix_key_type: full?.pix_key_type, status: full?.status, available: full?.available, has_password: !!full?.password_hash },
    entregasSemana, aReceber, jaRecebido,
    periodAReceber, periodRecebido,
    recentOrders: (recentOrders || []).map(o => ({
      id: o.id, company_name: nameByCompany.get(o.company_id) || '—', customer_name: o.customer_name, status: o.status, fee: o.fee, created_at: o.created_at, pago: !!o.payout_id,
      bairro: o.dropoff_address ? matchBairroInAddress(o.dropoff_address) : null,
      picked_up_at: o.picked_up_at, delivered_at: o.delivered_at,
    })),
    payouts: (payouts || []).map(p => ({ id: p.id, period_start: p.period_start, period_end: p.period_end, valor: p.valor, status: p.status, paid_at: p.paid_at })),
  })
}

export async function POST(req: NextRequest) {
  try {
    const motoboy = await getMotoboyFromRequest(req)
    if (!motoboy) return NextResponse.json({ error: 'sessão inválida' }, { status: 401 })
    const body = await req.json()

    if (body.action === 'disponibilidade') {
      await supabase.from('motoboys').update({ available: !!body.available }).eq('id', motoboy.id)
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'atualizar_pix') {
      if (!body.pix_key?.trim()) return NextResponse.json({ error: 'chave Pix obrigatória' }, { status: 400 })
      await supabase.from('motoboys').update({ pix_key: body.pix_key.trim(), pix_key_type: body.pix_key_type || 'celular' }).eq('id', motoboy.id)
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'logout') {
      const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
      if (token) await supabase.from('motoboy_sessions').delete().eq('token', token)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'ação inválida' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha' }, { status: 500 })
  }
}
