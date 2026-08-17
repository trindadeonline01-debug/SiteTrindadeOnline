import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://trindadeonline.com.br'

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

    // DEBUG TEMPORÁRIO — grava todo payload cru recebido, pra conseguir ver
    // o formato real do evento sem acesso ao log da Vercel. Remover depois
    // que o parsing abaixo estiver confirmado com um teste ao vivo. Precisa
    // de await — função serverless pode ser encerrada antes de completar
    // uma escrita disparada sem esperar.
    await supabase.from('crm_webhook_debug_log').insert({ event: body?.event || null, instance: instanceName || null, raw: body })
    if (!instanceName) return NextResponse.json({ ok: true })

    const { data: inst } = await supabase
      .from('crm_whatsapp_instances')
      .select('id, company_id')
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
        if (msg?.key?.fromMe) continue // mandado por nós mesmos — já registrado em /api/crm/enviar
        const remoteJid: string = msg?.key?.remoteJid || ''
        if (!remoteJid || remoteJid.includes('@g.us')) continue // ignora grupo, CRM é 1:1
        const phone = remoteJid.split('@')[0]

        const m = msg?.message || {}
        let mediaType: string | null = null
        let text: string | null = m.conversation || m.extendedTextMessage?.text || null
        if (!text && m.imageMessage) { mediaType = 'image'; text = m.imageMessage.caption || '[imagem recebida — visualização chega em breve]' }
        else if (!text && m.audioMessage) { mediaType = 'audio'; text = '[áudio recebido — visualização chega em breve]' }
        if (!text) continue

        const waMessageId: string | null = msg?.key?.id || null
        const pushName: string | null = msg?.pushName || null
        const sentAt = msg?.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000).toISOString() : new Date().toISOString()

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
          company_id: inst.company_id, contact_id: contactId, direction: 'in',
          body: text, media_type: mediaType, wa_message_id: waMessageId, sent_at: sentAt,
        })

        const { data: company } = await supabase.from('companies').select('owner_id, name').eq('id', inst.company_id).maybeSingle()
        if (company?.owner_id) {
          fetch(`${SITE_URL}/api/push/send`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: `💬 ${pushName || phone}`, body: text.slice(0, 120),
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
