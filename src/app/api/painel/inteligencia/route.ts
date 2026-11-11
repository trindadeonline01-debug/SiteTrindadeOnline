import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/requireAdmin'
import { requireCompanyAccess } from '@/lib/requireUser'
import { normalizePhone } from '@/lib/phone'
import { matchBairroInAddress } from '@/lib/bairrosSaoGoncalo'
import { ORIGENS_DELIVERY } from '@/lib/canais'

// Inteligência de consumo (nov/2026): entrega à tela os pedidos de DELIVERY (sem cancelados, sem
// mesa/PDV) já "achatados" — quem comprou, o quê, quando, de qual bairro — mais os números de prazo
// e de mensagens fora do horário. Toda a filtragem (loja, bairro, produto, horário, período, grupo
// de clientes) é feita no navegador, em cima desse conjunto.
//  • { companyId }  → dono da empresa (ou admin vendo como a empresa)
//  • { all: true }  → só admin, todas as lojas
// Pedidos de teste do Ricardo (WhatsApp final 0551) ficam de fora.

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const DIA_MS = 86400000
const BRT = 3 * 3600000 // Brasil sem horário de verão: UTC-3 fixo

type PedidoRow = { id: string; company_id: string; customer_name: string | null; customer_phone: string | null; delivery_address: string | null; total: number | string | null; created_at: string }

