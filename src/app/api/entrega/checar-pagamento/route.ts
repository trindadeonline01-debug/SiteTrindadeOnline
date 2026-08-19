import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

    const { data: dp } = await supabase.from('delivery_payments').select('id, status, kind, credits').eq('payment_id', String(payment_id)).maybeSingle()
    if (!dp) return NextResponse.json({ paid: false })

    if (dp.status !== 'paid') {
      await supabase.from('delivery_payments').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', dp.id)
      if (dp.kind === 'diaria') {
        const today = new Date().toISOString().slice(0, 10)
        await supabase.from('company_delivery_wallet').upsert(
          { company_id, daily_paid_on: today, updated_at: new Date().toISOString() },
          { onConflict: 'company_id' }
        )
        await supabase.from('delivery_credit_ledger').insert({ company_id, kind: 'diaria', amount: payment.transaction_amount, credits_delta: 0 })
      } else {
        const { data: wallet } = await supabase.from('company_delivery_wallet').select('credits').eq('company_id', company_id).maybeSingle()
        const newCredits = (wallet?.credits || 0) + Number(dp.credits || 0)
        await supabase.from('company_delivery_wallet').upsert(
          { company_id, credits: newCredits, updated_at: new Date().toISOString() },
          { onConflict: 'company_id' }
        )
        await supabase.from('delivery_credit_ledger').insert({ company_id, kind: 'compra_credito', amount: payment.transaction_amount, credits_delta: Number(dp.credits || 0) })
      }
    }

    return NextResponse.json({ paid: true })
  } catch (err: any) {
    return NextResponse.json({ paid: false, error: err.message })
  }
}
