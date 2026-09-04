'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { moduleActive } from '@/lib/modules'
import EmpresaShell from '@/components/EmpresaShell'

type Status = 'recebido' | 'em_preparo' | 'pronto' | 'saiu_entrega' | 'entregue' | 'cancelado'
type Pedido = {
  id: string; status: Status; origin: string; payment_method: string | null; payment_status: string
  delivery_type: 'entrega' | 'retirada'; total: number; created_at: string
}
type ItemRow = { pedido_id: string; product_name: string; unit_price: number; qty: number }
type Period = 'today' | 'week' | 'month' | 'year'

const ORIGIN_LABEL: Record<string, string> = { cardapio_publico: '🌐 Site', conversa: '💬 WhatsApp', balcao: '🏪 Balcão' }
const PAY_LABEL: Record<string, string> = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão' }
const DOW_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MES_LABEL = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const CHART_COLORS = ['#A87200', '#157A52', '#1A56B0', '#C43D3D', '#8A6410', '#6E6656']

function fmt(n: number) { return 'R$ ' + n.toFixed(2).replace('.', ',') }

// Nascido de olhar relatório de venda de sistema de restaurante/POS (Square,
// Toast, iFood Gestor) — os mesmos 4 números e os mesmos 2 gráficos de
// horário/dia aparecem em praticamente todo painel de pedidos do mundo,
// porque são as perguntas que todo dono de negócio local faz primeiro:
// quanto vendi, quantos pedidos, hora de pico, o que mais vende.
export default function RelatoriosPage() {
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [crmEnabled, setCrmEnabled] = useState(false)
  const [entregaEnabled, setEntregaEnabled] = useState(false)
  const [period, setPeriod] = useState<Period>('week')
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [itens, setItens] = useState<ItemRow[]>([])
  const [loadingData, setLoadingData] = useState(true)

  const revRef = useRef<HTMLCanvasElement>(null)
  const hourRef = useRef<HTMLCanvasElement>(null)
  const dowRef = useRef<HTMLCanvasElement>(null)
  const originRef = useRef<HTMLCanvasElement>(null)
  const payRef = useRef<HTMLCanvasElement>(null)
  const charts = useRef<Record<string, any>>({})

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login?redirect=/painel/relatorios'; return }
      const { data: comp } = await supabase.from('companies').select('id, name, loja_digital_enabled, crm_whatsapp_enabled, entrega_enabled, trial_modules_until').eq('owner_id', session.user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (!comp || !moduleActive(comp.loja_digital_enabled, comp.trial_modules_until)) { window.location.href = '/painel/compartilhar'; return }
      setCompanyId(comp.id)
      setCompanyName(comp.name)
      setCrmEnabled(moduleActive(comp.crm_whatsapp_enabled, comp.trial_modules_until))
      setEntregaEnabled(moduleActive(comp.entrega_enabled, comp.trial_modules_until))
      setLoading(false)
    })
  }, [])

  function getRange(): { from: string; to: string } {
    const now = new Date()
    const to = now.toISOString()
    if (period === 'today') return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(), to }
    if (period === 'week') return { from: new Date(Date.now() - 7 * 86400000).toISOString(), to }
    if (period === 'month') return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to }
    return { from: new Date(now.getFullYear(), 0, 1).toISOString(), to }
  }

  useEffect(() => {
    if (!companyId) return
    setLoadingData(true)
    const { from, to } = getRange()
    supabase.from('loja_pedidos')
      .select('id,status,origin,payment_method,payment_status,delivery_type,total,created_at')
      .eq('company_id', companyId).gte('created_at', from).lte('created_at', to).order('created_at', { ascending: true })
      .then(async ({ data }) => {
        const rows = (data || []) as Pedido[]
        setPedidos(rows)
        const ids = rows.filter(p => p.status !== 'cancelado').map(p => p.id)
        if (ids.length > 0) {
          const { data: itensData } = await supabase.from('loja_pedido_itens').select('pedido_id,product_name,unit_price,qty').in('pedido_id', ids)
          setItens((itensData || []) as ItemRow[])
        } else setItens([])
        setLoadingData(false)
      })
  }, [companyId, period])

  const validos = pedidos.filter(p => p.status !== 'cancelado')
  const faturamento = validos.reduce((s, p) => s + Number(p.total), 0)
  const ticketMedio = validos.length ? faturamento / validos.length : 0
  const canceladosCount = pedidos.length - validos.length
  const taxaCancelamento = pedidos.length ? (canceladosCount / pedidos.length) * 100 : 0
  const pendenteRecebimento = validos.filter(p => p.payment_status !== 'pago').reduce((s, p) => s + Number(p.total), 0)

  function revenueBuckets(): { label: string; value: number }[] {
    if (period === 'today') {
      const b = Array.from({ length: 24 }, (_, h) => ({ label: `${h}h`, value: 0 }))
      validos.forEach(p => { b[new Date(p.created_at).getHours()].value += Number(p.total) })
      return b
    }
    if (period === 'year') {
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

  function countBy(fn: (p: Pedido) => string, labelMap: Record<string, string>): { label: string; value: number }[] {
    const m = new Map<string, number>()
    validos.forEach(p => { const k = fn(p); m.set(k, (m.get(k) || 0) + 1) })
    return Array.from(m.entries()).map(([k, value]) => ({ label: labelMap[k] || k, value }))
  }

  const topProdutos = (() => {
    const m = new Map<string, { qty: number; revenue: number }>()
    itens.forEach(it => {
      const cur = m.get(it.product_name) || { qty: 0, revenue: 0 }
      cur.qty += it.qty; cur.revenue += Number(it.unit_price) * it.qty
      m.set(it.product_name, cur)
    })
    return Array.from(m.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.qty - a.qty).slice(0, 10)
  })()

  useEffect(() => {
    if (loadingData) return
    import('chart.js/auto').then(({ default: Chart }) => {
      Object.values(charts.current).forEach((c: any) => c?.destroy())
      charts.current = {}

      const rev = revenueBuckets()
      if (revRef.current) {
        charts.current.rev = new Chart(revRef.current, {
          type: period === 'today' || period === 'year' ? 'bar' : 'line',
          data: { labels: rev.map(b => b.label), datasets: [{ label: 'Faturamento', data: rev.map(b => b.value), borderColor: '#A87200', backgroundColor: period === 'today' || period === 'year' ? '#A87200' : 'rgba(168,114,0,.1)', borderWidth: 2.5, pointRadius: 3, tension: 0.35, fill: true, borderRadius: 4 }] },
          options: {
            responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: any) => fmt(ctx.parsed.y) } } },
            scales: { x: { grid: { display: false }, ticks: { font: { size: 10.5 }, color: '#A79E8B', maxRotation: 0 } }, y: { grid: { color: '#F0EDE8' }, ticks: { font: { size: 10.5 }, color: '#A79E8B', callback: (v: any) => 'R$' + v } } },
          },
        })
      }
      const hours = hourBuckets()
      if (hourRef.current) {
        charts.current.hour = new Chart(hourRef.current, {
          type: 'bar',
          data: { labels: hours.map((_, h) => `${h}h`), datasets: [{ data: hours, backgroundColor: '#8A6410', borderRadius: 4 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 9.5 }, color: '#A79E8B', maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } }, y: { grid: { color: '#F0EDE8' }, ticks: { font: { size: 10.5 }, color: '#A79E8B', precision: 0 } } } },
        })
      }
      const dow = dowBuckets()
      if (dowRef.current) {
        charts.current.dow = new Chart(dowRef.current, {
          type: 'bar',
          data: { labels: DOW_LABEL, datasets: [{ data: dow, backgroundColor: '#157A52', borderRadius: 4 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#A79E8B' } }, y: { grid: { color: '#F0EDE8' }, ticks: { font: { size: 10.5 }, color: '#A79E8B', precision: 0 } } } },
        })
      }
      const origin = countBy(p => p.origin, ORIGIN_LABEL)
      if (originRef.current) {
        charts.current.origin = new Chart(originRef.current, {
          type: 'doughnut',
          data: { labels: origin.map(o => o.label), datasets: [{ data: origin.map(o => o.value), backgroundColor: CHART_COLORS, borderWidth: 0 }] },
          options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { font: { size: 10.5 }, boxWidth: 10, color: '#6E6656' } } } },
        })
      }
      const pay = countBy(p => p.payment_method || '—', PAY_LABEL)
      if (payRef.current) {
        charts.current.pay = new Chart(payRef.current, {
          type: 'doughnut',
          data: { labels: pay.map(o => o.label), datasets: [{ data: pay.map(o => o.value), backgroundColor: CHART_COLORS, borderWidth: 0 }] },
          options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { font: { size: 10.5 }, boxWidth: 10, color: '#6E6656' } } } },
        })
      }
    })
    return () => { Object.values(charts.current).forEach((c: any) => c?.destroy()); charts.current = {} }
  }, [loadingData, period])

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Archivo,sans-serif', color: '#AAA' }}>Carregando...</div>

  const PERIOD_LABEL: Record<Period, string> = { today: 'Hoje', week: '7 dias', month: 'Este mês', year: 'Este ano' }

  return (
    <EmpresaShell active="relatorios" companyName={companyName} lojaDigitalEnabled crmEnabled={crmEnabled} entregaEnabled={entregaEnabled}>
      <div className="rp-wrap">
        <style>{`
          .rp-wrap{ padding:20px 16px 48px; }
          @media(min-width:768px){ .rp-wrap{ padding:28px 32px 48px; } }
          .rp-periods{ display:flex;gap:8px;margin-bottom:18px;overflow-x:auto; }
          .rp-period-btn{ flex:none;padding:8px 16px;border-radius:20px;border:1.5px solid var(--line);background:#fff;font-weight:700;font-size:12.5px;color:var(--muted);cursor:pointer;font-family:'Archivo',sans-serif; }
          .rp-period-btn.on{ background:var(--ink);color:var(--sign);border-color:var(--ink); }
          .rp-kpis{ display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:20px; }
          @media(min-width:768px){ .rp-kpis{ grid-template-columns:repeat(4,1fr); } }
          .rp-kpi{ background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px; }
          .rp-kpi-lbl{ font-size:10.5px;font-weight:700;color:var(--muted);letter-spacing:.04em;text-transform:uppercase;margin-bottom:6px; }
          .rp-kpi-val{ font-family:'Anton',sans-serif;font-size:24px;color:var(--ink); }
          .rp-kpi-val.warn{ color:#B5690C; }
          .rp-kpi-val.alert{ color:#C43D3D; }
          .rp-grid2{ display:grid;grid-template-columns:1fr;gap:14px;margin-bottom:14px; }
          @media(min-width:900px){ .rp-grid2{ grid-template-columns:2fr 1fr; } }
          .rp-grid3{ display:grid;grid-template-columns:1fr;gap:14px;margin-bottom:14px; }
          @media(min-width:900px){ .rp-grid3{ grid-template-columns:1fr 1fr 1fr; } }
          .rp-card{ background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px; }
          .rp-card-title{ font-size:11.5px;font-weight:800;color:var(--muted);letter-spacing:.04em;text-transform:uppercase;margin-bottom:14px; }
          .rp-chart-box{ height:220px;position:relative; }
          .rp-chart-box.small{ height:180px; }
          .rp-empty{ text-align:center;color:var(--muted);font-size:12.5px;padding:40px 0; }
          .rp-table{ width:100%;border-collapse:collapse;font-size:12.5px; }
          .rp-table th{ text-align:left;font-size:10.5px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;padding:0 8px 8px;border-bottom:1px solid var(--line); }
          .rp-table td{ padding:9px 8px;border-bottom:1px solid #F5F2EC; }
          .rp-table tr:last-child td{ border-bottom:none; }
          .rp-rank{ display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:var(--concrete-2);font-size:10.5px;font-weight:800;color:var(--muted);margin-right:6px; }
        `}</style>

        <div className="rp-periods">
          {(['today', 'week', 'month', 'year'] as Period[]).map(p => (
            <button key={p} className={`rp-period-btn ${period === p ? 'on' : ''}`} onClick={() => setPeriod(p)}>{PERIOD_LABEL[p]}</button>
          ))}
        </div>

        {loadingData ? (
          <div className="rp-empty">Carregando relatório...</div>
        ) : pedidos.length === 0 ? (
          <div className="rp-empty">Nenhum pedido em {PERIOD_LABEL[period].toLowerCase()}.</div>
        ) : (
          <>
            <div className="rp-kpis">
              <div className="rp-kpi"><div className="rp-kpi-lbl">Faturamento</div><div className="rp-kpi-val">{fmt(faturamento)}</div></div>
              <div className="rp-kpi"><div className="rp-kpi-lbl">Pedidos</div><div className="rp-kpi-val">{validos.length}</div></div>
              <div className="rp-kpi"><div className="rp-kpi-lbl">Ticket médio</div><div className="rp-kpi-val">{fmt(ticketMedio)}</div></div>
              <div className="rp-kpi"><div className="rp-kpi-lbl">Cancelamento</div><div className={`rp-kpi-val ${taxaCancelamento > 10 ? 'alert' : ''}`}>{taxaCancelamento.toFixed(0)}%</div></div>
            </div>

            {pendenteRecebimento > 0 && (
              <div className="rp-card" style={{ marginBottom: 14, borderLeft: '3px solid #B5690C' }}>
                <div className="rp-kpi-lbl">💰 Ainda não recebido no período</div>
                <div className="rp-kpi-val warn">{fmt(pendenteRecebimento)}</div>
              </div>
            )}

            <div className="rp-grid2">
              <div className="rp-card">
                <div className="rp-card-title">Faturamento no período</div>
                <div className="rp-chart-box"><canvas ref={revRef} /></div>
              </div>
              <div className="rp-card">
                <div className="rp-card-title">Origem dos pedidos</div>
                <div className="rp-chart-box"><canvas ref={originRef} /></div>
              </div>
            </div>

            <div className="rp-grid2">
              <div className="rp-card">
                <div className="rp-card-title">Pedidos por horário</div>
                <div className="rp-chart-box small"><canvas ref={hourRef} /></div>
              </div>
              <div className="rp-card">
                <div className="rp-card-title">Forma de pagamento</div>
                <div className="rp-chart-box"><canvas ref={payRef} /></div>
              </div>
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
                <div className="rp-card-title">Por dia da semana</div>
                <div className="rp-chart-box"><canvas ref={dowRef} /></div>
              </div>
            </div>
          </>
        )}
      </div>
    </EmpresaShell>
  )
}
