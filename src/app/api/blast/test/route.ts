import { NextRequest, NextResponse } from 'next/server'

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://taste-relocation-recording-decided.trycloudflare.com'
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || 'trindade2024'
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'Trindade Online'

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('55')) return digits
  return '55' + digits
}

function buildMessage(messages: string[], nome: string, empresa: string): string {
  const idx = Math.floor(Math.random() * messages.length)
  return messages[idx]
    .replace(/\{\{nome\}\}/g, nome || 'Cliente')
    .replace(/\{\{empresa\}\}/g, empresa || '')
}

export async function POST(req: NextRequest) {
  try {
    const { phone, name, company, messages } = await req.json()
    if (!phone || !messages?.length) return NextResponse.json({ error: 'phone e messages obrigatorios' }, { status: 400 })

    const formatted = formatPhone(phone)
    const message = buildMessage(messages, name, company)

    const res = await fetch(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
      body: JSON.stringify({ number: formatted, text: message })
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: err }, { status: 500 })
    }

    return NextResponse.json({ ok: true, message })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}