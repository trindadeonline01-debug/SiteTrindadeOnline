import { NextRequest, NextResponse } from 'next/server'
import { checkExpiredOffers } from '@/lib/entregaDispatch'

// checkExpiredOffers() antes só rodava a reboque de um webhook de motoboy ou
// do polling de /painel/entrega — se nenhum motoboy mandasse mensagem e
// nenhuma loja estivesse com o painel aberto, uma oferta vencida (1min)
// ficava "pendente" indefinidamente, sem passar pro próximo da fila (achado
// real, set/2026: oferta parada 49min até alguém sem querer disparar o
// webhook).
//
// O cron do vercel.json cobre isso só 1x/dia (plano Hobby não permite mais
// frequente — achado real, set/2026: um cron por minuto aqui derrubou TODOS
// os deploys em silêncio por mais de 24h, sem aparecer nem como erro na
// lista da Vercel). A checagem de verdade, a cada minuto, roda por fora via
// pg_cron do Supabase chamando essa mesma rota com o mesmo CRON_SECRET —
// nada de token novo, mesma trava de sempre.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  await checkExpiredOffers()
  return NextResponse.json({ ok: true })
}
