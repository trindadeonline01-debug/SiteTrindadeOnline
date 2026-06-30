import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// VALORES DE TESTE — restaurar após testes:
// home: 49.90/89.90/159.90 | category: 29.90/54.90/99.90 | subcat: 14.90/27.90/49.90
const PRICES: Record<string, Record<number, number>> = {
  home:     { 7: 5.00, 15: 6.00, 30: 7.00 },
  category: { 7: 4.00, 15: 5.00, 30: 6.00 },
  subcat:   { 7: 3.00, 15: 4.00, 30: 5.00 },
}

export async function POST(req: NextRequest) {
  try {
    const { level, days, company_id, owner_email } = await req.json()

    const value = PRICES[level]?.[days]
    if (!value) return NextResponse.json({ error: 'Opção inválida' }, { status: 400 })

    const { data: setting } = await supabase.from('settings').select('value').eq('key', 'mp_access_token').single()
    const accessToken = setting?.value
    if (!accessToken) return NextResponse.json({ error: 'Mercado Pago não configurado' }, { status: 500 })

    const levelLabel = level === 'home' ? 'Home' : level === 'category' ? 'Categoria' : 'Subcategoria'
    const res = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `highlight-${company_id}-${level}-${days}-${Date.now()}`,
      },
      body: JSON.stringify({
        transaction_amount: value,
        description: `Trindade Online — Destaque ${levelLabel} ${days} dias`,
        payment_method_id: 'pix',
        payer: { email: owner_email || 'lojista@trindadeonline.com.br' },
        notification_url: 'https://www.trindadeonline.com.br/api/mp/webhook',
        external_reference: JSON.stringify({ company_id, level, days, value, type: 'highlight' }),
      })
    })

    const data = await res.json()
    if (!data.id) return NextResponse.json({ error: data.message || 'Erro ao criar pagamento', detail: data }, { status: 500 })

    const pixData = data.point_of_interaction?.transaction_data
    return NextResponse.json({
      payment_id: data.id,
      value,
      qr_code_image: pixData?.qr_code_base64 || null,
      pix_copy_paste: pixData?.qr_code || null,
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
