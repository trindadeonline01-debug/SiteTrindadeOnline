import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Motoboy não tem conta no Supabase Auth — a sessão do painel dele é um
// token opaco simples guardado em motoboy_sessions (ver
// /api/motoboy/verificar-codigo e /api/motoboy/login-senha, que são quem
// cria a sessão). Resolve o token do header Authorization: Bearer.
export async function getMotoboyFromRequest(req: NextRequest): Promise<{ id: string; name: string; phone: string } | null> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data: session } = await supabase.from('motoboy_sessions').select('motoboy_id, expires_at').eq('token', token).maybeSingle()
  if (!session || new Date(session.expires_at).getTime() < Date.now()) return null
  const { data: motoboy } = await supabase.from('motoboys').select('id, name, phone').eq('id', session.motoboy_id).maybeSingle()
  return motoboy || null
}
