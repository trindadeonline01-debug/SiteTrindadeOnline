'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import PeriodFilterBar from '@/components/admin/PeriodFilterBar'
import { PeriodSel, periodRange, periodLabel, previousPeriodRange } from '@/lib/periodFilter'
import { matchBairroInAddress } from '@/lib/bairrosSaoGoncalo'

type Status = 'recebido' | 'em_preparo' | 'pronto' | 'saiu_entrega' | 'entregue' | 'cancelado'
type Pedido = {
  id: string; status: Status; origin: string; payment_method: string | null; payment_status: string
  delivery_type: 'entrega' | 'retirada' | 'balcao'; total: number; created_at: string; delivery_address: string | null
}
type ItemRow = { pedido_id: string; product_name: string; unit_price: number; qty: number }
type Agg = { key: string; label: string; value: number; pct: number }
type Delta = { label: string; good: boolean } | null

const ORIGIN_LABEL: Record<string, string> = { cardapio_publico: '🌐 Site', conversa: '💬 WhatsApp', balcao: '🏪 Balcão' }
const PAY_LABEL: Record<string, string> = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão' }
const DOW_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MES_LABEL = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const CHART_COLORS = ['#A87200', '#157A52', '#1A56B0', '#C43D3D', '#8A6410', '#6E6656', '#B5690C', '#4C8FA8']

function fmt(n: number) { return 'R$ ' + n.toFixed(2).replace('.', ',') }

// "cartao_credito"/"cartao_debito" (formas reais salvas no checkout — ver
// PAY_LABEL em CardapioClient.tsx) viram 1 categoria só, "cartao" — senão
// fragmenta o que devia ser uma fatia só (bug real achado em Sala de Vendas).
function paymentGroup(method: string | null): string {
  const m = method || '—'
  return m.startsWith('cartao') ? 'cartao' : m
}

// Bairro só existe pra quem pediu entrega (retirada/balcão não têm endereço).
// matchBairroInAddress já é usado em produção pra entrega — aqui é o mesmo
// reconhecimento, só que sobre o endereço do pedido em vez da corrida do
// motoboy. Endereço digitado à mão (fora do fluxo de CEP) pode não bater
// com nenhum bairro — null nesse caso, nunca inventa um bairro.
function bairroOf(p: Pedido): string | null {
  if (p.delivery_type !== 'entrega' || !p.delivery_address) return null
  return matchBairroInAddress(p.delivery_address)
}

