import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { gerarRespostaIA, type HistoricoMsg } from '@/lib/crmIA'
import { transcreverAudioWhatsApp } from '@/lib/transcreverAudio'

// PROTÓTIPO (12/nov/2026) — IA respondendo pelo WAHA, só para teste.
// Recebe o webhook `message` de UMA sessão do WAHA, e responde com a mesma IA do CRM
// (`gerarRespostaIA`, usando o cadastro de UMA loja de teste) SOMENTE para números da lista
// WA_TEST_ALLOWLIST. Quem não está na lista é ignorado. Não grava nada no CRM e não mexe em pedidos.
// Fica desligado enquanto as variáveis de ambiente não existirem. Ver docs/DESENHO_WAHA.md.
//
// Variáveis (Vercel): WAHA_URL (https público do WAHA, sem barra no fim), WAHA_API_KEY, WAHA_HMAC_KEY,
// WA_TEST_ALLOWLIST (números só com dígitos, separados por vírgula), WA_TEST_SESSION (padrão "teste"),
// WA_TEST_COMPANY_ID (padrão: Calçada do Peixe).

export const maxDuration = 60

const WAHA_URL = (process.env.WAHA_URL || '').replace(/\/+$/, '')
const WAHA_API_KEY = process.env.WAHA_API_KEY || ''
const HMAC_KEY = process.env.WAHA_HMAC_KEY || ''
const SESSION = process.env.WA_TEST_SESSION || 'teste'
const COMPANY_ID = process.env.WA_TEST_COMPANY_ID || 'd3373bd7-fa9b-490f-a077-c8f2980028c1'
const ALLOWLIST = new Set((process.env.WA_TEST_ALLOWLIST || '').split(',').map(n => n.replace(/\D/g, '')).filter(Boolean))

// Evita responder duas vezes se o WAHA repetir o mesmo evento (vale só dentro da mesma instância da função).
const vistos = new Map<string, number>()
function jaVisto(id: string): boolean {
  const agora = Date.now()
  for (const [k, t] of vistos) if (agora - t > 10 * 60_000) vistos.delete(k)
  if (vistos.has(id)) return true
  vistos.set(id, agora)
  return false
}

