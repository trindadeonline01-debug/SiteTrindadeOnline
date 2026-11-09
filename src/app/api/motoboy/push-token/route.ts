import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getMotoboyFromRequest } from '@/lib/motoboySession'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// O app do motoboy manda aqui o token FCM do aparelho (ver
// app-motoboy/src/push.ts). Um token só pertence a um motoboy por vez:
// se outro motoboy logar no mesmo celular, o token passa pra ele.
export async function POST(req: NextRequest) {
  const motoboy = await getMotoboyFromRequest(req)
  if (!motoboy) return NextResponse.json({ error: 'sessão inválida' }, { status: 401 })
  const { token, platform } = await req.json().catch(() => ({}))
  if (typeof token !== 'string' || token.length < 20 || token.length > 4096) {
    return NextResponse.json({ error: 'token inválido' }, { status: 400 })
  }
  const { error } = await supabase.from('motoboy_push_tokens').upsert(
    { motoboy_id: motoboy.id, token, platform: platform === 'ios' ? 'ios' : 'android', updated_at: new Date().toISOString() },
    { onConflict: 'token' },
  )
  if (error) return NextResponse.json({ error: 'falha ao salvar' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
