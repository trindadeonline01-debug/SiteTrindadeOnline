'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Screen = 'loading' | 'auth' | 'needs_register' | 'pending' | 'clients' | 'admin' | 'calendar'
type TeamRow = {
  id: string; user_id: string; name: string; email: string; phone: string | null
  status: 'convidado' | 'ativo'; role: 'admin' | 'member'; invited_at: string; joined_at: string | null
}
type Client = { id: string; name: string; address: string | null; notes: string | null }
type VideoStatus = 'a_gravar' | 'gravado' | 'editado' | 'publicado'
type Task = {
  id: string; client_id: string; title: string; scheduled_at: string
  video_num: number | null; item_type: 'normal' | 'holiday' | 'special' | 'encerramento' | 'recess'
  segment: string | null; pillar: string | null; gancho: string | null; obs: string | null
  notes: string | null; video_status: VideoStatus
}

const SEG_SHORT: Record<string, string> = {
  'Educação Infantil': 'Infantil', 'Fundamental I (1º ao 5º ano)': 'Fund. I',
  'Fundamental II (6º ao 9º ano)': 'Fund. II', 'Ensino Médio': 'Ens. Médio',
  'Institucional / Geral': 'Institucional', 'Institucional / Geral (banco de conteúdo)': 'Institucional',
}
const SEG_COLOR: Record<string, { bg: string; fg: string; bar: string }> = {
  'Educação Infantil': { bg: '#FDEBD0', fg: '#8A5A00', bar: '#E5A93B' },
  'Fundamental I (1º ao 5º ano)': { bg: '#D6EAF8', fg: '#1A5A8A', bar: '#2E86C1' },
  'Fundamental II (6º ao 9º ano)': { bg: '#D5F5E3', fg: '#1D6A45', bar: '#2FA867' },
  'Ensino Médio': { bg: '#FCF3CF', fg: '#7A5E00', bar: '#D4AC0D' },
  'Institucional / Geral': { bg: '#E8DAEF', fg: '#5B2C77', bar: '#8E44AD' },
  'Institucional / Geral (banco de conteúdo)': { bg: '#ECEBE6', fg: '#5B5B63', bar: '#9C978A' },
}
const STATUSES: { key: VideoStatus; label: string; color: string; bg: string }[] = [
  { key: 'a_gravar', label: 'A gravar', color: '#B9791A', bg: '#FBEBD3' },
  { key: 'gravado', label: 'Gravado', color: '#2451B4', bg: '#D6EAF8' },
  { key: 'editado', label: 'Editado', color: '#8E44AD', bg: '#E8DAEF' },
  { key: 'publicado', label: 'Publicado', color: '#2E7D4F', bg: '#D5F5E3' },
]
function statusOf(k: VideoStatus) { return STATUSES.find(s => s.key === k) || STATUSES[0] }

