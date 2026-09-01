import { NextRequest, NextResponse } from 'next/server'
import { runPlanExpiration } from '@/lib/planExpiration'
import { requireAdmin } from '@/lib/requireAdmin'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  const result = await runPlanExpiration()
  return NextResponse.json({ ok: true, ...result })
}
