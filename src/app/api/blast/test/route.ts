import { NextRequest, NextResponse } from 'next/server'

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evo.trindadeonline.com.br'
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || 'trindade2024'
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'Trindade Online'

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('55')) return digits
  return '55' + digits
}

function buildMessage(messages: string[], nome: string, empresa: string): string {
  if (!messages || messages.length === 0) return ''
  const idx = Math.floor(Math.random() * messages.length)
  return messages[idx]
    .replace(/\{\{nome\}\}/g, nome || 'Cliente')
    .replace(/\{\{empresa\}\}/g, empresa || '')
}

async function sendText(phone: string, text: string) {
  const res = await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(EVOLUTION_INSTANCE)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
    body: JSON.stringify({ number: formatPhone(phone), text })
  })
  return res.ok ? null : await res.text()
}

async function sendMedia(phone: string, mediaUrl: string, mediaType: 'image' | 'video', caption: string) {
  const res = await fetch(`${EVOLUTION_URL}/message/sendMedia/${encodeURIComponent(EVOLUTION_INSTANCE)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
    body: JSON.stringify({ number: formatPhone(phone), mediatype: mediaType, media: mediaUrl, caption: caption || undefined })
  })
  return res.ok ? null : await res.text()
}

async function sendAudio(phone: string, mediaUrl: string) {
  const res = await fetch(`${EVOLUTION_URL}/message/sendWhatsAppAudio/${encodeURIComponent(EVOLUTION_INSTANCE)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
    body: JSON.stringify({ number: formatPhone(phone), audio: mediaUrl })
  })
  return res.ok ? null : await res.text()
}

export async function POST(req: NextRequest) {
  try {
    const { phone, name, company, messages, media_url, media_type } = await req.json()
    if (!phone) return NextResponse.json({ error: 'phone obrigatorio' }, { status: 400 })
    const validMessages = (messages || []).filter((m: string) => m?.trim())
    if (validMessages.length === 0 && !media_url) return NextResponse.json({ error: 'informe mensagem e/ou midia' }, { status: 400 })

    const message = buildMessage(validMessages, name, company)
    let err: string | null = null

    if (media_type === 'image' || media_type === 'video') {
      err = await sendMedia(phone, media_url, media_type, message)
    } else if (media_type === 'audio') {
      err = await sendAudio(phone, media_url)
      if (!err && message) err = await sendText(phone, message)
    } else {
      err = await sendText(phone, message)
    }

    if (err) return NextResponse.json({ error: err }, { status: 500 })
    return NextResponse.json({ ok: true, message })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
