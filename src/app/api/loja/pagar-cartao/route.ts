import { NextRequest, NextResponse } from 'next/server'
import {
  prepararCheckout, reservarCashback, devolverCashback, finalizarPedidoLoja,
  criarPagamentoMp, salvarPendente, confirmarPendente, CARTAO_ANALISE_DIAS,
} from '@/lib/lojaCheckout'

// Cartão (crédito ou débito) pelo Mercado Pago, só pra loja com conta
// conectada. O número do cartão nunca passa por aqui: o formulário seguro do
// Mercado Pago no navegador transforma o cartão num `token`, e é só esse
// token que chega. O pedido só é criado se o pagamento aprovar.

const RECUSA: Record<string, string> = {
  cc_rejected_insufficient_amount: 'Saldo ou limite insuficiente.',
  cc_rejected_bad_filled_security_code: 'Código de segurança (CVV) incorreto.',
  cc_rejected_bad_filled_date: 'Data de validade incorreta.',
  cc_rejected_bad_filled_other: 'Confere os dados do cartão.',
  cc_rejected_call_for_authorize: 'O banco pediu autorização — liga pro seu banco e tenta de novo.',
  cc_rejected_card_disabled: 'Cartão desativado — liga pro seu banco.',
  cc_rejected_duplicated_payment: 'Esse pagamento já foi feito agora há pouco.',
  cc_rejected_high_risk: 'Pagamento recusado por segurança — tenta outro cartão ou paga com Pix.',
  cc_rejected_max_attempts: 'Muitas tentativas — tenta outro cartão ou paga com Pix.',
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const card = body?.card
    if (!card?.token || !card?.payment_method_id || !card?.payer?.email) {
      return NextResponse.json({ error: 'Dados do cartão incompletos — tenta de novo.' }, { status: 400 })
    }

    const prep = await prepararCheckout({ ...body, paymentMethod: 'cartao_credito', origin: 'cardapio_publico' })
    if (!prep.ok) return NextResponse.json({ error: prep.error }, { status: prep.status })
    const { company, contaMp, useCashback } = prep
    if (!contaMp) return NextResponse.json({ error: 'Essa loja não aceita cartão pelo site.' }, { status: 400 })

    const { cashbackUsado, payload } = await reservarCashback(company, prep.payload, useCashback)
    if (payload.total <= 0) {
      const r = await finalizarPedidoLoja(payload, { company, reqUrl: req.url, cashbackUsado, pagoOnline: true, devolverCashbackSeFalhar: true })
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
      return NextResponse.json({ ok: true, estado: 'aprovado', pedidoId: r.pedidoId, orderNumber: r.orderNumber })
    }

    const mp = await criarPagamentoMp(contaMp, {
      transaction_amount: payload.total,
      token: card.token,
      description: `Pedido — ${company.name}`,
      installments: 1,
      payment_method_id: card.payment_method_id,
      issuer_id: card.issuer_id || undefined,
      payer: { email: card.payer.email, identification: card.payer.identification || undefined },
      notification_url: `${new URL(req.url).origin}/api/mp/webhook-loja`,
    }, `cartao-${company.id}-${crypto.randomUUID()}`)

    if (!mp.ok) {
      console.error('[pagar-cartao] mp recusou criar pagamento', mp.data)
      await devolverCashback(company.id, payload.customerPhone, cashbackUsado)
      return NextResponse.json({ error: 'Não deu pra processar o cartão agora — confere os dados ou paga com Pix.' }, { status: 502 })
    }

    const status: string = mp.data.status
    if (status === 'rejected' || status === 'cancelled') {
      await devolverCashback(company.id, payload.customerPhone, cashbackUsado)
      return NextResponse.json({ error: `Pagamento recusado. ${RECUSA[mp.data.status_detail] || 'Tenta outro cartão ou paga com Pix.'}` }, { status: 402 })
    }

    const comPagamento = { ...payload, paymentMethod: mp.data.payment_type_id === 'debit_card' ? 'cartao_debito' : 'cartao_credito' }
    const mpPaymentId = String(mp.data.id)
    const expiresAt = new Date(Date.now() + CARTAO_ANALISE_DIAS * 86400000).toISOString()
    const pendenteId = await salvarPendente({ company, payload: comPagamento, mpPaymentId, metodo: 'cartao', cashbackUsado, expiresAt })
    if (!pendenteId) {
      // Raríssimo: o cartão foi cobrado mas não deu pra guardar o carrinho.
      // Cria o pedido direto em vez de perder a venda.
      if (status === 'approved') {
        const r = await finalizarPedidoLoja(comPagamento, { company, reqUrl: req.url, cashbackUsado, mpPaymentId, pagoOnline: true, devolverCashbackSeFalhar: false })
        if (r.ok) return NextResponse.json({ ok: true, estado: 'aprovado', pedidoId: r.pedidoId, orderNumber: r.orderNumber })
      }
      return NextResponse.json({ error: 'Pagamento recebido, mas houve um erro ao registrar o pedido. A loja vai entrar em contato.' }, { status: 500 })
    }

    if (status === 'approved') {
      const estado = await confirmarPendente(mpPaymentId, req.url)
      if (estado.estado === 'convertido') {
        return NextResponse.json({ ok: true, estado: 'aprovado', pedidoId: estado.pedidoId, orderNumber: estado.orderNumber })
      }
    }

    // Em análise pelo Mercado Pago (in_process/pending): o pedido nasce
    // sozinho quando aprovar, pelo webhook.
    return NextResponse.json({ ok: true, estado: 'em_analise', pendenteId })
  } catch (err) {
    console.error('[pagar-cartao] falha geral:', err)
    return NextResponse.json({ error: 'Não deu pra processar o pagamento agora. Tenta de novo em alguns segundos.' }, { status: 500 })
  }
}
