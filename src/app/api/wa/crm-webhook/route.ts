import { NextRequest, NextResponse, after } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { shortId, wahaTelefone } from '@/lib/wa'
import { createClient } from '@supabase/supabase-js'
import { PLATAFORMA_WAHA, PLATAFORMA_SESSAO, EVOLUTION_INSTANCE_PLATAFORMA } from '@/lib/wa/plataforma'

// Entrada dos eventos do WAHA para o CRM das lojas (nov/2026). Traduz cada evento para o formato da
// Evolution que /api/crm/webhook já entende (IA, motoboy próprio, opt-out, follow-up, mídia, reação,
// status) e entrega a ele. Assim a regra de negócio fica numa cópia só. Ver docs/DESENHO_WAHA.md.

export const maxDuration = 60

const HMAC_KEY = process.env.WAHA_HMAC_KEY || ''
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.trindadeonline.com.br'
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function hmacOk(raw: string, recebido: string | null): boolean {
  if (!HMAC_KEY || !recebido) return false
  const esperado = createHmac('sha512', HMAC_KEY).update(raw).digest('hex')
  const a = Buffer.from(esperado)
  const b = Buffer.from(recebido)
  return a.length === b.length && timingSafeEqual(a, b)
}

const ACK: Record<string, number> = { ERROR: -1, PENDING: 0, SERVER: 1, DEVICE: 2, READ: 3, PLAYED: 4 }

async function encaminhar(body: unknown) {
  const r = await fetch(`${SITE}/api/crm/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!r.ok) console.error('[wa/crm-webhook] /api/crm/webhook respondeu', r.status)
}

async function log(event: string, payload: unknown) {
  try { await supabase.from('crm_webhook_debug').insert({ event, payload }) } catch {}
}

function montarMensagem(p: any): { message: any; mediaKind: string | null } {
  const texto: string = String(p?.body || '')
  const mime: string = String(p?.media?.mimetype || '')
  const stanzaId = p?.replyTo?.id ? shortId(p.replyTo.id) : null
  const ctx = stanzaId ? { contextInfo: { stanzaId } } : {}
  const dados = p?._data?.Message || p?._data?.message || {}

  if (p?.hasMedia && mime) {
    const base = mime.split(';')[0]
    const comum = { mimetype: mime, caption: texto || undefined, ...ctx }
    if (dados.stickerMessage) return { message: { stickerMessage: { mimetype: base, ...ctx } }, mediaKind: 'sticker' }
    if (base.startsWith('image/')) return { message: { imageMessage: comum }, mediaKind: 'image' }
    if (base.startsWith('video/')) return { message: { videoMessage: comum }, mediaKind: 'video' }
    if (base.startsWith('audio/')) return { message: { audioMessage: { mimetype: mime, ...ctx } }, mediaKind: 'audio' }
    return { message: { documentMessage: { mimetype: mime, fileName: p?.media?.filename || texto || undefined, ...ctx } }, mediaKind: 'document' }
  }

  const loc = p?.location || dados.locationMessage
  if (loc && (loc.latitude != null || loc.degreesLatitude != null)) {
    return { message: { locationMessage: {
      degreesLatitude: loc.latitude ?? loc.degreesLatitude, degreesLongitude: loc.longitude ?? loc.degreesLongitude,
      name: loc.name || loc.title || undefined, address: loc.address || undefined, ...ctx,
    } }, mediaKind: null }
  }
  if (Array.isArray(p?.vCards) && p.vCards[0]) {
    const v: string = String(p.vCards[0])
    return { message: { contactMessage: { displayName: (v.match(/FN:(.+)/)?.[1] || '').trim() || undefined, vcard: v, ...ctx } }, mediaKind: null }
  }
  if (!texto) return { message: {}, mediaKind: null }
  return { message: stanzaId ? { extendedTextMessage: { text: texto, ...ctx } } : { conversation: texto }, mediaKind: null }
}

// Número da PLATAFORMA no WAHA: só interessa a resposta de motoboy (SIM/NÃO/código). Entrega no formato da Evolution
// ao mesmo /api/entrega/webhook de sempre (ele só confere o nome da instância e o telefone, e a regra fica numa cópia só).
async function processarPlataforma(session: string, evento: string, p: any) {
  if (evento !== 'message.any' && evento !== 'message') return
  const from = String(p?.from || '')
  if (!p || p.fromMe || !from || from.endsWith('@g.us') || from.includes('@broadcast') || from.endsWith('@newsletter') || from.startsWith('status@')) return
  const texto = String(p?.body || '').trim()
  if (!texto) return
  const tel = await wahaTelefone(session, from)
  if (!tel) { await log('wa_telefone_nao_resolvido', { session, chat: from, evento }); return }
  const r = await fetch(`${SITE}/api/entrega/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    instance: EVOLUTION_INSTANCE_PLATAFORMA, event: 'messages.upsert',
    data: { messages: [{ key: { remoteJid: `${tel}@s.whatsapp.net`, fromMe: false, id: shortId(p?.id) }, message: { conversation: texto } }] },
  }) })
  if (!r.ok) console.error('[wa/crm-webhook] /api/entrega/webhook respondeu', r.status)
}