function weekKey(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay()
  const monday = new Date(d); monday.setDate(d.getDate() - ((day + 6) % 7))
  return monday.toISOString().slice(0, 10)
}
function weekLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay()
  const monday = new Date(d); monday.setDate(d.getDate() - ((day + 6) % 7))
  const friday = new Date(monday); friday.setDate(monday.getDate() + 4)
  const fmt = (x: Date) => x.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return `Semana de ${fmt(monday)} a ${fmt(friday)}`
}
function initialsOf(name: string): string {
  return (name || '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

const TODAY_KEY = new Date().toISOString().slice(0, 10)

export default function ProducaoPage() {
  const [screen, setScreen] = useState<Screen>('loading')
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [authName, setAuthName] = useState(''); const [authEmail, setAuthEmail] = useState(''); const [authPass, setAuthPass] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const [teamRow, setTeamRow] = useState<TeamRow | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [filterSeg, setFilterSeg] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [openCardId, setOpenCardId] = useState<string | null>(null)

  const [showNewClient, setShowNewClient] = useState(false)
  const [ncName, setNcName] = useState(''); const [ncAddress, setNcAddress] = useState(''); const [ncSaving, setNcSaving] = useState(false)

  const [adminTeam, setAdminTeam] = useState<TeamRow[]>([])
  const [approvingId, setApprovingId] = useState<string | null>(null)

  const noteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    init()
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) { setScreen('auth'); setTeamRow(null) }
    })
    return () => { sub.subscription.unsubscribe() }
  }, [])

  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setScreen('auth'); return }
    await loadTeamRow()
  }

  async function loadTeamRow() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setScreen('auth'); return }
    const { data } = await supabase.from('production_team').select('*').eq('user_id', session.user.id).maybeSingle()
    const row = (data as TeamRow) || null
    setTeamRow(row)
    if (!row) { setScreen('needs_register'); return }
    if (row.status !== 'ativo') { setScreen('pending'); return }
    setScreen('clients')
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    if (authPass.length < 6) { setErrorMsg('A senha precisa ter pelo menos 6 caracteres.'); return }
    setBusy(true)
    const { data, error } = await supabase.auth.signUp({ email: authEmail.trim(), password: authPass })
    if (error) { setBusy(false); setErrorMsg(error.message); return }
    if (data.user) {
      await supabase.from('production_team').insert({ user_id: data.user.id, name: authName.trim() || authEmail.split('@')[0], email: authEmail.trim() })
    }
    setBusy(false)
    await loadTeamRow()
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPass })
    setBusy(false)
    if (error) { setErrorMsg('Email ou senha incorretos.'); return }
    await loadTeamRow()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setTeamRow(null); setScreen('auth'); setAuthEmail(''); setAuthPass(''); setAuthName('')
  }

  async function handleNeedsRegisterSubmit(e: React.FormEvent) {
    e.preventDefault()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    setBusy(true)
    await supabase.from('production_team').insert({ user_id: session.user.id, name: authName.trim() || session.user.email!.split('@')[0], email: session.user.email })
    setBusy(false)
    await loadTeamRow()
  }

  async function goClients() {
    setScreen('clients')
    const { data } = await supabase.from('production_clients').select('*').order('name')
    setClients((data as Client[]) || [])
  }
  useEffect(() => { if (screen === 'clients') goClients() }, [screen])

  async function openClient(c: Client) {
    setSelectedClient(c); setFilterSeg('all'); setFilterStatus('all'); setOpenCardId(null)
    setScreen('calendar')
  }

  async function loadTasks(clientId: string) {
    const { data } = await supabase.from('production_tasks').select('*')
      .eq('client_id', clientId).order('video_num', { ascending: true, nullsFirst: false }).order('scheduled_at')
    setTasks((data as Task[]) || [])
  }

  useEffect(() => {
    if (screen !== 'calendar' || !selectedClient) return
    loadTasks(selectedClient.id)
    const channel = supabase.channel('tasks-' + selectedClient.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_tasks', filter: `client_id=eq.${selectedClient.id}` },
        () => loadTasks(selectedClient.id))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [screen, selectedClient])

  async function createClient(e: React.FormEvent) {
    e.preventDefault()
    if (!ncName.trim()) return
    setNcSaving(true)
    await supabase.from('production_clients').insert({ name: ncName.trim(), address: ncAddress.trim() || null })
    setNcSaving(false); setShowNewClient(false); setNcName(''); setNcAddress('')
    goClients()
  }

  async function openAdmin() {
    setScreen('admin')
    const { data } = await supabase.from('production_team').select('*').order('status').order('name')
    setAdminTeam((data as TeamRow[]) || [])
  }

  async function approveMember(id: string) {
    setApprovingId(id)
    await supabase.from('production_team').update({ status: 'ativo', joined_at: new Date().toISOString() }).eq('id', id)
    setApprovingId(null)
    openAdmin()
  }

  async function setVideoStatus(taskId: string, status: VideoStatus) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, video_status: status } : t))
    await supabase.from('production_tasks').update({ video_status: status }).eq('id', taskId)
  }

  function onNotesChange(taskId: string, value: string) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, notes: value } : t))
    clearTimeout(noteTimers.current[taskId])
    noteTimers.current[taskId] = setTimeout(() => {
      supabase.from('production_tasks').update({ notes: value }).eq('id', taskId)
    }, 500)
  }

  const isAdmin = teamRow?.role === 'admin'

  // ---- filtered / grouped tasks for calendar ----
  const filtered = tasks.filter(t => {
    if (t.item_type === 'holiday') return true
    if (filterSeg !== 'all' && t.segment !== filterSeg) return false
    if (filterStatus !== 'all' && t.video_status !== filterStatus) return false
    return true
  })
  const weeks: Record<string, Task[]> = {}
  filtered.forEach(t => {
    const dateStr = t.scheduled_at.slice(0, 10)
    const wk = weekKey(dateStr)
    if (!weeks[wk]) weeks[wk] = []
    weeks[wk].push(t)
  })
  const weekKeys = Object.keys(weeks).sort()
  const segs = [...new Set(tasks.filter(t => t.item_type !== 'holiday' && t.segment).map(t => t.segment as string))]
  const actionable = tasks.filter(t => t.video_num != null)
  const doneCount = actionable.filter(t => t.video_status === 'publicado').length
  const inProgressCount = actionable.filter(t => t.video_status === 'gravado' || t.video_status === 'editado').length
  const totalCount = actionable.length
  const progressPct = totalCount ? (doneCount / totalCount) * 100 : 0

  return (
    <>
      <style>{`
        :root{ --paper:#F7F4EC; --ink:#1B1B1F; --ink-soft:#5B5B63; --navy:#17306E; --blue:#2451B4; --gold:#C79A2B; --card:#FFFFFF; --line:#E3DFD3; --radius:14px; --danger:#C0392B; }
        .pr-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
        .pr-root{min-height:100vh;background:var(--paper);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;padding-bottom:env(safe-area-inset-bottom);}
        .pr-wrap{max-width:640px;margin:0 auto;padding:0 16px 100px;}
        .pr-center{max-width:400px;margin:0 auto;padding:60px 20px;}
        .pr-top{background:var(--navy);color:#fff;padding:calc(12px + env(safe-area-inset-top)) 16px 14px;border-radius:0 0 16px 16px;position:sticky;top:0;z-index:30;box-shadow:0 6px 18px rgba(23,48,110,.22);display:flex;align-items:center;justify-content:space-between;gap:10px;}
        .pr-brand{display:flex;align-items:center;gap:8px;cursor:pointer;}
        .pr-top h1{margin:0;font-size:16px;font-weight:700;}
        .pr-top p{margin:0;font-size:10.5px;color:#B9C6EA;}
        .pr-icon-btn{background:rgba(255,255,255,.14);border:none;color:#fff;border-radius:9px;padding:8px 11px;font-size:12px;font-weight:700;cursor:pointer;}
        .pr-title{font-size:19px;font-weight:700;color:var(--navy);margin:20px 0 4px;}
        .pr-sub{font-size:13px;color:var(--ink-soft);margin:0 0 16px;}
        .pr-card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:22px;}
        .pr-logo{font-size:28px;text-align:center;margin-bottom:4px;}
        .pr-atitle{text-align:center;font-size:19px;font-weight:800;color:var(--navy);margin-bottom:2px;}
        .pr-asub{text-align:center;font-size:12.5px;color:var(--ink-soft);margin-bottom:20px;}
        .pr-root label{font-size:12.5px;font-weight:700;color:var(--ink-soft);display:block;margin:12px 0 5px;}
        .pr-root input{width:100%;padding:12px 13px;border-radius:10px;border:1px solid var(--line);font-size:16px;background:#fff;color:var(--ink);font-family:inherit;}
        .pr-btn{width:100%;padding:13px;border-radius:11px;border:none;font-size:14.5px;font-weight:700;cursor:pointer;margin-top:18px;font-family:inherit;}
        .pr-btn:disabled{opacity:.6;}
        .pr-btn-primary{background:var(--navy);color:#fff;}
        .pr-btn-secondary{background:var(--card);color:var(--navy);border:1px solid var(--line);}
        .pr-btn-sm{padding:8px 12px;font-size:12.5px;width:auto;margin-top:0;}
        .pr-toggle{text-align:center;margin-top:14px;font-size:13px;color:var(--blue);cursor:pointer;font-weight:600;background:none;border:none;width:100%;font-family:inherit;}
        .pr-error{background:#FBE1DE;color:var(--danger);border-radius:9px;padding:10px 12px;font-size:12.5px;margin-top:12px;}
        .pr-pending{text-align:center;padding:40px 20px;}
        .pr-pending .emoji{font-size:44px;margin-bottom:10px;}
        .pr-pending h2{font-size:18px;color:var(--navy);margin-bottom:8px;}
        .pr-pending p{font-size:13.5px;color:var(--ink-soft);line-height:1.5;}
        .pr-client-card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:16px;margin-bottom:10px;cursor:pointer;display:flex;align-items:center;gap:12px;}
        .pr-client-avatar{width:46px;height:46px;border-radius:11px;background:var(--navy);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:17px;flex:0 0 46px;}
        .pr-client-name{font-size:15.5px;font-weight:700;}
        .pr-client-address{font-size:12px;color:var(--ink-soft);margin-top:2px;}
        .pr-fab{position:fixed;right:16px;bottom:calc(18px + env(safe-area-inset-bottom));z-index:40;background:var(--gold);color:#3A2900;border:none;padding:14px 18px;border-radius:26px;font-size:14px;font-weight:800;box-shadow:0 6px 16px rgba(0,0,0,.25);cursor:pointer;}
        .pr-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:50;display:flex;align-items:flex-end;justify-content:center;}
        @media(min-width:600px){.pr-modal-overlay{align-items:center;}}
        .pr-modal{background:#fff;border-radius:16px 16px 0 0;padding:22px;width:100%;max-width:420px;}
        @media(min-width:600px){.pr-modal{border-radius:16px;}}
        .pr-pending-user{background:#FBEBD3;border:1px solid #E9CE84;border-radius:var(--radius);padding:13px 14px;margin-bottom:9px;display:flex;align-items:center;gap:10px;}
        .pr-team-card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:12px 14px;margin-bottom:8px;display:flex;align-items:center;gap:10px;}
        .pr-role-tag{font-size:10px;font-weight:800;padding:3px 8px;border-radius:7px;text-transform:uppercase;}
        .pr-role-admin{background:#E8DAEF;color:#5B2C77;}
        .pr-role-member{background:#D6EAF8;color:#1A5A8A;}
        .pr-progress-track{margin:12px 0 4px;height:9px;border-radius:6px;background:var(--line);overflow:hidden;}
        .pr-progress-fill{height:100%;background:linear-gradient(90deg,#7FA0EA,var(--gold));transition:width .4s;}
        .pr-progress-caption{font-size:11.5px;color:var(--ink-soft);margin-bottom:14px;}
        .pr-filters{display:flex;gap:6px;overflow-x:auto;padding-bottom:8px;-webkit-overflow-scrolling:touch;}
        .pr-filters::-webkit-scrollbar{display:none;}
        .pr-chip{flex:0 0 auto;font-size:12.5px;font-weight:600;padding:8px 12px;border-radius:20px;background:var(--card);border:1px solid var(--line);color:var(--ink-soft);cursor:pointer;white-space:nowrap;}
        .pr-chip.active{background:var(--blue);border-color:var(--blue);color:#fff;}
        .pr-week-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--gold);margin:18px 0 8px 2px;}
        .pr-tcard{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);margin-bottom:11px;overflow:hidden;display:flex;align-items:stretch;}
        .pr-tcard.today{box-shadow:0 0 0 2.5px var(--gold);}
        .pr-tcard.holiday{opacity:.65;}
        .pr-square{flex:0 0 70px;width:70px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:9px 4px;text-align:center;color:#fff;}
        .pr-square .vid-label{font-size:8px;letter-spacing:.09em;opacity:.85;text-transform:uppercase;font-weight:700;}
        .pr-square .vid-num{font-size:22px;font-weight:800;line-height:1.05;margin-top:1px;}
        .pr-square .sep{width:56%;height:1px;background:rgba(255,255,255,.4);margin:6px 0;}
        .pr-square .day-num{font-size:23px;font-weight:800;line-height:1;}
        .pr-square .day-month{font-size:9.5px;font-weight:800;text-transform:uppercase;opacity:.92;}
        .pr-square .day-weekday{font-size:8.5px;opacity:.85;margin-top:2px;text-transform:uppercase;}
        .pr-tbody{flex:1;min-width:0;padding:12px 13px;}
        .pr-ttop{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;cursor:pointer;min-height:40px;}
        .pr-seg-tag{display:inline-block;font-size:10.5px;font-weight:700;padding:4px 8px;border-radius:8px;}
        .pr-theme{font-size:14.5px;font-weight:600;margin-top:6px;line-height:1.35;}
        .pr-gancho{font-size:11.5px;color:var(--gold);font-weight:700;margin-top:4px;}
        .pr-status-badge{font-size:11.5px;font-weight:700;padding:8px 11px;border-radius:9px;border:none;cursor:pointer;white-space:nowrap;flex:0 0 auto;font-family:inherit;}
        .pr-details{margin-top:10px;padding-top:10px;border-top:1px dashed var(--line);}
        .pr-details textarea{width:100%;min-height:50px;border-radius:9px;border:1px dashed #D8D3C2;padding:8px 9px;font-size:14.5px;font-family:inherit;resize:vertical;background:rgba(0,0,0,.02);color:var(--ink);}
        .pr-details .obs{font-size:12.5px;color:var(--ink-soft);margin-bottom:8px;line-height:1.4;}
        .pr-status-picker{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;}
        .pr-status-opt{font-size:12.5px;font-weight:600;padding:10px 8px;border-radius:10px;border:1px solid var(--line);background:var(--card);cursor:pointer;text-align:center;font-family:inherit;}
        .pr-empty{text-align:center;padding:30px 10px;color:var(--ink-soft);font-size:13.5px;}
        .pr-loading{text-align:center;padding:40px 10px;color:var(--ink-soft);font-size:13.5px;}
        .pr-live-dot{width:7px;height:7px;border-radius:50%;background:#4E8B63;display:inline-block;margin-right:5px;animation:pr-pulse 1.8s infinite;}
        @keyframes pr-pulse{0%,100%{opacity:1;}50%{opacity:.3;}}
      `}</style>

      <div className="pr-root">
        {screen === 'loading' && <div className="pr-loading">Carregando...</div>}

        {screen === 'auth' && (
          <div className="pr-center">
            <div className="pr-card">
              <div className="pr-logo">🎬</div>
              <div className="pr-atitle">Agenda de Produção</div>
              <div className="pr-asub">{authMode === 'login' ? 'Entre com sua conta' : 'Crie sua conta pra solicitar acesso'}</div>
              <form onSubmit={authMode === 'login' ? handleLogin : handleSignup}>
                {authMode === 'signup' && (<><label>Nome</label><input type="text" value={authName} onChange={e => setAuthName(e.target.value)} placeholder="Seu nome" /></>)}
                <label>E-mail</label>
                <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="voce@email.com" required />
                <label>Senha</label>
                <input type="password" value={authPass} onChange={e => setAuthPass(e.target.value)} placeholder="••••••••" required />
                <button type="submit" className="pr-btn pr-btn-primary" disabled={busy}>{busy ? '...' : authMode === 'login' ? 'Entrar' : 'Criar conta'}</button>
              </form>
              {errorMsg && <div className="pr-error">{errorMsg}</div>}
              <button className="pr-toggle" onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setErrorMsg('') }}>
                {authMode === 'login' ? 'Não tem conta? Criar uma' : 'Já tem conta? Entrar'}
              </button>
            </div>
          </div>
        )}

        {screen === 'needs_register' && (
          <div className="pr-center">
            <div className="pr-card">
              <div className="pr-logo">👋</div>
              <div className="pr-atitle">Falta um passo</div>
              <div className="pr-asub">Confirme seu nome pra solicitar acesso</div>
              <form onSubmit={handleNeedsRegisterSubmit}>
                <label>Nome</label>
                <input type="text" value={authName} onChange={e => setAuthName(e.target.value)} placeholder="Seu nome" />
                <button type="submit" className="pr-btn pr-btn-primary" disabled={busy}>{busy ? '...' : 'Solicitar acesso'}</button>
              </form>
              <button className="pr-btn pr-btn-secondary" onClick={handleLogout}>Sair</button>
            </div>
          </div>
        )}

        {screen === 'pending' && (
          <div className="pr-wrap">
            <header className="pr-top">
              <div className="pr-brand"><div><h1>Agenda de Produção</h1></div></div>
              <button className="pr-icon-btn" onClick={handleLogout}>Sair</button>
            </header>
            <div className="pr-pending">
              <div className="emoji">⏳</div>
              <h2>Aguardando aprovação</h2>
              <p>Sua conta ({teamRow?.email}) foi criada, mas ainda precisa ser liberada por um administrador. Assim que aprovarem, você verá os clientes automaticamente.</p>
              <button className="pr-btn pr-btn-secondary" style={{ marginTop: 20 }} onClick={loadTeamRow}>Verificar novamente</button>
            </div>
          </div>
        )}

        {screen === 'clients' && (
          <div className="pr-wrap">
            <header className="pr-top">
              <div className="pr-brand"><div><h1>Agenda de Produção</h1><p>Olá, {teamRow?.name}</p></div></div>
              <div style={{ display: 'flex', gap: 6 }}>
                {isAdmin && <button className="pr-icon-btn" onClick={openAdmin}>👥 Equipe</button>}
                <button className="pr-icon-btn" onClick={handleLogout}>Sair</button>
              </div>
            </header>
            <div className="pr-title">Clientes</div>
            <div className="pr-sub">Escolha um cliente pra ver o calendário de conteúdo.</div>
            {clients.length === 0 && <div className="pr-empty">Nenhum cliente cadastrado ainda.</div>}
            {clients.map(c => (
              <div key={c.id} className="pr-client-card" onClick={() => openClient(c)}>
                <div className="pr-client-avatar">{initialsOf(c.name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="pr-client-name">{c.name}</div>
                  {c.address && <div className="pr-client-address">{c.address}</div>}
                </div>
                <div style={{ color: 'var(--ink-soft)', fontSize: 18 }}>›</div>
              </div>
            ))}
            {isAdmin && <button className="pr-fab" onClick={() => setShowNewClient(true)}>+ Cliente</button>}
          </div>
        )}

        {showNewClient && (
          <div className="pr-modal-overlay" onClick={() => setShowNewClient(false)}>
            <div className="pr-modal" onClick={e => e.stopPropagation()}>
              <div className="pr-atitle" style={{ textAlign: 'left' }}>Novo cliente</div>
              <form onSubmit={createClient}>
                <label>Nome</label>
                <input type="text" value={ncName} onChange={e => setNcName(e.target.value)} required />
                <label>Endereço (opcional)</label>
                <input type="text" value={ncAddress} onChange={e => setNcAddress(e.target.value)} />
                <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                  <button type="button" className="pr-btn pr-btn-secondary" style={{ marginTop: 0 }} onClick={() => setShowNewClient(false)}>Cancelar</button>
                  <button type="submit" className="pr-btn pr-btn-primary" style={{ marginTop: 0 }} disabled={ncSaving}>{ncSaving ? '...' : 'Criar'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {screen === 'admin' && (
          <div className="pr-wrap">
            <header className="pr-top">
              <div className="pr-brand" onClick={() => setScreen('clients')}><div><h1>Equipe</h1><p>Aprovação e permissões</p></div></div>
              <button className="pr-icon-btn" onClick={() => setScreen('clients')}>← Clientes</button>
            </header>
            {adminTeam.filter(t => t.status !== 'ativo').length > 0 && (
              <>
                <div className="pr-title">Aguardando aprovação ({adminTeam.filter(t => t.status !== 'ativo').length})</div>
                {adminTeam.filter(t => t.status !== 'ativo').map(p => (
                  <div key={p.id} className="pr-pending-user">
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{p.email}</div>
                    </div>
                    <button className="pr-btn pr-btn-primary pr-btn-sm" disabled={approvingId === p.id} onClick={() => approveMember(p.id)}>
                      {approvingId === p.id ? '...' : 'Aprovar'}
                    </button>
                  </div>
                ))}
              </>
            )}
            <div className="pr-title">Equipe ativa</div>
            {adminTeam.filter(t => t.status === 'ativo').map(m => (
              <div key={m.id} className="pr-team-card">
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{m.email}</div>
                </div>
                <span className={`pr-role-tag ${m.role === 'admin' ? 'pr-role-admin' : 'pr-role-member'}`}>{m.role === 'admin' ? 'Admin' : 'Membro'}</span>
              </div>
            ))}
          </div>
        )}

        {screen === 'calendar' && selectedClient && (
          <div className="pr-wrap">
            <header className="pr-top">
              <div className="pr-brand" onClick={() => setScreen('clients')}>
                <div><h1>{selectedClient.name}</h1><p><span className="pr-live-dot" />ao vivo</p></div>
              </div>
              <button className="pr-icon-btn" onClick={() => setScreen('clients')}>← Clientes</button>
            </header>

            <div className="pr-progress-track"><div className="pr-progress-fill" style={{ width: progressPct + '%' }} /></div>
            <div className="pr-progress-caption">{doneCount} publicados · {inProgressCount} em produção · {totalCount - doneCount - inProgressCount} a gravar</div>

            <div className="pr-filters">
              <div className={`pr-chip ${filterSeg === 'all' ? 'active' : ''}`} onClick={() => setFilterSeg('all')}>Todas as turmas</div>
              {segs.map(s => (
                <div key={s} className={`pr-chip ${filterSeg === s ? 'active' : ''}`} onClick={() => setFilterSeg(s)}>{SEG_SHORT[s] || s}</div>
              ))}
            </div>
            <div className="pr-filters">
              <div className={`pr-chip ${filterStatus === 'all' ? 'active' : ''}`} onClick={() => setFilterStatus('all')}>Todos os status</div>
              {STATUSES.map(s => (
                <div key={s.key} className={`pr-chip ${filterStatus === s.key ? 'active' : ''}`} onClick={() => setFilterStatus(s.key)}>{s.label}</div>
              ))}
            </div>

            {filtered.length === 0 && <div className="pr-empty">Nenhum vídeo encontrado com esses filtros.</div>}
            {weekKeys.map(wk => (
              <div key={wk}>
                <div className="pr-week-title">{weekLabel(weeks[wk][0].scheduled_at.slice(0, 10))}</div>
                {weeks[wk].map(t => {
                  const isHoliday = t.item_type === 'holiday'
                  const dateStr = t.scheduled_at.slice(0, 10)
                  const isToday = dateStr === TODAY_KEY
                  const segColor = (t.segment && SEG_COLOR[t.segment]) || { bg: '#eee', fg: '#555', bar: '#999' }
                  const st = statusOf(t.video_status)
                  const d = new Date(dateStr + 'T00:00:00')
                  const dayNum = d.toLocaleDateString('pt-BR', { day: '2-digit' })
                  const monthAbbr = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
                  const weekdayAbbr = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
                  const open = openCardId === t.id
                  return (
                    <div key={t.id} className={`pr-tcard ${isHoliday ? 'holiday' : ''} ${isToday ? 'today' : ''}`}>
                      <div className="pr-square" style={{ background: isHoliday ? '#B9B4A4' : segColor.bar }}>
                        {isHoliday ? (
                          <>
                            <div className="day-num">{dayNum}</div>
                            <div className="day-month">{monthAbbr}</div>
                            <div className="day-weekday">Feriado</div>
                          </>
                        ) : (
                          <>
                            <div className="vid-label">Vídeo</div>
                            <div className="vid-num">{String(t.video_num).padStart(2, '0')}</div>
                            <div className="sep" />
                            <div className="day-num">{dayNum}</div>
                            <div className="day-month">{monthAbbr}</div>
                            <div className="day-weekday">{weekdayAbbr}</div>
                          </>
                        )}
                      </div>
                      <div className="pr-tbody">
                        <div className="pr-ttop" onClick={() => !isHoliday && setOpenCardId(open ? null : t.id)}>
                          <div>
                            {!isHoliday && t.segment && <span className="pr-seg-tag" style={{ background: segColor.bg, color: segColor.fg }}>{SEG_SHORT[t.segment] || t.segment}</span>}
                            <div className="pr-theme">{t.title}</div>
                            {t.gancho && <div className="pr-gancho">✦ {t.gancho}</div>}
                          </div>
                          {!isHoliday && <button className="pr-status-badge" style={{ background: st.bg, color: st.color }}>{st.label}</button>}
                        </div>
                        {!isHoliday && open && (
                          <div className="pr-details">
                            {t.obs && <div className="obs">{t.obs}</div>}
                            <div className="pr-status-picker">
                              {STATUSES.map(s => (
                                <div key={s.key} className="pr-status-opt"
                                  style={t.video_status === s.key ? { background: s.bg, color: s.color, borderColor: s.color } : {}}
                                  onClick={(e) => { e.stopPropagation(); setVideoStatus(t.id, s.key) }}>
                                  {s.label}
                                </div>
                              ))}
                            </div>
                            <textarea placeholder="Anotações..." value={t.notes || ''} onClick={e => e.stopPropagation()}
                              onChange={e => onNotesChange(t.id, e.target.value)} />
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
