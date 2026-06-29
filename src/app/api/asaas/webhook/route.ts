import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { event, payment } = body
    if (event !== 'PAYMENT_CONFIRMED' && event !== 'PAYMENT_RECEIVED') return NextResponse.json({ ok: true })
    const paymentId = payment?.id
    if (!paymentId) return NextResponse.json({ ok: true })

    const { data: rec } = await supabase.from('payments').select('*').eq('asaas_payment_id', paymentId).single()
    if (!rec) return NextResponse.json({ ok: true })

    await supabase.from('payments').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', rec.id)
    const planEndsAt = new Date(Date.now() + rec.days * 86400000).toISOString()
    await supabase.from('companies').update({ plan: 'paid', plan_ends_at: planEndsAt, status: 'active' }).eq('id', rec.company_id)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
