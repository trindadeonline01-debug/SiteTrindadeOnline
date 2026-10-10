import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendMotoboyWhatsApp } from '@/lib/whatsapp'

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

    // Trava de envio — auditoria de segurança, out/2026: sem isso dava pra
    // pedir código ilimitado pro mesmo número (gasto de WhatsApp à toa e
    // abre espaço pra tentar adivinhar o código enviando vários). Cooldown
    // de 1min entre pedidos + teto de 5 por hora, igual o espírito da trava
    // de senha que já existe (login-senha/route.ts).
    const now = Date.now()
    const { data: recentes } = await supabase
      .from('motoboy_otp_codes').select('created_at')
      .eq('phone', phone).eq('purpose', purpose)
      .gte('created_at', new Date(now - 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
    if (recentes && recentes.length > 0) {
      const ultimoEnvio = new Date(recentes[0].created_at).getTime()
      if (now - ultimoEnvio < 60 * 1000) {
        return NextResponse.json({ error: 'Aguarda 1 minuto antes de pedir outro código.' }, { status: 429 })
      }
      if (recentes.length >= 5) {
        return NextResponse.json({ error: 'Muitos códigos pedidos — tenta de novo daqui a pouco.' }, { status: 429 })
      }
    }

    const code = genCode()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    await supabase.from('motoboy_otp_codes').insert({ phone, code, purpose, expires_at: expiresAt })

    const sent = await sendMotoboyWhatsApp(phone, `🔐 Seu código Trindade Online: *${code}*\n\nVale por 10 minutos. Não compartilha com ninguém.`)
    if (!sent.ok) {
      // Antes isso retornava {ok:true} mesmo com o envio falhando — a tela
      // ficava esperando um código que nunca ia chegar, sem erro nenhum.
      // Detalhe técnico incluído na mensagem pra dar pra diagnosticar
      // direto pela tela (só o Ricardo usa esse fluxo por enquanto).
      return NextResponse.json({ error: `Não deu pra mandar o código pro WhatsApp agora. Detalhe técnico: ${sent.detail || 'desconhecido'}` }, { status: 502 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[motoboy/enviar-codigo]', err)
    return NextResponse.json({ error: 'falha ao enviar código' }, { status: 500 })
  }
}
