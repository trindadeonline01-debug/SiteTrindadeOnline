import { NextRequest, NextResponse } from 'next/server'
import { notifyAdmin, AdminEvent } from '@/lib/notifyAdmin'

function clip(s: unknown, max: number): string | null {
  if (typeof s !== 'string') return null
  const t = s.trim().slice(0, max)
  return t || null
}

// Essa rota é pública de propósito — dispara durante o cadastro de
// empresa, antes de existir sessão (ver /anunciar). Mas sem checagem
// nenhuma de forma, qualquer um podia mandar POST direto com texto livre e
// fazer aparecer como "notificação do sistema" no WhatsApp do Ricardo —
// spam ou mensagem forjada se passando por aviso real (achado em auditoria
// de segurança, out/2026). Só aceita os 2 tipos que o app de fato dispara
// por essa rota pública (nova_empresa/nova_sugestao) — nova_assinatura e
// motoboy_reenviou só são disparados server-side, direto por notifyAdmin(),
// nunca por aqui — com campo tipado e tamanho travado, não texto livre.
function parseEvent(body: any): AdminEvent | null {
  if (!body || typeof body !== 'object') return null
  if (body.type === 'nova_empresa') {
    const nome = clip(body.nome, 150)
    if (!nome) return null
    const categoria = clip(body.categoria, 60) || undefined
    return { type: 'nova_empresa', nome, categoria }
  }
  if (body.type === 'nova_sugestao') {
    const empresa = clip(body.empresa, 150)
    if (!empresa) return null
    if (!Array.isArray(body.sugestoes)) return null
    const sugestoes = body.sugestoes.map((s: unknown) => clip(s, 60)).filter((s: string | null): s is string => !!s).slice(0, 10)
    if (sugestoes.length === 0) return null
    return { type: 'nova_sugestao', empresa, sugestoes }
  }
  return null
}

// Limite simples pra não virar canal de flood — essa rota não exige login,
// então um script batendo em loop não devia conseguir disparar dezenas de
// "notificações" por minuto. Em memória (reseta a cada cold start da
// function serverless) — não é um rate-limit global de verdade entre
// instâncias da Vercel, mas já corta o caso óbvio de abuso na mesma
// instância sem precisar de tabela nova no banco.
const hits = new Map<string, number[]>()
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 5
function tooMany(ip: string): boolean {
  const now = Date.now()
  const arr = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS)
  arr.push(now)
  hits.set(ip, arr)
  return arr.length > MAX_PER_WINDOW
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'desconhecido'
    if (tooMany(ip)) return NextResponse.json({ error: 'muitas tentativas, espera um pouco' }, { status: 429 })

    const event = parseEvent(await req.json())
    if (!event) return NextResponse.json({ error: 'evento inválido' }, { status: 400 })

    await notifyAdmin(event)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[admin/notify-whatsapp]', err)
    return NextResponse.json({ error: 'falha ao notificar' }, { status: 500 })
  }
}
