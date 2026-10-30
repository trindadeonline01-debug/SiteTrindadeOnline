import { NextRequest, NextResponse } from 'next/server'
import {
  prepararCheckout, reservarCashback, devolverCashback, finalizarPedidoLoja,
  criarPagamentoMp, pixExpiracao, salvarPendente, PIX_VALIDADE_MIN,
} from '@/lib/lojaCheckout'

// Cria o pedido do cardápio público — roda com service role de propósito:
// é o que abre o checkout pra quem NÃO tem conta (só nome + WhatsApp).
//
// Loja com Mercado Pago conectado: só aceita Pix (aqui) ou cartão
// (/api/loja/pagar-cartao), e o pedido NÃO é criado agora — o carrinho
// fica aguardando e o pedido só nasce quando o pagamento aprova
// (lib/lojaCheckout.ts → confirmarPendente). Loja sem conta conectada
// segue como sempre: pedido criado na hora, pagamento combinado na entrega.
export async function POST(req: NextRequest) {
  try {
    const prep = await prepararCheckout(await req.json())
    if (!prep.ok) return NextResponse.json({ error: prep.error }, { status: prep.status })
    const { company, contaMp, useCashback } = prep

    if (contaMp) {
      if (prep.payload.origin === 'conversa' || prep.payload.paymentMethod !== 'pix') {
        return NextResponse.json({ error: 'Nessa loja o pagamento é feito pelo site: escolhe Pix ou cartão.' }, { status: 400 })
      }

      const { cashbackUsado, payload } = await reservarCashback(company, prep.payload, useCashback)

      // Cashback cobriu tudo: não tem o que cobrar no Mercado Pago.
      if (payload.total <= 0) {
        const r = await finalizarPedidoLoja(payload, { company, reqUrl: req.url, cashbackUsado, pagoOnline: true, devolverCashbackSeFalhar: true })
        if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
        return NextResponse.json({ ok: true, pedidoId: r.pedidoId, orderNumber: r.orderNumber, total: 0, cashbackUsado, pix: null })
      }

      const exp = pixExpiracao()
      const mp = await criarPagamentoMp(contaMp, {
        transaction_amount: payload.total,
        description: `Pedido — ${company.name}`,
        payment_method_id: 'pix',
        payer: { email: 'cliente@trindadeonline.com.br' },
        date_of_expiration: exp.mp,
        notification_url: `${new URL(req.url).origin}/api/mp/webhook-loja`,
      }, `pix-${company.id}-${crypto.randomUUID()}`)
      if (!mp.ok) {
        console.error('[criar-pedido] mp recusou pix', mp.data)
        await devolverCashback(company.id, payload.customerPhone, cashbackUsado)
        return NextResponse.json({ error: 'Não deu pra gerar o Pix agora — tenta de novo ou paga com cartão.' }, { status: 502 })
      }

      const mpPaymentId = String(mp.data.id)
      const pendenteId = await salvarPendente({ company, payload, mpPaymentId, metodo: 'pix', cashbackUsado, expiresAt: exp.db })
      if (!pendenteId) {
        await devolverCashback(company.id, payload.customerPhone, cashbackUsado)
        return NextResponse.json({ error: 'Não deu pra gerar o Pix agora — tenta de novo em alguns segundos.' }, { status: 500 })
      }

      return NextResponse.json({
        ok: true, pendenteId, total: payload.total, cashbackUsado, validadeMin: PIX_VALIDADE_MIN,
        pix: {
          paymentId: mpPaymentId,
          qrCodeBase64: mp.data.point_of_interaction?.transaction_data?.qr_code_base64 || null,
          qrCode: mp.data.point_of_interaction?.transaction_data?.qr_code || null,
        },
      })
    }

    const { cashbackUsado, payload } = await reservarCashback(company, prep.payload, useCashback)
    const r = await finalizarPedidoLoja(payload, { company, reqUrl: req.url, cashbackUsado, devolverCashbackSeFalhar: true })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ ok: true, pedidoId: r.pedidoId, orderNumber: r.orderNumber, total: payload.total, cashbackUsado, pix: null })
  } catch (err) {
    console.error('[criar-pedido] falha geral:', err)
    return NextResponse.json({ error: 'Não deu pra enviar seu pedido agora. Tenta de novo em alguns segundos.' }, { status: 500 })
  }
}