function sumByRevenue(rows: Pedido[], fn: (p: Pedido) => string, labelMap: Record<string, string>): Agg[] {
  const m = new Map<string, number>()
  rows.forEach(p => { const k = fn(p); m.set(k, (m.get(k) || 0) + Number(p.total)) })
  const total = Array.from(m.values()).reduce((s, v) => s + v, 0)
  return Array.from(m.entries())
    .map(([key, value]) => ({ key, label: labelMap[key] || key, value, pct: total ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value)
}

function pctDelta(curr: number, prev: number): Delta {
  if (prev === 0) return null // sem base pra comparar — melhor não mostrar do que mostrar % infinito/inventado
  const pct = ((curr - prev) / prev) * 100
  if (Math.abs(pct) < 0.5) return null
  return { label: `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}%`, good: pct >= 0 }
}
function ppDelta(curr: number, prev: number, lowerIsBetter: boolean): Delta {
  const diff = curr - prev
  if (Math.abs(diff) < 0.5) return null
  return { label: `${diff >= 0 ? '▲' : '▼'} ${Math.abs(diff).toFixed(1).replace('.', ',')}pp`, good: lowerIsBetter ? diff < 0 : diff >= 0 }
}

// "Valor em cada pico" (pedido do Ricardo) com dado real e variável — em vez
// de rotular TODO ponto (ilegível com 30+ dias num gráfico de mês), rotula
// todos quando são poucos (≤14) e só os picos locais quando são muitos.
function pickLabelIndices(values: number[], maxLabels = 14): Set<number> {
  const n = values.length
  if (n === 0) return new Set()
  if (n <= maxLabels) return new Set(values.map((_, i) => i).filter(i => values[i] > 0))
  const peaks: number[] = []
  for (let i = 0; i < n; i++) {
    const prev = i > 0 ? values[i - 1] : -Infinity
    const next = i < n - 1 ? values[i + 1] : -Infinity
    if (values[i] > 0 && values[i] >= prev && values[i] >= next) peaks.push(i)
  }
  return new Set([...peaks].sort((a, b) => values[b] - values[a]).slice(0, maxLabels))
}

function valueLabelPlugin(formatter: (v: number) => string, labelIndices: Set<number>) {
  return {
    id: 'valueLabels',
    afterDatasetsDraw(chart: any) {
      const { ctx } = chart
      chart.data.datasets.forEach((ds: any, dsIndex: number) => {
        const meta = chart.getDatasetMeta(dsIndex)
        meta.data.forEach((el: any, i: number) => {
          if (!labelIndices.has(i)) return
          const val = ds.data[i]
          if (val == null) return
          const { x, y } = el.getProps(['x', 'y'], true)
          ctx.save()
          ctx.font = '700 10px Archivo, sans-serif'
          ctx.fillStyle = '#6E6656'
          ctx.textAlign = 'center'
          ctx.fillText(formatter(val), x, y - 8)
          ctx.restore()
        })
      })
    },
  }
}

function KpiTile({ icon, label, value, delta, alertVal }: { icon: string; label: string; value: string; delta: Delta; alertVal?: boolean }) {
  return (
    <div className="rp-kpi">
      <div className="rp-kpi-top">
        <span className="rp-kpi-ico">{icon}</span>
        {delta && <span className={`rp-kpi-delta ${delta.good ? 'up' : 'down'}`}>{delta.label}</span>}
      </div>
      <div className="rp-kpi-lbl">{label}</div>
      <div className={`rp-kpi-val ${alertVal ? 'alert' : ''}`}>{value}</div>
    </div>
  )
}

function DonutCard({ title, canvasRef, agg }: { title: string; canvasRef: React.RefObject<HTMLCanvasElement | null>; agg: Agg[] }) {
  return (
    <div className="rp-card">
      <div className="rp-card-title">{title}</div>
      <div className="rp-donut-row">
        <div className="rp-chart-box small" style={{ flex: '0 0 140px' }}><canvas ref={canvasRef} /></div>
        <div className="rp-legend">
          <div className="rp-legend-hd"><span className="rp-ln" /><span className="rp-lp">%</span><span className="rp-lv">R$</span></div>
          {agg.map((r, i) => (
            <div className="rp-legend-row" key={r.key}>
              <i style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
              <span className="rp-ln">{r.label}</span>
              <span className="rp-lp">{r.pct.toFixed(0)}%</span>
              <span className="rp-lv">{fmt(r.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function BairroRow({ rank, r, max }: { rank: number; r: Agg; max: number }) {
  return (
    <div className="rp-bairro-row">
      <div className="rp-bairro-n">{rank}</div>
      <div className="rp-bairro-name">{r.label}</div>
      <div className="rp-bairro-barwrap"><div className="rp-bairro-bar" style={{ width: `${max ? (r.value / max) * 100 : 0}%` }} /></div>
      <div className="rp-bairro-val">{fmt(r.value)}</div>
    </div>
  )
}

// Dashboard de vendas de verdade (pedidos, faturamento, canal, bairro) —
// só faz sentido pra quem tem o cardápio digital ligado (loja_pedidos só
// existe nesse fluxo); quem chama este componente já checa
// company.loja_digital_enabled antes de montar ele.
export default function VendasDashboard({ company }: { company: { id: string } }) {
  const [period, setPeriod] = useState<PeriodSel>({ kind: 'week' })
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [pedidosPrev, setPedidosPrev] = useState<{ id: string; status: Status; total: number; created_at: string }[]>([])
  const [itens, setItens] = useState<ItemRow[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [channelFilter, setChannelFilter] = useState<string>('all')
  const [paymentFilter, setPaymentFilter] = useState<string>('all')
  const [bairroFilter, setBairroFilter] = useState<string>('all')
  const [showAllBairros, setShowAllBairros] = useState(false)

  const revRef = useRef<HTMLCanvasElement>(null)
  const hourRef = useRef<HTMLCanvasElement>(null)
  const dowRef = useRef<HTMLCanvasElement>(null)
  const originRef = useRef<HTMLCanvasElement>(null)
  const payRef = useRef<HTMLCanvasElement>(null)
  const charts = useRef<Record<string, any>>({})

  useEffect(() => {
    if (!company?.id) return
    setLoadingData(true)
    const { from, to } = periodRange(period)
    let q = supabase.from('loja_pedidos')
      .select('id,status,origin,payment_method,payment_status,delivery_type,total,created_at,delivery_address')
      .eq('company_id', company.id)
    if (from) q = q.gte('created_at', from)
    if (to) q = q.lt('created_at', to)

    const prevRange = previousPeriodRange(period)
    const prevQuery = prevRange
      ? supabase.from('loja_pedidos').select('id,status,total,created_at').eq('company_id', company.id).gte('created_at', prevRange.from).lt('created_at', prevRange.to)
      : Promise.resolve({ data: [] as any[] })

    Promise.all([q.order('created_at', { ascending: true }), prevQuery]).then(async ([{ data }, prevRes]) => {
      const rows = (data || []) as Pedido[]
      setPedidos(rows)
      setPedidosPrev(((prevRes as any).data || []) as { id: string; status: Status; total: number; created_at: string }[])
      setChannelFilter('all'); setPaymentFilter('all'); setBairroFilter('all')
      const ids = rows.filter(p => p.status !== 'cancelado').map(p => p.id)
      if (ids.length > 0) {
        const { data: itensData } = await supabase.from('loja_pedido_itens').select('pedido_id,product_name,unit_price,qty').in('pedido_id', ids)
        setItens((itensData || []) as ItemRow[])
      } else setItens([])
      setLoadingData(false)
    })
  }, [company?.id, period])

  function matchesFilters(p: Pedido): boolean {
    if (channelFilter !== 'all' && p.origin !== channelFilter) return false
    if (paymentFilter !== 'all' && paymentGroup(p.payment_method) !== paymentFilter) return false
    if (bairroFilter !== 'all' && bairroOf(p) !== bairroFilter) return false
    return true
  }

  const pedidosFiltered = pedidos.filter(matchesFilters)
  const validos = pedidosFiltered.filter(p => p.status !== 'cancelado')
  const validosIds = new Set(validos.map(p => p.id))
  const itensFiltered = itens.filter(it => validosIds.has(it.pedido_id))

  const faturamento = validos.reduce((s, p) => s + Number(p.total), 0)
  const ticketMedio = validos.length ? faturamento / validos.length : 0
  const canceladosCount = pedidosFiltered.length - validos.length
  const taxaCancelamento = pedidosFiltered.length ? (canceladosCount / pedidosFiltered.length) * 100 : 0
  const pendenteRecebimento = validos.filter(p => p.payment_status !== 'pago').reduce((s, p) => s + Number(p.total), 0)

  const channelOptions = Array.from(new Set(pedidos.map(p => p.origin))).filter(Boolean).sort()
  const paymentOptions = Array.from(new Set(pedidos.map(p => paymentGroup(p.payment_method))))
  const bairroOptions = Array.from(new Set(pedidos.map(bairroOf).filter((b): b is string => !!b))).sort()

  const validosPrev = pedidosPrev.filter(p => p.status !== 'cancelado')
  const faturamentoPrev = validosPrev.reduce((s, p) => s + Number(p.total), 0)
  const ticketMedioPrev = validosPrev.length ? faturamentoPrev / validosPrev.length : 0
  const taxaCancelamentoPrev = pedidosPrev.length ? ((pedidosPrev.length - validosPrev.length) / pedidosPrev.length) * 100 : 0
  const hasPrev = previousPeriodRange(period) != null
  const deltaFat = hasPrev ? pctDelta(faturamento, faturamentoPrev) : null
  const deltaPedidos = hasPrev ? pctDelta(validos.length, validosPrev.length) : null
  const deltaTicket = hasPrev ? pctDelta(ticketMedio, ticketMedioPrev) : null
  const deltaCancel = hasPrev ? ppDelta(taxaCancelamento, taxaCancelamentoPrev, true) : null

  function revenueBuckets(): { label: string; value: number }[] {
    if (period.kind === 'today' || period.kind === 'yesterday') {
      const b = Array.from({ length: 24 }, (_, h) => ({ label: `${h}h`, value: 0 }))
      validos.forEach(p => { b[new Date(p.created_at).getHours()].value += Number(p.total) })
      return b
    }
    if (period.kind === 'year') {
      const b = Array.from({ length: 12 }, (_, m) => ({ label: MES_LABEL[m], value: 0 }))
      validos.forEach(p => { b[new Date(p.created_at).getMonth()].value += Number(p.total) })
      return b
    }
    const map = new Map<string, number>()
    validos.forEach(p => {
      const key = new Date(p.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      map.set(key, (map.get(key) || 0) + Number(p.total))
    })
    return Array.from(map.entries()).map(([label, value]) => ({ label, value }))
  }

  function hourBuckets(): number[] {
    const b = Array.from({ length: 24 }, () => 0)
    validos.forEach(p => { b[new Date(p.created_at).getHours()]++ })
    return b
  }

  function dowBuckets(): number[] {
    const b = Array.from({ length: 7 }, () => 0)
    validos.forEach(p => { b[new Date(p.created_at).getDay()]++ })
    return b
  }

  const topProdutos = (() => {
    const m = new Map<string, { qty: number; revenue: number }>()
    itensFiltered.forEach(it => {
      const cur = m.get(it.product_name) || { qty: 0, revenue: 0 }
      cur.qty += it.qty; cur.revenue += Number(it.unit_price) * it.qty
      m.set(it.product_name, cur)
    })
    return Array.from(m.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.qty - a.qty).slice(0, 10)
  })()

  // Bairro só faz sentido pra quem pediu entrega. pct já é calculado sobre o
  // total REAL (entrega com bairro identificado + sem identificar) — nunca
  // sobre só os identificados, senão a % mostrada seria otimista demais.
  const entregaRows = validos.filter(p => p.delivery_type === 'entrega')
  const bairroAggAll = sumByRevenue(entregaRows, p => bairroOf(p) ?? '__sem_bairro__', {})
  const bairroRows = bairroAggAll.filter(r => r.key !== '__sem_bairro__')
  const bairroSemIdentificar = bairroAggAll.find(r => r.key === '__sem_bairro__')

  const channelAgg = sumByRevenue(validos, p => p.origin, ORIGIN_LABEL)
  const paymentAgg = sumByRevenue(validos, p => paymentGroup(p.payment_method), PAY_LABEL)

  useEffect(() => {
    if (loadingData) return
    import('chart.js/auto').then(({ default: Chart }) => {
      Object.values(charts.current).forEach((c: any) => c?.destroy())
      charts.current = {}

      const rev = revenueBuckets()
      const revValues = rev.map(b => b.value)
      const revLabelIdx = pickLabelIndices(revValues)
      if (revRef.current) {
        const isBar = period.kind === 'today' || period.kind === 'yesterday' || period.kind === 'year'
        charts.current.rev = new Chart(revRef.current, {
          type: isBar ? 'bar' : 'line',
          data: { labels: rev.map(b => b.label), datasets: [{ label: 'Faturamento', data: revValues, borderColor: '#A87200', backgroundColor: isBar ? '#A87200' : 'rgba(168,114,0,.1)', borderWidth: 2.5, pointRadius: 3, tension: 0.35, fill: true, borderRadius: 4 }] },
          plugins: [valueLabelPlugin(v => Math.round(v).toLocaleString('pt-BR'), revLabelIdx)],
          options: {
            responsive: true, maintainAspectRatio: false, layout: { padding: { top: 16 } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: any) => fmt(ctx.parsed.y) } } },
            scales: { x: { grid: { display: false }, ticks: { font: { size: 10.5 }, color: '#A79E8B', maxRotation: 0 } }, y: { grid: { color: '#F0EDE8' }, ticks: { font: { size: 10.5 }, color: '#A79E8B', callback: (v: any) => 'R$' + v } } },
          },
        } as any)
      }
      const hours = hourBuckets()
      if (hourRef.current) {
        charts.current.hour = new Chart(hourRef.current, {
          type: 'bar',
          data: { labels: hours.map((_, h) => `${h}h`), datasets: [{ data: hours, backgroundColor: '#8A6410', borderRadius: 4 }] },
          plugins: [valueLabelPlugin(v => String(v), pickLabelIndices(hours))],
          options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 16 } }, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 9.5 }, color: '#A79E8B', maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } }, y: { grid: { color: '#F0EDE8' }, ticks: { font: { size: 10.5 }, color: '#A79E8B', precision: 0 } } } },
        } as any)
      }
      const dow = dowBuckets()
      if (dowRef.current) {
        charts.current.dow = new Chart(dowRef.current, {
          type: 'bar',
          data: { labels: DOW_LABEL, datasets: [{ data: dow, backgroundColor: '#157A52', borderRadius: 4 }] },
          plugins: [valueLabelPlugin(v => String(v), pickLabelIndices(dow))],
          options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 16 } }, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#A79E8B' } }, y: { grid: { color: '#F0EDE8' }, ticks: { font: { size: 10.5 }, color: '#A79E8B', precision: 0 } } } },
        } as any)
      }
      if (originRef.current) {
        charts.current.origin = new Chart(originRef.current, {
          type: 'doughnut',
          data: { labels: channelAgg.map(o => o.label), datasets: [{ data: channelAgg.map(o => o.value), backgroundColor: CHART_COLORS, borderWidth: 0 }] },
          options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: any) => fmt(ctx.parsed) } } } },
        })
      }
      if (payRef.current) {
        charts.current.pay = new Chart(payRef.current, {
          type: 'doughnut',
          data: { labels: paymentAgg.map(o => o.label), datasets: [{ data: paymentAgg.map(o => o.value), backgroundColor: CHART_COLORS, borderWidth: 0 }] },
          options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: any) => fmt(ctx.parsed) } } } },
        })
      }
    })
    return () => { Object.values(charts.current).forEach((c: any) => c?.destroy()); charts.current = {} }
  }, [loadingData, period, channelFilter, paymentFilter, bairroFilter])

  return (
    <div className="rp-wrap">
      <style>{`
        .rp-wrap{ margin-bottom:24px; }
        .rp-filters-row{ display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px; }
        .rp-fselect{ font-size:12px;font-weight:700;color:#444;background:#fff;border:1.5px solid #e0e0e0;border-radius:10px;padding:8px 10px;cursor:pointer; }
        .rp-fselect.on{ color:var(--sign-dark);border-color:var(--sign-dark);background:#FDF6E8; }
        .rp-filters-note{ font-size:10px;color:var(--muted);font-weight:600;margin-bottom:18px; }
        .rp-kpis{ display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:20px; }
        @media(min-width:768px){ .rp-kpis{ grid-template-columns:repeat(4,1fr); } }
        .rp-kpi{ background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px; }
        .rp-kpi-top{ display:flex;align-items:center;justify-content:space-between;margin-bottom:8px; }
        .rp-kpi-ico{ font-size:14px; }
        .rp-kpi-delta{ font-size:10px;font-weight:800;padding:2px 7px;border-radius:9px; }
        .rp-kpi-delta.up{ color:var(--open);background:#E4F3EC; }
        .rp-kpi-delta.down{ color:var(--alert);background:#FBEAEA; }
        .rp-kpi-lbl{ font-size:10.5px;font-weight:700;color:var(--muted);letter-spacing:.04em;text-transform:uppercase;margin-bottom:6px; }
        .rp-kpi-val{ font-family:'Anton',sans-serif;font-size:24px;color:var(--ink); }
        .rp-kpi-val.alert{ color:var(--alert); }
        /* min-width:0 nas colunas do grid é essencial — por padrão um item de
           grid não encolhe abaixo do min-content do que tem dentro (o canvas
           do Chart.js, a legenda da pizza), então a coluna da direita empurra
           a página inteira pra fora da tela em vez de encolher (achado real
           do Ricardo, out/2026: gráficos "vazando" pra direita). */
        .rp-grid2{ display:grid;grid-template-columns:1fr;gap:14px;margin-bottom:14px;min-width:0; }
        @media(min-width:900px){ .rp-grid2{ grid-template-columns:2fr 1fr; } }
        .rp-grid3{ display:grid;grid-template-columns:1fr;gap:14px;margin-bottom:14px;min-width:0; }
        @media(min-width:900px){ .rp-grid3{ grid-template-columns:1fr 1fr 1fr; } }
        .rp-card{ background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px;min-width:0;box-sizing:border-box; }
        .rp-card-title{ font-size:11.5px;font-weight:800;color:var(--muted);letter-spacing:.04em;text-transform:uppercase;margin-bottom:14px; }
        .rp-card-title-sub{ text-transform:none;font-weight:600;letter-spacing:0;color:#A79E8B; }
        .rp-chart-box{ height:220px;position:relative;width:100%;min-width:0; }
        .rp-chart-box canvas{ max-width:100%; }
        .rp-chart-box.small{ height:160px; }
        .rp-empty{ text-align:center;color:var(--muted);font-size:12.5px;padding:40px 0; }
        .rp-table{ width:100%;border-collapse:collapse;font-size:12.5px; }
        .rp-table th{ text-align:left;font-size:10.5px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;padding:0 8px 8px;border-bottom:1px solid var(--line); }
        .rp-table td{ padding:9px 8px;border-bottom:1px solid #F5F2EC; }
        .rp-table tr:last-child td{ border-bottom:none; }
        .rp-rank{ display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:var(--concrete-2);font-size:10.5px;font-weight:800;color:var(--muted);margin-right:6px; }

        .rp-donut-row{ display:flex;align-items:center;gap:14px;flex-wrap:wrap;min-width:0; }
        .rp-legend{ flex:1 1 150px;min-width:0;display:flex;flex-direction:column;gap:4px; }
        .rp-legend-hd{ display:flex;font-size:9px;font-weight:800;color:#A79E8B;text-transform:uppercase;margin-bottom:2px; }
        .rp-legend-hd .lp, .rp-legend-row .lp{ width:36px;text-align:right; }
        .rp-legend-hd .lv, .rp-legend-row .lv{ width:70px;text-align:right; }
        .rp-legend-row{ display:flex;align-items:center;gap:6px;font-size:11.5px;padding:2px 0; }
        .rp-legend-row i{ width:9px;height:9px;border-radius:3px;flex-shrink:0; }
        .rp-ln{ flex:1; }
        .rp-legend-row .lp{ font-weight:800; }
        .rp-legend-row .lv{ font-weight:700;color:var(--open);font-size:11px; }

        .rp-bairro-row{ display:flex;align-items:center;gap:10px;padding:7px 0; }
        .rp-bairro-n{ width:19px;height:19px;border-radius:6px;background:var(--concrete-2);color:var(--sign-dark);font-weight:800;font-size:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0; }
        .rp-bairro-name{ width:110px;flex-shrink:0;font-weight:700;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
        .rp-bairro-barwrap{ flex:1;height:7px;background:var(--concrete-2);border-radius:4px;overflow:hidden; }
        .rp-bairro-bar{ height:100%;background:linear-gradient(90deg,var(--sign),var(--sign-dark)); }
        .rp-bairro-val{ width:76px;text-align:right;font-weight:800;color:var(--open);font-size:11.5px; }
        .rp-see-all{ width:100%;margin-top:8px;padding:8px;text-align:center;border-radius:9px;background:var(--concrete-2);color:var(--sign-dark);font-size:11px;font-weight:800;border:none;cursor:pointer; }
        .rp-note{ font-size:10.5px;color:var(--muted);margin-top:10px; }

        .rp-scrim{ position:fixed;inset:0;background:rgba(10,8,6,.55);display:flex;align-items:center;justify-content:center;z-index:200;padding:20px; }
        .rp-modal{ width:100%;max-width:440px;max-height:80vh;overflow:auto;background:#fff;border-radius:16px;padding:20px 22px; }
        .rp-modal-hd{ display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;font-size:14px;font-weight:800; }
        .rp-modal-hd button{ border:none;background:none;font-size:16px;color:#A79E8B;cursor:pointer; }
        .rp-modal-sub{ font-size:10.5px;color:var(--muted);margin-bottom:12px; }
      `}</style>

      <div style={{ marginBottom: 12 }}>
        <PeriodFilterBar value={period} onChange={setPeriod} />
      </div>

      <div className="rp-filters-row">
        <select className={`rp-fselect ${channelFilter !== 'all' ? 'on' : ''}`} value={channelFilter} onChange={e => setChannelFilter(e.target.value)}>
          <option value="all">🧾 Canal: Todos</option>
          {channelOptions.map(o => <option key={o} value={o}>{ORIGIN_LABEL[o] || o}</option>)}
        </select>
        <select className={`rp-fselect ${paymentFilter !== 'all' ? 'on' : ''}`} value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}>
          <option value="all">💳 Pagamento: Todos</option>
          {paymentOptions.map(o => <option key={o} value={o}>{PAY_LABEL[o] || o}</option>)}
        </select>
        <select className={`rp-fselect ${bairroFilter !== 'all' ? 'on' : ''}`} value={bairroFilter} onChange={e => setBairroFilter(e.target.value)}>
          <option value="all">📍 Bairro: Todos</option>
          {bairroOptions.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <div className="rp-filters-note">↳ tudo abaixo responde a esses filtros, além do período</div>

      {loadingData ? (
        <div className="rp-empty">Carregando vendas...</div>
      ) : pedidosFiltered.length === 0 ? (
        <div className="rp-empty">Nenhum pedido em {periodLabel(period)} com esses filtros.</div>
      ) : (
        <>
          <div className="rp-kpis">
            <KpiTile icon="💰" label="Faturamento" value={fmt(faturamento)} delta={deltaFat} />
            <KpiTile icon="🧾" label="Pedidos" value={String(validos.length)} delta={deltaPedidos} />
            <KpiTile icon="🎫" label="Ticket médio" value={fmt(ticketMedio)} delta={deltaTicket} />
            <KpiTile icon="⚠️" label="Cancelamento" value={`${taxaCancelamento.toFixed(0)}%`} delta={deltaCancel} alertVal={taxaCancelamento > 10} />
          </div>

          {pendenteRecebimento > 0 && (
            <div className="rp-card" style={{ marginBottom: 14, borderLeft: '3px solid #B5690C' }}>
              <div className="rp-kpi-lbl">💰 Ainda não recebido no período</div>
              <div className="rp-kpi-val" style={{ color: '#B5690C' }}>{fmt(pendenteRecebimento)}</div>
            </div>
          )}

          <div className="rp-grid2">
            <div className="rp-card">
              <div className="rp-card-title">Faturamento no período</div>
              <div className="rp-chart-box"><canvas ref={revRef} /></div>
            </div>
            <DonutCard title="Canal" canvasRef={originRef} agg={channelAgg} />
          </div>

          <div className="rp-grid3">
            <div className="rp-card">
              <div className="rp-card-title">Pedidos por horário</div>
              <div className="rp-chart-box small"><canvas ref={hourRef} /></div>
            </div>
            <div className="rp-card">
              <div className="rp-card-title">Por dia da semana</div>
              <div className="rp-chart-box small"><canvas ref={dowRef} /></div>
            </div>
            <DonutCard title="Forma de pagamento" canvasRef={payRef} agg={paymentAgg} />
          </div>

          <div className="rp-grid2">
            <div className="rp-card">
              <div className="rp-card-title">Produtos mais vendidos</div>
              {topProdutos.length === 0 ? <div className="rp-empty">Sem itens registrados nesse período.</div> : (
                <table className="rp-table">
                  <thead><tr><th>Produto</th><th style={{ textAlign: 'right' }}>Qtd</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
                  <tbody>
                    {topProdutos.map((p, i) => (
                      <tr key={p.name}>
                        <td><span className="rp-rank">{i + 1}</span>{p.name}</td>
                        <td style={{ textAlign: 'right' }}>{p.qty}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="rp-card">
              <div className="rp-card-title">📍 Vendas por bairro <span className="rp-card-title-sub">· top 5</span></div>
              {bairroRows.length === 0 ? (
                <div className="rp-empty">Sem pedidos de entrega com bairro identificado nesse período.</div>
              ) : (
                <>
                  {bairroRows.slice(0, 5).map((r, i) => <BairroRow key={r.key} rank={i + 1} r={r} max={bairroRows[0].value} />)}
                  {bairroRows.length > 5 && <button className="rp-see-all" onClick={() => setShowAllBairros(true)}>Ver todos os bairros →</button>}
                </>
              )}
              {bairroSemIdentificar && bairroSemIdentificar.value > 0 && (
                <div className="rp-note">+ {fmt(bairroSemIdentificar.value)} em pedidos de entrega sem bairro identificável no endereço</div>
              )}
            </div>
          </div>

          <a href="/painel/relatorios/whatsapp" style={{ display: 'block', textAlign: 'center', padding: '13px 16px', borderRadius: 12, background: 'linear-gradient(135deg,#0F8A57,#0B6B43)', color: '#fff', fontWeight: 800, fontSize: 13, textDecoration: 'none' }}>
            💬 Ver conversão de WhatsApp →
          </a>
        </>
      )}

      {showAllBairros && (
        <div className="rp-scrim" onClick={() => setShowAllBairros(false)}>
          <div className="rp-modal" onClick={e => e.stopPropagation()}>
            <div className="rp-modal-hd"><span>📍 Vendas por bairro</span><button onClick={() => setShowAllBairros(false)} aria-label="Fechar">✕</button></div>
            <div className="rp-modal-sub">{periodLabel(period)} · todos os bairros com venda</div>
            {bairroRows.map((r, i) => <BairroRow key={r.key} rank={i + 1} r={r} max={bairroRows[0].value} />)}
          </div>
        </div>
      )}
    </div>
  )
}
