import { NextResponse } from 'next/server'
import { runPlanExpiration } from '@/lib/planExpiration'

export async function POST() {
  const result = await runPlanExpiration()
  return NextResponse.json({ ok: true, ...result })
}
