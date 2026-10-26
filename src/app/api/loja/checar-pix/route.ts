import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Polling do checkout público enquanto o modal de Pix tá aberto — mesmo
// padrão de /api/entrega/checar-pagamento. Só devolve um booleano, nunca
// dado sensível, então não precisa de autenticação (o cliente pode nem ter
// conta).
export async function POST(req: NextRequest) {
  try {
    const { pedidoId } = await req.json()
    if (!pedidoId) return NextResponse.json({ error: 'pedido obrigatório' }, { status: 400 })

    const { data } = await supabase.from('loja_pedidos').select('payment_status').eq('id', pedidoId).maybeSingle()
    return NextResponse.json({ pago: data?.payment_status === 'pago' })
  } catch (err) {
    console.error('[loja/checar-pix]', err)
    return NextResponse.json({ pago: false })
  }
}
