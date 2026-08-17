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

// Resposta 1:1 numa conversa do CRM — NÃO conta pro limite diário de disparo
// (crm_daily_send_count), que é só pra campanha em massa. Responder cliente
// que acabou de mandar mensagem é uso normal do WhatsApp, sem risco de bloqueio.
// Aceita texto puro OU mídia (media_path já enviado pelo navegador pro bucket
// crm-midia + media_type) — nunca os dois vazios.
export async function POST(req: NextRequest) {
  try {
    const { access_token, company_id, contact_id, text, media_path, media_type, reply_to_id } = await req.json()
    if (!access_token || !company_id || !contact_id || (!text?.trim() && !media_path)) {
      return NextResponse.json({ error: 'dados faltando' }, { status: 400 })
    }
    if (media_path && media_type !== 'image' && media_type !== 'audio') {
      return NextResponse.json({ error: 'media_type inválido' }, { status: 400 })
    }

    const { data: userData } = await supabaseAuth.auth.getUser(access_token)
    if (!userData?.user) return NextResponse.json({ error: 'sessão inválida' }, { status: 401 })

    const { data: company } = await supabase.from('companies').select('owner_id').eq('id', company_id).maybeSingle()
    if (!company || company.owner_id !== userData.user.id) {
      return NextResponse.json({ error: 'empresa não é sua' }, { status: 403 })
    }

    const { data: instance } = await supabase
      .from('crm_whatsapp_instances').select('instance_name, api_key')
      .eq('company_id', company_id).eq('status', 'connected').limit(1).maybeSingle()
    if (!instance) return NextResponse.json({ error: 'WhatsApp não está conectado' }, { status: 400 })

    const { data: contact } = await supabase.from('crm_contacts').select('phone').eq('id', contact_id).eq('company_id', company_id).maybeSingle()
    if (!contact) return NextResponse.json({ error: 'contato não encontrado' }, { status: 404 })

    // Responder citando: só precisa da key (remoteJid/fromMe/id) da mensagem original,
    // o WhatsApp busca o conteúdo pra montar a caixinha de citação sozinho.
    let quoted: any = undefined
    if (reply_to_id) {
      const { data: quotedMsg } = await supabase
        .from('crm_messages').select('wa_message_id, direction')
        .eq('id', reply_to_id).eq('company_id', company_id).maybeSingle()
      if (quotedMsg?.wa_message_id) {
        quoted = { key: { remoteJid: `${formatPhone(contact.phone)}@s.whatsapp.net`, fromMe: quotedMsg.direction === 'out', id: quotedMsg.wa_message_id } }
      }
    }

    const number = formatPhone(contact.phone)
    let evoRes: Response
    if (media_path) {
      // media_path é caminho no bucket privado — a Evolution precisa de uma
      // URL alcançável de fora pra baixar, então gera uma assinada de curta
      // duração só pro tempo do envio (a mídia já fica hospedada no próprio
      // WhatsApp depois de entregue, não depende dessa URL continuar válida).
      const { data: signed } = await supabase.storage.from('crm-midia').createSignedUrl(media_path, 300)
      if (!signed?.signedUrl) return NextResponse.json({ error: 'falha ao gerar URL da mídia' }, { status: 500 })

      if (media_type === 'image') {
        evoRes = await fetch(`${EVOLUTION_URL}/message/sendMedia/${encodeURIComponent(instance.instance_name)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: instance.api_key },
          body: JSON.stringify({ number, mediatype: 'image', media: signed.signedUrl, caption: text?.trim() || undefined, quoted }),
        })
      } else {
        evoRes = await fetch(`${EVOLUTION_URL}/message/sendWhatsAppAudio/${encodeURIComponent(instance.instance_name)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: instance.api_key },
          body: JSON.stringify({ number, audio: signed.signedUrl, quoted }),
        })
      }
    } else {
      evoRes = await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(instance.instance_name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: instance.api_key },
        body: JSON.stringify({ number, text: text.trim(), quoted }),
      })
    }

    if (!evoRes.ok) {
      const errText = await evoRes.text()
      return NextResponse.json({ error: `falha ao enviar (status ${evoRes.status}): ${errText.slice(0, 300)}` }, { status: 500 })
    }
    const evoData = await evoRes.json().catch(() => null)
    const waMessageId = evoData?.key?.id || null

    const now = new Date().toISOString()
    await supabase.from('crm_messages').insert({
      company_id, contact_id, direction: 'out',
      body: text?.trim() || null, media_type: media_path ? media_type : null, media_url: media_path || null,
      wa_message_id: waMessageId, sent_at: now, reply_to_id: reply_to_id || null, status: 'sent',
    })
    await supabase.from('crm_contacts').update({ last_message_at: now, last_read_at: now }).eq('id', contact_id)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha ao enviar' }, { status: 500 })
  }
}
