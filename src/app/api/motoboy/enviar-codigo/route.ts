import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendMotoboyWhatsApp } from '@/lib/entregaDispatch'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : '55' + digits
}
function genCode(): string { return String(Math.floor(100000 + Math.random() * 900000)) }

// Manda um código de 6 dígitos pro WhatsApp — usado tanto na etapa de
// verificação do cadastro (/motoboy/cadastro) quanto no login sem senha
// do painel do motoboy (/motoboy/painel).
export async function POST(req: NextRequest) {
  try {
    const { phone: rawPhone, purpose } = await req.json()
    if (!rawPhone?.trim() || (purpose !== 'cadastro' && purpose !== 'login')) {
      return NextResponse.json({ error: 'dados inválidos' }, { status: 400 })
    }
    const phone = formatPhone(rawPhone)

    if (purpose === 'login') {
      const { data: motoboy } = await supabase.from('motoboys').select('id').eq('phone', phone).maybeSingle()
      if (!motoboy) return NextResponse.json({ error: 'Nenhum motoboy encontrado com esse WhatsApp.' }, { status: 404 })
    }

    const code = genCode()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    await supabase.from('motoboy_otp_codes').insert({ phone, code, purpose, expires_at: expiresAt })

    await sendMotoboyWhatsApp(phone, `🔐 Seu código Trindade Online: *${code}*\n\nVale por 10 minutos. Não compartilha com ninguém.`)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha ao enviar código' }, { status: 500 })
  }
}
