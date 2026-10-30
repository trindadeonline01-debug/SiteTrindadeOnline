import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/lojaCheckout'
import { requireCompanyAccess } from '@/lib/requireUser'
import { cancelarPedidoLoja } from '@/lib/lojaCancelamento'

// Cancela o pedido de verdade (status + cashback + motoboy + estorno no
// Mercado Pago, ver src/lib/lojaCancelamento.ts).
// - por 'loja': precisa de login do dono (ou admin) — qualquer etapa antes
//   de entregue.
// - por 'cliente': sem login (o UUID do pedido é a credencial, mesmo modelo
//   de /pedido/[id]) — só em loja com Mercado Pago conectado e só enquanto o
//   pedido está em "Recebido". Depois disso o cliente só pode SOLICITAR
//   (/api/loja/solicitar-cancelamento) e a loja decide.
export async function POST(req: NextRequest) {
  try {
    const { pedidoId, por } = await req.json()
    if (!pedidoId || (por !== 'loja' && por !== 'cliente')) return NextResponse.json({ error: 'dados inválidos' }, { status: 400 })

    const { data: pedido } = await supabaseAdmin.from('loja_pedidos').select('company_id, status').eq('id', pedidoId).maybeSingle()
    if (!pedido) return NextResponse.json({ error: 'pedido não encontrado' }, { status: 404 })

    if (por === 'loja') {
      const access = await requireCompanyAccess(req, pedido.company_id)
      if (access instanceof NextResponse) return access
    } else {
      const { data: company } = await supabaseAdmin.from('companies').select('pix_mp_enabled').eq('id', pedido.company_id).maybeSingle()
      if (!company?.pix_mp_enabled) return NextResponse.json({ error: 'Nessa loja o cancelamento é pedido pra loja — usa "Solicitar cancelamento".' }, { status: 400 })
      if (pedido.status !== 'recebido') return NextResponse.json({ error: 'A loja já começou a preparar — agora só dá pra solicitar o cancelamento.' }, { status: 400 })
    }

    const r = await cancelarPedidoLoja({ pedidoId, por })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status || 400 })
    return NextResponse.json(r)
  } catch (err) {
    console.error('[loja/cancelar-pedido]', err)
    return NextResponse.json({ error: 'falha ao cancelar o pedido' }, { status: 500 })
  }
}
