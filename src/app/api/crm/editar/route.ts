import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evo.trindadeonline.com.br'

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : '55' + digits
}

// Edita mensagem de texto própria já enviada (WhatsApp só permite editar
// texto puro, não mídia). Sujeito à janela de tempo que o WhatsApp aceita
// pro remetente — se recusar, devolve o erro em vez de mudar só no nosso banco.
export async function POST(req: NextRequest) {
  try {
    const { access_token, company_id, message_id, text } = await req.json()
    if (!access_token || !company_id || !message_id || !text?.trim()) {
      return NextResponse.json({ error: 'dados faltando' }, { status: 400 })
    }

    const { data: userData } = await supabaseAuth.auth.getUser(access_token)
    if (!userData?.user) return NextResponse.json({ error: 'sessão inválida' }, { status: 401 })

    const { data: company } = await supabase.from('companies').select('owner_id').eq('id', company_id).maybeSingle()
    if (!company || company.owner_id !== userData.user.id) {
      return NextResponse.json({ error: 'empresa não é sua' }, { status: 403 })
    }

    const { data: msg } = await supabase
      .from('crm_messages').select('id, contact_id, direction, media_type, wa_message_id, deleted_at')
      .eq('id', message_id).eq('company_id', company_id).maybeSingle()
    if (!msg) return NextResponse.json({ error: 'mensagem não encontrada' }, { status: 404 })
    if (msg.direction !== 'out') return NextResponse.json({ error: 'só dá pra editar mensagem que você mandou' }, { status: 403 })
    if (msg.deleted_at) return NextResponse.json({ error: 'mensagem já foi apagada' }, { status: 400 })
    if (msg.media_type) return NextResponse.json({ error: 'só dá pra editar mensagem de texto' }, { status: 400 })
    if (!msg.wa_message_id) return NextResponse.json({ error: 'mensagem sem id do WhatsApp' }, { status: 400 })

    const { data: contact } = await supabase.from('crm_contacts').select('phone').eq('id', msg.contact_id).maybeSingle()
    if (!contact) return NextResponse.json({ error: 'contato não encontrado' }, { status: 404 })

    const { data: instance } = await supabase
      .from('crm_whatsapp_instances').select('instance_name, api_key')
      .eq('company_id', company_id).eq('status', 'connected').limit(1).maybeSingle()
    if (!instance) return NextResponse.json({ error: 'WhatsApp não está conectado' }, { status: 400 })

    const number = formatPhone(contact.phone)
    const evoRes = await fetch(`${EVOLUTION_URL}/chat/updateMessage/${encodeURIComponent(instance.instance_name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: instance.api_key },
      body: JSON.stringify({
        number, text: text.trim(),
        key: { remoteJid: `${number}@s.whatsapp.net`, fromMe: true, id: msg.wa_message_id },
      }),
    })
    if (!evoRes.ok) {
      const errText = await evoRes.text().catch(() => '')
      return NextResponse.json({ error: `falha ao editar (status ${evoRes.status}): ${errText.slice(0, 300)}` }, { status: 500 })
    }

    await supabase.from('crm_messages').update({ body: text.trim(), edited_at: new Date().toISOString() }).eq('id', message_id)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha ao editar' }, { status: 500 })
  }
}
