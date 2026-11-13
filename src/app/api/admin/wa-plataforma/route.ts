import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/requireAdmin'
import { waha, wahaCriarSessao, wahaSessao, wahaQr, wahaApagarSessao, waSendText } from '@/lib/wa'
import { PLATAFORMA_WAHA, PLATAFORMA_SESSAO, plataformaWaha } from '@/lib/wa/plataforma'

// Conexão do número da PLATAFORMA no WAHA (só admin): criar a sessão, ler o QR, ver o estado e mandar uma
// mensagem de teste — tudo ANTES de virar a chave (WA_PLATFORM_PROVIDER=waha na Vercel). Nada aqui mexe na Evolution.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { acao, phone, texto } = await req.json().catch(() => ({}))

  if (acao === 'criar') {
    const atual = await wahaSessao(PLATAFORMA_SESSAO)
    if (!atual) {
      const r = await wahaCriarSessao(PLATAFORMA_SESSAO)
      if (!r.ok) return NextResponse.json({ error: r.detail || 'não criou a sessão' }, { status: 500 })
    } else if (atual.status === 'FAILED') {
      // QR que expirou sem leitura deixa a sessão "Falhou" e o /start não destrava: apaga e cria de novo.
      await wahaApagarSessao(PLATAFORMA_SESSAO)
      const r = await wahaCriarSessao(PLATAFORMA_SESSAO)
      if (!r.ok) return NextResponse.json({ error: r.detail || 'não recriou a sessão' }, { status: 500 })
    } else if (atual.status === 'STOPPED') {
      await waha(`/api/sessions/${encodeURIComponent(PLATAFORMA_SESSAO)}/start`, { method: 'POST' })
    }
    return NextResponse.json({ ok: true })
  }

  if (acao === 'apagar') {
    await wahaApagarSessao(PLATAFORMA_SESSAO)
    return NextResponse.json({ ok: true })
  }

  if (acao === 'testar') {
    const d = String(phone || '').replace(/\D/g, '')
    if (d.length < 10) return NextResponse.json({ error: 'informe o telefone com DDD' }, { status: 400 })
    const r = await waSendText(plataformaWaha(), d.startsWith('55') ? d : '55' + d, String(texto || '✅ Teste do número da plataforma pelo WAHA.'))
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.detail || 'falhou' }, { status: 500 })
  }

  // status (padrão)
  const st = await wahaSessao(PLATAFORMA_SESSAO)
  const qr = st?.status === 'SCAN_QR_CODE' ? await wahaQr(PLATAFORMA_SESSAO) : null
  return NextResponse.json({ chaveNoWaha: PLATAFORMA_WAHA, sessao: PLATAFORMA_SESSAO, existe: !!st, status: st?.status || null, phone: st?.phone || null, qr })
}
