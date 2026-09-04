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

    const { data: otp } = await supabase
      .from('motoboy_otp_codes').select('id, expires_at, verified_at')
      .eq('phone', phone).eq('code', code.trim()).eq('purpose', purpose)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()

    if (!otp) return NextResponse.json({ error: 'Código incorreto.' }, { status: 400 })
    if (new Date(otp.expires_at).getTime() < Date.now()) return NextResponse.json({ error: 'Código expirado — pede um novo.' }, { status: 400 })

    if (!otp.verified_at) await supabase.from('motoboy_otp_codes').update({ verified_at: new Date().toISOString() }).eq('id', otp.id)

    if (purpose === 'login') {
      const { data: motoboy } = await supabase.from('motoboys').select('id, name, status').eq('phone', phone).maybeSingle()
      if (!motoboy) return NextResponse.json({ error: 'Nenhum motoboy encontrado com esse WhatsApp.' }, { status: 404 })

      const token = crypto.randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
      await supabase.from('motoboy_sessions').insert({ token, motoboy_id: motoboy.id, expires_at: expiresAt })

      return NextResponse.json({ ok: true, token, motoboy: { id: motoboy.id, name: motoboy.name, status: motoboy.status } })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha ao verificar código' }, { status: 500 })
  }
}
