import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { applyDeliveryWalletPayment } from '@/lib/entregaWallet'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Poll de segurança pra tela de pagamento — caso o webhook do Mercado Pago
// demore, o cliente confere aqui até o Pix confirmar. Mesma lógica de
// crédito do branch `delivery_wallet` em /api/mp/webhook, idempotente.
export async function POST(req: NextRequest) {
  try {
    const { payment_id, company_id } = await req.json()
    if (!payment_id || !company_id) return NextResponse.json({ paid: false })

    const { data: setting } = await supabase.from('settings').select('value').eq('key', 'mp_access_token').maybeSingle()
    const accessToken = setting?.value
    if (!accessToken) return NextResponse.json({ paid: false })

    const res = await fetch(`https://api.mercadopago.com/v1/payments/${payment_id}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    const payment = await res.json()
    if (payment.status !== 'approved') return NextResponse.json({ paid: false })

    const { data: dp } = await supabase.from('delivery_payments').select('id, status, kind, credits, dias, value').eq('payment_id', String(payment_id)).maybeSingle()
    if (!dp) return NextResponse.json({ paid: false })

    if (dp.status !== 'paid') {
      await supabase.from('delivery_payments').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', dp.id)
      await applyDeliveryWalletPayment({ companyId: company_id, kind: dp.kind, credits: Number(dp.credits || 0), dias: Number(dp.dias || 0), value: Number(dp.value || payment.transaction_amount) })
    }

    return NextResponse.json({ paid: true })
  } catch (err: any) {
    return NextResponse.json({ paid: false, error: err.message })
  }
}
