import { NextRequest, NextResponse } from 'next/server'
import { runPlanExpiration } from '@/lib/planExpiration'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const result = await runPlanExpiration()
  return NextResponse.json({ ok: true, ...result })
}
