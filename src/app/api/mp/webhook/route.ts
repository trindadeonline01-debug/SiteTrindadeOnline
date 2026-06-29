import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function processPayment(paymentId: string) {
  try {
    const { data: setting } = await supabase.from('settings').select('value').eq('key', 'mp_access_token').single()
    const accessToken = setting?.value
    if (!accessToken) return

    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    const payment = await res.json()
    if (payment.status !== 'approved') return

    const { data: rec } = await supabase.from('payments').select('*').eq('payment_id', String(paymentId)).single()

    if (!rec) {
      const ext = JSON.parse(payment.external_reference || '{}')
      if (!ext.company_id) return
      await supabase.from('payments').insert({ company_id: ext.company_id, payment_id: String(paymentId), plan: ext.plan, value: payment.transaction_amount, days: ext.days, status: 'paid', paid_at: new Date().toISOString() })
      const planEndsAt = new Date(Date.now() + ext.days * 86400000).toISOString()
      await supabase.from('companies').update({ plan: 'paid', plan_ends_at: planEndsAt, status: 'active' }).eq('id', ext.company_id)
    } else {
      await supabase.from('payments').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', rec.id)
      const planEndsAt = new Date(Date.now() + rec.days * 86400000).toISOString()
      await supabase.from('companies').update({ plan: 'paid', plan_ends_at: planEndsAt, status: 'active' }).eq('id', rec.company_id)
    }
  } catch (err) {
    console.error('processPayment error:', err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    // Responde 200 imediatamente
    const response = NextResponse.json({ ok: true })
    // Processa em background
    if (body.type === 'payment' && body.data?.id) {
      processPayment(String(body.data.id))
    }
    return response
  } catch {
    return NextResponse.json({ ok: true })
  }
}

export async function GET() {
  return NextResponse.json({ ok: true })
}
