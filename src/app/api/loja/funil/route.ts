import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/phone'

// Rastreio do funil do cardápio (ver src/lib/funil.ts). Público, sem login; só grava, nunca devolve dado.
// Limite por visitante para ninguém encher a tabela: no máximo 40 eventos por loja em 10 minutos.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const EVENTOS = ['cardapio_aberto', 'carrinho_add', 'carrinho_telefone', 'pedido_feito']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  let b: Record<string, unknown>
  try { b = await req.json() } catch { return NextResponse.json({ ok: false }, { status: 400 }) }
  const companyId = String(b.companyId || ''), sessao = String(b.sessao || '').slice(0, 64), evento = String(b.evento || '')
  if (!UUID.test(companyId) || !sessao || !EVENTOS.includes(evento)) return NextResponse.json({ ok: false }, { status: 400 })

  const desde = new Date(Date.now() - 10 * 60000).toISOString()
  const { count } = await sb.from('loja_funil_eventos').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('sessao', sessao).gte('created_at', desde)
  if ((count || 0) >= 40) return NextResponse.json({ ok: true, limitado: true })

  const itens = Array.isArray(b.itens)
    ? (b.itens as { n?: unknown; q?: unknown }[]).slice(0, 15).map(i => ({ n: String(i.n || '').slice(0, 60), q: Math.max(1, Math.min(99, Number(i.q) || 1)) })).filter(i => i.n)
    : null
  const tel = b.telefone ? normalizePhone(String(b.telefone)) : ''
  await sb.from('loja_funil_eventos').insert({
    company_id: companyId, sessao, evento,
    origem: b.origem ? String(b.origem).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24) || null : null,
    produto_id: typeof b.produtoId === 'string' && UUID.test(b.produtoId) ? b.produtoId : null,
    itens: itens && itens.length ? itens : null,
    telefone: tel.length >= 12 ? tel : null,
  })
  return NextResponse.json({ ok: true })
}