function mediana(v: number[]): number {
  if (!v.length) return 0
  const s = [...v].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

async function paginar<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null }>, maxPaginas = 40): Promise<T[]> {
  const out: T[] = []
  for (let p = 0; p < maxPaginas; p++) {
    const { data } = await consulta(p * 1000, p * 1000 + 999)
    if (!data?.length) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

export async function POST(req: NextRequest) {
  let b: Record<string, unknown> = {}
  try { b = await req.json() } catch { /* corpo vazio */ }
  const todas = b.all === true
  const companyId = String(b.companyId || '')
  if (todas) {
    const a = await requireAdmin(req)
    if (a instanceof NextResponse) return a
  } else {
    if (!companyId) return NextResponse.json({ error: 'Empresa não informada' }, { status: 400 })
    const a = await requireCompanyAccess(req, companyId)
    if (a instanceof NextResponse) return a
  }

  const desde = new Date(Date.now() - 400 * DIA_MS).toISOString()
  const pedidos = await paginar<PedidoRow>((de, ate) => {
    let q = sb.from('loja_pedidos')
      .select('id, company_id, customer_name, customer_phone, delivery_address, total, created_at')
      .in('origin', [...ORIGENS_DELIVERY]).neq('status', 'cancelado').gte('created_at', desde)
      .order('created_at', { ascending: true }).range(de, ate)
    if (!todas) q = q.eq('company_id', companyId)
    return q as unknown as PromiseLike<{ data: PedidoRow[] | null }>
  })

  const validos = pedidos.filter(p => {
    const tel = normalizePhone(p.customer_phone || '')
    return !tel.endsWith('0551')
  })

  // Itens de cada pedido (nomes dos produtos).
  const itensPor = new Map<string, string[]>()
  const ids = validos.map(p => p.id)
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await sb.from('loja_pedido_itens').select('pedido_id, product_name').in('pedido_id', ids.slice(i, i + 150))
    for (const it of (data || []) as { pedido_id: string; product_name: string | null }[]) {
      if (!it.product_name) continue
      const l = itensPor.get(it.pedido_id) || []
      l.push(it.product_name)
      itensPor.set(it.pedido_id, l)
    }
  }

  // Lojas que aparecem (índice usado pelo navegador).
  const empIds = [...new Set(validos.map(p => p.company_id))]
  const { data: emps } = empIds.length
    ? await sb.from('companies').select('id, name, loja_tempo_preparo_min').in('id', empIds)
    : { data: [] as { id: string; name: string; loja_tempo_preparo_min: number | null }[] }
  const nomePor = new Map((emps || []).map(e => [e.id, e]))
  const lojas = empIds
    .map(id => ({ id, nome: String(nomePor.get(id)?.name || '—').trim(), prazo: Number(nomePor.get(id)?.loja_tempo_preparo_min) || 0, n: validos.filter(p => p.company_id === id).length }))
    .sort((a, b) => b.n - a.n)
  const idxLoja = new Map(lojas.map((l, i) => [l.id, i]))

  const linhas = validos.map(p => {
    const t = new Date(new Date(p.created_at).getTime() - BRT)
    const tel = normalizePhone(p.customer_phone || '')
    return {
      l: idxLoja.get(p.company_id) ?? 0,
      d: t.toISOString().slice(0, 10),            // data em Brasília
      h: t.getUTCHours(),
      w: t.getUTCDay(),                            // 0 = domingo
      b: p.delivery_address ? matchBairroInAddress(p.delivery_address) || '' : '',
      t: Math.round(Number(p.total || 0) * 100) / 100,
      p: tel,
      n: (p.customer_name || '').trim(),
      it: [...new Set(itensPor.get(p.id) || [])],
    }
  })

  // Prazo prometido x real (60 dias, entregas concluídas).
  const criado = new Map(validos.map(p => [p.id, new Date(p.created_at).getTime()]))
  const desde60 = new Date(Date.now() - 60 * DIA_MS).toISOString()
  const ents = await paginar<{ pedido_id: string | null; company_id: string; picked_up_at: string | null; delivered_at: string | null }>((de, ate) => {
    let q = sb.from('delivery_orders').select('pedido_id, company_id, picked_up_at, delivered_at')
      .eq('status', 'entregue').not('picked_up_at', 'is', null).not('delivered_at', 'is', null).not('pedido_id', 'is', null)
      .gte('created_at', desde60).range(de, ate)
    if (!todas) q = q.eq('company_id', companyId)
    return q as unknown as PromiseLike<{ data: { pedido_id: string | null; company_id: string; picked_up_at: string | null; delivered_at: string | null }[] | null }>
  })
  const porLoja = new Map<string, { ret: number[]; ent: number[] }>()
  for (const e of ents) {
    const c0 = e.pedido_id ? criado.get(e.pedido_id) : undefined
    if (!c0 || !e.picked_up_at || !e.delivered_at) continue
    const ret = (new Date(e.picked_up_at).getTime() - c0) / 60000
    const ent = (new Date(e.delivered_at).getTime() - new Date(e.picked_up_at).getTime()) / 60000
    if (ret < 0 || ret > 600 || ent < 0 || ent > 600) continue
    const o = porLoja.get(e.company_id) || { ret: [], ent: [] }
    o.ret.push(ret); o.ent.push(ent)
    porLoja.set(e.company_id, o)
  }
  const prazos = lojas.map((l, i) => {
    const o = porLoja.get(l.id)
    if (!o || o.ret.length < 3) return null
    const passou = l.prazo ? Math.round(o.ret.filter(x => x > l.prazo).length / o.ret.length * 100) : null
    return { l: i, n: o.ret.length, prazo: l.prazo, ret: Math.round(mediana(o.ret)), ent: Math.round(mediana(o.ent)), passou }
  }).filter(Boolean)

  // Mensagens recebidas no WhatsApp em dias de loja fechada (seg e dom), 30 dias.
  const desde30 = new Date(Date.now() - 30 * DIA_MS).toISOString()
  const msgs = await paginar<{ company_id: string; sent_at: string }>((de, ate) => {
    let q = sb.from('crm_messages').select('company_id, sent_at').eq('direction', 'in').gte('sent_at', desde30).range(de, ate)
    q = todas ? q.in('company_id', empIds.length ? empIds : ['00000000-0000-0000-0000-000000000000']) : q.eq('company_id', companyId)
    return q as unknown as PromiseLike<{ data: { company_id: string; sent_at: string }[] | null }>
  }, 25)
  const cont = new Map<string, { tot: number; sd: number }>()
  for (const m of msgs) {
    const w = new Date(new Date(m.sent_at).getTime() - BRT).getUTCDay()
    const o = cont.get(m.company_id) || { tot: 0, sd: 0 }
    o.tot++
    if (w === 0 || w === 1) o.sd++
    cont.set(m.company_id, o)
  }
  const perdida = lojas.map((l, i) => ({ l: i, ...(cont.get(l.id) || { tot: 0, sd: 0 }) })).filter(x => x.tot > 0)

  return NextResponse.json({
    hoje: new Date(Date.now() - BRT).toISOString().slice(0, 10),
    lojas: lojas.map(l => ({ nome: l.nome, prazo: l.prazo })),
    pedidos: linhas, prazos, perdida,
  })
}
