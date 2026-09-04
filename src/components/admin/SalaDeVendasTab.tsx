'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Period = 'today' | '7d' | '30d' | 'all'
type StatusPedido = 'recebido' | 'em_preparo' | 'pronto' | 'saiu_entrega' | 'entregue' | 'cancelado'

interface Pedido {
  id: string
  company_id: string
  customer_name: string | null
  status: StatusPedido
  payment_method: string | null
  delivery_type: string | null
  total: number
  created_at: string
  order_number: number | null
}

interface Item {
  pedido_id: string
  product_name: string
  qty: number
  unit_price: number
}

const OPEN_STATUSES: StatusPedido[] = ['recebido', 'em_preparo', 'pronto', 'saiu_entrega']
const STATUS_LABEL: Record<StatusPedido, string> = {
  recebido: 'Recebido', em_preparo: 'Em preparo', pronto: 'Pronto',
  saiu_entrega: 'Saiu p/ entrega', entregue: 'Entregue', cancelado: 'Cancelado',
}
const STATUS_COLOR: Record<StatusPedido, string> = {
  recebido: 'var(--warn)', em_preparo: 'var(--info)', pronto: 'var(--info)',
  saiu_entrega: 'var(--info)', entregue: 'var(--open)', cancelado: 'var(--alert)',
}

