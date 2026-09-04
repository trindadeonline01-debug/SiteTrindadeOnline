import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : '55' + digits
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const check = crypto.scryptSync(password, salt, 64).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'))
}

// Segunda opção de acesso ao painel, além do código por WhatsApp — pra
// quem prefere não esperar mensagem toda vez que quiser entrar.
export async function POST(req: NextRequest) {
  try {
    const { phone: rawPhone, senha } = await req.json()
    if (!rawPhone?.trim() || !senha?.trim()) return NextResponse.json({ error: 'dados obrigatórios' }, { status: 400 })
    const phone = formatPhone(rawPhone)

    const { data: motoboy } = await supabase.from('motoboys').select('id, name, status, password_hash').eq('phone', phone).maybeSingle()
    if (!motoboy || !motoboy.password_hash || !verifyPassword(senha, motoboy.password_hash)) {
      return NextResponse.json({ error: 'WhatsApp ou senha incorretos.' }, { status: 401 })
    }

    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
    await supabase.from('motoboy_sessions').insert({ token, motoboy_id: motoboy.id, expires_at: expiresAt })

    return NextResponse.json({ ok: true, token, motoboy: { id: motoboy.id, name: motoboy.name, status: motoboy.status } })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha ao entrar' }, { status: 500 })
  }
}
