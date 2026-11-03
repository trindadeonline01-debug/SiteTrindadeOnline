import { NextResponse } from 'next/server'

// Versão (commit) que está no ar agora. O painel compara com a versão que ele
// carregou e avisa "Nova versão disponível" — lojista deixa a aba aberta o dia
// todo e continuava rodando código antigo depois de cada atualização.
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({ id: process.env.VERCEL_GIT_COMMIT_SHA || '' }, { headers: { 'Cache-Control': 'no-store' } })
}
