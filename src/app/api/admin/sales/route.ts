import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/requireAdmin'
import { periodRange, PeriodSel } from '@/lib/periodFilter'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  const { period } = await req.json() as { period: PeriodSel }
  const { from, to } = periodRange(period)
  const now = new Date()

  let q = supabaseAdmin.from('payments').select('id, payment_id, plan, value, days, status, paid_at, company_id').eq('status','paid').order('paid_at', { ascending: false })
  if (from) q = q.gte('paid_at', from)
  if (to) q = q.lt('paid_at', to)
  const { data: payments, error } = await q

  // Buscar nomes das empresas separado
  const companyIds = [...new Set((payments||[]).map((p:any) => p.company_id).filter(Boolean))]
  let companyMap: Record<string,string> = {}
  if (companyIds.length > 0) {
    const { data: comps } = await supabaseAdmin.from('companies').select('id,name').in('id', companyIds)
    if (comps) comps.forEach((c:any) => { companyMap[c.id] = c.name })
  }

  const paymentsWithNames = (payments||[]).map((p:any) => ({ ...p, company: { name: companyMap[p.company_id] || '—' } }))

  const in7days = new Date(now); in7days.setDate(in7days.getDate()+7)
  const { data: exp } = await supabaseAdmin.from('companies').select('id,name,trial_ends_at,plan').eq('status','active').neq('plan','paid').lt('trial_ends_at', in7days.toISOString()).gt('trial_ends_at', now.toISOString()).order('trial_ends_at')

  return NextResponse.json({ payments: paymentsWithNames, expiring: exp || [], error: error?.message })
}
