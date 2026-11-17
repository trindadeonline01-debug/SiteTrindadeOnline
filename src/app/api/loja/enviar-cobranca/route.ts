import { NextRequest, NextResponse } from 'next/server'
import { requireCompanyAccess } from '@/lib/requireUser'
import { enviarCobrancaPesagem } from '@/lib/cobrancaPesagem'

// Botão "Enviar cobrança" (painel → Pedidos) do pedido que aguarda pesagem.
export async function POST(req: NextRequest) {
  try {
    const { companyId, pedidoId } = await req.json()
    if (!companyId || !pedidoId) return NextResponse.json({ error: 'dados obrigatórios' }, { status: 400 })
    const access = await requireCompanyAccess(req, companyId)
    if (access instanceof NextResponse) return access
    const r = await enviarCobrancaPesagem(pedidoId, companyId, req.url)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ ok: true, total: r.total })
  } catch (err) {
    console.error('[enviar-cobranca]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
