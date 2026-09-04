import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function requireAdmin(accessToken: string | undefined): Promise<boolean> {
  if (!accessToken) return false
  const { data: userData } = await supabaseAuth.auth.getUser(accessToken)
  if (!userData?.user) return false
  const { data: profile } = await supabase.from('profiles').select('user_type').eq('id', userData.user.id).maybeSingle()
  return profile?.user_type === 'admin'
}

export async function GET(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!(await requireAdmin(accessToken))) return NextResponse.json({ error: 'acesso negado' }, { status: 403 })

  const today = new Date().toISOString().slice(0, 10)
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7)

  const [{ data: orders }, { data: offers }, { data: payments }, { data: payouts }, { data: companies }, { data: wallets }, { data: motoboys }] = await Promise.all([
    supabase.from('delivery_orders').select('id, company_id, motoboy_id, status, fee, created_at, delivered_at'),
    supabase.from('delivery_offers').select('motoboy_id, status'),
    supabase.from('delivery_payments').select('company_id, kind, value, status, paid_at').eq('status', 'paid').gte('paid_at', weekStart.toISOString()),
    supabase.from('motoboy_payouts').select('motoboy_id, valor, status'),
    supabase.from('companies').select('id, name'),
    supabase.from('company_delivery_wallet').select('company_id, credits, daily_paid_until'),
    supabase.from('motoboys').select('id, name'),
  ])

  const nameByCompany = new Map((companies || []).map(c => [c.id, c.name]))
  const walletByCompany = new Map((wallets || []).map(w => [w.company_id, w]))
  const nameByMotoboy = new Map((motoboys || []).map(m => [m.id, m.name]))

  const entregasHoje = (orders || []).filter(o => o.status === 'entregue' && (o.delivered_at || '').slice(0, 10) === today)
  const entregasSemana = (orders || []).filter(o => o.status === 'entregue' && o.delivered_at && new Date(o.delivered_at) >= weekStart)
  const aceitas = (offers || []).filter(o => o.status === 'aceita').length
  const recusadas = (offers || []).filter(o => o.status === 'recusada').length
  const expiradas = (offers || []).filter(o => o.status === 'expirada').length
  const totalOfertas = aceitas + recusadas + expiradas
  const taxaAceite = totalOfertas > 0 ? Math.round((aceitas / totalOfertas) * 100) : null

  const receitaDiaria = (payments || []).filter(p => p.kind === 'diaria').reduce((a, p) => a + Number(p.value), 0)
  const receitaCredito = (payments || []).filter(p => p.kind === 'credito').reduce((a, p) => a + Number(p.value), 0)
  const receitaCombo = (payments || []).filter(p => p.kind === 'combo').reduce((a, p) => a + Number(p.value), 0)
  const aPagarMotoboys = (payouts || []).filter(p => p.status === 'pendente').reduce((a, p) => a + Number(p.valor), 0)

  const porEmpresaMap = new Map<string, { cadastradas: number; realizadas: number; pendentes: number; canceladas: number; gasto: number }>()
  for (const o of orders || []) {
    const cur = porEmpresaMap.get(o.company_id) || { cadastradas: 0, realizadas: 0, pendentes: 0, canceladas: 0, gasto: 0 }
    cur.cadastradas += 1
    if (o.status === 'entregue') cur.realizadas += 1
    else if (o.status === 'buscando_motoboy' || o.status === 'a_caminho') cur.pendentes += 1
    else if (o.status === 'cancelada' || o.status === 'sem_credito') cur.canceladas += 1
    porEmpresaMap.set(o.company_id, cur)
  }
  const gastoByCompany = new Map<string, number>()
  for (const p of payments || []) {
    gastoByCompany.set(p.company_id, (gastoByCompany.get(p.company_id) || 0) + Number(p.value))
  }
  const porEmpresa = Array.from(porEmpresaMap.entries()).map(([company_id, v]) => {
    const wallet = walletByCompany.get(company_id)
    const diariaPaga = !!(wallet?.daily_paid_until && wallet.daily_paid_until >= today)
    return {
      company_id, company_name: nameByCompany.get(company_id) || '—',
      diaria_paga: diariaPaga, creditos: wallet?.credits || 0,
      ...v, gasto: gastoByCompany.get(company_id) || 0,
    }
  }).sort((a, b) => b.cadastradas - a.cadastradas)

  const porMotoboyMap = new Map<string, { aceitas: number; recusadas: number; expiradas: number }>()
  for (const o of offers || []) {
    const cur = porMotoboyMap.get(o.motoboy_id) || { aceitas: 0, recusadas: 0, expiradas: 0 }
    if (o.status === 'aceita') cur.aceitas += 1
    else if (o.status === 'recusada') cur.recusadas += 1
    else if (o.status === 'expirada') cur.expiradas += 1
    porMotoboyMap.set(o.motoboy_id, cur)
  }
  const aReceberByMotoboy = new Map<string, number>()
  const jaRecebidoByMotoboy = new Map<string, number>()
  for (const p of payouts || []) {
    if (p.status === 'pendente') aReceberByMotoboy.set(p.motoboy_id, (aReceberByMotoboy.get(p.motoboy_id) || 0) + Number(p.valor))
    if (p.status === 'pago') jaRecebidoByMotoboy.set(p.motoboy_id, (jaRecebidoByMotoboy.get(p.motoboy_id) || 0) + Number(p.valor))
  }
  const porMotoboy = (motoboys || []).map(m => {
    const stats = porMotoboyMap.get(m.id) || { aceitas: 0, recusadas: 0, expiradas: 0 }
    const total = stats.aceitas + stats.recusadas + stats.expiradas
    return {
      motoboy_id: m.id, motoboy_name: nameByMotoboy.get(m.id) || m.name, ...stats,
      taxa_aceite: total > 0 ? Math.round((stats.aceitas / total) * 100) : null,
      a_receber: aReceberByMotoboy.get(m.id) || 0, ja_recebido: jaRecebidoByMotoboy.get(m.id) || 0,
    }
  })

  return NextResponse.json({
    kpis: {
      entregasHoje: entregasHoje.length, entregasSemana: entregasSemana.length, taxaAceite,
      receitaDiaria, receitaCredito, receitaCombo, aPagarMotoboys,
    },
    porEmpresa, porMotoboy,
  })
}
