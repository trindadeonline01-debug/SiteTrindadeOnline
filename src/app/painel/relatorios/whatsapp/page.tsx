'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { usePainelShell } from '@/contexts/PainelShellContext'
import PeriodFilterBar from '@/components/admin/PeriodFilterBar'
import { PeriodSel, periodRange, periodLabel, previousPeriodRange } from '@/lib/periodFilter'

type Delta = { label: string; good: boolean } | null
type FunilResp = { visitas: string[]; pedidos: { created_at: string; total: number }[]; cliquesWhatsapp: number }

function pctDelta(curr: number, prev: number): Delta {
  if (prev === 0) return null
  const pct = ((curr - prev) / prev) * 100
  if (Math.abs(pct) < 0.5) return null
  return { label: `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}%`, good: pct >= 0 }
}

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
          ctx.fillStyle = '#0B6B43'
          ctx.textAlign = 'center'
          ctx.fillText(formatter(val), x, y - 8)
          ctx.restore()
        })
      })
    },
  }
}

async function fetchFunil(companyId: string, accessToken: string, from: string | null, to: string | null): Promise<FunilResp | null> {
  const r = await fetch('/api/painel/whatsapp-funil', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: accessToken, company_id: companyId, from, to }),
  })
  if (!r.ok) return null
  return r.json()
}

function KpiTile({ icon, label, value, delta }: { icon: string; label: string; value: string; delta: Delta }) {
  return (
    <div className="wf-kpi">
      <div className="wf-kpi-top">
        <span className="wf-kpi-ico">{icon}</span>
        {delta && <span className={`wf-kpi-delta ${delta.good ? 'up' : 'down'}`}>{delta.label}</span>}
      </div>
      <div className="wf-kpi-lbl">{label}</div>
      <div className="wf-kpi-val">{value}</div>
    </div>
  )
}

