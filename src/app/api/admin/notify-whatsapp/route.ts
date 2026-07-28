import { NextRequest, NextResponse } from 'next/server'
import { notifyAdmin, AdminEvent } from '@/lib/notifyAdmin'

export async function POST(req: NextRequest) {
  try {
    const event = (await req.json()) as AdminEvent
    await notifyAdmin(event)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
