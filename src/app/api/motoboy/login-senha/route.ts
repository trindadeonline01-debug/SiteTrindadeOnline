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

// Trava brute-force: 5 tentativas erradas seguidas bloqueia por 15min —
// achado em auditoria de segurança, out/2026 (login não tinha limite
// nenhum, dava pra tentar senha infinita pro mesmo número). Zera a
// contagem no login certo.
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000

// Segunda opção de acesso ao painel, além do código por WhatsApp — pra
// quem prefere não esperar mensagem toda vez que quiser entrar.
export async function POST(req: NextRequest) {
  try {
    const { phone: rawPhone, senha } = await req.json()
    if (!rawPhone?.trim() || !senha?.trim()) return NextResponse.json({ error: 'dados obrigatórios' }, { status: 400 })
    const phone = formatPhone(rawPhone)

    const { data: motoboy } = await supabase.from('motoboys')
      .select('id, name, status, password_hash, login_failed_count, login_locked_until')
      .eq('phone', phone).maybeSingle()

    if (motoboy?.login_locked_until && new Date(motoboy.login_locked_until).getTime() > Date.now()) {
      return NextResponse.json({ error: 'Muitas tentativas erradas — tenta de novo em 15 minutos, ou entra pelo código via WhatsApp.' }, { status: 429 })
    }

    const ok = !!motoboy?.password_hash && verifyPassword(senha, motoboy.password_hash)
    if (!motoboy || !ok) {
      // Mesma mensagem genérica de sempre, pra não revelar se o problema
      // foi o telefone não cadastrado ou a senha errada — mas só conta
      // tentativa (e bloqueia) quando o motoboy existe de verdade, senão
      // um número aleatório nunca cadastrado nunca bloquearia nada.
      if (motoboy) {
        const nextCount = (motoboy.login_failed_count || 0) + 1
        const lock = nextCount >= MAX_ATTEMPTS ? { login_locked_until: new Date(Date.now() + LOCKOUT_MS).toISOString(), login_failed_count: 0 } : { login_failed_count: nextCount }
        await supabase.from('motoboys').update(lock).eq('id', motoboy.id)
      }
      return NextResponse.json({ error: 'WhatsApp ou senha incorretos.' }, { status: 401 })
    }

    if (motoboy.login_failed_count > 0 || motoboy.login_locked_until) {
      await supabase.from('motoboys').update({ login_failed_count: 0, login_locked_until: null }).eq('id', motoboy.id)
    }

    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
    await supabase.from('motoboy_sessions').insert({ token, motoboy_id: motoboy.id, expires_at: expiresAt })

    return NextResponse.json({ ok: true, token, motoboy: { id: motoboy.id, name: motoboy.name, status: motoboy.status } })
  } catch (err: any) {
    console.error('[motoboy/login-senha]', err)
    return NextResponse.json({ error: 'falha ao entrar' }, { status: 500 })
  }
}
