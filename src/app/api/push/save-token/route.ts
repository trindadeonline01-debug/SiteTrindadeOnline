import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { token, user_id, user_type } = await req.json()
  if (!token) return NextResponse.json({ error: 'Token obrigatório' }, { status: 400 })

  await supabase.from('push_tokens').upsert(
    { token, user_id: user_id || null, user_type: user_type || 'user', updated_at: new Date().toISOString() },
    { onConflict: 'token' }
  )

  return NextResponse.json({ ok: true })
}
