import { NextRequest, NextResponse } from 'next/server'

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evo.trindadeonline.com.br'
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || 'trindade2024'
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'Trindade Online'

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('55')) return digits
  return '55' + digits
}

interface MessageVariation {
  text: string
  media_url?: string | null
  media_type?: string | null
}

function pickVariation(messages: MessageVariation[], nome: string, empresa: string) {
  const idx = Math.floor(Math.random() * messages.length)
  const v = messages[idx]
  return {
    text: (v.text || '').replace(/\{\{nome\}\}/g, nome || 'Cliente').replace(/\{\{empresa\}\}/g, empresa || ''),
    media_url: v.media_url || null,
    media_type: v.media_type || null
  }
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
    const { phone, name, company, messages } = await req.json()
    if (!phone) return NextResponse.json({ error: 'phone obrigatorio' }, { status: 400 })
    const validMessages = ((messages || []) as MessageVariation[]).filter(m => m?.text?.trim() || m?.media_url)
    if (validMessages.length === 0) return NextResponse.json({ error: 'informe mensagem e/ou midia' }, { status: 400 })

    const picked = pickVariation(validMessages, name, company)
    const message = picked.text
    let err: string | null = null

    if (picked.media_type === 'image' || picked.media_type === 'video') {
      err = await sendMedia(phone, picked.media_url!, picked.media_type as 'image' | 'video', message)
    } else if (picked.media_type === 'audio') {
      err = await sendAudio(phone, picked.media_url!)
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
