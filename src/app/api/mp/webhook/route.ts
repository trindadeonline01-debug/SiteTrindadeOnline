import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Valida assinatura do MP se secret estiver configurado
    const xSignature = req.headers.get('x-signature')
    const xRequestId = req.headers.get('x-request-id')
    if (xSignature) {
      const { data: secSetting } = await supabase.from('settings').select('value').eq('key', 'mp_webhook_secret').single()
      const secret = secSetting?.value
      if (secret && xRequestId) {
        const dataId = body.data?.id
        const manifest = `id:${dataId};request-id:${xRequestId};ts:${xSignature.split('ts=')[1]?.split(',')[0]};`
        const crypto = await import('crypto')
        const ts = xSignature.split('ts=')[1]?.split(',')[0]
        const v1 = xSignature.split('v1=')[1]
        const hmac = crypto.createHmac('sha256', secret).update(manifest).digest('hex')
        if (hmac !== v1) {
          return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
        }
      }
    }

    if (body.type !== 'payment') return NextResponse.json({ ok: true })
    const paymentId = body.data?.id
    if (!paymentId) return NextResponse.json({ ok: true })

    const { data: setting } = await supabase.from('settings').select('value').eq('key', 'mp_access_token').single()
    const accessToken = setting?.value
    if (!accessToken) return NextResponse.json({ ok: true })

    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    const payment = await res.json()
    if (payment.status !== 'approved') return NextResponse.json({ ok: true })

    const { data: rec } = await supabase.from('payments').select('*').eq('payment_id', String(paymentId)).single()

    if (!rec) {
      const ext = JSON.parse(payment.external_reference || '{}')
      if (!ext.company_id) return NextResponse.json({ ok: true })
      await supabase.from('payments').insert({ company_id: ext.company_id, asaas_payment_id: String(paymentId), plan: ext.plan, value: payment.transaction_amount, days: ext.days, status: 'paid', paid_at: new Date().toISOString() })
      const planEndsAt = new Date(Date.now() + ext.days * 86400000).toISOString()
      await supabase.from('companies').update({ plan: 'paid', plan_ends_at: planEndsAt, status: 'active' }).eq('id', ext.company_id)
    } else {
      await supabase.from('payments').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', rec.id)
      const planEndsAt = new Date(Date.now() + rec.days * 86400000).toISOString()
      await supabase.from('companies').update({ plan: 'paid', plan_ends_at: planEndsAt, status: 'active' }).eq('id', rec.company_id)
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ ok: true })
}
