import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://trindadeonline.com.br'
const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evo.trindadeonline.com.br'

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
      .select('id, company_id, api_key')
      .eq('instance_name', instanceName).maybeSingle()
    if (!inst) return NextResponse.json({ ok: true })

    if (event.includes('connection')) {
      const state = data?.state || data?.connection
      const connected = state === 'open'
      await supabase.from('crm_whatsapp_instances').update({
        status: connected ? 'connected' : 'disconnected',
        ...(connected ? { connected_at: new Date().toISOString() } : {}),
      }).eq('id', inst.id)
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
        let mediaType: 'image' | 'audio' | null = null
        let text: string | null = m.conversation || m.extendedTextMessage?.text || null
        if (!text && m.imageMessage) { mediaType = 'image'; text = m.imageMessage.caption || null }
        else if (!text && m.audioMessage) { mediaType = 'audio' }

        const pushName: string | null = msg?.pushName || null
        const sentAt = msg?.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000).toISOString() : new Date().toISOString()

        // Evolution normalmente manda a mídia já decodificada em base64 no
        // próprio evento (config base64:true na criação da instância). Se por
        // algum motivo não vier (payload grande, etc.), busca direto na
        // Evolution como fallback antes de desistir.
        let base64Data: string | null = m.base64 || null
        if (mediaType && !base64Data && waMessageId && inst.api_key) {
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
        if (mediaType && base64Data) {
          try {
            const mimetype: string = (mediaType === 'image' ? m.imageMessage?.mimetype : m.audioMessage?.mimetype) || ''
            const ext = mediaType === 'image' ? (mimetype.split('/')[1] || 'jpg').split(';')[0] : 'ogg'
            const buf = Buffer.from(base64Data, 'base64')
            const path = `${inst.company_id}/${phone}/${Date.now()}.${ext}`
            const { error: upErr } = await supabase.storage.from('crm-midia').upload(path, buf, {
              contentType: mimetype || (mediaType === 'image' ? 'image/jpeg' : 'audio/ogg'),
            })
            if (!upErr) mediaPath = path
          } catch {}
        }

        if (!text && !mediaPath && !mediaType) continue // nada útil pra registrar

        const { data: existing } = await supabase
          .from('crm_contacts').select('id, name')
          .eq('company_id', inst.company_id).eq('phone', phone).maybeSingle()

        let contactId: string | undefined
        if (!existing) {
          const { data: created } = await supabase.from('crm_contacts').insert({
            company_id: inst.company_id, phone, name: pushName, last_message_at: sentAt,
          }).select('id').single()
          contactId = created?.id
        } else {
          contactId = existing.id
          await supabase.from('crm_contacts').update({
            last_message_at: sentAt,
            ...(pushName && !existing.name ? { name: pushName } : {}),
          }).eq('id', contactId)
        }
        if (!contactId) continue

        await supabase.from('crm_messages').insert({
          company_id: inst.company_id, contact_id: contactId, direction,
          body: text, media_type: mediaType, media_url: mediaPath, wa_message_id: waMessageId, sent_at: sentAt,
        })

        if (direction === 'out') {
          // Mandado pelo celular direto (fora do CRM) — marca como lido, não precisa notificar o próprio lojista.
          await supabase.from('crm_contacts').update({ last_read_at: sentAt }).eq('id', contactId)
          continue
        }

        const { data: company } = await supabase.from('companies').select('owner_id, name').eq('id', inst.company_id).maybeSingle()
        if (company?.owner_id) {
          const notifBody = text || (mediaType === 'image' ? '📷 Foto' : mediaType === 'audio' ? '🎤 Áudio' : 'Nova mensagem')
          fetch(`${SITE_URL}/api/push/send`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: `💬 ${pushName || phone}`, body: notifBody.slice(0, 120),
              target: 'external_user_id', userId: company.owner_id,
            }),
          }).catch(() => {})
        }
      }
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}
