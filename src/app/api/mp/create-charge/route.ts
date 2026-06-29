import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PLANS: Record<string, { value: number; days: number; description: string }> = {
  mensal:     { value: 29.90,  days: 30,  description: 'Trindade Online — Plano Mensal' },
  trimestral: { value: 79.90,  days: 90,  description: 'Trindade Online — Plano Trimestral' },
  semestral:  { value: 149.90, days: 180, description: 'Trindade Online — Plano Semestral' },
}

export async function POST(req: NextRequest) {
  try {
    const { plan, company_id, owner_email } = await req.json()
    const planData = PLANS[plan]
    if (!planData) return NextResponse.json({ error: 'Plano inválido' }, { status: 400 })

    const { data: setting } = await supabase
      .from('settings').select('value').eq('key', 'mp_access_token').single()

    const accessToken = setting?.value
    if (!accessToken) return NextResponse.json({ error: 'Mercado Pago não configurado' }, { status: 500 })

    const res = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `${company_id}-${plan}-${Date.now()}`,
      },
      body: JSON.stringify({
        transaction_amount: planData.value,
        description: planData.description,
        payment_method_id: 'pix',
        payer: { email: owner_email || 'lojista@trindadeonline.com.br' },
        notification_url: 'https://trindadeonline.com.br/api/mp/webhook',
        external_reference: JSON.stringify({ company_id, plan, days: planData.days }),
      })
    })

    const data = await res.json()
    if (data.error || !data.id) {
      return NextResponse.json({ error: data.message || 'Erro ao criar pagamento', detail: data }, { status: 500 })
    }

    await supabase.from('payments').insert({
      company_id,
      asaas_payment_id: String(data.id),
      plan, value: planData.value, days: planData.days, status: 'pending',
    })

    const pixData = data.point_of_interaction?.transaction_data
    return NextResponse.json({
      payment_id: data.id,
      value: planData.value,
      qr_code_image: pixData?.qr_code_base64 || null,
      pix_copy_paste: pixData?.qr_code || null,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
