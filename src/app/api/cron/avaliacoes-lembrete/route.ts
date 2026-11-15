import { NextRequest, NextResponse } from 'next/server'
import { runAvaliacoesLembrete } from '@/lib/avaliacoesLembrete'

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json({ ok: true, ...(await runAvaliacoesLembrete()) })
  } catch (err) {
    console.error('[avaliacoes-lembrete]', err)
    return NextResponse.json({ error: 'falhou' }, { status: 500 })
  }
}
