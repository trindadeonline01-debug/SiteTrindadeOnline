import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, confirmarPendente } from '@/lib/lojaCheckout'

// Consulta do checkout público enquanto o Pix (ou cartão em análise) espera
// aprovação. Sem login de propósito (o cliente pode nem ter conta): só devolve
// o estado do pagamento e o número do pedido, nunca dado sensível. Também é
// uma 2ª via de confirmação caso o webhook do Mercado Pago atrase.
export async function POST(req: NextRequest) {
  try {
    const { pendenteId, pedidoId } = await req.json()

    if (pendenteId) {
      const { data: pend } = await supabaseAdmin.from('loja_pagamentos_pendentes').select('mp_payment_id').eq('id', pendenteId).maybeSingle()
      if (!pend) return NextResponse.json({ pago: false, estado: 'desconhecido' })
      const estado = await confirmarPendente(pend.mp_payment_id, req.url)
      if (estado.estado === 'convertido') {
        return NextResponse.json({ pago: true, estado: 'convertido', pedidoId: estado.pedidoId, orderNumber: estado.orderNumber })
      }
      return NextResponse.json({ pago: false, estado: estado.estado })
    }

    if (!pedidoId) return NextResponse.json({ error: 'pedido obrigatório' }, { status: 400 })
    const { data } = await supabaseAdmin.from('loja_pedidos').select('payment_status').eq('id', pedidoId).maybeSingle()
    return NextResponse.json({ pago: data?.payment_status === 'pago' })
  } catch (err) {
    console.error('[loja/checar-pix]', err)
    return NextResponse.json({ pago: false })
  }
}