export default function WhatsappFunilPage() {
  const { company, loading: shellLoading } = usePainelShell()
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<PeriodSel>({ kind: 'week' })
  const [loadingData, setLoadingData] = useState(true)
  const [data, setData] = useState<FunilResp | null>(null)
  const [dataPrev, setDataPrev] = useState<FunilResp | null>(null)
  const chartRef = useRef<HTMLCanvasElement>(null)
  const chart = useRef<any>(null)

  useEffect(() => {
    if (shellLoading) return
    if (!company || !company.loja_digital_enabled) { window.location.href = '/painel/compartilhar'; return }
    setLoading(false)
  }, [shellLoading, company?.id, company?.loja_digital_enabled])

  useEffect(() => {
    if (!company?.id) return
    setLoadingData(true)
    const { from, to } = periodRange(period)
    const prevRange = previousPeriodRange(period)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.access_token) { setLoadingData(false); return }
      const [curr, prev] = await Promise.all([
        fetchFunil(company.id, session.access_token, from, to),
        prevRange ? fetchFunil(company.id, session.access_token, prevRange.from, prevRange.to) : Promise.resolve(null),
      ])
      setData(curr)
      setDataPrev(prev)
      setLoadingData(false)
    })
  }, [company?.id, period])

  const visitas = data?.visitas.length || 0
  const pedidosCount = data?.pedidos.length || 0
  const conversao = visitas > 0 ? (pedidosCount / visitas) * 100 : 0
  const cliques = data?.cliquesWhatsapp || 0

  const visitasPrev = dataPrev?.visitas.length || 0
  const pedidosPrevCount = dataPrev?.pedidos.length || 0
  const hasPrev = previousPeriodRange(period) != null
  const deltaVisitas = hasPrev ? pctDelta(visitas, visitasPrev) : null
  const deltaPedidos = hasPrev ? pctDelta(pedidosCount, pedidosPrevCount) : null

  function dayBuckets(dates: string[]): { label: string; value: number }[] {
    const map = new Map<string, number>()
    dates.forEach(d => {
      const key = new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      map.set(key, (map.get(key) || 0) + 1)
    })
    return Array.from(map.entries()).map(([label, value]) => ({ label, value }))
  }

  useEffect(() => {
    if (loadingData || !data) return
    import('chart.js/auto').then(({ default: Chart }) => {
      chart.current?.destroy()
      const buckets = dayBuckets(data.visitas)
      const values = buckets.map(b => b.value)
      if (chartRef.current) {
        chart.current = new Chart(chartRef.current, {
          type: 'line',
          data: { labels: buckets.map(b => b.label), datasets: [{ data: values, borderColor: '#0B6B43', backgroundColor: 'rgba(15,138,87,.12)', borderWidth: 2.5, pointRadius: 3, tension: 0.35, fill: true }] },
          plugins: [valueLabelPlugin(v => String(v), pickLabelIndices(values))],
          options: {
            responsive: true, maintainAspectRatio: false, layout: { padding: { top: 16 } },
            plugins: { legend: { display: false } },
            scales: { x: { grid: { display: false }, ticks: { font: { size: 10.5 }, color: '#A79E8B', maxRotation: 0 } }, y: { grid: { color: '#F0EDE8' }, ticks: { font: { size: 10.5 }, color: '#A79E8B', precision: 0 } } },
          },
        } as any)
      }
    })
    return () => { chart.current?.destroy() }
  }, [loadingData, data])

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Archivo,sans-serif', color: '#AAA' }}>Carregando...</div>

  return (
    <div className="wf-wrap">
      <style>{`
        .wf-wrap{ padding:20px 16px 48px; }
        @media(min-width:768px){ .wf-wrap{ padding:28px 32px 48px; } }
        .wf-back{ font-size:12px;font-weight:700;color:var(--muted);text-decoration:none;margin-bottom:10px;display:inline-block; }
        .wf-title{ font-family:'Anton',sans-serif;font-size:22px;margin:4px 0 16px; }
        .wf-kpis{ display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:16px; }
        @media(min-width:768px){ .wf-kpis{ grid-template-columns:repeat(3,1fr); } }
        .wf-kpi{ background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px; }
        .wf-kpi-top{ display:flex;align-items:center;justify-content:space-between;margin-bottom:8px; }
        .wf-kpi-ico{ font-size:14px; }
        .wf-kpi-delta{ font-size:10px;font-weight:800;padding:2px 7px;border-radius:9px; }
        .wf-kpi-delta.up{ color:var(--open);background:#E4F3EC; }
        .wf-kpi-delta.down{ color:var(--alert);background:#FBEAEA; }
        .wf-kpi-lbl{ font-size:10.5px;font-weight:700;color:var(--muted);letter-spacing:.04em;text-transform:uppercase;margin-bottom:6px; }
        .wf-kpi-val{ font-family:'Anton',sans-serif;font-size:24px;color:var(--ink); }
        .wf-card{ background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:14px; }
        .wf-card-title{ font-size:11.5px;font-weight:800;color:var(--muted);letter-spacing:.04em;text-transform:uppercase;margin-bottom:16px; }
        .wf-funnel-step{ display:flex;align-items:center;gap:16px;margin-bottom:4px; }
        .wf-funnel-bar{ height:48px;border-radius:10px;display:flex;align-items:center;padding:0 16px;color:#fff;font-weight:800;font-size:13px;min-width:44px; }
        .wf-funnel-lbl{ width:150px;flex-shrink:0;text-align:right;font-size:12px;font-weight:700;color:var(--muted); }
        .wf-funnel-pct{ width:60px;flex-shrink:0;font-size:12px;font-weight:800;color:#8A8477; }
        .wf-drop{ font-size:10.5px;color:var(--alert);font-weight:700;margin:4px 0 10px 166px; }
        .wf-chart-box{ height:200px;position:relative; }
        .wf-note{ background:#F5F6F2;border-radius:10px;padding:12px 14px;font-size:12px;color:var(--muted);line-height:1.5; }
        .wf-note b{ color:var(--ink); }
        .wf-empty{ text-align:center;color:var(--muted);font-size:12.5px;padding:40px 0; }
      `}</style>

      <a href="/painel" className="wf-back">← Voltar pra Visão Geral</a>
      <div className="wf-title">💬 Conversão de WhatsApp</div>

      <div style={{ marginBottom: 16 }}>
        <PeriodFilterBar value={period} onChange={setPeriod} />
      </div>

      {loadingData ? (
        <div className="wf-empty">Carregando...</div>
      ) : !data ? (
        <div className="wf-empty">Não foi possível carregar os dados desse período.</div>
      ) : (
        <>
          <div className="wf-kpis">
            <KpiTile icon="👆" label="Visitas no cardápio" value={String(visitas)} delta={deltaVisitas} />
            <KpiTile icon="🧾" label="Pedidos do cardápio" value={String(pedidosCount)} delta={deltaPedidos} />
            <KpiTile icon="📊" label="Taxa de conversão" value={visitas > 0 ? `${conversao.toFixed(1)}%` : '—'} delta={null} />
          </div>

          <div className="wf-card">
            <div className="wf-card-title">Funil do cardápio digital</div>
            {visitas === 0 ? (
              <div className="wf-empty">Sem visitas ao cardápio nesse período.</div>
            ) : (
              <>
                <div className="wf-funnel-step">
                  <div className="wf-funnel-lbl">Visitaram o cardápio</div>
                  <div className="wf-funnel-bar" style={{ width: '100%', maxWidth: 480, background: '#2A4E7A' }}>{visitas}</div>
                  <div className="wf-funnel-pct">100%</div>
                </div>
                <div className="wf-drop">▼ {(100 - conversao).toFixed(0)}% não chega a pedir</div>
                <div className="wf-funnel-step">
                  <div className="wf-funnel-lbl">Fizeram pedido</div>
                  <div className="wf-funnel-bar" style={{ width: `${Math.max(conversao, 8)}%`, maxWidth: 480, background: '#0F8A57' }}>{pedidosCount}</div>
                  <div className="wf-funnel-pct">{conversao.toFixed(0)}%</div>
                </div>
              </>
            )}
          </div>

          <div className="wf-card">
            <div className="wf-card-title">Visitas ao cardápio ao longo do tempo</div>
            <div className="wf-chart-box"><canvas ref={chartRef} /></div>
          </div>

          <div className="wf-note">
            💬 <b>Cliques no botão de contato do WhatsApp (perfil da empresa + cardápio): {cliques}</b> em {periodLabel(period)}.
            Esse número não entra no funil acima — é um botão separado (&ldquo;chamar no WhatsApp&rdquo;), sem ligação com quem depois fez pedido pelo cardápio.
          </div>
        </>
      )}
    </div>
  )
}
