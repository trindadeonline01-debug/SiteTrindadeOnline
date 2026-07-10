import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { filter, dateFrom, dateTo } = await req.json()
  const now = new Date()
  let from: string | null = null
  let to: string | null = null

  if (filter === 'today') { from = now.toISOString().split('T')[0] + 'T00:00:00Z'; to = now.toISOString() }
  else if (filter === 'week') { const d = new Date(now); d.setDate(d.getDate()-7); from = d.toISOString() }
  else if (filter === 'month') { from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString() }
  else if (filter === '30d') { const d = new Date(now); d.setDate(d.getDate()-30); from = d.toISOString() }
  else if (filter === '90d') { const d = new Date(now); d.setDate(d.getDate()-90); from = d.toISOString() }
  else if (filter === 'custom' && dateFrom) { from = dateFrom + 'T00:00:00Z'; to = dateTo ? dateTo + 'T23:59:59Z' : now.toISOString() }

  let q = supabaseAdmin.from('payments').select('id, payment_id, plan, value, days, status, paid_at, company_id, companies(name)').eq('status','paid').order('paid_at', { ascending: false })
  if (from) q = q.gte('paid_at', from)
  if (to) q = q.lte('paid_at', to)
  const { data, error } = await q

  const in7days = new Date(now); in7days.setDate(in7days.getDate()+7)
  const { data: exp } = await supabaseAdmin.from('companies').select('id,name,trial_ends_at,plan').eq('status','active').neq('plan','paid').lt('trial_ends_at', in7days.toISOString()).gt('trial_ends_at', now.toISOString()).order('trial_ends_at')

  return NextResponse.json({ payments: data || [], expiring: exp || [], error: error?.message })
}
