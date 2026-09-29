import { NextRequest, NextResponse } from 'next/server'
import { runBlastWatchdog } from '@/app/api/blast/route'

// Reativa campanha de disparo em massa travada, sozinho — antes só existia
// o vigia embutido no polling do painel (a cada 8s, só enquanto a aba
// Disparos está aberta). Achado real do Ricardo, set/2026: campanha
// travou quase 1h porque ele saiu da tela e ninguém rodou o vigia. Roda
// a cada 5 minutos via vercel.json, independente de qualquer aba aberta.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const result = await runBlastWatchdog(new URL(req.url).origin)
  return NextResponse.json({ ok: true, ...result })
}
