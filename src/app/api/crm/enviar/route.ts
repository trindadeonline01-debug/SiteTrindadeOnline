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
const MEDIA_TYPES = ['image', 'audio', 'video', 'document']

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : '55' + digits
}

// Resposta 1:1 numa conversa do CRM — NÃO conta pro limite diário de disparo
// (crm_daily_send_count), que é só pra campanha em massa. Responder cliente
// que acabou de mandar mensagem é uso normal do WhatsApp, sem risco de bloqueio.
// Aceita texto, mídia (media_path já enviado pelo navegador pro bucket
// crm-midia + media_type), localização OU compartilhar contato — sempre um
// desses preenchido.
export async function POST(req: NextRequest) {
  try {
    const {
      access_token, company_id, contact_id, text, media_path, media_type, file_name,
      location, contact_share, reply_to_id, client_message_id,
    } = await req.json()
    if (!access_token || !company_id || !contact_id || (!text?.trim() && !media_path && !location && !contact_share)) {
      return NextResponse.json({ error: 'dados faltando' }, { status: 400 })
    }
    if (media_path && !MEDIA_TYPES.includes(media_type)) {
      return NextResponse.json({ error: 'media_type inválido' }, { status: 400 })
    }
    if (location && (typeof location.lat !== 'number' || typeof location.lng !== 'number')) {
      return NextResponse.json({ error: 'localização inválida' }, { status: 400 })
    }
    if (contact_share && !contact_share.phone) {
      return NextResponse.json({ error: 'contato pra compartilhar sem telefone' }, { status: 400 })
    }

    const { data: userData } = await supabaseAuth.auth.getUser(access_token)
    if (!userData?.user) return NextResponse.json({ error: 'sessão inválida' }, { status: 401 })

    const { data: company } = await supabase.from('companies').select('owner_id').eq('id', company_id).maybeSingle()
    if (!company) return NextResponse.json({ error: 'empresa não encontrada' }, { status: 404 })
    if (company.owner_id !== userData.user.id) {
      // Modo admin (/painel/mensagens?empresa=) já deixa o admin VER a
      // conversa de qualquer empresa (RLS: "crm_messages: admin acesso
      // total"), mas essa rota nunca tinha a mesma exceção — admin conseguia
      // abrir o CRM da empresa e nunca conseguia mandar nada, sempre 403
      // (achado real, set/2026: Ricardo tentando responder cliente pela
      // empresa como admin).
      const { data: profile } = await supabase.from('profiles').select('user_type').eq('id', userData.user.id).maybeSingle()
      if (profile?.user_type !== 'admin') {
        return NextResponse.json({ error: 'empresa não é sua' }, { status: 403 })
      }
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
    let bodyForDb: string | null = text?.trim() || null

    if (media_path) {
      // media_path é caminho no bucket privado — a Evolution precisa de uma
      // URL alcançável de fora pra baixar, então gera uma assinada de curta
      // duração só pro tempo do envio (a mídia já fica hospedada no próprio
      // WhatsApp depois de entregue, não depende dessa URL continuar válida).
      const { data: signed } = await supabase.storage.from('crm-midia').createSignedUrl(media_path, 300)
      if (!signed?.signedUrl) return NextResponse.json({ error: 'falha ao gerar URL da mídia' }, { status: 500 })

      if (media_type === 'audio') {
        evoRes = await fetch(`${EVOLUTION_URL}/message/sendWhatsAppAudio/${encodeURIComponent(instance.instance_name)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: instance.api_key },
          body: JSON.stringify({ number, audio: signed.signedUrl, quoted }),
        })
      } else {
        if (media_type === 'document') bodyForDb = file_name || 'Documento'
        evoRes = await fetch(`${EVOLUTION_URL}/message/sendMedia/${encodeURIComponent(instance.instance_name)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: instance.api_key },
          body: JSON.stringify({
            number, mediatype: media_type, media: signed.signedUrl,
            caption: text?.trim() || undefined, fileName: media_type === 'document' ? (file_name || undefined) : undefined,
            quoted,
          }),
        })
      }
    } else if (location) {
      evoRes = await fetch(`${EVOLUTION_URL}/message/sendLocation/${encodeURIComponent(instance.instance_name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: instance.api_key },
        body: JSON.stringify({ number, latitude: location.lat, longitude: location.lng, name: location.name || undefined, address: location.address || undefined, quoted }),
      })
      bodyForDb = JSON.stringify({ lat: location.lat, lng: location.lng, name: location.name, address: location.address })
    } else if (contact_share) {
      evoRes = await fetch(`${EVOLUTION_URL}/message/sendContact/${encodeURIComponent(instance.instance_name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: instance.api_key },
        body: JSON.stringify({
          number,
          contact: [{ fullName: contact_share.name || contact_share.phone, wuid: formatPhone(contact_share.phone), phoneNumber: contact_share.phone }],
        }),
      })
      bodyForDb = JSON.stringify({ name: contact_share.name, phone: contact_share.phone })
    } else {
      evoRes = await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(instance.instance_name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: instance.api_key },
        body: JSON.stringify({ number, text: text.trim(), linkPreview: true, quoted }),
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
      // Usa o id gerado no navegador (mesmo id da bolha otimista) pra o
      // evento de Realtime da própria mensagem reconciliar em vez de duplicar.
      ...(client_message_id ? { id: client_message_id } : {}),
      company_id, contact_id, direction: 'out',
      body: bodyForDb,
      media_type: media_path ? media_type : location ? 'location' : contact_share ? 'contact' : null,
      media_url: media_path || null,
      wa_message_id: waMessageId, sent_at: now, reply_to_id: reply_to_id || null, status: 'sent',
    })
    const preview = text?.trim() ? text.trim()
      : media_type === 'image' ? '📷 Foto' : media_type === 'video' ? '🎥 Vídeo' : media_type === 'audio' ? '🎤 Áudio'
      : media_type === 'document' ? '📄 Documento' : location ? '📍 Localização' : contact_share ? '👤 Contato' : ''
    // Resposta manual pelo painel também conta como "humano assumiu" — mesmo
    // princípio do fromMe direto do celular (ver api/crm/webhook): quem
    // respondeu por aqui não precisa também lembrar de clicar em "Assumir a
    // conversa" à parte, pedido do Ricardo, out/2026.
    const { data: contactIa } = await supabase.from('crm_contacts').select('atendimento_modo').eq('id', contact_id).maybeSingle()
    await supabase.from('crm_contacts').update({
      last_message_at: now, last_read_at: now, unread_count: 0,
      last_message_preview: preview, last_message_direction: 'out',
      ...(contactIa && contactIa.atendimento_modo !== 'humano' ? { atendimento_modo: 'humano', pediu_humano_em: null } : {}),
    }).eq('id', contact_id)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha ao enviar' }, { status: 500 })
  }
}
