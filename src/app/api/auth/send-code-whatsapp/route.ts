import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/phone'
import { sendPlatformWhatsApp } from '@/lib/entregaDispatch'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Confirmação do cadastro de morador por WhatsApp em vez de email — email
// continua sendo pedido no formulário (é o que vira o login), só a
// confirmação de "tem alguém de verdade aqui" que trocou de canal.
export async function POST(req: NextRequest) {
  try {
    const { email, phone: rawPhone } = await req.json()
    if (!email) return NextResponse.json({ error: 'Email obrigatório' }, { status: 400 })
    if (!rawPhone) return NextResponse.json({ error: 'WhatsApp obrigatório' }, { status: 400 })
    const phone = normalizePhone(rawPhone)
    if (phone.length < 12) return NextResponse.json({ error: 'Informe um número de WhatsApp válido.' }, { status: 400 })

    const { data: existing } = await supabase.auth.admin.listUsers()
    const alreadyExists = existing?.users.find(u => u.email === email)
    if (alreadyExists) return NextResponse.json({ error: 'Este email já está cadastrado.' }, { status: 400 })

    const code = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    await supabase.from('whatsapp_verifications').delete().eq('phone', phone)
    await supabase.from('whatsapp_verifications').insert({ phone, code, expires_at: expiresAt })

    await sendPlatformWhatsApp(phone, `🔑 Seu código de verificação da Trindade Online: *${code}*\n\nVálido por 10 minutos. Se não foi você, ignore essa mensagem.`)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
