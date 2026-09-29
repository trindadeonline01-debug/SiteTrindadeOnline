import { NextRequest, NextResponse } from 'next/server'
import { runBlastWatchdog } from '@/app/api/blast/route'

// Reativa campanha de disparo em massa travada, sozinho — antes só existia
// o vigia embutido no polling do painel (a cada 8s, só enquanto a aba
// Disparos está aberta). Achado real do Ricardo, set/2026: campanha
// travou quase 1h porque ele saiu da tela e ninguém rodou o vigia.
// Rodava a cada 5 minutos, mas o projeto está no plano Free da Vercel,
// que só permite cron 1x por dia — a tentativa de 5 em 5 min travava a
// validação do deploy silenciamente (nem aparecia como erro na lista).
// Por ora roda 1x por dia (13:40 UTC, vercel.json) — não é tão
// responsivo quanto o ideal, mas não depende de ninguém com a aba
// aberta. Pra voltar a ser frequente de verdade, precisa de upgrade
// pro plano Pro da Vercel.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const result = await runBlastWatchdog(new URL(req.url).origin)
  return NextResponse.json({ ok: true, ...result })
}
