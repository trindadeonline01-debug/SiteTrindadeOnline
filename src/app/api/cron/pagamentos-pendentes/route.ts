import { NextRequest, NextResponse } from 'next/server'
import { varrerPendentesVencidos } from '@/lib/lojaCheckout'

// A cada 5 min (pg_cron): carrinho com Pix/cartão vencido vira "expirado" e o
// cashback volta pro cliente — a não ser que o Mercado Pago diga que aprovou,
// aí cria o pedido (ou avisa o admin se não conseguir).
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const resumo = await varrerPendentesVencidos(req.url)
  return NextResponse.json({ ok: true, ...resumo })
}
