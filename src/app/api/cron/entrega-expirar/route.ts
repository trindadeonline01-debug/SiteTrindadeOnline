import { NextRequest, NextResponse } from 'next/server'
import { checkExpiredOffers } from '@/lib/entregaDispatch'

// checkExpiredOffers() antes só rodava a reboque de um webhook de motoboy ou
// do polling de /painel/entrega — se nenhum motoboy mandasse mensagem e
// nenhuma loja estivesse com o painel aberto, uma oferta vencida (1min)
// ficava "pendente" indefinidamente, sem passar pro próximo da fila (achado
// real, set/2026: oferta parada 49min até alguém sem querer disparar o
// webhook). Esse cron cobre o caso de ninguém estar olhando.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  await checkExpiredOffers()
  return NextResponse.json({ ok: true })
}
