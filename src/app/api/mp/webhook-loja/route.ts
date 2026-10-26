import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyOwnerNewOrder } from '@/lib/whatsapp'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Webhook dos pagamentos de PEDIDO (Mercado Pago Connect, por loja) —
// separado do /api/mp/webhook de assinatura/destaque/entrega, que usa o
// token ÚNICO da plataforma. Aqui cada pagamento foi criado com o token DE
// CADA LOJA, então a confirmação também precisa do token daquela loja
// específica — por isso a notificação não é "o pagamento X foi aprovado",
// é "acha o pedido que tem esse payment_id, descobre a loja dele, usa o
// token DELA pra perguntar pro Mercado Pago se aprovou de verdade".
async function processPayment(paymentId: string) {
  try {
    const { data: pedido } = await supabase.from('loja_pedidos')
      .select('id, company_id, order_number, payment_status, customer_name, total')
      .eq('mp_payment_id', paymentId).maybeSingle()
    if (!pedido) return // não é um pagamento nosso (ou já não existe)
    if (pedido.payment_status === 'pago') return // Mercado Pago reenvia o mesmo webhook mais de uma vez — idempotente

    const { data: contaMp } = await supabase.from('company_mp_accounts')
      .select('mp_access_token').eq('company_id', pedido.company_id).maybeSingle()
    if (!contaMp) return

    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${contaMp.mp_access_token}` },
    })
    const payment = await res.json()
    if (payment.status !== 'approved') return

    await supabase.from('loja_pedidos').update({ payment_status: 'pago', updated_at: new Date().toISOString() }).eq('id', pedido.id)

    const valorFmt = `R$ ${Number(pedido.total || 0).toFixed(2).replace('.', ',')}`
    await notifyOwnerNewOrder(pedido.company_id, `✅ *Pix confirmado* — Pedido #${pedido.order_number ?? ''}\n${pedido.customer_name || 'Cliente'} pagou ${valorFmt} pelo Mercado Pago. Pode seguir com o preparo.`)
  } catch (err) {
    console.error('[webhook-loja] processPayment error', err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const response = NextResponse.json({ ok: true })
    if ((body.type === 'payment' || body.action === 'payment.updated') && body.data?.id) {
      await processPayment(String(body.data.id))
    }
    return response
  } catch {
    return NextResponse.json({ ok: true })
  }
}

export async function GET() {
  return NextResponse.json({ ok: true })
}
