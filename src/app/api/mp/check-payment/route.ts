import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { payment_id, company_id } = await req.json()
    if (!payment_id || !company_id) return NextResponse.json({ paid: false })

    const { data: setting } = await supabase.from('settings').select('value').eq('key', 'mp_access_token').single()
    const accessToken = setting?.value
    if (!accessToken) return NextResponse.json({ paid: false })

    const res = await fetch(`https://api.mercadopago.com/v1/payments/${payment_id}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    const payment = await res.json()

    if (payment.status !== 'approved') return NextResponse.json({ paid: false })

    // Atualiza payments
    const { data: rec } = await supabase.from('payments').select('*').eq('payment_id', String(payment_id)).single()
    const ext = JSON.parse(payment.external_reference || '{}')
    const days = rec?.days || ext?.days || 30
    const planEndsAt = new Date(Date.now() + days * 86400000).toISOString()

    if (rec) {
      await supabase.from('payments').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', rec.id)
    }

    await supabase.from('companies').update({
      plan: 'paid',
      plan_ends_at: planEndsAt,
      status: 'active'
    }).eq('id', company_id)

    return NextResponse.json({ paid: true, plan_ends_at: planEndsAt })
  } catch (err: any) {
    return NextResponse.json({ paid: false, error: err.message })
  }
}
