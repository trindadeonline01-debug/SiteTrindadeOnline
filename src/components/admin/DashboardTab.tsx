'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import PeriodFilterBar from '@/components/admin/PeriodFilterBar'
import { PeriodSel, periodRange } from '@/lib/periodFilter'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface DashStats {
  views: number
  unique_visitors: number
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

interface SearchEvent {
  created_at: string
  user_id: string | null
  results_count: number | null
}

interface SearchTerm {
  term: string
  count: number
  no_result: boolean
  events: SearchEvent[]
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
  const [period, setPeriod] = useState<PeriodSel>({ kind: 'week' })
  const [stats, setStats] = useState<DashStats | null>(null)
  const [searchTerms, setSearchTerms] = useState<SearchTerm[]>([])
  const [topCompanies, setTopCompanies] = useState<TopCompany[]>([])
  const [weeklyViews, setWeeklyViews] = useState<DayData[]>([])
  const [loading, setLoading] = useState(true)
  const [detailTerm, setDetailTerm] = useState<SearchTerm | null>(null)
  const [userNames, setUserNames] = useState<Record<string, string>>({})
  const lineRef = useRef<HTMLCanvasElement>(null)
  const donutRef = useRef<HTMLCanvasElement>(null)
  const lineChart = useRef<any>(null)
  const donutChart = useRef<any>(null)

  async function loadDashboard() {
    setLoading(true)
    // periodRange() devolve `to` exclusivo e `from`/`to` podem vir null (sem
    // limite) — "Tudo" e as RPCs abaixo exigem timestamp de verdade, nunca
    // null (null em >= / <= no SQL derruba a linha toda, silenciosamente).
    // Substitui por uma janela bem larga quando não tem limite.
    const { from, to } = periodRange(period)
    const effectiveFrom = from || '2000-01-01T00:00:00.000Z'
    const effectiveTo = to || new Date().toISOString()

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
      { count: viewsCount },
      { count: wppClicksCount },
      { data: topCompanyViews },
      { data: uniqueVisitorsCount },
    ] = await Promise.all([
      supabase.from('companies').select('link_clicks, address_clicks').eq('status', 'active'),
      supabase.from('companies').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('companies').select('*', { count: 'exact', head: true }).eq('status', 'active').eq('plan', 'paid'),
      supabase.from('companies').select('*', { count: 'exact', head: true }).eq('status', 'active').neq('plan', 'paid'),
      supabase.from('companies').select('*', { count: 'exact', head: true }).eq('status', 'active').gte('created_at', effectiveFrom).lt('created_at', effectiveTo),
      supabase.from('search_logs').select('query, results_count, created_at, user_id').gte('created_at', effectiveFrom).lt('created_at', effectiveTo),
      supabase.from('reviews').select('*', { count: 'exact', head: true }).gte('created_at', effectiveFrom).lt('created_at', effectiveTo),
      supabase.from('coupons').select('*', { count: 'exact', head: true }).gte('created_at', effectiveFrom).lt('created_at', effectiveTo),
      supabase.from('promotions').select('*', { count: 'exact', head: true }).gte('created_at', effectiveFrom).lt('created_at', effectiveTo),
      supabase.from('page_views').select('*', { count: 'exact', head: true }).eq('page', '/empresa').gte('created_at', effectiveFrom).lt('created_at', effectiveTo),
      supabase.from('whatsapp_clicks').select('*', { count: 'exact', head: true }).gte('created_at', effectiveFrom).lt('created_at', effectiveTo),
      // Agregado no banco (RPC), não trazendo linha por linha pro navegador —
      // o SELECT do Supabase corta em 1000 linhas, então em períodos longos
      // (ano todo) a contagem por empresa saía cortada e errada
      supabase.rpc('dashboard_top_companies', { p_from: effectiveFrom, p_to: effectiveTo, p_limit: 5 }),
      supabase.rpc('dashboard_unique_visitors', { p_from: effectiveFrom, p_to: effectiveTo }),
    ])

    // Cliques em link externo e endereço não têm log por data — soma acumulada (total geral)
    const totalLink = (companies || []).reduce((a, c) => a + (c.link_clicks || 0), 0)
    const totalAddr = (companies || []).reduce((a, c) => a + (c.address_clicks || 0), 0)

    // Top 5 empresas por visualizações no período (já vem agregado e ordenado do banco)
    const topIds = (topCompanyViews || []).map((r: any) => [r.entity_id, r.views] as [string, number])
    let topNames: Record<string, string> = {}
    if (topIds.length > 0) {
      const { data: topCos } = await supabase.from('companies').select('id, name').in('id', topIds.map(([id]: [string, number]) => id))
      ;(topCos || []).forEach((c: any) => { topNames[c.id] = c.name })
    }
    setTopCompanies(topIds.map(([id, views]: [string, number]) => ({ name: topNames[id] || '—', category: '', views })))

    // Termos de busca — agrupa por termo (sem diferenciar maiúscula/minúscula)
    // e guarda cada busca individual (quando + quem), não só a contagem.
    // "sem resultado" reflete a busca MAIS RECENTE do termo, não "alguma
    // vez já deu 0" — antes, um log antigo (ex: de antes da busca por
    // produto ser ligada) deixava o termo marcado como "sem resultado" pra
    // sempre, mesmo já encontrando resultado normalmente agora (achado real
    // do Ricardo, set/2026: "peixe" aparecia sem resultado mas a busca de
    // verdade trazia produto).
    const termMap: Record<string, { count: number; events: SearchEvent[] }> = {}
    ;(searches || []).forEach((s: any) => {
      const q = (s.query || '').toLowerCase().trim()
      if (!q) return
      if (!termMap[q]) termMap[q] = { count: 0, events: [] }
      termMap[q].count++
      termMap[q].events.push({ created_at: s.created_at, user_id: s.user_id, results_count: s.results_count })
    })
    const terms = Object.entries(termMap)
      .map(([term, v]) => {
        const events = [...v.events].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        return { term, count: v.count, no_result: !events[0]?.results_count, events }
      })
      .sort((a, b) => b.count - a.count)
    setSearchTerms(terms)

    const noResultCount = (searches || []).filter((s: any) => !s.results_count || s.results_count === 0).length

    setStats({
      views: viewsCount || 0,
      unique_visitors: Number(uniqueVisitorsCount) || 0,
      whatsapp_clicks: wppClicksCount || 0,
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

    // Buscas por dia (últimos 7 dias) — dados reais
    const days: DayData[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000)
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString()
      const { count } = await supabase.from('search_logs').select('*', { count: 'exact', head: true }).gte('created_at', dayStart).lte('created_at', dayEnd)
      days.push({ day: d.toLocaleDateString('pt-BR', { weekday: 'short' }), views: count || 0 })
    }
    setWeeklyViews(days)
    setLoading(false)
  }

  useEffect(() => { loadDashboard() }, [period])

  // Clique num termo abre o detalhe (dia/hora de cada busca + quem buscou,
  // quando logado) — pedido do Ricardo, set/2026. Nomes de usuário só são
  // buscados na hora, pra quem ainda não está no cache local.
  async function openTermDetail(t: SearchTerm) {
    setDetailTerm(t)
    const ids = Array.from(new Set(t.events.map(e => e.user_id).filter((id): id is string => !!id)))
    const missing = ids.filter(id => !userNames[id])
    if (missing.length === 0) return
    const { data } = await supabase.from('profiles').select('id, name').in('id', missing)
    const next: Record<string, string> = {}
    ;(data || []).forEach((p: any) => { next[p.id] = p.name || 'Sem nome' })
    setUserNames(prev => ({ ...prev, ...next }))
  }

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
            datasets: [{ label: 'Views', data: weeklyViews.map(d => d.views), borderColor: '#A87200', backgroundColor: 'rgba(201,149,26,0.08)', borderWidth: 2.5, pointBackgroundColor: '#A87200', pointRadius: 4, tension: 0.4, fill: true }]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#aaa' } }, y: { grid: { color: '#f0f0f0' }, ticks: { font: { size: 11 }, color: '#aaa' } } } }
        })
      }
      if (donutRef.current) {
        if (donutChart.current) donutChart.current.destroy()
        donutChart.current = new Chart(donutRef.current, {
          type: 'doughnut',
          data: { datasets: [{ data: [stats.paid, stats.free], backgroundColor: ['#16a34a', '#A87200'], borderWidth: 0 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '70%' }
        })
      }
    })
  }, [stats, weeklyViews])

  const s: Record<string, any> = {
    wrap: { padding: '0 0 40px 0' },
    alert: { background: '#fff', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderLeft: '4px solid #e24b4a', marginBottom: 24 },
    sectionTitle: { fontSize: 11, fontWeight: 700, color: '#aaa', letterSpacing: 1.5, textTransform: 'uppercase' as const, marginBottom: 12, marginTop: 28 },
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
      <style>{`
        .dash-grid-5{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-bottom:14px;}
        .dash-grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:14px;}
        .dash-grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:14px;}
        .dash-grid-2{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-bottom:14px;}
        .dash-donut-row{display:flex;align-items:center;gap:20px;flex-wrap:wrap;justify-content:center;}
        .dash-terms-mobile{display:none;}
        .dash-term-row:hover{background:#fafafa;}
        @media(max-width:700px){
          .dash-grid-5{grid-template-columns:repeat(2,1fr);}
          .dash-grid-4{grid-template-columns:repeat(2,1fr);}
          .dash-grid-3{grid-template-columns:1fr;}
          .dash-grid-2{grid-template-columns:1fr;}
          .dash-terms-table{display:none;}
          .dash-terms-mobile{display:flex;flex-direction:column;}
        }
      `}</style>

      {/* FILTRO — padrão do site, igual Sala de Vendas */}
      <div style={{ marginBottom: 24 }}>
        <PeriodFilterBar value={period} onChange={setPeriod} />
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
      <div className="dash-grid-5">
        {[
          { icon: '👁️', label: 'Visualizações', val: stats.views, color: '#2563eb' },
          { icon: '🙋', label: 'Visitantes únicos', val: stats.unique_visitors, color: '#16a34a' },
          { icon: '💬', label: 'Cliques WhatsApp', val: stats.whatsapp_clicks, color: 'var(--sign-dark)' },
          { icon: '🔗', label: 'Cliques link externo (total geral)', val: stats.link_clicks, color: '#111' },
          { icon: '📍', label: 'Cliques no endereço (total geral)', val: stats.address_clicks, color: '#111' },
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
        <div style={s.chartTitle}>Buscas por dia</div>
        <div style={{ position: 'relative', height: 180 }}>
          <canvas ref={lineRef}></canvas>
        </div>
      </div>

      {/* EMPRESAS */}
      <div style={s.sectionTitle}>🏪 Empresas</div>
      <div className="dash-grid-3">
        <div style={s.card}>
          <span style={s.cardIcon}>✅</span>
          <div style={s.cardLabel}>Pagas ativas <span style={{fontSize:10,color:'#aaa',fontWeight:400}}>(total atual)</span></div>
          {num(stats.paid, '#16a34a')}
          <div style={{ fontSize: 12, color: '#aaa', marginBottom: 12 }}>R$ {(stats.paid * 49.9).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês estimado</div>
          <div style={{ background: '#f0f0f0', borderRadius: 99, height: 5, overflow: 'hidden' }}>
            <div style={{ background: '#16a34a', height: '100%', borderRadius: 99, width: `${Math.round(stats.paid / (stats.paid + stats.free) * 100)}%` }}></div>
          </div>
        </div>
        <div style={s.card}>
          <span style={s.cardIcon}>🆓</span>
          <div style={s.cardLabel}>Cadastros gratuitos <span style={{fontSize:10,color:'#aaa',fontWeight:400}}>(total atual)</span></div>
          {num(stats.free, 'var(--sign-dark)')}
          <div style={{ fontSize: 12, color: 'var(--sign-dark)', marginBottom: 12 }}>Potencial de conversão</div>
          <div style={{ background: '#f0f0f0', borderRadius: 99, height: 5, overflow: 'hidden' }}>
            <div style={{ background: 'var(--sign-dark)', height: '100%', borderRadius: 99, width: `${Math.round(stats.free / (stats.paid + stats.free) * 100)}%` }}></div>
          </div>
        </div>
        <div style={{ ...s.card, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="dash-donut-row">
            <div style={{ width: 110, height: 110, flexShrink: 0 }}>
              <canvas ref={donutRef}></canvas>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#555' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#16a34a' }}></div>
                <span><strong>{stats.paid}</strong> pagas</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#555' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--sign-dark)' }}></div>
                <span><strong>{stats.free}</strong> gratuitas</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RECEITA */}
      <div style={s.sectionTitle}>💰 Receita</div>
      <div className="dash-grid-2">
        <div style={s.card}>
          <span style={s.cardIcon}>💵</span>
          <div style={s.cardLabel}>Receita mensal estimada</div>
          {num(Math.floor(stats.paid * 49.9), '#16a34a')}
          <div style={{ fontSize: 12, color: '#aaa' }}>{stats.paid} empresas × R$ 49,90</div>
        </div>
        <div style={s.card}>
          <span style={s.cardIcon}>🎯</span>
          <div style={s.cardLabel}>Potencial não convertido</div>
          {num(Math.floor(stats.free * 49.9), 'var(--sign-dark)')}
          <div style={{ fontSize: 12, color: 'var(--sign-dark)' }}>{stats.free} empresas no plano gratuito</div>
        </div>
      </div>
      {/* ENGAJAMENTO */}
      <div style={s.sectionTitle}>❤️ Engajamento</div>
      <div className="dash-grid-4">
        {[
          { icon: '⭐', label: 'Avaliações', val: stats.reviews, color: '#111' },
          { icon: '🎟️', label: 'Cupons criados', val: stats.coupons, color: 'var(--sign-dark)' },
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
            <div style={{ fontSize: 16, fontWeight: 800, width: 24, textAlign: 'center', color: i === 0 ? 'var(--sign-dark)' : i === 1 ? '#888' : i === 2 ? '#b87333' : '#aaa' }}>{i + 1}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{c.name}</div>
            </div>
            <div style={{ width: 120 }}>
              <div style={{ background: '#f0f0f0', borderRadius: 99, height: 5, overflow: 'hidden', marginBottom: 3 }}>
                <div style={{ background: i === 0 ? 'var(--sign-dark)' : '#aaa', height: '100%', borderRadius: 99, width: `${Math.round((c.views / (topCompanies[0]?.views || 1)) * 100)}%` }}></div>
              </div>
              <div style={{ fontSize: 11, color: '#aaa', fontWeight: 600, textAlign: 'right' }}>{c.views.toLocaleString()} views</div>
            </div>
          </div>
        ))}
      </div>

      {/* BUSCAS */}
      <div style={s.sectionTitle}>🔍 Termos mais buscados</div>

      {/* Desktop/tablet — tabela */}
      <div className="dash-terms-table" style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1.5px solid #f0f0f0', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 70px 130px 130px', gap: 8, padding: '12px 16px', background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
          {['#','Termo','Buscas','Resultado','Volume'].map(h => (
            <span key={h} style={{ fontSize: 11, fontWeight: 700, color: '#aaa', letterSpacing: 0.5, textTransform: 'uppercase' as const }}>{h}</span>
          ))}
        </div>
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {searchTerms.slice(0, 50).map((t, i) => (
            <div key={t.term} className="dash-term-row" onClick={() => openTermDetail(t)} style={{ display: 'grid', gridTemplateColumns: '36px 1fr 70px 130px 130px', gap: 8, padding: '11px 16px', borderBottom: '1px solid #f9f9f9', alignItems: 'center', cursor: 'pointer' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, background: i === 0 ? '#fff8e6' : i === 1 ? '#f5f5f5' : i === 2 ? '#fdf3ec' : '#f0f0f0', color: i === 0 ? 'var(--sign-dark)' : i === 1 ? '#666' : i === 2 ? '#b87333' : '#888', fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
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

      {/* Mobile — cards empilhados */}
      <div className="dash-terms-mobile" style={{ gap: 8 }}>
        {searchTerms.slice(0, 50).map((t, i) => (
          <div key={t.term} className="dash-term-row" onClick={() => openTermDetail(t)} style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #f0f0f0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', padding: '12px 14px', marginBottom: 8, cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, flexShrink: 0, background: i === 0 ? '#fff8e6' : i === 1 ? '#f5f5f5' : i === 2 ? '#fdf3ec' : '#f0f0f0', color: i === 0 ? 'var(--sign-dark)' : i === 1 ? '#666' : i === 2 ? '#b87333' : '#888', fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#111', flex: 1 }}>{t.term}</span>
              <span style={{ fontSize: 11, fontWeight: 600, background: t.no_result ? '#fff0f0' : '#f0fdf4', color: t.no_result ? '#dc2626' : '#16a34a', padding: '2px 8px', borderRadius: 6, flexShrink: 0 }}>{t.no_result ? '✗ sem resultado' : '✓ encontrou'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', flexShrink: 0 }}>{t.count} busca{t.count !== 1 ? 's' : ''}</span>
              <div style={{ flex: 1, background: '#f0f0f0', borderRadius: 99, height: 4, overflow: 'hidden' }}>
                <div style={{ background: t.no_result ? '#dc2626' : '#2563eb', height: '100%', borderRadius: 99, width: `${Math.round((t.count / (searchTerms[0]?.count || 1)) * 100)}%` }}></div>
              </div>
            </div>
          </div>
        ))}
        {searchTerms.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#aaa', fontSize: 13 }}>Nenhuma busca no período selecionado.</div>}
      </div>

      {detailTerm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setDetailTerm(null) }}>
          <div style={{ background: '#fff', borderRadius: 16, maxWidth: 460, width: '100%', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid #f0f0f0' }}>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: '#111' }}>🔍 "{detailTerm.term}" — {detailTerm.count} busca{detailTerm.count !== 1 ? 's' : ''}</span>
              <button onClick={() => setDetailTerm(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#999', flexShrink: 0 }}>✕</button>
            </div>
            <div style={{ overflowY: 'auto' }}>
              {detailTerm.events.map((e, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 18px', borderBottom: '1px solid #f9f9f9' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#111' }}>
                      {new Date(e.created_at).toLocaleDateString('pt-BR')} às {new Date(e.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                      {e.user_id ? (userNames[e.user_id] || 'Carregando...') : 'Visitante não logado'}
                    </div>
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 6, flexShrink: 0, background: e.results_count ? '#f0fdf4' : '#fff0f0', color: e.results_count ? '#16a34a' : '#dc2626' }}>
                    {e.results_count ? `✓ ${e.results_count}` : '✗ 0'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}