function hmacOk(raw: string, recebido: string | null): boolean {
  if (!HMAC_KEY || !recebido) return false
  const esperado = createHmac('sha512', HMAC_KEY).update(raw).digest('hex')
  const a = Buffer.from(esperado)
  const b = Buffer.from(recebido)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function waha(path: string, init?: RequestInit) {
  return fetch(`${WAHA_URL}${path}`, { ...init, headers: { 'X-Api-Key': WAHA_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json', ...(init?.headers || {}) } })
}

// Baixa o áudio (voz) de uma mensagem do WAHA. O `media.url` do webhook aponta pro endereço interno do WAHA
// (ex.: http://localhost:3000/api/files/...), então reaproveita só o caminho /api/files/... no WAHA_URL público.
async function baixarAudio(p: any): Promise<{ buf: Buffer; mimetype: string } | null> {
  const mimetype = String(p?.media?.mimetype || '')
  if (!p?.hasMedia || !mimetype.startsWith('audio')) return null
  try {
    let url: string | null = p?.media?.url || null
    if (!url && p?.id) {
      // WAHA não baixou o arquivo junto do webhook: pede a mensagem de novo mandando baixar.
      const chatId = encodeURIComponent(String(p.from || ''))
      const r = await waha(`/api/${encodeURIComponent(SESSION)}/chats/${chatId}/messages/${encodeURIComponent(String(p.id))}?downloadMedia=true`)
      if (r.ok) url = (await r.json())?.media?.url || null
    }
    if (!url) return null
    const caminho = url.includes('/api/files/') ? url.slice(url.indexOf('/api/files/')) : null
    if (!caminho) return null
    const r = await waha(caminho)
    if (!r.ok) return null
    return { buf: Buffer.from(await r.arrayBuffer()), mimetype: mimetype.split(';')[0] || 'audio/ogg' }
  } catch { return null }
}

// `from` pode vir como 5521...@c.us ou 1234...@lid; devolve só os dígitos do telefone (ou null).
async function telefoneDe(from: string): Promise<string | null> {
  const [id, dominio] = from.split('@')
  if (dominio === 'c.us' || dominio === 's.whatsapp.net') return id.replace(/\D/g, '') || null
  if (dominio === 'lid') {
    try {
      const r = await waha(`/api/${encodeURIComponent(SESSION)}/lids/${encodeURIComponent(id)}`)
      if (!r.ok) return null
      const d = await r.json()
      const pn: string | undefined = d?.pn
      return pn ? pn.split('@')[0].replace(/\D/g, '') : null
    } catch { return null }
  }
  return null
}

export async function POST(req: NextRequest) {
  if (!WAHA_URL || !WAHA_API_KEY || !HMAC_KEY || ALLOWLIST.size === 0) return NextResponse.json({ ok: true, desligado: true })

  const raw = await req.text()
  if (!hmacOk(raw, req.headers.get('x-webhook-hmac'))) return NextResponse.json({ error: 'assinatura inválida' }, { status: 401 })

  let body: any
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ ok: true }) }
  if (body?.event !== 'message' || body?.session !== SESSION) return NextResponse.json({ ok: true })

  const p = body.payload
  const from: string = String(p?.from || '')
  let texto: string = String(p?.body || '').trim()
  if (!p || p.fromMe || !from || from.endsWith('@g.us') || from.includes('@broadcast') || from.endsWith('@newsletter')) return NextResponse.json({ ok: true })
  const ehAudio = !texto && p.hasMedia && String(p?.media?.mimetype || '').startsWith('audio')
  if (!texto && !ehAudio) return NextResponse.json({ ok: true })
  if (p.id && jaVisto(String(p.id))) return NextResponse.json({ ok: true })

  const telefone = await telefoneDe(from)
  if (!telefone || !ALLOWLIST.has(telefone)) return NextResponse.json({ ok: true })

  if (ehAudio) {
    const audio = await baixarAudio(p)
    texto = audio ? ((await transcreverAudioWhatsApp(audio.buf, audio.mimetype)) || '') : ''
    if (!texto) {
      // Mesma resposta de reserva do atendimento normal quando o áudio não pôde ser transcrito.
      await waha('/api/sendText', { method: 'POST', body: JSON.stringify({ session: SESSION, chatId: `${telefone}@c.us`, text: 'Não consegui ouvir seu áudio agora 😕 Pode escrever sua mensagem, por favor?' }) })
      return NextResponse.json({ ok: true, audioSemTexto: true })
    }
  }

  try {
    const chatId = `${telefone}@c.us`
    // Histórico recente do próprio WhatsApp (nada é gravado no nosso banco).
    let historico: HistoricoMsg[] = [{ direction: 'in', body: texto }]
    const h = await waha(`/api/${encodeURIComponent(SESSION)}/chats/${encodeURIComponent(chatId)}/messages?limit=10&downloadMedia=false`)
    if (h.ok) {
      const lista: any[] = await h.json()
      const ordenada = lista
        .filter(m => String(m?.body || '').trim())
        .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
        .map(m => ({ direction: m.fromMe ? 'out' : 'in', body: String(m.body) }) as HistoricoMsg)
      if (ehAudio) ordenada.push({ direction: 'in', body: texto } as HistoricoMsg)
      if (ordenada.length && ordenada[ordenada.length - 1].direction === 'in') historico = ordenada
    }

    const sentAt = p.timestamp ? new Date(Number(p.timestamp) * 1000).toISOString() : null
    const resposta = await gerarRespostaIA(COMPANY_ID, historico, telefone, sentAt)
    if (!resposta?.texto) return NextResponse.json({ ok: true, semResposta: true })

    const r = await waha('/api/sendText', { method: 'POST', body: JSON.stringify({ session: SESSION, chatId, text: resposta.texto }) })
    if (!r.ok) console.error('[wa/webhook] sendText falhou', r.status, (await r.text().catch(() => '')).slice(0, 200))
    return NextResponse.json({ ok: r.ok })
  } catch (err) {
    console.error('[wa/webhook] erro', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
