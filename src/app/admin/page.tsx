'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

// ── TIPOS ──────────────────────────────────────────────────
type Company = {
  id: string; name: string; status: string; plan: string
  created_at: string; owner_id: string; category_id: string
  address: string; phone: string
  category?: { name: string; emoji: string }
  owner?: { name: string }
}
type Profile = {
  id: string; name: string; user_type: string
  neighborhood: string; created_at: string
}
type SearchLog  = { query: string; count: number; no_result: number }
type Highlight  = { id: string; company_id: string; scope_type: string; scope_id: string|null; highlight_type: string; active: boolean; expires_at: string|null; display_order: number; company?: any; scope_name?: string }
type CatOpt     = { id: string; name: string; emoji: string; slug: string }
type Report     = { id: string; reason: string; resolved: boolean; created_at: string; listing?: any; reporter?: any }
type SubcatOpt  = { id: string; name: string; emoji: string; slug: string; category_id: string }
type Stats = {
  total_users: number; users_today: number; users_week: number
  total_companies: number; pending: number; active: number
  total_searches: number; searches_today: number
}

// ── HELPERS ────────────────────────────────────────────────
const today = () => new Date().toISOString().split('T')[0]
const weekAgo = () => { const d = new Date(); d.setDate(d.getDate()-7); return d.toISOString() }
const fmtDate = (s: string) => new Date(s).toLocaleDateString('pt-BR')
const statusColor = (s: string) => s === 'active' ? '#0F8050' : s === 'pending' ? '#C9951A' : '#E24B4A'
const statusLabel = (s: string) => s === 'active' ? 'Ativa' : s === 'pending' ? 'Pendente' : 'Suspensa'

