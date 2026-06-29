import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function processHighlight(paymentId: string) {
  try {
    const { data: setting } = await supabase.from('settings').select('value').eq('key', 'mp_access_token').single()
    const accessToken = setting?.value
    if (!accessToken) return

    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    const payment = await res.json()
    if (payment.status !== 'approved') return

    const ext = JSON.parse(payment.external_reference || '{}')
    if (ext.type !== 'highlight' || !ext.company_id) return

    const startsAt = new Date()
    const expiresAt = new Date(Date.now() + ext.days * 86400000)

    await supabase.from('highlights').insert({
      company_id: ext.company_id,
      level: ext.level,
      duration_days: ext.days,
      price_paid: ext.value,
      starts_at: startsAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      status: 'active',
      clicks_count: 0,
      impressions_count: 0,
    })
  } catch (err) {
    console.error('processHighlight error:', err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const response = NextResponse.json({ ok: true })
    if (body.type === 'payment' && body.data?.id) {
      processHighlight(String(body.data.id))
    }
    return response
  } catch {
    return NextResponse.json({ ok: true })
  }
}

export async function GET() {
  return NextResponse.json({ ok: true })
}
