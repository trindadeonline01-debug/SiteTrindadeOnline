import { NextRequest, NextResponse } from 'next/server'
import { runTrialReminders } from '@/lib/trialReminders'
import { requireAdmin } from '@/lib/requireAdmin'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  const result = await runTrialReminders()
  return NextResponse.json({ ok: true, ...result })
}
