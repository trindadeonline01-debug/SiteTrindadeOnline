import { NextRequest, NextResponse } from 'next/server'

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evo.trindadeonline.com.br'

type EvoInstance = { name: string; key: string }

// Mesma lógica de failover do disparo em massa (src/app/api/blast/route.ts)
// — testa aqui pelo botão "Testar" já passa pela mesma instância que vai
// ser usada de verdade numa campanha
const INSTANCES: EvoInstance[] = [
  { name: process.env.EVOLUTION_INSTANCE || 'Trindade Online', key: process.env.EVOLUTION_API_KEY || 'trindade2024' },
  { name: process.env.EVOLUTION_INSTANCE_2 || '', key: process.env.EVOLUTION_API_KEY_2 || '' },
].filter(i => i.name && i.key)

async function isInstanceConnected(instance: EvoInstance): Promise<boolean> {
  try {
    const res = await fetch(`${EVOLUTION_URL}/instance/connectionState/${encodeURIComponent(instance.name)}`, {
      headers: { apikey: instance.key }
    })
    if (!res.ok) return false
    const data = await res.json()
    return data?.instance?.state === 'open'
  } catch {
    return false
  }
}

async function pickActiveInstance(): Promise<EvoInstance> {
  for (const inst of INSTANCES) {
    if (await isInstanceConnected(inst)) return inst
  }
  return INSTANCES[0]
}

async function evoRequest(instance: EvoInstance, path: string, body: any): Promise<string | null> {
  const res = await fetch(`${EVOLUTION_URL}${path}/${encodeURIComponent(instance.name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: instance.key },
    body: JSON.stringify(body)
  })
  return res.ok ? null : await res.text()
}

async function sendWithFailover(path: string, body: any, current: EvoInstance): Promise<string | null> {
  const err = await evoRequest(current, path, body)
  if (!err) return null
  const other = INSTANCES.find(i => i.name !== current.name)
  if (other) {
    const retryErr = await evoRequest(other, path, body)
    if (!retryErr) return null
  }
  return err
}

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

async function sendText(phone: string, text: string, instance: EvoInstance) {
  return sendWithFailover('/message/sendText', { number: formatPhone(phone), text }, instance)
}

async function sendMedia(phone: string, mediaUrl: string, mediaType: 'image' | 'video', caption: string, instance: EvoInstance) {
  return sendWithFailover('/message/sendMedia', { number: formatPhone(phone), mediatype: mediaType, media: mediaUrl, caption: caption || undefined }, instance)
}

async function sendAudio(phone: string, mediaUrl: string, instance: EvoInstance) {
  return sendWithFailover('/message/sendWhatsAppAudio', { number: formatPhone(phone), audio: mediaUrl }, instance)
}

export async function POST(req: NextRequest) {
  try {
    const { phone, name, company, messages } = await req.json()
    if (!phone) return NextResponse.json({ error: 'phone obrigatorio' }, { status: 400 })
    const validMessages = ((messages || []) as MessageVariation[]).filter(m => m?.text?.trim() || m?.media_url)
    if (validMessages.length === 0) return NextResponse.json({ error: 'informe mensagem e/ou midia' }, { status: 400 })

    const picked = pickVariation(validMessages, name, company)
    const message = picked.text
    const instance = await pickActiveInstance()
    let err: string | null = null

    if (picked.media_type === 'image' || picked.media_type === 'video') {
      err = await sendMedia(phone, picked.media_url!, picked.media_type as 'image' | 'video', message, instance)
    } else if (picked.media_type === 'audio') {
      err = await sendAudio(phone, picked.media_url!, instance)
      if (!err && message) err = await sendText(phone, message, instance)
    } else {
      err = await sendText(phone, message, instance)
    }

    if (err) return NextResponse.json({ error: err }, { status: 500 })
    return NextResponse.json({ ok: true, message })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
