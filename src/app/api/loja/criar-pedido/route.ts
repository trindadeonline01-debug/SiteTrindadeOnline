import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { temProdutoPorPeso } from '@/lib/cobrancaPesagem'
import {
  prepararCheckout, reservarCashback, devolverCashback, finalizarPedidoLoja,
  criarPagamentoMp, pixExpiracao, salvarPendente, PIX_VALIDADE_MIN,
} from '@/lib/lojaCheckout'

const sbAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

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

    // Loja que também aceita pagamento no local (Painel → Pagamentos): essas
    // formas seguem o fluxo de sempre, pedido na hora e pagamento na entrega/retirada.
    // "pix_local" = Pix direto pra loja, combinado na hora (não passa pelo Mercado Pago).
    const metodoLocal = prep.payload.paymentMethod === 'pix_local' ? 'pix' : prep.payload.paymentMethod
    const pagaNoLocal = !!contaMp && prep.payload.origin !== 'conversa' && !!metodoLocal
      && prep.payload.paymentMethod !== 'pix' && prep.metodosOnline.local.includes(metodoLocal)
    if (pagaNoLocal) prep.payload.paymentMethod = metodoLocal

    if (contaMp && !pagaNoLocal) {
      if (prep.payload.origin === 'conversa' || prep.payload.paymentMethod !== 'pix') {
        return NextResponse.json({ error: 'Nessa loja o pagamento é feito pelo site: escolhe Pix ou cartão.' }, { status: 400 })
      }
      if (!prep.metodosOnline.pix) {
        return NextResponse.json({ error: 'Essa loja não aceita Pix pelo site — paga com cartão.' }, { status: 400 })
      }

      // Produto vendido por kg: o valor só fecha depois de pesar. O pedido nasce
      // agora, sem cobrança, e a loja manda o Pix com o valor real depois
      // (src/lib/cobrancaPesagem.ts). Cashback não entra aqui: o total ainda vai mudar.
      const { data: prods } = await sbAdmin.from('loja_produtos').select('name').in('id', [...new Set(prep.payload.items.map(l => l.produtoId))])
      if (temProdutoPorPeso((prods || []).map(x => String(x.name)))) {
        const r = await finalizarPedidoLoja({ ...prep.payload, paymentMethod: 'pix' }, { company, reqUrl: req.url, cashbackUsado: 0, devolverCashbackSeFalhar: false, aguardandoPesagem: true })
        if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
        return NextResponse.json({ ok: true, pedidoId: r.pedidoId, orderNumber: r.orderNumber, total: prep.payload.total, cashbackUsado: 0, pix: null, pesagem: true })
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