async function processar(session: string, evento: string, p: any) {
  if (session === PLATAFORMA_SESSAO) {
    if (PLATAFORMA_WAHA) await processarPlataforma(session, evento, p)
    return
  }
  if (evento === 'session.status') {
    const st = String(p?.status || '')
    if (st === 'WORKING') return encaminhar({ instance: session, event: 'connection.update', data: { state: 'open' } })
    if (st === 'FAILED' || st === 'STOPPED' || st === 'SCAN_QR_CODE') return encaminhar({ instance: session, event: 'connection.update', data: { state: 'close' } })
    return
  }

  if (evento === 'message.ack') {
    const id = shortId(p?.id)
    const ack = typeof p?.ack === 'number' ? p.ack : ACK[String(p?.ackName || '').toUpperCase()]
    if (!id || ack == null || ack < 1) return
    return encaminhar({ instance: session, event: 'messages.update', data: [{ keyId: id, status: ack }] })
  }

  const from: string = String(p?.from || '')
  const to: string = String(p?.to || '')
  const fromMe = !!p?.fromMe
  const chat = fromMe ? to : from
  if (!chat || chat.endsWith('@g.us') || chat.includes('@broadcast') || chat.endsWith('@newsletter') || chat.startsWith('status@')) return
  const telefone = await wahaTelefone(session, chat)
  if (!telefone) { await log('wa_telefone_nao_resolvido', { session, chat, evento }); return }
  const remoteJid = `${telefone}@s.whatsapp.net`

  if (evento === 'message.reaction') {
    const alvo = shortId(p?.reaction?.messageId)
    if (!alvo) return
    return encaminhar({ instance: session, event: 'messages.upsert', data: { messages: [{
      key: { remoteJid, fromMe, id: shortId(p?.id) },
      message: { reactionMessage: { key: { id: alvo }, text: String(p?.reaction?.text || '') } },
    }] } })
  }

  if (evento !== 'message.any' && evento !== 'message') return

  const { message, mediaKind } = montarMensagem(p)
  if (!Object.keys(message).length) return
  // Mensagem que NÓS mandamos pela API volta como eco: espera o envio gravar o id antes de entregar,
  // senão o eco seria confundido com "o dono digitou direto do celular" e desligaria a IA.
  if (fromMe) await new Promise(r => setTimeout(r, 2500))

  const pushName: string | null = p?._data?.Info?.PushName || p?._data?.pushName || p?.notifyName || null
  return encaminhar({ instance: session, event: 'messages.upsert', data: { messages: [{
    key: { remoteJid, fromMe, id: shortId(p?.id) },
    pushName,
    messageTimestamp: Number(p?.timestamp) || Math.floor(Date.now() / 1000),
    message,
    ...(mediaKind ? { _waha: { mediaUrl: p?.media?.url || null, composedId: String(p?.id || ''), chat } } : {}),
  }] } })
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  if (!hmacOk(raw, req.headers.get('x-webhook-hmac'))) return NextResponse.json({ error: 'assinatura inválida' }, { status: 401 })
  let body: any
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ ok: true }) }
  const session: string = String(body?.session || '')
  const evento: string = String(body?.event || '')
  if (!session || !evento) return NextResponse.json({ ok: true })

  // Responde já (o WAHA não deve esperar a IA) e termina o trabalho em segundo plano.
  after(async () => {
    try { await processar(session, evento, body?.payload) }
    catch (err) { await log('wa_crm_webhook_erro', { session, evento, erro: String((err as any)?.message || err).slice(0, 400) }) }
  })
  return NextResponse.json({ ok: true })
}
