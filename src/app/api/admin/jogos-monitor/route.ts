import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/requireAdmin'

// Monitor dos links de jogos que saem no WhatsApp (admin → Jogos): quem recebeu, quem abriu, quem jogou e
// quantos pontos fez. Dois links: "enquanto você espera" (diversão, jogo_links_enviados) e o do cashback do
// delivery (jogo_ofertas_pedido). "Jogou" = rodada do jogador com o WhatsApp do pedido, até 48 h após o envio.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const JANELA_MS = 48 * 3600000

type Link = { tipo: 'diversao' | 'cashback'; company_id: string; pedido_id: string; customer_phone: string; customer_name: string | null; enviado_em: string; acessos: number; primeiro_acesso_em: string | null; estado?: string; premio_valor?: number | null }

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const b = await req.json().catch(() => ({})) as { from?: string | null; to?: string | null; companyId?: string | null }
  const from = b.from || new Date(Date.now() - 30 * 86400000).toISOString()
  const to = b.to || null

  let q1 = sb.from('jogo_links_enviados').select('company_id, pedido_id, customer_phone, customer_name, enviado_em, acessos, primeiro_acesso_em').gte('enviado_em', from).order('enviado_em', { ascending: false }).limit(2000)
  let q2 = sb.from('jogo_ofertas_pedido').select('company_id, pedido_id, customer_phone, criado_em, acessos, primeiro_acesso_em, estado, premio_valor').gte('criado_em', from).order('criado_em', { ascending: false }).limit(2000)
  if (to) { q1 = q1.lt('enviado_em', to); q2 = q2.lt('criado_em', to) }
  if (b.companyId) { q1 = q1.eq('company_id', b.companyId); q2 = q2.eq('company_id', b.companyId) }
  const [{ data: d1 }, { data: d2 }] = await Promise.all([q1, q2])
  const links: Link[] = [
    ...(d1 || []).map(l => ({ ...l, tipo: 'diversao' as const })),
    ...(d2 || []).map(l => ({ tipo: 'cashback' as const, company_id: l.company_id, pedido_id: l.pedido_id, customer_phone: l.customer_phone, customer_name: null, enviado_em: l.criado_em, acessos: l.acessos, primeiro_acesso_em: l.primeiro_acesso_em, estado: l.estado, premio_valor: l.premio_valor })),
  ].sort((a, b2) => b2.enviado_em.localeCompare(a.enviado_em))

  const cids = [...new Set(links.map(l => l.company_id))]
  const pids = [...new Set(links.map(l => l.pedido_id))]
  const phones = [...new Set(links.map(l => l.customer_phone))]
  const [{ data: cos }, { data: peds }, { data: jogs }] = await Promise.all([
    cids.length ? sb.from('companies').select('id, name').in('id', cids) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    pids.length ? sb.from('loja_pedidos').select('id, order_number, customer_name, total').in('id', pids) : Promise.resolve({ data: [] as { id: string; order_number: number | null; customer_name: string | null; total: number }[] }),
    phones.length ? sb.from('quiz_jogadores').select('id, company_id, telefone, apelido').in('telefone', phones) : Promise.resolve({ data: [] as { id: string; company_id: string; telefone: string; apelido: string }[] }),
  ])
  const loja = new Map((cos || []).map(c => [c.id, String(c.name).trim()]))
  const ped = new Map((peds || []).map(p => [p.id, p]))
  const jogador = new Map((jogs || []).map(j => [`${j.company_id}|${j.telefone}`, j]))
  const jids = (jogs || []).map(j => j.id)
  const [{ data: qr }, { data: cr }] = jids.length ? await Promise.all([
    sb.from('quiz_rodadas').select('jogador_id, iniciada_em, pontos, acertos, estado').in('jogador_id', jids).gte('iniciada_em', from).limit(10000),
    sb.from('caca_rodadas').select('jogador_id, criada_em, pontos, melhor_nivel, estado').in('jogador_id', jids).gte('criada_em', from).limit(10000),
  ]) : [{ data: [] }, { data: [] }]

  const linhas = links.map(l => {
    const j = jogador.get(`${l.company_id}|${l.customer_phone}`)
    const ini = Date.parse(l.enviado_em), fim = ini + JANELA_MS
    const dentro = (t: string) => { const x = Date.parse(t); return x >= ini && x <= fim }
    const qs = j ? (qr || []).filter(r => r.jogador_id === j.id && dentro(r.iniciada_em)) : []
    const cs = j ? (cr || []).filter(r => r.jogador_id === j.id && dentro(r.criada_em)) : []
    const p = ped.get(l.pedido_id)
    return {
      tipo: l.tipo, loja: loja.get(l.company_id) || '—', cliente: l.customer_name || p?.customer_name || null, apelido: j?.apelido || null,
      phone: l.customer_phone, pedido: p?.order_number ?? null, totalPedido: p ? Number(p.total) : null,
      enviadoEm: l.enviado_em, acessos: l.acessos || 0, abriuEm: l.primeiro_acesso_em,
      quiz: qs.length ? { rodadas: qs.length, pontos: Math.max(...qs.map(r => r.pontos || 0)), acertos: Math.max(...qs.map(r => r.acertos || 0)) } : null,
      caca: cs.length ? { rodadas: cs.length, pontos: Math.max(...cs.map(r => r.pontos || 0)), nivel: Math.max(...cs.map(r => r.melhor_nivel || 0)) } : null,
      cashback: l.tipo === 'cashback' ? { estado: l.estado || 'aberta', valor: l.premio_valor != null ? Number(l.premio_valor) : null } : null,
    }
  })

  const porLoja = new Map<string, { loja: string; enviados: number; abriram: number; jogaram: number }>()
  for (const x of linhas) {
    const e = porLoja.get(x.loja) || { loja: x.loja, enviados: 0, abriram: 0, jogaram: 0 }
    e.enviados++; if (x.acessos > 0) e.abriram++; if (x.quiz || x.caca) e.jogaram++
    porLoja.set(x.loja, e)
  }
  return NextResponse.json({
    resumo: {
      enviados: linhas.length, abriram: linhas.filter(x => x.acessos > 0).length, jogaram: linhas.filter(x => x.quiz || x.caca).length,
      cashbackPago: Math.round(linhas.reduce((s, x) => s + (x.cashback?.estado === 'premiada' ? x.cashback.valor || 0 : 0), 0) * 100) / 100,
    },
    porLoja: [...porLoja.values()].sort((a, b2) => b2.enviados - a.enviados),
    linhas: linhas.slice(0, 500),
  })
}