export default function AdminPage() {
  const [tab, setTab]               = useState<'dashboard'|'empresas'|'destaques'|'denuncias'|'usuarios'|'buscas'|'atividade'>('dashboard')
  const [stats, setStats]           = useState<Stats|null>(null)
  const [companies, setCompanies]   = useState<Company[]>([])
  const [users, setUsers]           = useState<Profile[]>([])
  const [searches, setSearches]     = useState<SearchLog[]>([])
  const [filterStatus, setFilter]   = useState('all')
  const [loading, setLoading]       = useState(true)
  const [toast, setToast]           = useState('')
  const [authorized, setAuthorized] = useState<boolean|null>(null)
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [catOpts, setCatOpts]       = useState<CatOpt[]>([])
  const [subcatOpts, setSubcatOpts] = useState<SubcatOpt[]>([])
  const [hlForm, setHlForm]         = useState({ company_id:'', scope_type:'category', scope_id:'', highlight_type:'manual', expires_at:'' })
  const [hlFormOpen, setHlFormOpen] = useState(false)
  const [hlLoading, setHlLoading]   = useState(false)
  const [reports, setReports]         = useState<Report[]>([])
  const [repCount, setRepCount]       = useState(0)

  // Verifica se é admin
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return }
      const { data } = await supabase.from('profiles').select('user_type').eq('id', session.user.id).single()
      if (data?.user_type !== 'admin') { setAuthorized(false); return }
      setAuthorized(true)
      loadAll()
    })
  }, [])

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadStats(), loadCompanies(), loadUsers(), loadSearches(), loadHighlights(), loadReports()])
    setLoading(false)
  }

  async function loadStats() {
    const [
      { count: total_users },
      { count: users_today },
      { count: users_week },
      { count: total_companies },
      { count: pending },
      { count: active },
      { count: total_searches },
      { count: searches_today },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', today()),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo()),
      supabase.from('companies').select('*', { count: 'exact', head: true }),
      supabase.from('companies').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('companies').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('search_logs').select('*', { count: 'exact', head: true }),
      supabase.from('search_logs').select('*', { count: 'exact', head: true }).gte('created_at', today()),
    ])
    setStats({
      total_users: total_users||0, users_today: users_today||0, users_week: users_week||0,
      total_companies: total_companies||0, pending: pending||0, active: active||0,
      total_searches: total_searches||0, searches_today: searches_today||0
    })
  }

  async function loadCompanies() {
    const { data } = await supabase
      .from('companies')
      .select('*, category:categories(name,emoji), owner:profiles(name)')
      .order('created_at', { ascending: false })
      .limit(100)
    setCompanies(data || [])
  }

  async function loadUsers() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    setUsers(data || [])
  }

  async function loadSearches() {
    const { data } = await supabase
      .from('search_logs')
      .select('query, results_count')
      .order('created_at', { ascending: false })
      .limit(500)
    if (!data) return
    const map: Record<string, { count: number; no_result: number }> = {}
    data.forEach(r => {
      const q = r.query.toLowerCase().trim()
      if (!map[q]) map[q] = { count: 0, no_result: 0 }
      map[q].count++
      if (r.results_count === 0) map[q].no_result++
    })
    const sorted = Object.entries(map)
      .map(([query, v]) => ({ query, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50)
    setSearches(sorted)
  }

  async function loadHighlights() {
    const { data: hl } = await supabase
      .from('highlights')
      .select('*, company:companies(name,category:categories(name,emoji))')
      .eq('active', true)
      .order('display_order')
    const { data: cats } = await supabase.from('categories').select('id,name,emoji,slug').order('name')
    const { data: subs } = await supabase.from('subcategories').select('id,name,emoji,slug,category_id').order('name')
    setHighlights((hl || []) as Highlight[])
    setCatOpts((cats || []) as CatOpt[])
    setSubcatOpts((subs || []) as SubcatOpt[])
  }

  async function saveHighlight() {
    if (!hlForm.company_id) return
    setHlLoading(true)
    // Mapeia scope_type para os campos reais da tabela
    const levelMap: Record<string,string> = { global:'home', category:'category', subcategory:'subcategory' }
    const durationDays = parseInt(hlForm.expires_at) || 0
    const { error: hlErr } = await supabase.from('highlights').insert({
      company_id:    hlForm.company_id,
      level:         levelMap[hlForm.scope_type] || 'home',
      category_id:   hlForm.scope_type === 'category'    ? hlForm.scope_id || null : null,
      subcategory_id:hlForm.scope_type === 'subcategory' ? hlForm.scope_id || null : null,
      scope_type:    hlForm.scope_type,
      scope_id:      hlForm.scope_id || null,
      highlight_type:hlForm.highlight_type,
      duration_days: durationDays,
      price_paid:    0,
      active:        true,
      status:        'active',
      starts_at:     new Date().toISOString(),
      expires_at:    durationDays > 0 ? new Date(Date.now() + durationDays * 86400000).toISOString() : null,
    })
    if (hlErr) { showToast('Erro: ' + hlErr.message); setHlLoading(false); return }
    setHlFormOpen(false)
    setHlForm({ company_id:'', scope_type:'category', scope_id:'', highlight_type:'manual', expires_at:'' })
    await loadHighlights()
    showToast('Destaque salvo!')
    setHlLoading(false)
  }


  async function loadReports() {
    const { data } = await supabase
      .from('listing_reports')
      .select('id, reason, resolved, created_at, listing:listings(id,title,type,status), reporter:profiles(name)')
      .order('created_at', { ascending: false })
    const r = (data || []) as Report[]
    setReports(r)
    setRepCount(r.filter(x => !x.resolved).length)
  }

  async function resolveReport(reportId: string) {
    await supabase.from('listing_reports').update({ resolved: true }).eq('id', reportId)
    await loadReports()
    showToast('Denúncia ignorada.')
  }

  async function deleteListingFromReport(listingId: string, reportId: string) {
    await supabase.from('listings').update({ status: 'deleted' }).eq('id', listingId)
    await supabase.from('listing_reports').update({ resolved: true }).eq('id', reportId)
    await loadReports()
    showToast('Anúncio excluído.')
  }
  async function removeHighlight(id: string) {
    await supabase.from('highlights').update({ active: false }).eq('id', id)
    await loadHighlights()
    showToast('Destaque removido.')
  }


  async function approveCompany(id: string) {
    await supabase.from('companies').update({ status: 'active', approved_at: new Date().toISOString() }).eq('id', id)
    const { data: { session } } = await supabase.auth.getSession()
    if (session) await supabase.from('admin_logs').insert({ admin_id: session.user.id, action: 'approve_company', entity_type: 'company', entity_id: id })
    showToast('Empresa aprovada!')
    loadCompanies(); loadStats()
  }

  async function suspendCompany(id: string) {
    await supabase.from('companies').update({ status: 'suspended' }).eq('id', id)
    showToast('Empresa suspensa.')
    loadCompanies(); loadStats()
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  // ── GUARDS ────────────────────────────────────────────────
  if (authorized === null) return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'Inter,sans-serif',color:'#AAA' }}>Verificando acesso...</div>
  if (authorized === false) return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'Inter,sans-serif' }}><div style={{ textAlign:'center' }}><div style={{ fontSize:48,marginBottom:16 }}>🚫</div><div style={{ fontSize:20,fontWeight:700 }}>Acesso negado</div><div style={{ color:'#AAA',marginTop:8 }}>Você não tem permissão para acessar esta página.</div></div></div>

  const filteredCompanies = filterStatus === 'all' ? companies : companies.filter(c => c.status === filterStatus)

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; background: #F0EDE8; }

        .admin-layout { display: flex; min-height: 100vh; }

        /* SIDEBAR */
        .sidebar {
          width: 220px; background: #111; flex-shrink: 0;
          display: flex; flex-direction: column;
          position: sticky; top: 0; height: 100vh;
        }
        .sidebar-logo {
          padding: 24px 20px 20px;
          font-family: 'Bebas Neue', sans-serif;
          font-size: 20px; letter-spacing: 2px; color: #fff;
          border-bottom: 1px solid #222;
        }
        .sidebar-logo span { color: #C9951A; }
        .sidebar-badge {
          font-size: 10px; background: #C9951A; color: #fff;
          padding: 2px 8px; border-radius: 8px;
          font-family: 'Inter', sans-serif; font-weight: 600;
          display: inline-block; margin-top: 4px;
        }
        .nav-item {
          display: flex; align-items: center; gap: 10px;
          padding: 12px 20px; cursor: pointer; transition: all .15s;
          color: #888; font-size: 13px; font-weight: 500;
          border-left: 3px solid transparent;
        }
        .nav-item:hover { background: #1A1A1A; color: #fff; }
        .nav-item.on { background: #1A1A1A; color: #C9951A; border-left-color: #C9951A; }
        .nav-badge {
          margin-left: auto; background: #E24B4A; color: #fff;
          font-size: 10px; font-weight: 700; padding: 1px 7px; border-radius: 10px;
        }
        .sidebar-footer {
          margin-top: auto; padding: 16px 20px;
          border-top: 1px solid #222;
        }
        .sidebar-footer a {
          font-size: 12px; color: #555; text-decoration: none;
          display: flex; align-items: center; gap: 6px;
        }
        .sidebar-footer a:hover { color: #888; }

        /* MAIN */
        .admin-main { flex: 1; overflow-x: hidden; }
        .admin-topbar {
          background: #fff; border-bottom: 1px solid #EDE8E0;
          padding: 14px 28px; display: flex; align-items: center;
          justify-content: space-between; position: sticky; top: 0; z-index: 20;
        }
        .topbar-title { font-family: 'Bebas Neue', sans-serif; font-size: 20px; color: #111; letter-spacing: 1px; }
        .topbar-date { font-size: 12px; color: #AAA; }
        .admin-body { padding: 28px; }

        /* STATS GRID */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 14px; margin-bottom: 28px;
        }
        @media (min-width: 1024px) { .stats-grid { grid-template-columns: repeat(4, 1fr); } }
        .stat-card {
          background: #fff; border-radius: 14px;
          padding: 18px 20px; border: 0.5px solid #EDE8E0;
        }
        .stat-label { font-size: 11px; color: #AAA; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 8px; }
        .stat-num   { font-family: 'Bebas Neue', sans-serif; font-size: 36px; letter-spacing: 1px; line-height: 1; margin-bottom: 4px; }
        .stat-sub   { font-size: 11px; color: #AAA; }
        .stat-up    { color: #0F8050; }
        .stat-warn  { color: #C9951A; }
        .stat-danger{ color: #E24B4A; }

        /* SECTION */
        .section-card { background: #fff; border-radius: 14px; border: 0.5px solid #EDE8E0; margin-bottom: 20px; overflow: hidden; }
        .section-hdr  { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 0.5px solid #F0EDE8; }
        .section-title{ font-family: 'Bebas Neue', sans-serif; font-size: 14px; color: #888; letter-spacing: 1.5px; }

        /* FILTERS */
        .filter-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .filter-btn { padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 500; cursor: pointer; border: 1px solid #E0DDD8; background: #FAFAF8; color: #666; transition: all .15s; font-family: 'Inter', sans-serif; }
        .filter-btn.on { border-color: #C9951A; background: #FEF3E2; color: #854F0B; font-weight: 600; }

        /* TABLE */
        .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .data-table th { text-align: left; padding: 10px 16px; font-size: 11px; font-weight: 600; color: #AAA; text-transform: uppercase; letter-spacing: .04em; background: #FAFAF8; border-bottom: 0.5px solid #F0EDE8; }
        .data-table td { padding: 12px 16px; border-bottom: 0.5px solid #F5F2EC; color: #333; vertical-align: middle; }
        .data-table tr:last-child td { border-bottom: none; }
        .data-table tr:hover td { background: #FAFAF8; }
        .status-badge { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 10px; }
        .action-btn { padding: 5px 12px; border-radius: 8px; font-size: 11px; font-weight: 600; cursor: pointer; border: none; font-family: 'Inter', sans-serif; margin-right: 4px; transition: opacity .15s; }
        .action-btn:hover { opacity: .8; }
        .btn-approve  { background: #EDFAF3; color: #0F8050; }
        .btn-suspend  { background: #FEF0F0; color: #E24B4A; }
        .btn-view     { background: #F0F4FF; color: #185FA5; }

        /* SEARCH TABLE */
        .search-bar-wrap { display: flex; align-items: center; gap: 8px; background: #F5F2EC; border: 1.5px solid #C9951A; border-radius: 10px; padding: 8px 14px; }
        .search-bar-wrap input { flex: 1; border: none; background: transparent; font-size: 13px; font-family: 'Inter', sans-serif; outline: none; }
        .rank-num { font-family: 'Bebas Neue', sans-serif; font-size: 20px; color: #DDD; width: 30px; }
        .rank-1 { color: #C9951A; }
        .rank-2 { color: #888; }
        .rank-3 { color: #B87333; }
        .progress-bar { height: 6px; background: #F0EDE8; border-radius: 3px; overflow: hidden; flex: 1; }
        .progress-fill { height: 100%; background: #C9951A; border-radius: 3px; }
        .no-result-badge { font-size: 10px; background: #FEF0F0; color: #E24B4A; padding: 2px 7px; border-radius: 6px; font-weight: 600; }

        /* TOAST */
        .toast {
          position: fixed; bottom: 24px; right: 24px;
          background: #111; color: #fff; padding: 12px 20px; border-radius: 12px;
          font-size: 13px; font-weight: 500; z-index: 999;
          animation: fadein .2s ease;
        }
        @keyframes fadein { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform: translateY(0); } }

        /* EMPTY */
        .empty-state { text-align: center; padding: 48px 20px; color: #AAA; }
        .empty-state div:first-child { font-size: 40px; margin-bottom: 12px; }

        /* USER BADGE */
        .user-type-badge { font-size: 10px; padding: 2px 8px; border-radius: 8px; font-weight: 600; }
        .type-user    { background: #EBF4FF; color: #185FA5; }
        .type-company { background: #FEF3E2; color: #854F0B; }
        .type-admin   { background: #111; color: #C9951A; }
      `}</style>

      {toast && <div className="toast">✓ {toast}</div>}

      <div className="admin-layout">

        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-logo">
            TRINDADE <span>ONLINE</span>
            <br/>
            <span className="sidebar-badge">ADMIN</span>
          </div>

          {[
            { id: 'dashboard', icon: '📊', label: 'Dashboard' },
            { id: 'empresas',  icon: '🏪', label: 'Empresas', badge: stats?.pending || 0 },
            { id: 'destaques', icon: '⭐', label: 'Destaques' },
            { id: 'denuncias', icon: '🚩', label: 'Denúncias', badge: repCount },

            { id: 'usuarios',  icon: '👥', label: 'Usuários' },
            { id: 'buscas',    icon: '🔍', label: 'Buscas' },
            { id: 'atividade', icon: '⚡', label: 'Atividade' },
          ].map(n => (
            <div
              key={n.id}
              className={`nav-item ${tab === n.id ? 'on' : ''}`}
              onClick={() => setTab(n.id as any)}
            >
              <span>{n.icon}</span>
              <span>{n.label}</span>
              {!!n.badge && <span className="nav-badge">{n.badge}</span>}
            </div>
          ))}

          <div className="sidebar-footer">
            <a href="/">← Ver site</a>
          </div>
        </aside>

        {/* MAIN */}
        <main className="admin-main">
          <div className="admin-topbar">
            <div className="topbar-title">
              {tab === 'dashboard' && 'Dashboard'}
              {tab === 'empresas'  && 'Gestão de Empresas'}
              {tab === 'usuarios'  && 'Usuários Cadastrados'}
              {tab === 'buscas'    && 'Analytics de Buscas'}
              {tab === 'atividade' && 'Atividade Recente'}
              {tab === 'destaques' && 'Destaques'}
              {tab === 'denuncias' && 'Denúncias'}
            </div>
            <div className="topbar-date">{new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</div>
          </div>

          <div className="admin-body">
            {loading && <div style={{ textAlign:'center', padding:'60px', color:'#AAA' }}>Carregando dados...</div>}

            {/* ── DASHBOARD ── */}
            {!loading && tab === 'dashboard' && (
              <>
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-label">Total de Usuários</div>
                    <div className="stat-num stat-up">{stats?.total_users || 0}</div>
                    <div className="stat-sub">+{stats?.users_today || 0} hoje · +{stats?.users_week || 0} essa semana</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Empresas Cadastradas</div>
                    <div className="stat-num stat-warn">{stats?.total_companies || 0}</div>
                    <div className="stat-sub">{stats?.active || 0} ativas · {stats?.pending || 0} aguardando aprovação</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Total de Buscas</div>
                    <div className="stat-num" style={{ color:'#185FA5' }}>{stats?.total_searches || 0}</div>
                    <div className="stat-sub">{stats?.searches_today || 0} hoje</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Pendentes de Aprovação</div>
                    <div className={`stat-num ${stats?.pending ? 'stat-danger' : 'stat-up'}`}>{stats?.pending || 0}</div>
                    <div className="stat-sub">{stats?.pending ? 'Requer atenção' : 'Tudo em dia ✓'}</div>
                  </div>
                </div>

                {/* Empresas pendentes no dashboard */}
                {(stats?.pending || 0) > 0 && (
                  <div className="section-card">
                    <div className="section-hdr">
                      <span className="section-title">⚠️ EMPRESAS AGUARDANDO APROVAÇÃO</span>
                      <button className="filter-btn on" onClick={() => setTab('empresas')}>Ver todas →</button>
                    </div>
                    <table className="data-table">
                      <thead><tr><th>Empresa</th><th>Responsável</th><th>Categoria</th><th>Data</th><th>Ação</th></tr></thead>
                      <tbody>
                        {companies.filter(c => c.status === 'pending').slice(0,5).map(c => (
                          <tr key={c.id}>
                            <td><strong>{c.name}</strong></td>
                            <td>{c.owner?.name || '—'}</td>
                            <td>{c.category?.emoji} {c.category?.name || '—'}</td>
                            <td>{fmtDate(c.created_at)}</td>
                            <td>
                              <button className="action-btn btn-approve" onClick={() => approveCompany(c.id)}>✓ Aprovar</button>
                              <button className="action-btn btn-suspend" onClick={() => suspendCompany(c.id)}>✗ Recusar</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Top buscas no dashboard */}
                <div className="section-card">
                  <div className="section-hdr"><span className="section-title">🔍 TOP 10 BUSCAS</span></div>
                  {searches.length === 0
                    ? <div className="empty-state"><div>🔍</div><div>Nenhuma busca registrada ainda</div></div>
                    : <table className="data-table">
                        <thead><tr><th>#</th><th>Termo</th><th>Buscas</th><th>Sem resultado</th></tr></thead>
                        <tbody>
                          {searches.slice(0,10).map((s,i) => (
                            <tr key={s.query}>
                              <td><span className={`rank-num ${i===0?'rank-1':i===1?'rank-2':i===2?'rank-3':''}`}>{i+1}</span></td>
                              <td><strong>{s.query}</strong></td>
                              <td>{s.count}</td>
                              <td>{s.no_result > 0 ? <span className="no-result-badge">{s.no_result} sem resultado</span> : <span style={{color:'#AAA'}}>—</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                  }
                </div>
              </>
            )}

            {/* ── EMPRESAS ── */}
            {!loading && tab === 'empresas' && (
              <div className="section-card">
                <div className="section-hdr">
                  <span className="section-title">EMPRESAS ({filteredCompanies.length})</span>
                  <div className="filter-row">
                    {['all','pending','active','suspended'].map(f => (
                      <button key={f} className={`filter-btn ${filterStatus===f?'on':''}`} onClick={() => setFilter(f)}>
                        {f==='all'?'Todas':f==='pending'?'Pendentes':f==='active'?'Ativas':'Suspensas'}
                        {f==='pending' && stats?.pending ? ` (${stats.pending})` : ''}
                      </button>
                    ))}
                  </div>
                </div>
                {filteredCompanies.length === 0
                  ? <div className="empty-state"><div>🏪</div><div>Nenhuma empresa encontrada</div></div>
                  : <div style={{ overflowX:'auto' }}>
                      <table className="data-table">
                        <thead><tr><th>Nome</th><th>Responsável</th><th>Categoria</th><th>Plano</th><th>Status</th><th>Data</th><th>Ações</th></tr></thead>
                        <tbody>
                          {filteredCompanies.map(c => (
                            <tr key={c.id}>
                              <td><strong>{c.name}</strong><br/><span style={{fontSize:11,color:'#AAA'}}>{c.address || '—'}</span></td>
                              <td>{c.owner?.name || '—'}</td>
                              <td>{c.category?.emoji} {c.category?.name || '—'}</td>
                              <td><span style={{fontSize:11,fontWeight:600,color:c.plan==='paid'?'#0F8050':'#AAA'}}>{c.plan==='paid'?'Pago':'Grátis'}</span></td>
                              <td>
                                <span className="status-badge" style={{ background: statusColor(c.status)+'22', color: statusColor(c.status) }}>
                                  ● {statusLabel(c.status)}
                                </span>
                              </td>
                              <td>{fmtDate(c.created_at)}</td>
                              <td>
                                {c.status === 'pending'   && <button className="action-btn btn-approve" onClick={() => approveCompany(c.id)}>✓ Aprovar</button>}
                                {c.status === 'active'    && <button className="action-btn btn-suspend" onClick={() => suspendCompany(c.id)}>Suspender</button>}
                                {c.status === 'suspended' && <button className="action-btn btn-approve" onClick={() => approveCompany(c.id)}>Reativar</button>}
                                <button className="action-btn btn-view" onClick={() => window.open(`/empresa/${c.id}`)}>Ver</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                }
              </div>
            )}

            {/* ── USUÁRIOS ── */}
            {!loading && tab === 'usuarios' && (
              <div className="section-card">
                <div className="section-hdr">
                  <span className="section-title">USUÁRIOS ({users.length})</span>
                </div>
                {users.length === 0
                  ? <div className="empty-state"><div>👥</div><div>Nenhum usuário cadastrado ainda</div></div>
                  : <div style={{ overflowX:'auto' }}>
                      <table className="data-table">
                        <thead><tr><th>Nome</th><th>Tipo</th><th>Bairro</th><th>Cadastro</th></tr></thead>
                        <tbody>
                          {users.map(u => (
                            <tr key={u.id}>
                              <td><strong>{u.name}</strong></td>
                              <td>
                                <span className={`user-type-badge type-${u.user_type}`}>
                                  {u.user_type === 'user' ? '👤 Morador' : u.user_type === 'company' ? '🏪 Lojista' : '⭐ Admin'}
                                </span>
                              </td>
                              <td>{u.neighborhood || '—'}</td>
                              <td>{fmtDate(u.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                }
              </div>
            )}

            {/* ── BUSCAS ── */}
            {!loading && tab === 'buscas' && (
              <>
                <div className="stats-grid" style={{ gridTemplateColumns:'repeat(3,1fr)' }}>
                  <div className="stat-card">
                    <div className="stat-label">Total de Buscas</div>
                    <div className="stat-num" style={{color:'#185FA5'}}>{stats?.total_searches || 0}</div>
                    <div className="stat-sub">{stats?.searches_today || 0} hoje</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Termos Únicos</div>
                    <div className="stat-num stat-warn">{searches.length}</div>
                    <div className="stat-sub">palavras distintas buscadas</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Sem Resultado</div>
                    <div className="stat-num stat-danger">{searches.filter(s=>s.no_result>0).length}</div>
                    <div className="stat-sub">termos sem empresa encontrada</div>
                  </div>
                </div>
                <div className="section-card">
                  <div className="section-hdr"><span className="section-title">RANKING DE BUSCAS</span></div>
                  {searches.length === 0
                    ? <div className="empty-state"><div>🔍</div><div>Nenhuma busca registrada ainda</div></div>
                    : <table className="data-table">
                        <thead><tr><th>#</th><th>Termo buscado</th><th>Volume</th><th>Proporção</th><th>Sem resultado</th></tr></thead>
                        <tbody>
                          {searches.map((s,i) => (
                            <tr key={s.query}>
                              <td><span className={`rank-num ${i===0?'rank-1':i===1?'rank-2':i===2?'rank-3':''}`}>{i+1}</span></td>
                              <td><strong>{s.query}</strong></td>
                              <td>{s.count} {s.count===1?'busca':'buscas'}</td>
                              <td>
                                <div style={{display:'flex',alignItems:'center',gap:8}}>
                                  <div className="progress-bar">
                                    <div className="progress-fill" style={{width:`${Math.round((s.count/searches[0].count)*100)}%`}}/>
                                  </div>
                                  <span style={{fontSize:11,color:'#AAA',width:32}}>{Math.round((s.count/searches[0].count)*100)}%</span>
                                </div>
                              </td>
                              <td>{s.no_result > 0 ? <span className="no-result-badge">⚠ {s.no_result} sem resultado</span> : <span style={{color:'#0F8050',fontSize:11}}>✓ Com resultado</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                  }
                </div>
              </>
            )}

            {/* ── ATIVIDADE ── */}


            {/* ── DENÚNCIAS ── */}
            {!loading && tab === 'denuncias' && (
              <div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
                  <span className="section-title">DENÚNCIAS ({reports.filter(r=>!r.resolved).length} pendentes)</span>
                </div>

                {reports.length === 0 && (
                  <div style={{textAlign:'center',padding:'40px 0',color:'#555',fontSize:13}}>
                    Nenhuma denúncia registrada. ✅
                  </div>
                )}

                <div style={{display:'flex',flexDirection:'column',gap:10}}>
                  {reports.map(r => (
                    <div key={r.id} style={{display:'flex',alignItems:'flex-start',gap:12,padding:'12px 14px',background: r.resolved ? '#111' : '#1A0A0A',border:`0.5px solid ${r.resolved ? '#222' : '#4A1515'}`,borderRadius:10,opacity:r.resolved?0.5:1}}>
                      <span style={{fontSize:20,flexShrink:0}}>{r.resolved ? '✅' : '🚩'}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,color:'#fff',marginBottom:3}}>
                          {r.listing?.title || 'Anúncio removido'}
                          <span style={{marginLeft:8,fontSize:10,padding:'1px 7px',borderRadius:5,background:'#222',color:'#888'}}>{r.listing?.type||'—'}</span>
                        </div>
                        <div style={{fontSize:12,color:'#E24B4A',marginBottom:4}}>"{r.reason}"</div>
                        <div style={{fontSize:11,color:'#555'}}>
                          Denunciado por: {r.reporter?.name||'—'} · {new Date(r.created_at).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                      {!r.resolved && r.listing?.status === 'active' && (
                        <div style={{display:'flex',gap:6,flexShrink:0}}>
                          <button onClick={() => deleteListingFromReport(r.listing.id, r.id)}
                            style={{padding:'5px 10px',background:'#2A0A0A',color:'#E24B4A',border:'0.5px solid #4A1515',borderRadius:7,fontSize:11,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                            Excluir
                          </button>
                          <button onClick={() => resolveReport(r.id)}
                            style={{padding:'5px 10px',background:'#0A1A0A',color:'#4CAF50',border:'0.5px solid #1A4A1A',borderRadius:7,fontSize:11,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                            Ignorar
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── DESTAQUES ── */}
            {!loading && tab === 'destaques' && (
              <div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
                  <span className="section-title">DESTAQUES ATIVOS ({highlights.length})</span>
                  <button className="filter-btn on" onClick={() => setHlFormOpen(!hlFormOpen)}>
                    {hlFormOpen ? 'Cancelar' : '+ Adicionar destaque'}
                  </button>
                </div>

                {hlFormOpen && (
                  <div style={{background:'#1A1A1A',border:'1px solid #C9951A',borderRadius:12,padding:16,marginBottom:16}}>
                    <div style={{fontSize:12,fontWeight:600,color:'#fff',marginBottom:12}}>Novo destaque</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                      <div>
                        <div style={{fontSize:10,color:'#888',marginBottom:4}}>EMPRESA</div>
                        <select style={{width:'100%',padding:'7px 10px',borderRadius:8,border:'0.5px solid #333',background:'#111',color:'#fff',fontSize:12,fontFamily:'Inter,sans-serif'}}
                          value={hlForm.company_id} onChange={e => setHlForm(f => ({...f,company_id:e.target.value}))}>
                          <option value="">Selecionar empresa...</option>
                          {companies.filter(c=>c.status==='active').map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <div style={{fontSize:10,color:'#888',marginBottom:4}}>TIPO</div>
                        <select style={{width:'100%',padding:'7px 10px',borderRadius:8,border:'0.5px solid #333',background:'#111',color:'#fff',fontSize:12,fontFamily:'Inter,sans-serif'}}
                          value={hlForm.highlight_type} onChange={e => setHlForm(f => ({...f,highlight_type:e.target.value}))}>
                          <option value="manual">Manual (gratuito)</option>
                          <option value="paid">Pago</option>
                        </select>
                      </div>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                      <div>
                        <div style={{fontSize:10,color:'#888',marginBottom:4}}>ONDE APARECE</div>
                        <select style={{width:'100%',padding:'7px 10px',borderRadius:8,border:'0.5px solid #333',background:'#111',color:'#fff',fontSize:12,fontFamily:'Inter,sans-serif'}}
                          value={hlForm.scope_type} onChange={e => setHlForm(f => ({...f,scope_type:e.target.value,scope_id:''}))}>
                          <option value="global">Em toda a home</option>
                          <option value="category">Em uma categoria</option>
                          <option value="subcategory">Em uma subcategoria</option>
                        </select>
                      </div>
                      <div>
                        <div style={{fontSize:10,color:'#888',marginBottom:4}}>
                          {hlForm.scope_type === 'category' ? 'CATEGORIA' : hlForm.scope_type === 'subcategory' ? 'SUBCATEGORIA' : 'ESCOPO'}
                        </div>
                        {hlForm.scope_type === 'category' && (
                          <select style={{width:'100%',padding:'7px 10px',borderRadius:8,border:'0.5px solid #333',background:'#111',color:'#fff',fontSize:12,fontFamily:'Inter,sans-serif'}}
                            value={hlForm.scope_id} onChange={e => setHlForm(f => ({...f,scope_id:e.target.value}))}>
                            <option value="">Selecionar...</option>
                            {catOpts.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                          </select>
                        )}
                        {hlForm.scope_type === 'subcategory' && (
                          <select style={{width:'100%',padding:'7px 10px',borderRadius:8,border:'0.5px solid #333',background:'#111',color:'#fff',fontSize:12,fontFamily:'Inter,sans-serif'}}
                            value={hlForm.scope_id} onChange={e => setHlForm(f => ({...f,scope_id:e.target.value}))}>
                            <option value="">Selecionar...</option>
                            {subcatOpts.map(s => <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}
                          </select>
                        )}
                        {hlForm.scope_type === 'global' && (
                          <div style={{padding:'7px 10px',borderRadius:8,border:'0.5px solid #333',background:'#111',color:'#555',fontSize:12}}>Aparece na home</div>
                        )}
                      </div>
                    </div>
                    <div style={{marginBottom:12}}>
                      <div style={{fontSize:10,color:'#888',marginBottom:4}}>EXPIRAÇÃO</div>
                      <select style={{padding:'7px 10px',borderRadius:8,border:'0.5px solid #333',background:'#111',color:'#fff',fontSize:12,fontFamily:'Inter,sans-serif'}}
                        value={hlForm.expires_at} onChange={e => setHlForm(f => ({...f,expires_at:e.target.value}))}>
                        <option value="">Sem expiração</option>
                        <option value="1">1 dia</option>
                        <option value="3">3 dias</option>
                        <option value="5">5 dias</option>
                        <option value="7">7 dias</option>
                        <option value="10">10 dias</option>
                        <option value="15">15 dias</option>
                        <option value="30">30 dias</option>
                        <option value="60">60 dias</option>
                        <option value="90">90 dias</option>
                      </select>
                    </div>
                    <button onClick={saveHighlight} disabled={hlLoading || !hlForm.company_id}
                      style={{padding:'9px 20px',background:'#C9951A',color:'#fff',border:'none',borderRadius:9,fontSize:13,fontWeight:600,fontFamily:'Inter,sans-serif',cursor:'pointer',opacity:(!hlForm.company_id||hlLoading)?0.6:1}}>
                      {hlLoading ? 'Salvando...' : 'Salvar destaque'}
                    </button>
                  </div>
                )}

                {highlights.length === 0 && (
                  <div style={{textAlign:'center',padding:'40px 0',color:'#555',fontSize:13}}>
                    Nenhum destaque ativo. Adicione o primeiro!
                  </div>
                )}

                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {highlights.map(h => {
                    const scopeLabel = h.scope_type === 'global' ? 'Home' :
                      h.scope_type === 'category' ? `Categoria: ${catOpts.find(c=>c.id===h.scope_id)?.name||'—'}` :
                      `Subcategoria: ${subcatOpts.find(s=>s.id===h.scope_id)?.name||'—'}`
                    return (
                      <div key={h.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',background:'#111',border:'0.5px solid #222',borderRadius:10}}>
                        <span style={{fontSize:22}}>{h.company?.category?.emoji||'🏪'}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,color:'#fff',marginBottom:3}}>{h.company?.name||'—'}</div>
                          <div style={{fontSize:11,color:'#666',display:'flex',gap:6,flexWrap:'wrap'}}>
                            <span style={{background:h.highlight_type==='paid'?'#1A3A1A':'#2A1F0A',color:h.highlight_type==='paid'?'#4CAF50':'#C9951A',padding:'1px 8px',borderRadius:5,fontWeight:600,fontSize:10}}>
                              {h.highlight_type==='paid'?'Pago':'Manual'}
                            </span>
                            <span style={{background:'#1A1F2A',color:'#7aacf0',padding:'1px 8px',borderRadius:5,fontSize:10}}>{scopeLabel}</span>
                            {h.expires_at && <span style={{color:'#555',fontSize:10}}>Expira: {new Date(h.expires_at).toLocaleDateString('pt-BR')}</span>}
                          </div>
                        </div>
                        <button onClick={() => removeHighlight(h.id)}
                          style={{padding:'5px 10px',background:'#2A0A0A',color:'#E24B4A',border:'0.5px solid #4A1515',borderRadius:7,fontSize:11,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                          Remover
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {!loading && tab === 'atividade' && (
              <div className="section-card">
                <div className="section-hdr"><span className="section-title">CADASTROS RECENTES</span></div>
                <table className="data-table">
                  <thead><tr><th>Tipo</th><th>Nome</th><th>Detalhes</th><th>Data</th></tr></thead>
                  <tbody>
                    {[
                      ...companies.slice(0,10).map(c => ({ tipo:'empresa', nome:c.name, detalhe:`${c.category?.emoji||''} ${c.category?.name||'—'} · ${statusLabel(c.status)}`, date:c.created_at })),
                      ...users.filter(u=>u.user_type!=='admin').slice(0,10).map(u => ({ tipo:'usuario', nome:u.name, detalhe:`${u.user_type==='company'?'🏪 Lojista':'👤 Morador'} · ${u.neighborhood||'—'}`, date:u.created_at }))
                    ].sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime()).slice(0,20).map((item,i) => (
                      <tr key={i}>
                        <td><span className={`user-type-badge ${item.tipo==='empresa'?'type-company':'type-user'}`}>{item.tipo==='empresa'?'🏪 Empresa':'👤 Usuário'}</span></td>
                        <td><strong>{item.nome}</strong></td>
                        <td style={{color:'#888',fontSize:12}}>{item.detalhe}</td>
                        <td>{fmtDate(item.date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        </main>
      </div>
    </>
  )
}