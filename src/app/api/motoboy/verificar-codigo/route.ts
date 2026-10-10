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

// Confirma o código de 6 dígitos. No login, já cria a sessão do painel —
// sem isso o motoboy teria que confirmar de novo em seguida à toa.
export async function POST(req: NextRequest) {
  try {
    const { phone: rawPhone, code, purpose } = await req.json()
    if (!rawPhone?.trim() || !code?.trim() || (purpose !== 'cadastro' && purpose !== 'login')) {
      return NextResponse.json({ error: 'dados inválidos' }, { status: 400 })
    }
    const phone = formatPhone(rawPhone)

    // No login, mesma trava de 15min do login por senha (login-senha/
    // route.ts) — as duas formas de entrar somam pra UM lockout só por
    // motoboy, em vez de duas defesas desconectadas (auditoria, out/2026).
    let motoboyParaLogin: { id: string; name: string; status: string; login_failed_count: number | null } | null = null
    if (purpose === 'login') {
      const { data } = await supabase.from('motoboys').select('id, name, status, login_failed_count, login_locked_until').eq('phone', phone).maybeSingle()
      if (!data) return NextResponse.json({ error: 'Nenhum motoboy encontrado com esse WhatsApp.' }, { status: 404 })
      if (data.login_locked_until && new Date(data.login_locked_until).getTime() > Date.now()) {
        return NextResponse.json({ error: 'Muitas tentativas erradas — tenta de novo em 15 minutos, ou entra pela senha.' }, { status: 429 })
      }
      motoboyParaLogin = data
    }

    // Pega o código PENDENTE (não o que bateu com o dígito enviado) — é
    // assim que dá pra "queimar" o código quando o dígito está errado, em
    // vez de só dizer "incorreto" e deixar tentar de novo infinitamente
    // (auditoria de segurança, out/2026: 6 dígitos = 1 milhão de
    // combinações, sem limite de tentativa dava pra forçar bruto dentro
    // dos 10min de validade).
    const { data: otp } = await supabase
      .from('motoboy_otp_codes').select('id, code, expires_at, verified_at')
      .eq('phone', phone).eq('purpose', purpose)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()

    if (!otp || otp.verified_at || new Date(otp.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Código expirado — pede um novo.' }, { status: 400 })
    }

    if (otp.code !== code.trim()) {
      await supabase.from('motoboy_otp_codes').delete().eq('id', otp.id)
      if (motoboyParaLogin) {
        const nextCount = (motoboyParaLogin.login_failed_count || 0) + 1
        const lock = nextCount >= 5
          ? { login_locked_until: new Date(Date.now() + 15 * 60 * 1000).toISOString(), login_failed_count: 0 }
          : { login_failed_count: nextCount }
        await supabase.from('motoboys').update(lock).eq('id', motoboyParaLogin.id)
      }
      return NextResponse.json({ error: 'Código incorreto — pede um novo.' }, { status: 400 })
    }

    await supabase.from('motoboy_otp_codes').update({ verified_at: new Date().toISOString() }).eq('id', otp.id)

    if (motoboyParaLogin) {
      if (motoboyParaLogin.login_failed_count) {
        await supabase.from('motoboys').update({ login_failed_count: 0, login_locked_until: null }).eq('id', motoboyParaLogin.id)
      }
      const token = crypto.randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
      await supabase.from('motoboy_sessions').insert({ token, motoboy_id: motoboyParaLogin.id, expires_at: expiresAt })

      return NextResponse.json({ ok: true, token, motoboy: { id: motoboyParaLogin.id, name: motoboyParaLogin.name, status: motoboyParaLogin.status } })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[motoboy/verificar-codigo]', err)
    return NextResponse.json({ error: 'falha ao verificar código' }, { status: 500 })
  }
}
