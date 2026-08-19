import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isOpenNow } from '@/lib/businessHours'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://trindadeonline.com.br'
const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evo.trindadeonline.com.br'

type MediaType = 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location' | 'contact'
const DOWNLOADABLE: MediaType[] = ['image', 'audio', 'video', 'document', 'sticker']
const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 }
const STATUS_MAP: Record<string, 'sent' | 'delivered' | 'read'> = {
  '0': 'sent', '1': 'sent', '2': 'delivered', '3': 'read', '4': 'read',
  PENDING: 'sent', SERVER_ACK: 'sent', DELIVERY_ACK: 'delivered', READ: 'read', PLAYED: 'read',
}

function findContextInfo(m: any): any {
  return m?.extendedTextMessage?.contextInfo || m?.imageMessage?.contextInfo || m?.videoMessage?.contextInfo ||
    m?.audioMessage?.contextInfo || m?.documentMessage?.contextInfo || m?.stickerMessage?.contextInfo ||
    m?.locationMessage?.contextInfo || m?.contactMessage?.contextInfo || null
}

// Webhook público chamado pela Evolution API pra toda instância criada em
// /api/crm/whatsapp/connect (uma por empresa). Não tem autenticação de usuário
// — a única validação é o nome da instância bater com uma linha nossa; evento
// de instância desconhecida é ignorado silenciosamente (200, pra Evolution não
// ficar retentando).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const instanceName: string | undefined = body?.instance
    const event: string = (body?.event || '').toLowerCase()
    const data = body?.data
    if (!instanceName) return NextResponse.json({ ok: true })

    const { data: inst } = await supabase
      .from('crm_whatsapp_instances')
      .select('id, company_id, api_key, webhook_v2')
      .eq('instance_name', instanceName).maybeSingle()
    if (!inst) return NextResponse.json({ ok: true })

    // DEBUG temporário: grava o payload cru de status/presença/chat pra
    // descobrir o formato exato que essa versão da Evolution manda (vamos
    // remover essa tabela depois de confirmar o parsing). chats.update é o
    // evento que deve carregar o "li no celular" sincronizado de volta —
    // ainda não sabemos o formato real até ver um payload de verdade.
    if (event.includes('messages.update') || event.includes('messages_update') || event.includes('presence') || event.includes('chats')) {
      await supabase.from('crm_webhook_debug').insert({ event, payload: body })
    }

    // Auto-upgrade: instâncias criadas antes de MESSAGES_UPDATE/PRESENCE_UPDATE
    // existirem só escutavam os eventos antigos. Na primeira vez que qualquer
    // evento chegar depois desse deploy, reconfigura o webhook na Evolution
    // sem precisar reconectar/reescanear o QR. Precisa de `await` de verdade
    // — função serverless da Vercel pode congelar assim que a resposta sai,
    // matando qualquer fetch em segundo plano que não foi esperado.
    if (!inst.webhook_v2 && inst.api_key) {
      try {
        const setRes = await fetch(`${EVOLUTION_URL}/webhook/set/${encodeURIComponent(instanceName)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
          body: JSON.stringify({
            webhook: {
              enabled: true, url: `${SITE_URL}/api/crm/webhook`, byEvents: false, base64: true,
              events: ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'PRESENCE_UPDATE', 'CHATS_UPDATE', 'CHATS_UPSERT'],
            },
          }),
        })
        if (setRes.ok) {
          await supabase.from('crm_whatsapp_instances').update({ webhook_v2: true, webhook_v2_error: null }).eq('id', inst.id)
        } else {
          const errText = await setRes.text().catch(() => '')
          await supabase.from('crm_whatsapp_instances').update({ webhook_v2_error: `${setRes.status}: ${errText.slice(0, 300)}` }).eq('id', inst.id)
        }
      } catch (err: any) {
        await supabase.from('crm_whatsapp_instances').update({ webhook_v2_error: String(err?.message || err).slice(0, 300) }).eq('id', inst.id)
      }
    }

    if (event.includes('connection')) {
      const state = data?.state || data?.connection
      const connected = state === 'open'
      await supabase.from('crm_whatsapp_instances').update({
        status: connected ? 'connected' : 'disconnected',
        ...(connected ? { connected_at: new Date().toISOString() } : {}),
      }).eq('id', inst.id)
      return NextResponse.json({ ok: true })
    }

    // Status de entrega/leitura de mensagem que a gente mandou (✓ / ✓✓ / ✓✓ azul)
    if (event.includes('messages.update') || event.includes('messages_update')) {
      const updates: any[] = Array.isArray(data) ? data : data ? [data] : []
      for (const upd of updates) {
        const msgId: string | null = upd?.keyId || upd?.key?.id || upd?.messageId || null
        if (!msgId) continue
        const rawStatus = upd?.status ?? upd?.update?.status ?? upd?.data?.status
        const mapped = STATUS_MAP[String(rawStatus)]
        if (!mapped) continue
        const { data: current } = await supabase
          .from('crm_messages').select('id, status')
          .eq('company_id', inst.company_id).eq('wa_message_id', msgId).maybeSingle()
        // Nunca regride (update fora de ordem não pode voltar 'read' pra 'delivered')
        if (current && (!current.status || STATUS_RANK[mapped] > (STATUS_RANK[current.status] || 0))) {
          await supabase.from('crm_messages').update({ status: mapped }).eq('id', current.id)
        }
      }
      return NextResponse.json({ ok: true })
    }

    // "Digitando..." / "online" — estado efêmero, guardado com validade curta
    if (event.includes('presence.update') || event.includes('presence_update')) {
      const remoteJid: string = data?.id || data?.remoteJid || ''
      const phone = remoteJid.split('@')[0]
      const presences = data?.presences || {}
      const first: any = Object.values(presences)[0]
      const state: string | null = first?.lastKnownPresence || data?.presence || null
      if (phone && state) {
        const composing = state === 'composing' || state === 'recording'
        await supabase.from('crm_contacts').update({
          presence_state: state,
          presence_until: composing ? new Date(Date.now() + 15000).toISOString() : null,
        }).eq('company_id', inst.company_id).eq('phone', phone)
      }
      return NextResponse.json({ ok: true })
    }

    if (event.includes('messages.upsert') || event.includes('messages_upsert')) {
      const msgs: any[] = Array.isArray(data?.messages) ? data.messages : Array.isArray(data) ? data : data ? [data] : []
      for (const msg of msgs) {
        const remoteJid: string = msg?.key?.remoteJid || ''
        if (!remoteJid || remoteJid.includes('@g.us')) continue // ignora grupo, CRM é 1:1
        const phone = remoteJid.split('@')[0]
        const fromMe: boolean = !!msg?.key?.fromMe
        const direction: 'in' | 'out' = fromMe ? 'out' : 'in'

        // Reação é um "mensagem" à parte que referencia outra pelo key.id —
        // não cria linha nova, só atualiza a mensagem alvo. Texto vazio = removeu a reação.
        const reactionMsg = msg?.message?.reactionMessage
        if (reactionMsg) {
          const targetWaId: string | undefined = reactionMsg.key?.id
          const emoji: string = reactionMsg.text || ''
          if (targetWaId) {
            const { data: target } = await supabase
              .from('crm_messages').select('id')
              .eq('company_id', inst.company_id).eq('wa_message_id', targetWaId).maybeSingle()
            if (target) {
              await supabase.from('crm_messages').update({
                reaction: emoji || null, reaction_by: emoji ? direction : null,
              }).eq('id', target.id)
            }
          }
          continue
        }

        const waMessageId: string | null = msg?.key?.id || null
        if (waMessageId) {
          // Evita duplicar: se fromMe, pode já ter sido gravado por /api/crm/enviar;
          // se retry de webhook, o mesmo evento pode chegar mais de uma vez.
          const { data: dup } = await supabase
            .from('crm_messages').select('id')
            .eq('company_id', inst.company_id).eq('wa_message_id', waMessageId).maybeSingle()
          if (dup) continue
        }

        const m = msg?.message || {}
        let mediaType: MediaType | null = null
        let text: string | null = m.conversation || m.extendedTextMessage?.text || null
        let documentFileName: string | null = null

        if (!text && m.imageMessage) { mediaType = 'image'; text = m.imageMessage.caption || null }
        else if (!text && m.videoMessage) { mediaType = 'video'; text = m.videoMessage.caption || null }
        else if (!text && m.documentMessage) { mediaType = 'document'; documentFileName = m.documentMessage.fileName || null; text = documentFileName }
        else if (!text && m.stickerMessage) { mediaType = 'sticker' }
        else if (!text && m.audioMessage) { mediaType = 'audio' }
        else if (!text && m.locationMessage) {
          mediaType = 'location'
          text = JSON.stringify({
            lat: m.locationMessage.degreesLatitude, lng: m.locationMessage.degreesLongitude,
            name: m.locationMessage.name || undefined, address: m.locationMessage.address || undefined,
          })
        } else if (!text && m.contactMessage) {
          mediaType = 'contact'
          const vcard: string = m.contactMessage.vcard || ''
          const phoneMatch = vcard.match(/waid=(\d+)/) || vcard.match(/TEL[^:]*:(\+?\d+)/)
          text = JSON.stringify({ name: m.contactMessage.displayName || undefined, phone: phoneMatch?.[1] })
        }

        // pushName no evento fromMe é o nome do PRÓPRIO perfil (quem mandou),
        // não do contato — só serve pra nomear/atualizar contato em mensagem
        // recebida (direction 'in'), senão grava o nosso nome no cliente.
        const pushName: string | null = direction === 'in' ? (msg?.pushName || null) : null
        const sentAt = msg?.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000).toISOString() : new Date().toISOString()

        // Evolution normalmente manda a mídia já decodificada em base64 no
        // próprio evento (config base64:true na criação da instância). Se por
        // algum motivo não vier (payload grande, etc.), busca direto na
        // Evolution como fallback antes de desistir.
        let base64Data: string | null = m.base64 || null
        if (mediaType && DOWNLOADABLE.includes(mediaType) && !base64Data && waMessageId && inst.api_key) {
          try {
            const mediaRes = await fetch(`${EVOLUTION_URL}/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
              body: JSON.stringify({ message: { key: msg.key }, convertToMp4: false }),
            })
            if (mediaRes.ok) {
              const mediaJson: any = await mediaRes.json().catch(() => null)
              base64Data = mediaJson?.base64 || null
            }
          } catch {}
        }

        let mediaPath: string | null = null
        if (mediaType && DOWNLOADABLE.includes(mediaType) && base64Data) {
          try {
            const mimetype: string =
              (mediaType === 'image' ? m.imageMessage?.mimetype :
               mediaType === 'video' ? m.videoMessage?.mimetype :
               mediaType === 'document' ? m.documentMessage?.mimetype :
               mediaType === 'sticker' ? m.stickerMessage?.mimetype :
               m.audioMessage?.mimetype) || ''
            const mimeExt = mimetype.split('/')[1]?.split(';')[0] || ''
            const ext = mediaType === 'audio' ? 'ogg'
              : mediaType === 'document' ? (documentFileName?.split('.').pop() || mimeExt || 'bin')
              : mediaType === 'sticker' ? (mimeExt || 'webp')
              : mediaType === 'video' ? (mimeExt || 'mp4')
              : (mimeExt || 'jpg')
            const buf = Buffer.from(base64Data, 'base64')
            const path = `${inst.company_id}/${phone}/${Date.now()}.${ext}`
            const { error: upErr } = await supabase.storage.from('crm-midia').upload(path, buf, {
              contentType: mimetype || 'application/octet-stream',
            })
            if (!upErr) mediaPath = path
          } catch {}
        }

        if (!text && !mediaPath && !mediaType) continue // nada útil pra registrar

        // Resolve a mensagem citada (responder), se houver, pra já linkar via reply_to_id
        const stanzaId: string | null = findContextInfo(m)?.stanzaId || null
        let replyToId: string | null = null
        if (stanzaId) {
          const { data: quoted } = await supabase
            .from('crm_messages').select('id')
            .eq('company_id', inst.company_id).eq('wa_message_id', stanzaId).maybeSingle()
          replyToId = quoted?.id || null
        }

        const { data: existing } = await supabase
          .from('crm_contacts').select('id, name, muted, last_auto_reply_at, unread_count')
          .eq('company_id', inst.company_id).eq('phone', phone).maybeSingle()

        // Prévia mostrada na lista de conversas (estilo WhatsApp) — mesmo
        // texto usado no push, então calcula uma vez só e reaproveita.
        const previewText = text && mediaType !== 'location' && mediaType !== 'contact' ? text
          : mediaType === 'image' ? '📷 Foto' : mediaType === 'video' ? '🎥 Vídeo' : mediaType === 'audio' ? '🎤 Áudio'
          : mediaType === 'document' ? '📄 Documento' : mediaType === 'sticker' ? '🏷️ Figurinha'
          : mediaType === 'location' ? '📍 Localização' : mediaType === 'contact' ? '👤 Contato' : 'Nova mensagem'

        let contactId: string | undefined
        if (!existing) {
          const { data: created } = await supabase.from('crm_contacts').insert({
            company_id: inst.company_id, phone, name: pushName, last_message_at: sentAt,
            last_message_preview: previewText, last_message_direction: direction,
            unread_count: direction === 'in' ? 1 : 0,
          }).select('id').single()
          contactId = created?.id
        } else {
          contactId = existing.id
          await supabase.from('crm_contacts').update({
            last_message_at: sentAt,
            last_message_preview: previewText, last_message_direction: direction,
            ...(direction === 'in' ? { unread_count: (existing.unread_count || 0) + 1 } : {}),
            ...(pushName && !existing.name ? { name: pushName } : {}),
          }).eq('id', contactId)
        }
        if (!contactId) continue

        await supabase.from('crm_messages').insert({
          company_id: inst.company_id, contact_id: contactId, direction,
          body: text, media_type: mediaType, media_url: mediaPath, wa_message_id: waMessageId, sent_at: sentAt,
          reply_to_id: replyToId, status: direction === 'out' ? 'sent' : null,
        })

        if (direction === 'out') {
          // Mandado pelo celular direto (fora do CRM) — marca como lido, não precisa notificar o próprio lojista.
          await supabase.from('crm_contacts').update({ last_read_at: sentAt, unread_count: 0 }).eq('id', contactId)
          continue
        }

        const { data: company } = await supabase
          .from('companies')
          .select('owner_id, name, crm_auto_reply_enabled, crm_auto_reply_text, flexible_hours')
          .eq('id', inst.company_id).maybeSingle()
        if (company?.owner_id && !existing?.muted) {
          const notifBody = previewText
          // Precisa de `await` de verdade — sem isso a função serverless pode
          // congelar assim que a resposta sai, matando o fetch em segundo plano.
          await fetch(`${SITE_URL}/api/push/send`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: `💬 ${pushName || phone}`, body: notifBody.slice(0, 120),
              target: 'external_user_id', userId: company.owner_id,
              url: `${SITE_URL}/painel/crm/mensagens`,
            }),
          }).catch(() => {})
        }

        // Resposta automática fora do horário de funcionamento — só dispara
        // uma vez a cada 3h por contato, pra não spammar numa conversa ativa.
        if (company?.crm_auto_reply_enabled && company.crm_auto_reply_text?.trim() && inst.api_key) {
          const cooldownOk = !existing?.last_auto_reply_at ||
            (Date.now() - new Date(existing.last_auto_reply_at).getTime()) > 3 * 60 * 60 * 1000
          if (cooldownOk) {
            const { data: hours } = await supabase
              .from('company_hours').select('day_of_week, open_time, close_time, closed')
              .eq('company_id', inst.company_id)
            if (!isOpenNow(hours || [], company.flexible_hours)) {
              try {
                await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(instanceName)}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
                  body: JSON.stringify({ number: phone, text: company.crm_auto_reply_text.trim() }),
                })
                const autoReplyAt = new Date().toISOString()
                await supabase.from('crm_messages').insert({
                  company_id: inst.company_id, contact_id: contactId, direction: 'out',
                  body: company.crm_auto_reply_text.trim(), status: 'sent', sent_at: autoReplyAt,
                })
                await supabase.from('crm_contacts').update({
                  last_auto_reply_at: autoReplyAt, last_message_at: autoReplyAt,
                  last_message_preview: company.crm_auto_reply_text.trim(), last_message_direction: 'out',
                }).eq('id', contactId)
              } catch {}
            }
          }
        }
      }
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}
