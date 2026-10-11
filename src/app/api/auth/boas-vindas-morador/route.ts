import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/phone'
import { sendPlatformWhatsApp } from '@/lib/whatsapp'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Chamada pelo próprio /cadastro depois que a conta do morador é criada
// com sucesso. Só manda a mensagem se esse telefone passou de verdade pela
// verificação de WhatsApp do cadastro nos últimos minutos — sem essa
// checagem, a rota virava um jeito de mandar mensagem da plataforma pra
// qualquer número, só informando phone+name no corpo da requisição.
export async function POST(req: NextRequest) {
  try {
    const { phone: rawPhone, name } = await req.json()
    if (!rawPhone) return NextResponse.json({ error: 'phone obrigatório' }, { status: 400 })
    const phone = normalizePhone(rawPhone)

    const { data: verified } = await supabase
      .from('whatsapp_verifications')
      .select('id')
      .eq('phone', phone)
      .eq('used', true)
      .gte('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())
      .limit(1)
      .maybeSingle()
    if (!verified) return NextResponse.json({ ok: false })

    const primeiroNome = (name || '').trim().split(' ')[0] || 'por aqui'
    const text = `🎉 Oi, *${primeiroNome}*! Seja bem-vindo ao *Trindade Online*.\n\nAqui você encontra empresas, serviços, cupons e promoções do bairro, tudo num lugar só:\n\n🔍 Busque qualquer negócio da Trindade\n❤️ Favorite os que você mais usa\n🎟️ Fique de olho nos cupons e promoções da semana\n\n👉 https://www.trindadeonline.com.br\n\nQualquer dúvida, pode chamar aqui mesmo! 😊`

    const result = await sendPlatformWhatsApp(phone, text)
    return NextResponse.json({ ok: result.ok })
  } catch (err: any) {
    console.error('[auth/boas-vindas-morador]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
