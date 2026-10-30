import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyOwnerNewOrder } from '@/lib/whatsapp'
import { confirmarPendente } from '@/lib/lojaCheckout'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Webhook dos pagamentos de PEDIDO (Mercado Pago Connect, por loja) —
// separado do /api/mp/webhook de assinatura/destaque/entrega, que usa o
// token ÚNICO da plataforma. Cada pagamento foi criado com o token DE CADA
// LOJA, então a confirmação também usa o token daquela loja.
async function processPayment(paymentId: string, reqUrl: string) {
  try {
    // Fluxo atual: carrinho aguardando pagamento — o pedido nasce aqui.
    const estado = await confirmarPendente(paymentId, reqUrl)
    if (estado.estado !== 'desconhecido') return

    // Pedidos antigos (criados antes de out/2026, já com mp_payment_id e
    // pagamento ainda pendente): só marca como pago.
    const { data: pedido } = await supabase.from('loja_pedidos')
      .select('id, company_id, order_number, payment_status, customer_name, total')
      .eq('mp_payment_id', paymentId).maybeSingle()
    if (!pedido || pedido.payment_status === 'pago') return

    const { data: contaMp } = await supabase.from('company_mp_accounts')
      .select('mp_access_token').eq('company_id', pedido.company_id).maybeSingle()
    if (!contaMp) return
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${contaMp.mp_access_token}` },
    })
    const payment = await res.json()
    if (payment.status !== 'approved') return

    await supabase.from('loja_pedidos').update({ payment_status: 'pago', updated_at: new Date().toISOString() }).eq('id', pedido.id)
    const valorFmt = `R$ ${Number(pedido.total || 0).toFixed(2).replace('.', ',')}`
    await notifyOwnerNewOrder(pedido.company_id, `✅ *Pagamento confirmado* — Pedido #${pedido.order_number ?? ''}\n${pedido.customer_name || 'Cliente'} pagou ${valorFmt} pelo Mercado Pago. Pode seguir com o preparo.`)
  } catch (err) {
    console.error('[webhook-loja] processPayment error', err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if ((body.type === 'payment' || body.action === 'payment.updated' || body.action === 'payment.created') && body.data?.id) {
      await processPayment(String(body.data.id), req.url)
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}

export async function GET() {
  return NextResponse.json({ ok: true })
}
