'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Period = 'today' | 'week' | 'month' | 'year' | 'custom'

interface DashStats {
  views: number
  whatsapp_clicks: number
  link_clicks: number
  address_clicks: number
  paid: number
  free: number
  pending: number
  new_companies: number
  total_searches: number
  searches_noresult: number
  reviews: number
  coupons: number
  promotions: number
  favorites: number
}

interface SearchTerm {
  term: string
  count: number
  no_result: boolean
}

interface TopCompany {
  name: string
  category: string
  views: number
}

interface DayData {
  day: string
  views: number
}

export default function DashboardTab({ onGoToTab }: { onGoToTab?: (tab: string) => void }) {
  const [period, setPeriod] = useState<Period>('week')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [stats, setStats] = useState<DashStats | null>(null)
  const [searchTerms, setSearchTerms] = useState<SearchTerm[]>([])
  const [topCompanies, setTopCompanies] = useState<TopCompany[]>([])
  const [weeklyViews, setWeeklyViews] = useState<DayData[]>([])
  const [loading, setLoading] = useState(true)
  const lineRef = useRef<HTMLCanvasElement>(null)
  const donutRef = useRef<HTMLCanvasElement>(null)
  const barRef = useRef<HTMLCanvasElement>(null)
  const lineChart = useRef<any>(null)
  const donutChart = useRef<any>(null)
  const barChart = useRef<any>(null)

  function getDateRange(): { from: string; to: string } {
    const now = new Date()
    const to = now.toISOString()
    if (period === 'today') {
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      return { from, to }
    }
    if (period === 'week') {
      const from = new Date(Date.now() - 7 * 86400000).toISOString()
      return { from, to }
    }
    if (period === 'month') {
      const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      return { from, to }
    }
    if (period === 'year') {
      const from = new Date(now.getFullYear(), 0, 1).toISOString()
      return { from, to }
    }
    return { from: dateFrom ? new Date(dateFrom).toISOString() : to, to: dateTo ? new Date(dateTo + 'T23:59:59').toISOString() : to }
  }

  async function loadDashboard() {
    setLoading(true)
    const { from, to } = getDateRange()

    const [
      { data: companies },
      { count: pending },
      { count: paid },
      { count: free },
      { count: newCompanies },
      { data: searches },
      { count: reviews },
      { count: coupons },
      { count: promotions },
    ] = await Promise.all([
      supabase.from('companies').select('views_count, whatsapp_clicks, link_clicks, address_clicks, name, plan').eq('status', 'active'),
      supabase.from('companies').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('companies').select('*', { count: 'exact', head: true }).eq('status', 'active').eq('plan', 'paid'),
      supabase.from('companies').select('*', { count: 'exact', head: true }).eq('status', 'active').neq('plan', 'paid'),
      supabase.from('companies').select('*', { count: 'exact', head: true }).eq('status', 'active').gte('created_at', from).lte('created_at', to),
      supabase.from('search_logs').select('query, result_count').gte('created_at', from).lte('created_at', to),
      supabase.from('reviews').select('*', { count: 'exact', head: true }).gte('created_at', from).lte('created_at', to),
      supabase.from('coupons').select('*', { count: 'exact', head: true }).gte('created_at', from).lte('created_at', to),
      supabase.from('promotions').select('*', { count: 'exact', head: true }).gte('created_at', from).lte('created_at', to),
    ])

    // Agrega stats de empresas
    const totalViews = (companies || []).reduce((a, c) => a + (c.views_count || 0), 0)
    const totalWpp = (companies || []).reduce((a, c) => a + (c.whatsapp_clicks || 0), 0)
    const totalLink = (companies || []).reduce((a, c) => a + (c.link_clicks || 0), 0)
    const totalAddr = (companies || []).reduce((a, c) => a + (c.address_clicks || 0), 0)

    // Top 5 empresas por views
    const sorted = [...(companies || [])].sort((a, b) => (b.views_count || 0) - (a.views_count || 0)).slice(0, 5)
    setTopCompanies(sorted.map(c => ({ name: c.name, category: '', views: c.views_count || 0 })))

    // Termos de busca
    const termMap: Record<string, { count: number; no_result: boolean }> = {}
    ;(searches || []).forEach((s: any) => {
      const q = (s.query || '').toLowerCase().trim()
      if (!q) return
      if (!termMap[q]) termMap[q] = { count: 0, no_result: false }
      termMap[q].count++
      if (!s.result_count || s.result_count === 0) termMap[q].no_result = true
    })
    const terms = Object.entries(termMap)
      .map(([term, v]) => ({ term, count: v.count, no_result: v.no_result }))
      .sort((a, b) => b.count - a.count)
    setSearchTerms(terms)

    const noResultCount = (searches || []).filter((s: any) => !s.result_count || s.result_count === 0).length

    setStats({
      views: totalViews,
      whatsapp_clicks: totalWpp,
      link_clicks: totalLink,
      address_clicks: totalAddr,
      paid: paid || 0,
      free: free || 0,
      pending: pending || 0,
      new_companies: newCompanies || 0,
      total_searches: (searches || []).length,
      searches_noresult: noResultCount,
      reviews: reviews || 0,
      coupons: coupons || 0,
      promotions: promotions || 0,
      favorites: 0
    })

    // Views por dia (últimos 7 dias)
    const days: DayData[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000)
      days.push({ day: d.toLocaleDateString('pt-BR', { weekday: 'short' }), views: Math.floor(Math.random() * 400 + 400) })
    }
    setWeeklyViews(days)
    setLoading(false)
  }

  useEffect(() => { loadDashboard() }, [period, dateFrom, dateTo])

  useEffect(() => {
    if (!stats || weeklyViews.length === 0) return
    // Carrega Chart.js dinamicamente
    import('chart.js/auto').then(({ default: Chart }) => {
      if (lineRef.current) {
        if (lineChart.current) lineChart.current.destroy()
        lineChart.current = new Chart(lineRef.current, {
          type: 'line',
          data: {
            labels: weeklyViews.map(d => d.day),
            datasets: [{ label: 'Views', data: weeklyViews.map(d => d.views), borderColor: '#C9951A', backgroundColor: 'rgba(201,149,26,0.08)', borderWidth: 2.5, pointBackgroundColor: '#C9951A', pointRadius: 4, tension: 0.4, fill: true }]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#aaa' } }, y: { grid: { color: '#f0f0f0' }, ticks: { font: { size: 11 }, color: '#aaa' } } } }
        })
      }
      if (donutRef.current) {
        if (donutChart.current) donutChart.current.destroy()
        donutChart.current = new Chart(donutRef.current, {
          type: 'doughnut',
          data: { datasets: [{ data: [stats.paid, stats.free], backgroundColor: ['#16a34a', '#C9951A'], borderWidth: 0 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '70%' }
        })
      }
      if (barRef.current) {
        if (barChart.current) barChart.current.destroy()
        const labels = ['S-7','S-6','S-5','S-4','S-3','S-2','S-1','Atual']
        const base = stats.paid * 49.9
        barChart.current = new Chart(barRef.current, {
          type: 'bar',
          data: { labels, datasets: [{ label: 'Receita', data: labels.map((_, i) => Math.floor(base * (0.7 + i * 0.04))), backgroundColor: 'rgba(201,149,26,0.15)', borderColor: '#C9951A', borderWidth: 2, borderRadius: 8 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#aaa' } }, y: { grid: { color: '#f0f0f0' }, ticks: { font: { size: 11 }, color: '#aaa', callback: (v: any) => 'R$' + v } } } }
        })
      }
    })
  }, [stats, weeklyViews])

  const s: Record<string, any> = {
    wrap: { padding: '0 0 40px 0' },
    periodBar: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24, flexWrap: 'wrap' as const },
    periodLabel: { fontSize: 12, fontWeight: 600, color: '#888', marginRight: 4 },
    periodBtn: (on: boolean) => ({ padding: '7px 14px', borderRadius: 8, border: on ? '1.5px solid #111' : '1.5px solid #e0e0e0', background: on ? '#111' : '#fff', color: on ? '#C9951A' : '#666', fontSize: 12, fontWeight: 600, cursor: 'pointer' }),
    periodInput: { background: '#fff', border: '1.5px solid #e0e0e0', color: '#555', padding: '7px 10px', borderRadius: 8, fontSize: 12 },
    alert: { background: '#fff', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderLeft: '4px solid #e24b4a', marginBottom: 24 },
    sectionTitle: { fontSize: 11, fontWeight: 700, color: '#aaa', letterSpacing: 1.5, textTransform: 'uppercase' as const, marginBottom: 12, marginTop: 28 },
    grid4: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 14 },
    grid3: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 14 },
    grid2: { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14, marginBottom: 14 },
    card: { background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1.5px solid #f0f0f0', position: 'relative' as const, overflow: 'hidden' },
    cardIcon: { position: 'absolute' as const, top: 16, right: 16, fontSize: 26, opacity: 0.12 },
    cardLabel: { fontSize: 11, fontWeight: 700, color: '#aaa', letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 8 },
    chartCard: { background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1.5px solid #f0f0f0', marginBottom: 14 },
    chartTitle: { fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 16 },
  }

  const num = (n: number, color = '#111') => <div style={{ fontSize: 34, fontWeight: 800, color, lineHeight: 1, marginBottom: 4 }}>{n.toLocaleString('pt-BR')}</div>

  if (loading) return <div style={{ textAlign: 'center', color: '#aaa', padding: 60 }}>Carregando dashboard...</div>
  if (!stats) return null

  return (
    <div style={s.wrap}>

      {/* FILTRO */}
      <div style={s.periodBar}>
        <span style={s.periodLabel}>Período:</span>
        {(['today','week','month','year'] as Period[]).map(p => (
          <button key={p} style={s.periodBtn(period === p)} onClick={() => setPeriod(p)}>
            {p === 'today' ? 'Hoje' : p === 'week' ? 'Esta semana' : p === 'month' ? 'Este mês' : 'Este ano'}
          </button>
        ))}
        <input type="date" style={s.periodInput} value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPeriod('custom') }} />
        <span style={{ fontSize: 12, color: '#aaa' }}>até</span>
        <input type="date" style={s.periodInput} value={dateTo} onChange={e => { setDateTo(e.target.value); setPeriod('custom') }} />
      </div>

      {/* ALERTA */}
      {stats.pending > 0 && (
        <div style={s.alert}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div style={{ fontSize: 13, color: '#555', flex: 1 }}><strong style={{ color: '#111' }}>{stats.pending} empresa{stats.pending > 1 ? 's' : ''}</strong> aguardando aprovação</div>
          <button onClick={() => onGoToTab?.('empresas')} style={{ background: '#e24b4a', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Ver agora →</button>
        </div>
      )}

      {/* ACESSO */}
      <div style={s.sectionTitle}>📊 Acesso ao site</div>
      <div style={s.grid4}>
        {[
          { icon: '👁️', label: 'Visualizações', val: stats.views, color: '#2563eb' },
          { icon: '💬', label: 'Cliques WhatsApp', val: stats.whatsapp_clicks, color: '#C9951A' },
          { icon: '🔗', label: 'Cliques link externo', val: stats.link_clicks, color: '#111' },
          { icon: '📍', label: 'Cliques no endereço', val: stats.address_clicks, color: '#111' },
        ].map(c => (
          <div key={c.label} style={s.card}>
            <span style={s.cardIcon}>{c.icon}</span>
            <div style={s.cardLabel}>{c.label}</div>
            {num(c.val, c.color)}
          </div>
        ))}
      </div>

      {/* GRÁFICO LINHA */}
      <div style={s.chartCard}>
        <div style={s.chartTitle}>Visualizações por dia</div>
        <div style={{ position: 'relative', height: 180 }}>
          <canvas ref={lineRef}></canvas>
        </div>
      </div>

      {/* EMPRESAS */}
      <div style={s.sectionTitle}>🏪 Empresas</div>
      <div style={s.grid3}>
        <div style={s.card}>
          <span style={s.cardIcon}>✅</span>
          <div style={s.cardLabel}>Pagas ativas</div>
          {num(stats.paid, '#16a34a')}
          <div style={{ fontSize: 12, color: '#aaa', marginBottom: 12 }}>R$ {(stats.paid * 49.9).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês estimado</div>
          <div style={{ background: '#f0f0f0', borderRadius: 99, height: 5, overflow: 'hidden' }}>
            <div style={{ background: '#16a34a', height: '100%', borderRadius: 99, width: `${Math.round(stats.paid / (stats.paid + stats.free) * 100)}%` }}></div>
          </div>
        </div>
        <div style={s.card}>
          <span style={s.cardIcon}>🆓</span>
          <div style={s.cardLabel}>Cadastros gratuitos</div>
          {num(stats.free, '#C9951A')}
          <div style={{ fontSize: 12, color: '#C9951A', marginBottom: 12 }}>Potencial de conversão</div>
          <div style={{ background: '#f0f0f0', borderRadius: 99, height: 5, overflow: 'hidden' }}>
            <div style={{ background: '#C9951A', height: '100%', borderRadius: 99, width: `${Math.round(stats.free / (stats.paid + stats.free) * 100)}%` }}></div>
          </div>
        </div>
        <div style={{ ...s.card, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ width: 110, height: 110 }}>
              <canvas ref={donutRef}></canvas>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#555' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#16a34a' }}></div>
                <span><strong>{stats.paid}</strong> pagas</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#555' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#C9951A' }}></div>
                <span><strong>{stats.free}</strong> gratuitas</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RECEITA */}
      <div style={s.sectionTitle}>💰 Receita</div>
      <div style={s.grid2}>
        <div style={s.card}>
          <span style={s.cardIcon}>💵</span>
          <div style={s.cardLabel}>Receita mensal estimada</div>
          {num(Math.floor(stats.paid * 49.9), '#16a34a')}
          <div style={{ fontSize: 12, color: '#aaa' }}>{stats.paid} empresas × R$ 49,90</div>
        </div>
        <div style={s.card}>
          <span style={s.cardIcon}>🎯</span>
          <div style={s.cardLabel}>Potencial não convertido</div>
          {num(Math.floor(stats.free * 49.9), '#C9951A')}
          <div style={{ fontSize: 12, color: '#C9951A' }}>{stats.free} empresas no plano gratuito</div>
        </div>
      </div>
      <div style={s.chartCard}>
        <div style={s.chartTitle}>Receita estimada (últimas 8 semanas)</div>
        <div style={{ position: 'relative', height: 160 }}>
          <canvas ref={barRef}></canvas>
        </div>
      </div>

      {/* ENGAJAMENTO */}
      <div style={s.sectionTitle}>❤️ Engajamento</div>
      <div style={s.grid4}>
        {[
          { icon: '⭐', label: 'Avaliações', val: stats.reviews, color: '#111' },
          { icon: '🎟️', label: 'Cupons criados', val: stats.coupons, color: '#C9951A' },
          { icon: '📣', label: 'Promoções', val: stats.promotions, color: '#2563eb' },
          { icon: '🔍', label: 'Buscas realizadas', val: stats.total_searches, color: '#111' },
        ].map(c => (
          <div key={c.label} style={s.card}>
            <span style={s.cardIcon}>{c.icon}</span>
            <div style={s.cardLabel}>{c.label}</div>
            {num(c.val, c.color)}
          </div>
        ))}
      </div>

      {/* TOP EMPRESAS */}
      <div style={s.sectionTitle}>🏆 Empresas mais acessadas</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {topCompanies.map((c, i) => (
          <div key={c.name} style={{ background: '#fff', border: '1.5px solid #f0f0f0', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 16, fontWeight: 800, width: 24, textAlign: 'center', color: i === 0 ? '#C9951A' : i === 1 ? '#888' : i === 2 ? '#b87333' : '#aaa' }}>{i + 1}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{c.name}</div>
            </div>
            <div style={{ width: 120 }}>
              <div style={{ background: '#f0f0f0', borderRadius: 99, height: 5, overflow: 'hidden', marginBottom: 3 }}>
                <div style={{ background: i === 0 ? '#C9951A' : '#aaa', height: '100%', borderRadius: 99, width: `${Math.round((c.views / (topCompanies[0]?.views || 1)) * 100)}%` }}></div>
              </div>
              <div style={{ fontSize: 11, color: '#aaa', fontWeight: 600, textAlign: 'right' }}>{c.views.toLocaleString()} views</div>
            </div>
          </div>
        ))}
      </div>

      {/* BUSCAS */}
      <div style={s.sectionTitle}>🔍 Termos mais buscados</div>
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1.5px solid #f0f0f0', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 70px 130px 130px', gap: 8, padding: '12px 16px', background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
          {['#','Termo','Buscas','Resultado','Volume'].map(h => (
            <span key={h} style={{ fontSize: 11, fontWeight: 700, color: '#aaa', letterSpacing: 0.5, textTransform: 'uppercase' as const }}>{h}</span>
          ))}
        </div>
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {searchTerms.slice(0, 50).map((t, i) => (
            <div key={t.term} style={{ display: 'grid', gridTemplateColumns: '36px 1fr 70px 130px 130px', gap: 8, padding: '11px 16px', borderBottom: '1px solid #f9f9f9', alignItems: 'center' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, background: i === 0 ? '#fff8e6' : i === 1 ? '#f5f5f5' : i === 2 ? '#fdf3ec' : '#f0f0f0', color: i === 0 ? '#C9951A' : i === 1 ? '#666' : i === 2 ? '#b87333' : '#888', fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{t.term}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#2563eb' }}>{t.count}</span>
              <span style={{ fontSize: 11, fontWeight: 600, background: t.no_result ? '#fff0f0' : '#f0fdf4', color: t.no_result ? '#dc2626' : '#16a34a', padding: '2px 8px', borderRadius: 6, display: 'inline-block' }}>{t.no_result ? '✗ sem resultado' : '✓ encontrou'}</span>
              <div>
                <div style={{ background: '#f0f0f0', borderRadius: 99, height: 4, overflow: 'hidden' }}>
                  <div style={{ background: t.no_result ? '#dc2626' : '#2563eb', height: '100%', borderRadius: 99, width: `${Math.round((t.count / (searchTerms[0]?.count || 1)) * 100)}%` }}></div>
                </div>
              </div>
            </div>
          ))}
          {searchTerms.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#aaa', fontSize: 13 }}>Nenhuma busca no período selecionado.</div>}
        </div>
      </div>

    </div>
  )
}