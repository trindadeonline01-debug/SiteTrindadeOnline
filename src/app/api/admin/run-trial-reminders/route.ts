import { NextResponse } from 'next/server'
import { runTrialReminders } from '@/lib/trialReminders'

export async function POST() {
  const result = await runTrialReminders()
  return NextResponse.json({ ok: true, ...result })
}
