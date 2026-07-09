import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PLANS: Record<string, { value: number; days: number; description: string }> = {
  // VALORES DE TESTE — restaurar após testes:
  // mensal: 29.90 / trimestral: 79.90 / semestral: 149.90
  // banner upload: 79.90 / 139.90 / 249.90
  // banner ia: 119.90 / 179.90 / 289.90
  mensal:     { value: 1.00, days: 30,  description: 'Trindade Online — Plano Mensal' },
  trimestral: { value: 2.00, days: 90,  description: 'Trindade Online — Plano Trimestral' },
  semestral:  { value: 3.00, days: 180, description: 'Trindade Online — Plano Semestral' },
  'banner_7d_upload':  { value: 1.00, days: 7,  description: 'Trindade Online — Banner Home 7 dias' },
  'banner_15d_upload': { value: 2.00, days: 15, description: 'Trindade Online — Banner Home 15 dias' },
  'banner_30d_upload': { value: 3.00, days: 30, description: 'Trindade Online — Banner Home 30 dias' },
  'banner_7d_ia':      { value: 41.00, days: 7,  description: 'Trindade Online — Banner Home 7 dias + Criação IA' },
  'banner_15d_ia':     { value: 42.00, days: 15, description: 'Trindade Online — Banner Home 15 dias + Criação IA' },
  'banner_30d_ia':     { value: 43.00, days: 30, description: 'Trindade Online — Banner Home 30 dias + Criação IA' },
}

export async function POST(req: NextRequest) {
  try {
    const { plan, company_id, owner_email, valor_override, dias_override, nome_plano } = await req.json()
    
    // Plano dinâmico (do banco) tem precedência sobre os fixos
    let planData = PLANS[plan]
    if (valor_override && dias_override) {
      planData = { value: valor_override, days: dias_override, description: `Trindade Online — ${nome_plano || plan}` }
    }
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
        notification_url: 'https://www.trindadeonline.com.br/api/mp/webhook',
        external_reference: JSON.stringify({ company_id, plan, days: planData.days }),
      })
    })

    const data = await res.json()
    if (data.error || !data.id) {
      return NextResponse.json({ error: data.message || 'Erro ao criar pagamento', detail: data }, { status: 500 })
    }

    const { error: insertError } = await supabase.from('payments').insert({
      company_id,
      payment_id: String(data.id),
      plan, value: planData.value, days: planData.days, status: 'pending',
    })
    if (insertError) console.error('INSERT ERROR:', insertError)

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