function periodStart(p: Period): string | null {
  const now = new Date()
  if (p === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  if (p === '7d') return new Date(Date.now() - 7 * 86400000).toISOString()
  if (p === '30d') return new Date(Date.now() - 30 * 86400000).toISOString()
  return null
}

function fmtMoney(n: number) {
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function pctDelta(curr: number, prev: number): { label: string; pos: boolean } | null {
  if (prev === 0 && curr === 0) return null
  if (prev === 0) return { label: 'novo', pos: true }
  const pct = ((curr - prev) / prev) * 100
  return { label: `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%`, pos: pct >= 0 }
}

export default function SalaDeVendasTab() {
  const [period, setPeriod] = useState<Period>('today')
  const [storeFilter, setStoreFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])
  const [pedidos, setPedidos] = useState<Pedido[]>([])       // período atual
  const [pedidosPrev, setPedidosPrev] = useState<Pedido[]>([]) // período anterior equivalente, pra delta
  const [feed, setFeed] = useState<Pedido[]>([])             // recentes, sem filtro de período
  const [openOrders, setOpenOrders] = useState<Pedido[]>([]) // em aberto agora, sem filtro de período
  const [weekly, setWeekly] = useState<{ day: string; label: string; total: number; isToday: boolean }[]>([])
  const [topProducts, setTopProducts] = useState<{ name: string; store: string; qty: number; orders: number }[]>([])
  const chartRef = useRef<HTMLDivElement>(null)

  async function loadCompanies() {
    const { data } = await supabase
      .from('companies')
      .select('id, name, loja_digital_enabled, trial_modules_until')
      .order('name')
    const withModule = (data || []).filter((c: any) => {
      if (c.loja_digital_enabled) return true
      if (c.trial_modules_until && new Date(c.trial_modules_until).getTime() > Date.now()) return true
      return false
    })
    setCompanies(withModule.map((c: any) => ({ id: c.id, name: c.name })))
  }

  async function loadAll() {
    setLoading(true)
    const from = periodStart(period)
    const now = new Date()

    let q = supabase.from('loja_pedidos').select('id, company_id, customer_name, status, payment_method, delivery_type, total, created_at, order_number')
    if (from) q = q.gte('created_at', from)
    if (storeFilter !== 'all') q = q.eq('company_id', storeFilter)
    const { data: curr } = await q.order('created_at', { ascending: false })
    setPedidos((curr || []) as Pedido[])

    // período anterior equivalente, só pra "today"/"7d"/"30d" — pra "all" não existe anterior
    if (from) {
      const ms = now.getTime() - new Date(from).getTime()
      const prevFrom = new Date(new Date(from).getTime() - ms).toISOString()
      let qp = supabase.from('loja_pedidos').select('id, company_id, customer_name, status, payment_method, delivery_type, total, created_at, order_number').gte('created_at', prevFrom).lt('created_at', from)
      if (storeFilter !== 'all') qp = qp.eq('company_id', storeFilter)
      const { data: prev } = await qp
      setPedidosPrev((prev || []) as Pedido[])
    } else {
      setPedidosPrev([])
    }

    // feed recente — últimos 20, sem filtro de período (mas respeita loja)
    let qf = supabase.from('loja_pedidos').select('id, company_id, customer_name, status, payment_method, delivery_type, total, created_at, order_number').order('created_at', { ascending: false }).limit(20)
    if (storeFilter !== 'all') qf = qf.eq('company_id', storeFilter)
    const { data: feedData } = await qf
    setFeed((feedData || []) as Pedido[])

    // pedidos em aberto agora — instantâneo, sem filtro de período
    let qo = supabase.from('loja_pedidos').select('id, company_id, customer_name, status, payment_method, delivery_type, total, created_at, order_number').in('status', OPEN_STATUSES)
    if (storeFilter !== 'all') qo = qo.eq('company_id', storeFilter)
    const { data: openData } = await qo
    setOpenOrders((openData || []) as Pedido[])

    // faturamento por dia — últimos 7 dias, sempre (independente do período escolhido)
    const days: { day: string; label: string; total: number; isToday: boolean }[] = []
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).toISOString()
    let qw = supabase.from('loja_pedidos').select('created_at, total, status').gte('created_at', weekStart).neq('status', 'cancelado')
    if (storeFilter !== 'all') qw = qw.eq('company_id', storeFilter)
    const { data: weekData } = await qw
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate())
      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
      const total = (weekData || []).filter((p: any) => {
        const t = new Date(p.created_at).getTime()
        return t >= dayStart.getTime() && t <= dayEnd.getTime()
      }).reduce((a: number, p: any) => a + Number(p.total || 0), 0)
      days.push({ day: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''), label: `${d.getDate()}/${d.getMonth() + 1}`, total, isToday: i === 0 })
    }
    setWeekly(days)

    // produtos mais vendidos — últimos 30 dias, todas as lojas (ou a filtrada), excluindo cancelados
    const prodFrom = new Date(Date.now() - 30 * 86400000).toISOString()
    let qi = supabase.from('loja_pedidos').select('id, company_id, status').gte('created_at', prodFrom).neq('status', 'cancelado')
    if (storeFilter !== 'all') qi = qi.eq('company_id', storeFilter)
    const { data: recentPedidos } = await qi
    const pedidoIds = (recentPedidos || []).map((p: any) => p.id)
    const pedidoCompany: Record<string, string> = {}
    ;(recentPedidos || []).forEach((p: any) => { pedidoCompany[p.id] = p.company_id })

    let prodAgg: { name: string; store: string; qty: number; orders: number }[] = []
    if (pedidoIds.length > 0) {
      const { data: itens } = await supabase.from('loja_pedido_itens').select('pedido_id, product_name, qty').in('pedido_id', pedidoIds)
      const { data: allCompanies } = await supabase.from('companies').select('id, name')
      const nameById: Record<string, string> = {}
      ;(allCompanies || []).forEach((c: any) => { nameById[c.id] = c.name })

      const agg: Record<string, { name: string; store: string; qty: number; orders: Set<string> }> = {}
      ;(itens || []).forEach((it: any) => {
        const companyId = pedidoCompany[it.pedido_id]
        const key = `${companyId}::${it.product_name}`
        if (!agg[key]) agg[key] = { name: it.product_name, store: nameById[companyId] || '—', qty: 0, orders: new Set() }
        agg[key].qty += Number(it.qty || 0)
        agg[key].orders.add(it.pedido_id)
      })
      prodAgg = Object.values(agg)
        .map(a => ({ name: a.name, store: a.store, qty: a.qty, orders: a.orders.size }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5)
    }
    setTopProducts(prodAgg)

    setLoading(false)
  }

  useEffect(() => { loadCompanies() }, [])
  useEffect(() => { loadAll() }, [period, storeFilter])

  // ao vivo — atualiza sozinho quando qualquer pedido muda
  useEffect(() => {
    const channel = supabase.channel('admin-sala-de-vendas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loja_pedidos' }, () => { loadAll() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, storeFilter])

  const companyName = useMemo(() => {
    const m: Record<string, string> = {}
    companies.forEach(c => { m[c.id] = c.name })
    return m
  }, [companies])

  const naoCancelados = pedidos.filter(p => p.status !== 'cancelado')
  const faturado = naoCancelados.reduce((a, p) => a + Number(p.total || 0), 0)
  const numPedidos = naoCancelados.length
  const ticketMedio = numPedidos > 0 ? faturado / numPedidos : 0

  const prevNaoCancelados = pedidosPrev.filter(p => p.status !== 'cancelado')
  const prevFaturado = prevNaoCancelados.reduce((a, p) => a + Number(p.total || 0), 0)
  const prevNumPedidos = prevNaoCancelados.length
  const prevTicketMedio = prevNumPedidos > 0 ? prevFaturado / prevNumPedidos : 0

  const deltaFaturado = pctDelta(faturado, prevFaturado)
  const deltaPedidos = pctDelta(numPedidos, prevNumPedidos)
  const deltaTicket = pctDelta(ticketMedio, prevTicketMedio)

  const cancelados = pedidos.filter(p => p.status === 'cancelado')
  const taxaCancelamento = pedidos.length > 0 ? (cancelados.length / pedidos.length) * 100 : 0
  const canceladosPorLoja: Record<string, number> = {}
  cancelados.forEach(p => { canceladosPorLoja[p.company_id] = (canceladosPorLoja[p.company_id] || 0) + 1 })
  const lojaComMaisCancelamento = Object.entries(canceladosPorLoja).sort((a, b) => b[1] - a[1])[0]

  // ranking por loja, no período selecionado
  const ranking = useMemo(() => {
    const agg: Record<string, { total: number; count: number }> = {}
    naoCancelados.forEach(p => {
      if (!agg[p.company_id]) agg[p.company_id] = { total: 0, count: 0 }
      agg[p.company_id].total += Number(p.total || 0)
      agg[p.company_id].count++
    })
    return Object.entries(agg)
      .map(([id, v]) => ({ id, name: companyName[id] || '—', ...v }))
      .sort((a, b) => b.total - a.total)
  }, [naoCancelados, companyName])

  const lojasSemVenda = companies.filter(c => !ranking.some(r => r.id === c.id))

  // mix de pagamento / entrega, no período
  const mixPagamento = useMemo(() => {
    const m: Record<string, number> = { cartao: 0, dinheiro: 0, pix: 0 }
    naoCancelados.forEach(p => { const k = p.payment_method || 'outro'; m[k] = (m[k] || 0) + 1 })
    return m
  }, [naoCancelados])
  const mixEntrega = useMemo(() => {
    const m: Record<string, number> = { entrega: 0, retirada: 0 }
    naoCancelados.forEach(p => { const k = p.delivery_type || 'outro'; m[k] = (m[k] || 0) + 1 })
    return m
  }, [naoCancelados])

  // pedidos abertos parados há mais de 2h
  const agora = Date.now()
  const pedidosParados = openOrders.filter(p => (agora - new Date(p.created_at).getTime()) > 2 * 3600 * 1000)
  const valorParado = pedidosParados.reduce((a, p) => a + Number(p.total || 0), 0)
  const parados15dMaisAntigo = pedidosParados.length > 0
    ? pedidosParados.reduce((a, p) => new Date(p.created_at).getTime() < new Date(a.created_at).getTime() ? p : a)
    : null

  // loja com módulo ativo mas sem venda há 7+ dias (ou nunca vendeu)
  const lojaInativa = useMemo(() => {
    const seteDias = Date.now() - 7 * 86400000
    for (const c of companies) {
      const pedidosDaLoja = feed.filter(p => p.company_id === c.id)
      const ultima = pedidosDaLoja[0]
      if (!ultima) continue // sem pedido nenhum ainda — não é "inatividade", é ausência total, tratamos separado
      if (new Date(ultima.created_at).getTime() < seteDias) return c
    }
    return null
  }, [companies, feed])

  const maxRankTotal = ranking[0]?.total || 1
  const maxWeekly = Math.max(...weekly.map(d => d.total), 1)
  const totalMix = mixPagamento.cartao + mixPagamento.dinheiro + mixPagamento.pix
  const totalMixEntrega = mixEntrega.entrega + mixEntrega.retirada

  const s = {
    card: { background: '#fff', borderRadius: 14, border: '1.5px solid #f0f0f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' as const },
    cardHd: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', borderBottom: '1px solid #f0f0f0', gap: 10 },
    cardTitle: { fontSize: 12, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: 0.5, color: '#888' },
    cardHint: { fontSize: 11, color: '#aaa' },
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      <style>{`
        .sv-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px;}
        .sv-alerts{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px;}
        .sv-body{display:grid;grid-template-columns:1.55fr 1fr;gap:14px;margin-bottom:14px;align-items:start;}
        .sv-bottom{display:grid;grid-template-columns:1.15fr .95fr .9fr;gap:14px;}
        .sv-stack{display:flex;flex-direction:column;gap:14px;}
        @media(max-width:1080px){.sv-bottom{grid-template-columns:1fr 1fr;}}
        @media(max-width:880px){
          .sv-kpis{grid-template-columns:repeat(2,1fr);}
          .sv-alerts{grid-template-columns:1fr;}
          .sv-body{grid-template-columns:1fr;}
          .sv-bottom{grid-template-columns:1fr;}
        }
        .sv-period-btn{border:1.5px solid #e0e0e0;background:#fff;font-size:12px;font-weight:700;color:#888;padding:7px 13px;border-radius:8px;cursor:pointer;}
        .sv-period-btn.on{background:var(--ink);border-color:var(--ink);color:var(--sign);}
        .sv-mix-bar{display:flex;height:18px;border-radius:6px;overflow:hidden;margin-bottom:8px;background:#f0f0f0;}
        .sv-mix-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:#888;}
      `}</style>

      {/* CONTROLES */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--open)', background: '#e4f3ec', borderRadius: 20, padding: '5px 11px 5px 8px' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--open)', display: 'inline-block' }} />
            Ao vivo
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4, background: '#fafafa', border: '1.5px solid #e0e0e0', borderRadius: 10, padding: 3 }}>
            {([['today', 'Hoje'], ['7d', '7 dias'], ['30d', '30 dias'], ['all', 'Tudo']] as [Period, string][]).map(([p, label]) => (
              <button key={p} className={`sv-period-btn ${period === p ? 'on' : ''}`} onClick={() => setPeriod(p)}>{label}</button>
            ))}
          </div>
          <select value={storeFilter} onChange={e => setStoreFilter(e.target.value)} style={{ fontSize: 12.5, fontWeight: 600, color: '#333', background: '#fff', border: '1.5px solid #e0e0e0', borderRadius: 10, padding: '8px 12px' }}>
            <option value="all">Todas as lojas</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {loading && pedidos.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#aaa', padding: 60 }}>Carregando vendas...</div>
      ) : (
      <>
      {/* KPIs */}
      <div className="sv-kpis">
        <div style={{ ...s.card, padding: '16px 18px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#aaa', marginBottom: 6 }}>Faturado {period === 'today' ? 'hoje' : period === 'all' ? '(tudo)' : `(${period === '7d' ? '7 dias' : '30 dias'})`}</div>
          <div style={{ fontFamily: 'inherit', fontWeight: 800, fontSize: 28, color: 'var(--sign-dark)' }}>{fmtMoney(faturado)}</div>
          {deltaFaturado ? (
            <div style={{ fontSize: 11.5, marginTop: 4 }}>
              <span style={{ fontWeight: 700, color: deltaFaturado.pos ? 'var(--open)' : 'var(--alert)' }}>{deltaFaturado.label}</span>
              <span style={{ color: '#aaa' }}> vs. período anterior</span>
            </div>
          ) : <div style={{ fontSize: 11.5, color: '#aaa', marginTop: 4 }}>{numPedidos} pedido{numPedidos !== 1 ? 's' : ''}</div>}
        </div>
        <div style={{ ...s.card, padding: '16px 18px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#aaa', marginBottom: 6 }}>Pedidos</div>
          <div style={{ fontWeight: 800, fontSize: 28, color: '#111' }}>{numPedidos}</div>
          {deltaPedidos ? (
            <div style={{ fontSize: 11.5, marginTop: 4 }}>
              <span style={{ fontWeight: 700, color: deltaPedidos.pos ? 'var(--open)' : 'var(--alert)' }}>{deltaPedidos.label}</span>
              <span style={{ color: '#aaa' }}> vs. período anterior</span>
            </div>
          ) : <div style={{ fontSize: 11.5, color: '#aaa', marginTop: 4 }}>&nbsp;</div>}
        </div>
        <div style={{ ...s.card, padding: '16px 18px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#aaa', marginBottom: 6 }}>Ticket médio</div>
          <div style={{ fontWeight: 800, fontSize: 28, color: '#111' }}>{ticketMedio > 0 ? fmtMoney(ticketMedio) : '—'}</div>
          {deltaTicket ? (
            <div style={{ fontSize: 11.5, marginTop: 4 }}>
              <span style={{ fontWeight: 700, color: deltaTicket.pos ? 'var(--open)' : 'var(--alert)' }}>{deltaTicket.label}</span>
              <span style={{ color: '#aaa' }}> vs. período anterior</span>
            </div>
          ) : <div style={{ fontSize: 11.5, color: '#aaa', marginTop: 4 }}>&nbsp;</div>}
        </div>
        <div style={{ ...s.card, padding: '16px 18px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#aaa', marginBottom: 6 }}>Em aberto agora</div>
          <div style={{ fontWeight: 800, fontSize: 28, color: openOrders.length > 0 ? 'var(--warn)' : '#111' }}>{openOrders.length}</div>
          <div style={{ fontSize: 11.5, color: '#aaa', marginTop: 4 }}>
            {pedidosParados.length > 0 ? <span style={{ color: 'var(--alert)', fontWeight: 700 }}>{pedidosParados.length} parado{pedidosParados.length !== 1 ? 's' : ''} há 2h+</span> : (openOrders.length > 0 ? 'dentro do prazo' : 'nenhum agora')}
          </div>
        </div>
      </div>

      {/* ALERTAS */}
      {(pedidosParados.length > 0 || lojaInativa || (cancelados.length > 0 && taxaCancelamento >= 5)) && (
        <div className="sv-alerts">
          {pedidosParados.length > 0 && (
            <div style={{ ...s.card, display: 'flex', gap: 12, alignItems: 'flex-start', padding: '13px 16px', borderLeft: '4px solid var(--alert)' }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, background: '#fbeaea' }}>⏱️</span>
              <span>
                <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 2 }}>{pedidosParados.length} pedido{pedidosParados.length !== 1 ? 's' : ''} parado{pedidosParados.length !== 1 ? 's' : ''}</div>
                <div style={{ fontSize: 11.5, color: '#888', lineHeight: 1.4 }}>
                  {parados15dMaisAntigo && <b style={{ color: '#111' }}>{companyName[parados15dMaisAntigo.company_id] || '—'}</b>} sem avançar há mais de 2h — {fmtMoney(valorParado)} parado.
                </div>
              </span>
            </div>
          )}
          {lojaInativa && (
            <div style={{ ...s.card, display: 'flex', gap: 12, alignItems: 'flex-start', padding: '13px 16px', borderLeft: '4px solid var(--warn)' }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, background: '#fef3e0' }}>😴</span>
              <span>
                <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 2 }}>Loja sem vender há 7 dias+</div>
                <div style={{ fontSize: 11.5, color: '#888', lineHeight: 1.4 }}><b style={{ color: '#111' }}>{lojaInativa.name}</b> não vende há mais de uma semana — vale um contato.</div>
              </span>
            </div>
          )}
          {cancelados.length > 0 && taxaCancelamento >= 5 && (
            <div style={{ ...s.card, display: 'flex', gap: 12, alignItems: 'flex-start', padding: '13px 16px', borderLeft: '4px solid var(--info)' }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, background: '#e8f0fe' }}>📉</span>
              <span>
                <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 2 }}>Taxa de cancelamento: {taxaCancelamento.toFixed(1)}%</div>
                <div style={{ fontSize: 11.5, color: '#888', lineHeight: 1.4 }}>
                  {cancelados.length} de {pedidos.length} pedidos no período{lojaComMaisCancelamento && <> — concentrado em <b style={{ color: '#111' }}>{companyName[lojaComMaisCancelamento[0]] || '—'}</b></>}.
                </div>
              </span>
            </div>
          )}
        </div>
      )}

      {/* CORPO: feed + ranking/mix */}
      <div className="sv-body">
        <div style={s.card}>
          <div style={s.cardHd}>
            <span style={s.cardTitle}>Pedidos em tempo real</span>
            <span style={s.cardHint}>atualiza sozinho</span>
          </div>
          <div>
            {feed.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#aaa', fontSize: 13 }}>Nenhum pedido ainda.</div>}
            {feed.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: '1px solid #f5f5f5' }}>
                <span style={{ fontSize: 11, color: '#aaa', width: 42, flex: 'none' }}>{new Date(p.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                <span style={{ width: 36, height: 36, borderRadius: 9, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f6f2', border: '1px solid #f0f0f0', fontSize: 13, fontWeight: 800, color: 'var(--sign-dark)' }}>
                  {(companyName[p.company_id] || '?').slice(0, 2).toUpperCase()}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{companyName[p.company_id] || '—'}</div>
                  <div style={{ fontSize: 11, color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Pedido #{p.order_number ?? '—'} · {p.customer_name || 'sem nome'} · {p.delivery_type === 'retirada' ? 'retirada' : 'entrega'} · {p.payment_method || '—'}
                  </div>
                </span>
                <span style={{ flex: 'none', textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: 13.5 }}>{fmtMoney(Number(p.total || 0))}</div>
                  <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.3, padding: '3px 8px', borderRadius: 20, color: STATUS_COLOR[p.status], background: p.status === 'entregue' ? '#e4f3ec' : p.status === 'cancelado' ? '#fbeaea' : p.status === 'recebido' ? '#fef3e0' : '#e8f0fe' }}>
                    {STATUS_LABEL[p.status]}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="sv-stack">
          <div style={s.card}>
            <div style={s.cardHd}>
              <span style={s.cardTitle}>Ranking por loja</span>
              <span style={s.cardHint}>{period === 'today' ? 'hoje' : period === 'all' ? 'tudo' : period === '7d' ? '7 dias' : '30 dias'}</span>
            </div>
            <div>
              {ranking.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#aaa', fontSize: 13 }}>Sem vendas no período.</div>}
              {ranking.map((r, i) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', borderBottom: '1px solid #f5f5f5' }}>
                  <span style={{ fontWeight: 800, fontSize: 14, color: i === 0 ? 'var(--sign-dark)' : '#ccc', width: 18, flex: 'none' }}>{i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                    <div style={{ height: 4, background: '#f0f0f0', borderRadius: 3, marginTop: 6, overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: 'var(--sign)', borderRadius: 3, width: `${Math.round((r.total / maxRankTotal) * 100)}%` }} />
                    </div>
                  </span>
                  <span style={{ flex: 'none', textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: 13 }}>{fmtMoney(r.total)}</div>
                    <div style={{ fontSize: 10.5, color: '#aaa' }}>{r.count} pedido{r.count !== 1 ? 's' : ''}</div>
                  </span>
                </div>
              ))}
            </div>
            {lojasSemVenda.length > 0 && (
              <div style={{ padding: '10px 18px 14px', fontSize: 11, color: '#aaa', borderTop: '1px solid #f5f5f5' }}>
                {lojasSemVenda.map(l => l.name).join(', ')} não vendeu {period === 'today' ? 'hoje' : period === 'all' ? 'ainda' : 'no período'}.
              </div>
            )}
          </div>

          <div style={s.card}>
            <div style={s.cardHd}>
              <span style={s.cardTitle}>Mix de pagamento e entrega</span>
              <span style={s.cardHint}>{numPedidos} pedido{numPedidos !== 1 ? 's' : ''}</span>
            </div>
            {totalMix === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#aaa', fontSize: 13 }}>Sem dado no período.</div>
            ) : (
            <>
              <div style={{ padding: '14px 18px 16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#aaa', marginBottom: 9 }}>Forma de pagamento</div>
                <div className="sv-mix-bar">
                  <span style={{ width: `${(mixPagamento.cartao / totalMix) * 100}%`, background: 'var(--sign)' }} />
                  <span style={{ width: `${(mixPagamento.dinheiro / totalMix) * 100}%`, background: 'var(--sign-dark)' }} />
                  <span style={{ width: `${(mixPagamento.pix / totalMix) * 100}%`, background: '#e8e8e8' }} />
                </div>
                <div className="sv-mix-legend">
                  <span>🟨 Cartão <b style={{ color: '#111' }}>{mixPagamento.cartao}</b></span>
                  <span>🟧 Dinheiro <b style={{ color: '#111' }}>{mixPagamento.dinheiro}</b></span>
                  <span>⬜ Pix <b style={{ color: '#111' }}>{mixPagamento.pix}</b></span>
                </div>
              </div>
              <div style={{ padding: '14px 18px 16px', borderTop: '1px solid #f5f5f5' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#aaa', marginBottom: 9 }}>Entrega ou retirada</div>
                <div className="sv-mix-bar">
                  <span style={{ width: totalMixEntrega > 0 ? `${(mixEntrega.entrega / totalMixEntrega) * 100}%` : '0%', background: 'var(--info)' }} />
                  <span style={{ width: totalMixEntrega > 0 ? `${(mixEntrega.retirada / totalMixEntrega) * 100}%` : '0%', background: '#e8e8e8' }} />
                </div>
                <div className="sv-mix-legend">
                  <span>🟦 Entrega <b style={{ color: '#111' }}>{mixEntrega.entrega}</b></span>
                  <span>⬜ Retirada <b style={{ color: '#111' }}>{mixEntrega.retirada}</b></span>
                </div>
              </div>
            </>
            )}
          </div>
        </div>
      </div>

      {/* RODAPÉ: gráfico + produtos + funil (exemplo) */}
      <div className="sv-bottom">
        <div style={s.card}>
          <div style={s.cardHd}>
            <span style={s.cardTitle}>Faturamento por dia</span>
            <span style={s.cardHint}>últimos 7 dias</span>
          </div>
          <div style={{ padding: '18px 18px 14px' }} ref={chartRef}>
            {weekly.every(d => d.total === 0) ? (
              <div style={{ textAlign: 'center', color: '#aaa', fontSize: 13, padding: '30px 0' }}>Sem vendas nos últimos 7 dias.</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140 }}>
                {weekly.map(d => (
                  <div key={d.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                    {d.total > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, color: d.isToday ? '#111' : '#888' }}>{Math.round(d.total)}</span>}
                    <div style={{ width: '100%', maxWidth: 44, height: `${Math.max((d.total / maxWeekly) * 100, d.total > 0 ? 4 : 1)}%`, background: d.isToday ? 'var(--sign-dark)' : 'var(--sign)', borderRadius: '4px 4px 0 0', minHeight: 2 }} />
                    <span style={{ fontSize: 10, color: d.isToday ? '#111' : '#aaa', fontWeight: d.isToday ? 800 : 400 }}>{d.isToday ? 'hoje' : d.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={s.card}>
          <div style={s.cardHd}>
            <span style={s.cardTitle}>Produtos mais vendidos</span>
            <span style={s.cardHint}>30 dias</span>
          </div>
          <div>
            {topProducts.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#aaa', fontSize: 13 }}>Sem vendas nos últimos 30 dias.</div>}
            {topProducts.map((p, i) => (
              <div key={p.store + p.name} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 18px', borderBottom: '1px solid #f5f5f5' }}>
                <span style={{ fontWeight: 800, fontSize: 14, color: i === 0 ? 'var(--sign-dark)' : '#ccc', width: 16, flex: 'none' }}>{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  <div style={{ fontSize: 10.5, color: '#aaa' }}>{p.store}</div>
                </span>
                <span style={{ flex: 'none', textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>{p.qty} un</div>
                  <div style={{ fontSize: 10, color: '#aaa' }}>{p.orders} pedido{p.orders !== 1 ? 's' : ''}</div>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={s.card}>
          <div style={s.cardHd}>
            <span style={s.cardTitle}>
              Carrinho → Pedido
              <span style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--sign-dark)', background: '#f5f6f2', border: '1px dashed #ddd', padding: '2px 7px', borderRadius: 6, marginLeft: 8 }}>em breve</span>
            </span>
          </div>
          <div style={{ padding: '18px', fontSize: 12, color: '#888', lineHeight: 1.6 }}>
            Ainda não existe rastreio de carrinho abandonado — o cardápio só grava o pedido quando o cliente confirma. Pra medir isso de verdade, precisa salvar o carrinho como rascunho assim que a pessoa começa a montar.
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  )
}
