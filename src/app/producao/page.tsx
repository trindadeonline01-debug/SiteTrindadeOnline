'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Screen = 'loading' | 'auth' | 'needs_register' | 'pending' | 'home' | 'team' | 'client'
type TeamRow = {
  id: string; user_id: string; name: string; email: string; phone: string | null
  status: 'convidado' | 'ativo'; role: 'admin' | 'member'; invited_at: string; joined_at: string | null
}
type Client = { id: string; name: string; address: string | null; notes: string | null }
type Folder = { id: string; client_id: string; name: string; date: string; archived: boolean }
type VideoStatus = 'a_gravar' | 'gravado' | 'editado' | 'postado'
type Task = {
  id: string; folder_id: string; client_id: string; title: string; scheduled_at: string
  assigned_to: string | null; video_status: VideoStatus; reference_link: string | null; notes: string | null
}

const STATUSES: { key: VideoStatus; label: string; color: string; bg: string }[] = [
  { key: 'a_gravar', label: 'A gravar', color: '#B9791A', bg: '#FBEBD3' },
  { key: 'gravado', label: 'Gravado', color: '#2451B4', bg: '#D6EAF8' },
  { key: 'editado', label: 'Editado', color: '#8E44AD', bg: '#E8DAEF' },
  { key: 'postado', label: 'Postado', color: '#2E7D4F', bg: '#D5F5E3' },
]
function statusOf(k: VideoStatus) { return STATUSES.find(s => s.key === k) || STATUSES[0] }

const TYPE_PALETTE = ['#8A5A2E', '#1D6A6A', '#5B4A8A', '#A23B3B', '#3A6B35', '#7A4A66', '#3F6FA8']
const TYPE_ICON_RULES: [RegExp, string][] = [
  [/foto/i, '📷'], [/360/i, '🌀'], [/corte/i, '✂️'], [/venda/i, '📣'],
  [/depoimento/i, '🗣️'], [/bastidor/i, '🎬'], [/turma|aula|sala/i, '🎒'], [/convite|teaser/i, '✨'],
]
function typeColor(label: string): string {
  let h = 0; for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0
  return TYPE_PALETTE[h % TYPE_PALETTE.length]
}
function typeIcon(label: string): string {
  const hit = TYPE_ICON_RULES.find(([re]) => re.test(label))
  return hit ? hit[1] : '🎥'
}
function initialsOf(name: string): string {
  return (name || '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}
function todayIso(): string { return new Date().toISOString().slice(0, 10) }
function isOverdue(t: { video_status: VideoStatus; scheduled_at: string }): boolean {
  return t.video_status !== 'postado' && t.scheduled_at.slice(0, 10) < todayIso()
}
function weekLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
}

export default function ProducaoPage() {
  const [screen, setScreen] = useState<Screen>('loading')
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [authName, setAuthName] = useState(''); const [authEmail, setAuthEmail] = useState(''); const [authPass, setAuthPass] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const [teamRow, setTeamRow] = useState<TeamRow | null>(null)
  const isAdmin = teamRow?.role === 'admin'

  const [clients, setClients] = useState<Client[]>([])
  const [activeFolderCount, setActiveFolderCount] = useState<Record<string, number>>({})
  const [currentClient, setCurrentClient] = useState<Client | null>(null)
  const [clientView, setClientView] = useState<'pastas' | 'calendario'>('pastas')

  const [folderFilter, setFolderFilter] = useState<'active' | 'archived'>('active')
  const [folders, setFolders] = useState<Folder[]>([])
  const [currentFolder, setCurrentFolder] = useState<Folder | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])

  const [team, setTeam] = useState<TeamRow[]>([])
  const [approvingId, setApprovingId] = useState<string | null>(null)

  const [showNewClient, setShowNewClient] = useState(false)
  const [ncName, setNcName] = useState(''); const [ncAddress, setNcAddress] = useState(''); const [ncSaving, setNcSaving] = useState(false)

  const [showNewFolder, setShowNewFolder] = useState(false)
  const [nfName, setNfName] = useState(''); const [nfDate, setNfDate] = useState(''); const [nfSaving, setNfSaving] = useState(false)

  const [showInvite, setShowInvite] = useState(false)
  const [invName, setInvName] = useState(''); const [invEmail, setInvEmail] = useState(''); const [invPhone, setInvPhone] = useState('')
  const [invSaving, setInvSaving] = useState(false); const [invError, setInvError] = useState('')

  const [monthCursor, setMonthCursor] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const [calTasks, setCalTasks] = useState<(Task & { folderName: string })[]>([])
  const [selectedDay, setSelectedDay] = useState(todayIso())

  const notesTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const refTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    init()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
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
    let row = data as TeamRow | null
    if (!row) { setScreen('needs_register'); return }
    if (row.status !== 'ativo') { setTeamRow(row); setScreen('pending'); return }
    if (!row.joined_at) {
      await supabase.from('production_team').update({ joined_at: new Date().toISOString() }).eq('id', row.id)
      row = { ...row, joined_at: new Date().toISOString() }
    }
    setTeamRow(row)
    setScreen('home')
  }

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(''); setBusy(true)
    if (authMode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email: authEmail.trim(), password: authPass })
      if (error) { setBusy(false); setErrorMsg(error.message); return }
      if (data.user) await supabase.from('production_team').insert({ user_id: data.user.id, name: authName.trim() || authEmail.split('@')[0], email: authEmail.trim() })
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPass })
      if (error) { setBusy(false); setErrorMsg('Email ou senha incorretos.'); return }
    }
    setBusy(false)
    await loadTeamRow()
  }

  async function handleNeedsRegister(e: React.FormEvent) {
    e.preventDefault()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    setBusy(true)
    await supabase.from('production_team').insert({ user_id: session.user.id, name: authName.trim() || session.user.email!.split('@')[0], email: session.user.email })
    setBusy(false)
    await loadTeamRow()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setTeamRow(null); setScreen('auth'); setAuthEmail(''); setAuthPass(''); setAuthName('')
  }

  // ---- HOME: clientes ----
  async function goHome() {
    setCurrentClient(null); setCurrentFolder(null)
    setScreen('home')
    const { data: cs } = await supabase.from('production_clients').select('*').order('name')
    setClients((cs as Client[]) || [])
    const { data: fs } = await supabase.from('production_folders').select('client_id').eq('archived', false)
    const counts: Record<string, number> = {}
    for (const f of (fs as { client_id: string }[]) || []) counts[f.client_id] = (counts[f.client_id] || 0) + 1
    setActiveFolderCount(counts)
  }
  useEffect(() => { if (screen === 'home') goHome() }, [screen])

  async function createClient(e: React.FormEvent) {
    e.preventDefault()
    if (!ncName.trim()) return
    setNcSaving(true)
    const { error } = await supabase.from('production_clients').insert({ name: ncName.trim(), address: ncAddress.trim() || null })
    setNcSaving(false)
    if (error) { alert(error.message); return }
    setShowNewClient(false); setNcName(''); setNcAddress('')
    goHome()
  }

  // ---- EQUIPE ----
  async function goTeam() {
    setScreen('team')
    const { data } = await supabase.from('production_team').select('*').order('status').order('name')
    setTeam((data as TeamRow[]) || [])
  }
  async function approveMember(id: string) {
    setApprovingId(id)
    await supabase.from('production_team').update({ status: 'ativo', joined_at: new Date().toISOString() }).eq('id', id)
    setApprovingId(null)
    goTeam()
  }
  async function sendInvite(e: React.FormEvent) {
    e.preventDefault()
    setInvError('')
    if (!invName.trim() || !invEmail.trim()) { setInvError('Preenche nome e email.'); return }
    setInvSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/producao/convidar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: session?.access_token, name: invName, email: invEmail, phone: invPhone }),
    })
    const data = await res.json()
    setInvSaving(false)
    if (data.error) { setInvError(data.error); return }
    setShowInvite(false); setInvName(''); setInvEmail(''); setInvPhone('')
    goTeam()
  }

  // ---- CLIENTE: pastas ----
  async function openClient(c: Client) {
    setCurrentClient(c); setCurrentFolder(null); setClientView('pastas'); setFolderFilter('active')
    setScreen('client')
    await loadFolders(c.id, false)
  }
  async function loadFolders(clientId: string, archived: boolean) {
    const { data } = await supabase.from('production_folders').select('*').eq('client_id', clientId).eq('archived', archived).order('date', { ascending: false })
    setFolders((data as Folder[]) || [])
  }
  useEffect(() => { if (screen === 'client' && currentClient && !currentFolder) loadFolders(currentClient.id, folderFilter === 'archived') }, [folderFilter])

  useEffect(() => {
    if (screen !== 'client' || !currentClient || currentFolder) return
    const channel = supabase.channel('folders-' + currentClient.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_folders', filter: `client_id=eq.${currentClient.id}` },
        () => loadFolders(currentClient.id, folderFilter === 'archived'))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [screen, currentClient, currentFolder, folderFilter])

  async function createFolder(e: React.FormEvent) {
    e.preventDefault()
    if (!currentClient || !nfName.trim() || !nfDate) return
    setNfSaving(true)
    const { error } = await supabase.from('production_folders').insert({ client_id: currentClient.id, name: nfName.trim(), date: nfDate, archived: false })
    setNfSaving(false)
    if (error) { alert(error.message); return }
    setShowNewFolder(false); setNfName(''); setNfDate('')
    setFolderFilter('active') // pasta nova sempre nasce ativa
    loadFolders(currentClient.id, false)
  }

  // ---- DENTRO DA PASTA ----
  async function openFolder(f: Folder) {
    setCurrentFolder(f)
    await loadTasks(f.id)
  }
  async function loadTasks(folderId: string) {
    const { data } = await supabase.from('production_tasks').select('*').eq('folder_id', folderId).order('scheduled_at')
    setTasks((data as Task[]) || [])
  }
  function closeFolder() {
    setCurrentFolder(null); setTasks([])
    if (currentClient) loadFolders(currentClient.id, folderFilter === 'archived')
  }

  useEffect(() => {
    if (!currentFolder) return
    const channel = supabase.channel('tasks-' + currentFolder.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_tasks', filter: `folder_id=eq.${currentFolder.id}` },
        () => loadTasks(currentFolder.id))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [currentFolder])

  async function toggleArchive() {
    if (!currentFolder) return
    await supabase.from('production_folders').update({ archived: !currentFolder.archived }).eq('id', currentFolder.id)
    setFolderFilter(currentFolder.archived ? 'active' : 'archived')
    closeFolder()
  }

  async function addContent() {
    if (!currentClient || !currentFolder) return
    const label = prompt('Nome do novo conteúdo (ex: Foto, Vídeo de Cortes, Depoimento...):')
    if (!label || !label.trim()) return
    await supabase.from('production_tasks').insert({
      client_id: currentClient.id, folder_id: currentFolder.id, title: label.trim(),
      scheduled_at: currentFolder.date + 'T12:00:00', video_status: 'a_gravar',
    })
    loadTasks(currentFolder.id)
  }

  async function cycleStatus(t: Task) {
    const idx = STATUSES.findIndex(s => s.key === t.video_status)
    const next = STATUSES[(idx + 1) % STATUSES.length].key
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, video_status: next } : x))
    await supabase.from('production_tasks').update({ video_status: next }).eq('id', t.id)
  }
  async function cycleAssignee(t: Task) {
    const active = team.length ? team.filter(m => m.status === 'ativo') : teamMembersCache
    const idx = active.findIndex(m => m.id === t.assigned_to)
    const next = idx === -1 ? (active[0]?.id ?? null) : (active[idx + 1] ? active[idx + 1].id : null)
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, assigned_to: next } : x))
    await supabase.from('production_tasks').update({ assigned_to: next }).eq('id', t.id)
  }
  function onNotesChange(id: string, value: string) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, notes: value } : t))
    clearTimeout(notesTimers.current[id])
    notesTimers.current[id] = setTimeout(() => { supabase.from('production_tasks').update({ notes: value }).eq('id', id) }, 500)
  }
  function onRefChange(id: string, value: string) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, reference_link: value } : t))
    clearTimeout(refTimers.current[id])
    refTimers.current[id] = setTimeout(() => { supabase.from('production_tasks').update({ reference_link: value || null }).eq('id', id) }, 500)
  }

  // pequeno cache de membros ativos pra atribuir responsável mesmo fora da tela Equipe
  const [teamMembersCache, setTeamMembersCache] = useState<TeamRow[]>([])
  useEffect(() => {
    supabase.from('production_team').select('*').eq('status', 'ativo').then(({ data }) => setTeamMembersCache((data as TeamRow[]) || []))
  }, [])
  function memberOf(id: string | null): TeamRow | null {
    return (team.length ? team : teamMembersCache).find(m => m.id === id) || null
  }

  // ---- CALENDÁRIO ----
  useEffect(() => {
    if (screen !== 'client' || !currentClient || clientView !== 'calendario') return
    loadCalendar()
  }, [screen, currentClient, clientView, monthCursor])

  async function loadCalendar() {
    if (!currentClient) return
    const start = new Date(monthCursor)
    const end = new Date(monthCursor); end.setMonth(end.getMonth() + 1)
    const { data } = await supabase.from('production_tasks')
      .select('*, folder:production_folders!inner(name, archived)')
      .eq('client_id', currentClient.id).eq('folder.archived', false)
      .gte('scheduled_at', start.toISOString().slice(0, 10))
      .lt('scheduled_at', end.toISOString().slice(0, 10))
      .order('scheduled_at')
    const rows = ((data as any[]) || []).map(r => ({ ...r, folderName: (Array.isArray(r.folder) ? r.folder[0] : r.folder)?.name || '' }))
    setCalTasks(rows)
  }


  return (
    <>
      <style>{`
        :root{ --paper:#F7F4EC; --card:#FFFFFF; --ink:#1B1B1F; --ink-soft:#5B5B63; --ink-faint:#9A9488; --navy:#17306E; --blue:#2451B4; --gold:#C79A2B; --line:#E3DFD3; --line-soft:#EDE9DD; --danger:#C0392B;
          --st-a-gravar-bg:#FBEBD3; --st-a-gravar-fg:#B9791A; --st-gravado-bg:#D6EAF8; --st-gravado-fg:#2451B4; --st-editado-bg:#E8DAEF; --st-editado-fg:#8E44AD; --st-postado-bg:#D5F5E3; --st-postado-fg:#2E7D4F;
          --shadow:0 1px 2px rgba(23,48,110,.05), 0 8px 20px -10px rgba(23,48,110,.18); }
        .pr2-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
        .pr2-root{min-height:100vh;background:var(--paper);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;}
        .pr2-app{max-width:980px;margin:0 auto;padding:0 20px 80px;}
        .pr2-center{max-width:400px;margin:0 auto;padding:60px 20px;}
        header.pr2-top{padding:22px 0 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}
        .pr2-top-id{display:flex;align-items:center;gap:12px;}
        .pr2-avatar{width:44px;height:44px;border-radius:11px;background:var(--navy);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;flex:none;}
        :root[data-theme="dark"] .pr2-avatar, :root:not([data-theme="light"]) .pr2-avatar{ color:#12141A; }
        .pr2-root h1{margin:0;font-size:19px;font-weight:800;letter-spacing:-.01em;}
        .pr2-top-sub{font-size:12px;color:var(--ink-soft);margin-top:2px;}
        .pr2-back{font-family:inherit;font-size:12.5px;font-weight:700;color:var(--ink-soft);background:var(--card);border:1px solid var(--line);border-radius:9px;padding:8px 12px;cursor:pointer;flex:none;}
        .pr2-card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:22px;}
        .pr2-logo{font-size:28px;text-align:center;margin-bottom:4px;}
        .pr2-atitle{text-align:center;font-size:19px;font-weight:800;color:var(--navy);margin-bottom:2px;}
        .pr2-asub{text-align:center;font-size:12.5px;color:var(--ink-soft);margin-bottom:20px;}
        .pr2-root label{font-size:12.5px;font-weight:700;color:var(--ink-soft);display:block;margin:12px 0 5px;}
        .pr2-root input{width:100%;padding:12px 13px;border-radius:10px;border:1px solid var(--line);font-size:16px;background:#fff;color:var(--ink);font-family:inherit;}
        .pr2-btn{width:100%;padding:13px;border-radius:11px;border:none;font-size:14.5px;font-weight:700;cursor:pointer;margin-top:18px;font-family:inherit;}
        .pr2-btn:disabled{opacity:.6;}
        .pr2-btn-primary{background:var(--navy);color:#fff;}
        .pr2-btn-secondary{background:var(--card);color:var(--navy);border:1px solid var(--line);}
        .pr2-toggle{text-align:center;margin-top:14px;font-size:13px;color:var(--blue);cursor:pointer;font-weight:600;background:none;border:none;width:100%;font-family:inherit;}
        .pr2-error{background:#FBE1DE;color:var(--danger);border-radius:9px;padding:10px 12px;font-size:12.5px;margin-top:12px;}
        .pr2-pending{text-align:center;padding:40px 20px;}
        .pr2-pending .emoji{font-size:44px;margin-bottom:10px;}
        .pr2-pending h2{font-size:18px;color:var(--navy);margin-bottom:8px;}
        .pr2-pending p{font-size:13.5px;color:var(--ink-soft);line-height:1.5;}
        .pr2-view-toggle{display:flex;gap:2px;background:var(--line-soft);border-radius:11px;padding:3px;width:fit-content;margin-bottom:20px;}
        .pr2-view-toggle button{font-family:inherit;border:none;background:transparent;color:var(--ink-soft);font-size:12.5px;font-weight:700;padding:8px 16px;border-radius:8px;cursor:pointer;}
        .pr2-view-toggle button.on{background:var(--card);color:var(--navy);box-shadow:var(--shadow);}
        .pr2-filter-toggle{display:flex;gap:14px;margin-bottom:14px;border-bottom:1px solid var(--line);}
        .pr2-filter-toggle button{font-family:inherit;border:none;background:transparent;color:var(--ink-faint);font-size:12.5px;font-weight:700;padding:0 2px 9px;cursor:pointer;border-bottom:2px solid transparent;}
        .pr2-filter-toggle button.on{color:var(--navy);border-bottom-color:var(--gold);}
        .pr2-stats-row{display:flex;gap:10px;margin-bottom:22px;flex-wrap:wrap;}
        .pr2-stat{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:11px 16px;display:flex;flex-direction:column;gap:2px;min-width:100px;}
        .pr2-stat b{font-size:19px;font-weight:800;font-variant-numeric:tabular-nums;}
        .pr2-stat span{font-size:10.5px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.06em;font-weight:700;}
        .pr2-section-lbl{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-faint);margin:22px 0 10px;}
        .pr2-section-lbl:first-child{margin-top:0;}
        .pr2-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;}
        .pr2-fcard{background:var(--card);border:1px solid var(--line);border-radius:15px;padding:16px;cursor:pointer;box-shadow:var(--shadow);transition:transform .12s, border-color .12s;}
        .pr2-fcard:hover{transform:translateY(-2px);border-color:var(--gold);}
        .pr2-fcard.archived{opacity:.6;}
        .pr2-ftop{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:12px;}
        .pr2-fname{font-size:15px;font-weight:800;line-height:1.3;}
        .pr2-fdate{font-size:11.5px;color:var(--ink-soft);margin-top:3px;}
        .pr2-fico{font-size:20px;flex:none;}
        .pr2-chips{display:flex;gap:5px;flex-wrap:wrap;}
        .pr2-chip{display:flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;padding:5px 8px 5px 6px;border-radius:20px;background:var(--line-soft);color:var(--ink-soft);}
        .pr2-chip .dot{width:6px;height:6px;border-radius:50%;flex:none;}
        .pr2-progress{margin-top:12px;height:5px;border-radius:3px;background:var(--line-soft);overflow:hidden;}
        .pr2-progress-fill{height:100%;background:linear-gradient(90deg,var(--blue),var(--gold));}
        .pr2-archive-tag{font-size:9.5px;font-weight:800;color:var(--ink-faint);background:var(--line-soft);padding:3px 8px;border-radius:20px;text-transform:uppercase;letter-spacing:.03em;}
        .pr2-empty{text-align:center;padding:30px 10px;color:var(--ink-faint);font-size:13.5px;}
        .pr2-invite-btn{display:block;width:100%;font-family:inherit;font-size:13px;font-weight:700;color:var(--navy);background:var(--card);border:1px dashed var(--line);border-radius:12px;padding:13px;cursor:pointer;margin-bottom:8px;}
        .pr2-invite-btn:hover{background:var(--line-soft);}
        .pr2-fab{display:block;margin:20px auto 0;font-family:inherit;font-size:13px;font-weight:700;color:#12141A;background:var(--gold);border:none;border-radius:12px;padding:13px 22px;cursor:pointer;box-shadow:var(--shadow);}

        .pr2-detail-title{font-size:16px;font-weight:800;}
        .pr2-detail-sub{font-size:11.5px;color:var(--ink-soft);margin-top:2px;}
        .pr2-content-list{display:flex;flex-direction:column;gap:9px;}
        .pr2-row{display:flex;flex-direction:column;gap:9px;border:1px solid var(--line);border-radius:12px;padding:11px 13px;background:var(--card);}
        .pr2-row.overdue{border-color:var(--danger);background:rgba(192,57,43,.05);}
        .pr2-rtop{position:relative;display:flex;align-items:center;min-height:34px;}
        .pr2-rico{width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:15px;color:#fff;flex:none;}
        .pr2-status-pill{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:11px;font-weight:800;padding:6px 11px;border-radius:9px;border:none;cursor:pointer;white-space:nowrap;font-family:inherit;}
        .pr2-overdue-tag{font-size:10px;font-weight:800;color:#fff;background:var(--danger);padding:5px 9px;border-radius:20px;flex:none;margin-left:auto;}
        .pr2-rbottom{display:flex;align-items:center;justify-content:space-between;gap:10px;}
        .pr2-rmid{min-width:0;}
        .pr2-rtype{font-size:14px;font-weight:700;}
        .pr2-rdate{font-size:11.5px;color:var(--ink-soft);margin-top:2px;}
        .pr2-assignee{flex:none;display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:var(--ink-soft);background:var(--line-soft);border:none;border-radius:20px;padding:4px 10px 4px 4px;cursor:pointer;font-family:inherit;}
        .pr2-assignee.unassigned{color:var(--ink-faint);font-style:italic;padding:5px 10px;}
        .pr2-avatar-sm{width:18px;height:18px;border-radius:50%;background:var(--navy);color:#fff;flex:none;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;}
        :root[data-theme="dark"] .pr2-avatar-sm, :root:not([data-theme="light"]) .pr2-avatar-sm{ color:#12141A; }
        .pr2-refinput{width:100%;padding:8px 9px;border-radius:9px;border:1px dashed #D8D3C2;font-size:13px;background:rgba(0,0,0,.02);color:var(--ink);font-family:inherit;}
        .pr2-notes{width:100%;min-height:44px;border-radius:9px;border:1px dashed #D8D3C2;padding:8px 9px;font-size:13.5px;font-family:inherit;resize:vertical;background:rgba(0,0,0,.02);color:var(--ink);}
        .pr2-add-content{display:block;width:100%;margin-top:12px;font-family:inherit;font-size:12.5px;font-weight:700;color:var(--blue);background:transparent;border:1px dashed var(--line);border-radius:11px;padding:11px;cursor:pointer;}
        .pr2-add-content:hover{background:var(--line-soft);}

        .pr2-cal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;}
        .pr2-cal-nav{display:flex;align-items:center;gap:10px;}
        .pr2-cal-nav button{width:30px;height:30px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--ink-soft);cursor:pointer;font-size:13px;}
        .pr2-cal-month{font-size:15px;font-weight:800;min-width:150px;text-align:center;text-transform:capitalize;}
        .pr2-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;}
        .pr2-cal-dow{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-faint);text-align:center;padding-bottom:4px;}
        .pr2-cal-cell{background:var(--card);border:1px solid var(--line);border-radius:10px;min-height:58px;padding:6px 5px;display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer;}
        .pr2-cal-cell:hover{border-color:var(--gold);}
        .pr2-cal-cell.empty{background:transparent;border-color:transparent;cursor:default;}
        .pr2-cal-daynum{font-size:12px;font-weight:700;color:var(--ink-soft);width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none;}
        .pr2-cal-cell.today .pr2-cal-daynum{color:var(--gold);font-weight:800;}
        .pr2-cal-cell.selected .pr2-cal-daynum{background:var(--navy);color:#fff;}
        .pr2-cal-dots{display:flex;gap:3px;flex-wrap:wrap;justify-content:center;align-items:center;min-height:6px;}
        .pr2-cal-dot{width:6px;height:6px;border-radius:50%;flex:none;}
        .pr2-cal-dot.overdue{box-shadow:0 0 0 1.5px var(--danger);}
        .pr2-cal-more{font-size:8.5px;color:var(--ink-faint);font-weight:700;}
        .pr2-day-panel{margin-top:16px;background:var(--card);border:1px solid var(--line);border-radius:15px;padding:16px;box-shadow:var(--shadow);}
        .pr2-day-panel-head{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--gold);margin-bottom:12px;}
        .pr2-day-card{display:flex;align-items:center;gap:12px;background:var(--paper);border:1px solid var(--line);border-radius:13px;padding:11px 13px;margin-bottom:8px;}
        .pr2-day-card:last-child{margin-bottom:0;}
        .pr2-day-mid{flex:1;min-width:0;}
        .pr2-day-event{font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .pr2-day-type{font-size:11.5px;color:var(--ink-soft);margin-top:2px;display:flex;align-items:center;gap:6px;}
        .pr2-day-type .sw{width:7px;height:7px;border-radius:50%;flex:none;}
        .pr2-day-status{font-size:10px;font-weight:800;padding:5px 9px;border-radius:8px;flex:none;white-space:nowrap;}
        .pr2-day-empty{font-size:12.5px;color:var(--ink-faint);text-align:center;padding:6px 0;}

        .pr2-team-row{display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:13px;padding:12px 14px;margin-bottom:8px;}
        .pr2-team-name{font-size:13.5px;font-weight:700;}
        .pr2-team-meta{font-size:11.5px;color:var(--ink-soft);margin-top:2px;}
        .pr2-team-tag{font-size:10px;font-weight:800;padding:4px 9px;border-radius:20px;flex:none;text-transform:uppercase;letter-spacing:.03em;}
        .pr2-team-tag.invited{background:var(--st-a-gravar-bg);color:var(--st-a-gravar-fg);}
        .pr2-team-tag.pending{background:var(--st-editado-bg);color:var(--st-editado-fg);}
        .pr2-team-tag.admin{background:#E8DAEF;color:#5B2C77;}
        .pr2-team-tag.member{background:var(--st-gravado-bg);color:var(--st-gravado-fg);}
        .pr2-team-approve{font-family:inherit;font-size:11.5px;font-weight:700;color:#12141A;background:var(--gold);border:none;border-radius:8px;padding:8px 12px;cursor:pointer;flex:none;}

        .pr2-modal-overlay{display:none;position:fixed;inset:0;background:rgba(15,17,23,.55);z-index:900;align-items:flex-end;justify-content:center;}
        .pr2-modal-overlay.show{display:flex;}
        .pr2-modal{background:var(--card);border-radius:20px 20px 0 0;padding:22px;width:100%;max-width:420px;}
        @media(min-width:600px){ .pr2-modal-overlay{align-items:center;} .pr2-modal{border-radius:16px;} }
        .pr2-modal-actions{display:flex;gap:8px;margin-top:18px;}
        .pr2-modal-actions button{flex:1;font-family:inherit;font-size:13px;font-weight:700;padding:12px;border-radius:11px;border:none;cursor:pointer;}
        .pr2-modal-cancel{background:var(--line-soft);color:var(--ink-soft);}
        .pr2-modal-save{background:var(--navy);color:#fff;}
        .pr2-modal-save:disabled{opacity:.6;}
      `}</style>

      <div className="pr2-root">
        {screen === 'loading' && <div className="pr2-empty">Carregando...</div>}

        {screen === 'auth' && (
          <div className="pr2-center">
            <div className="pr2-card">
              <div className="pr2-logo">🎬</div>
              <div className="pr2-atitle">Agenda de Produção</div>
              <div className="pr2-asub">{authMode === 'login' ? 'Entre com sua conta' : 'Crie sua conta pra solicitar acesso'}</div>
              <form onSubmit={handleAuth}>
                {authMode === 'signup' && (<><label>Nome</label><input type="text" value={authName} onChange={e => setAuthName(e.target.value)} placeholder="Seu nome" /></>)}
                <label>E-mail</label>
                <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="voce@email.com" required />
                <label>Senha</label>
                <input type="password" value={authPass} onChange={e => setAuthPass(e.target.value)} placeholder="••••••••" required minLength={6} />
                <button type="submit" className="pr2-btn pr2-btn-primary" disabled={busy}>{busy ? '...' : authMode === 'login' ? 'Entrar' : 'Criar conta'}</button>
              </form>
              {errorMsg && <div className="pr2-error">{errorMsg}</div>}
              <button className="pr2-toggle" onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setErrorMsg('') }}>
                {authMode === 'login' ? 'Não tem conta? Criar uma' : 'Já tem conta? Entrar'}
              </button>
            </div>
          </div>
        )}

        {screen === 'needs_register' && (
          <div className="pr2-center">
            <div className="pr2-card">
              <div className="pr2-logo">👋</div>
              <div className="pr2-atitle">Falta um passo</div>
              <div className="pr2-asub">Confirme seu nome pra solicitar acesso</div>
              <form onSubmit={handleNeedsRegister}>
                <label>Nome</label>
                <input type="text" value={authName} onChange={e => setAuthName(e.target.value)} placeholder="Seu nome" />
                <button type="submit" className="pr2-btn pr2-btn-primary" disabled={busy}>{busy ? '...' : 'Solicitar acesso'}</button>
              </form>
              <button className="pr2-btn pr2-btn-secondary" onClick={handleLogout}>Sair</button>
            </div>
          </div>
        )}

        {screen === 'pending' && (
          <div className="pr2-app">
            <header className="pr2-top">
              <div className="pr2-top-id"><div><h1>Agenda de Produção</h1></div></div>
              <button className="pr2-back" onClick={handleLogout}>Sair</button>
            </header>
            <div className="pr2-pending">
              <div className="emoji">⏳</div>
              <h2>Aguardando aprovação</h2>
              <p>Sua conta ({teamRow?.email}) foi criada, mas ainda precisa ser liberada por um administrador.</p>
              <button className="pr2-btn pr2-btn-secondary" style={{ marginTop: 20 }} onClick={loadTeamRow}>Verificar novamente</button>
            </div>
          </div>
        )}

        {screen === 'home' && (
          <div className="pr2-app">
            <header className="pr2-top">
              <div className="pr2-top-id">
                <div className="pr2-avatar" style={{ background: 'var(--gold)' }}>🎬</div>
                <div><h1>Agenda de Produção</h1><div className="pr2-top-sub">Olá, {teamRow?.name}</div></div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {isAdmin && <button className="pr2-back" onClick={goTeam}>👥 Equipe</button>}
                <button className="pr2-back" onClick={handleLogout}>Sair</button>
              </div>
            </header>
            <div className="pr2-section-lbl">Clientes</div>
            {clients.length === 0 && <div className="pr2-empty">Nenhum cliente cadastrado ainda.</div>}
            <div className="pr2-grid">
              {clients.map(c => (
                <div key={c.id} className="pr2-fcard" onClick={() => openClient(c)}>
                  <div className="pr2-ftop">
                    <div>
                      <div className="pr2-fname">{c.name}</div>
                      <div className="pr2-fdate">{activeFolderCount[c.id] || 0} {activeFolderCount[c.id] === 1 ? 'pasta ativa' : 'pastas ativas'}</div>
                    </div>
                    <div className="pr2-fico">{initialsOf(c.name)}</div>
                  </div>
                </div>
              ))}
            </div>
            {isAdmin && <button className="pr2-fab" onClick={() => setShowNewClient(true)}>+ Novo cliente</button>}
          </div>
        )}

        {showNewClient && (
          <div className="pr2-modal-overlay show" onClick={() => setShowNewClient(false)}>
            <div className="pr2-modal" onClick={e => e.stopPropagation()}>
              <div className="pr2-detail-title">Novo cliente</div>
              <form onSubmit={createClient}>
                <label>Nome</label><input type="text" value={ncName} onChange={e => setNcName(e.target.value)} required />
                <label>Endereço (opcional)</label><input type="text" value={ncAddress} onChange={e => setNcAddress(e.target.value)} />
                <div className="pr2-modal-actions">
                  <button type="button" className="pr2-modal-cancel" onClick={() => setShowNewClient(false)}>Cancelar</button>
                  <button type="submit" className="pr2-modal-save" disabled={ncSaving}>{ncSaving ? '...' : 'Criar'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {screen === 'team' && (
          <div className="pr2-app">
            <header className="pr2-top">
              <div className="pr2-top-id">
                <button className="pr2-back" onClick={goHome}>← Clientes</button>
                <div><h1>Equipe</h1><div className="pr2-top-sub">Quem tem acesso à agenda</div></div>
              </div>
            </header>

            <div className="pr2-section-lbl">Convites enviados por você</div>
            {team.filter(t => t.status === 'ativo' && !t.joined_at).length === 0
              ? <div className="pr2-empty">Nenhum convite pendente de 1º acesso.</div>
              : team.filter(t => t.status === 'ativo' && !t.joined_at).map(t => (
                <div key={t.id} className="pr2-team-row">
                  <div style={{ flex: 1 }}><div className="pr2-team-name">{t.name}</div><div className="pr2-team-meta">{t.email}</div></div>
                  <span className="pr2-team-tag invited">convite enviado</span>
                </div>
              ))}
            <button className="pr2-invite-btn" onClick={() => setShowInvite(true)}>✉️ Convidar alguém</button>

            {team.filter(t => t.status !== 'ativo').length > 0 && (
              <>
                <div className="pr2-section-lbl">Aguardando aprovação</div>
                {team.filter(t => t.status !== 'ativo').map(t => (
                  <div key={t.id} className="pr2-team-row">
                    <div style={{ flex: 1 }}><div className="pr2-team-name">{t.name}</div><div className="pr2-team-meta">{t.email} · pediu acesso sozinho(a)</div></div>
                    <button className="pr2-team-approve" disabled={approvingId === t.id} onClick={() => approveMember(t.id)}>{approvingId === t.id ? '...' : 'Aprovar'}</button>
                  </div>
                ))}
              </>
            )}

            <div className="pr2-section-lbl">Equipe ativa</div>
            {team.filter(t => t.status === 'ativo' && t.joined_at).map(t => (
              <div key={t.id} className="pr2-team-row">
                <div style={{ flex: 1 }}><div className="pr2-team-name">{t.name}</div><div className="pr2-team-meta">{t.email}</div></div>
                <span className={`pr2-team-tag ${t.role}`}>{t.role === 'admin' ? 'Admin' : 'Membro'}</span>
              </div>
            ))}
          </div>
        )}

        {showInvite && (
          <div className="pr2-modal-overlay show" onClick={() => setShowInvite(false)}>
            <div className="pr2-modal" onClick={e => e.stopPropagation()}>
              <div className="pr2-detail-title">Convidar pra equipe</div>
              <div className="pr2-detail-sub">Manda o link direto — a pessoa já entra liberada assim que criar a senha.</div>
              <form onSubmit={sendInvite}>
                <label>Nome</label><input type="text" value={invName} onChange={e => setInvName(e.target.value)} placeholder="Nome da pessoa" />
                <label>E-mail</label><input type="email" value={invEmail} onChange={e => setInvEmail(e.target.value)} placeholder="email@exemplo.com" />
                <label>WhatsApp (opcional)</label><input type="text" value={invPhone} onChange={e => setInvPhone(e.target.value)} placeholder="(21) 90000-0000" />
                {invError && <div className="pr2-error">{invError}</div>}
                <div className="pr2-modal-actions">
                  <button type="button" className="pr2-modal-cancel" onClick={() => setShowInvite(false)}>Cancelar</button>
                  <button type="submit" className="pr2-modal-save" disabled={invSaving}>{invSaving ? '...' : '✉️ Enviar convite'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {screen === 'client' && currentClient && !currentFolder && (
          <div className="pr2-app">
            <header className="pr2-top">
              <div className="pr2-top-id">
                <button className="pr2-back" onClick={goHome}>← Clientes</button>
                <div className="pr2-avatar">{initialsOf(currentClient.name)}</div>
                <div><h1>{currentClient.name}</h1><div className="pr2-top-sub">Agenda de Produção</div></div>
              </div>
            </header>

            <div className="pr2-view-toggle">
              <button className={clientView === 'pastas' ? 'on' : ''} onClick={() => setClientView('pastas')}>🗂️ Pastas</button>
              <button className={clientView === 'calendario' ? 'on' : ''} onClick={() => setClientView('calendario')}>📅 Calendário</button>
            </div>

            {clientView === 'pastas' && (
              <>
                <div className="pr2-filter-toggle">
                  <button className={folderFilter === 'active' ? 'on' : ''} onClick={() => setFolderFilter('active')}>Ativas</button>
                  <button className={folderFilter === 'archived' ? 'on' : ''} onClick={() => setFolderFilter('archived')}>Arquivadas</button>
                </div>
                <div className="pr2-section-lbl">Pastas</div>
                {folders.length === 0 && <div className="pr2-empty">{folderFilter === 'archived' ? 'Nenhuma pasta arquivada ainda.' : 'Nenhuma pasta ativa — crie uma abaixo.'}</div>}
                <div className="pr2-grid">
                  {folders.map(f => (
                    <div key={f.id} className={`pr2-fcard ${f.archived ? 'archived' : ''}`} onClick={() => openFolder(f)}>
                      <div className="pr2-ftop">
                        <div><div className="pr2-fname">{f.name}</div><div className="pr2-fdate">🗂️ {fmtDate(f.date)}</div></div>
                        {f.archived && <span className="pr2-archive-tag">🗄️ arquivada</span>}
                      </div>
                    </div>
                  ))}
                </div>
                <button className="pr2-invite-btn" onClick={() => setShowNewFolder(true)}>+ Nova pasta</button>
              </>
            )}

            {clientView === 'calendario' && (
              <>
                <div className="pr2-cal-head">
                  <div className="pr2-cal-nav">
                    <button onClick={() => setMonthCursor(d => { const n = new Date(d); n.setMonth(n.getMonth() - 1); return n })}>‹</button>
                    <div className="pr2-cal-month">{monthCursor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</div>
                    <button onClick={() => setMonthCursor(d => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n })}>›</button>
                  </div>
                </div>
                <CalendarGrid monthCursor={monthCursor} calTasks={calTasks} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
                <DayPanel calTasks={calTasks} selectedDay={selectedDay} memberOf={memberOf} />
              </>
            )}
          </div>
        )}

        {showNewFolder && (
          <div className="pr2-modal-overlay show" onClick={() => setShowNewFolder(false)}>
            <div className="pr2-modal" onClick={e => e.stopPropagation()}>
              <div className="pr2-detail-title">Nova pasta</div>
              <div className="pr2-detail-sub">Cada pasta agrupa os conteúdos de um evento ou período.</div>
              <form onSubmit={createFolder}>
                <label>Nome</label><input type="text" value={nfName} onChange={e => setNfName(e.target.value)} placeholder="Ex: Casamento — Marina & Rafael" />
                <label>Data</label><input type="date" value={nfDate} onChange={e => setNfDate(e.target.value)} />
                <div className="pr2-modal-actions">
                  <button type="button" className="pr2-modal-cancel" onClick={() => setShowNewFolder(false)}>Cancelar</button>
                  <button type="submit" className="pr2-modal-save" disabled={nfSaving}>{nfSaving ? '...' : '🗂️ Criar pasta'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {screen === 'client' && currentFolder && (
          <div className="pr2-app">
            <header className="pr2-top">
              <button className="pr2-back" onClick={closeFolder}>← Pastas</button>
              <button className="pr2-back" onClick={toggleArchive}>{currentFolder.archived ? '♻️ Reabrir pasta' : '🗄️ Arquivar pasta'}</button>
            </header>
            <div style={{ marginBottom: 16 }}>
              <div className="pr2-detail-title">{currentFolder.name}{currentFolder.archived && <span className="pr2-archive-tag" style={{ marginLeft: 8 }}>arquivada</span>}</div>
              <div className="pr2-detail-sub">{fmtDate(currentFolder.date)} · {tasks.length} {tasks.length === 1 ? 'conteúdo programado' : 'conteúdos programados'}</div>
            </div>
            <div className="pr2-content-list">
              {tasks.map(t => {
                const st = statusOf(t.video_status); const color = typeColor(t.title); const overdue = isOverdue(t); const who = memberOf(t.assigned_to)
                return (
                  <div key={t.id} className={`pr2-row ${overdue ? 'overdue' : ''}`}>
                    <div className="pr2-rtop">
                      <div className="pr2-rico" style={{ background: color }}>{typeIcon(t.title)}</div>
                      <button className="pr2-status-pill" style={{ background: st.bg, color: st.color }} onClick={() => cycleStatus(t)}>{st.label}</button>
                      {overdue && <span className="pr2-overdue-tag">⚠️ Atrasado</span>}
                    </div>
                    <div className="pr2-rbottom">
                      <div className="pr2-rmid">
                        <div className="pr2-rtype">{t.title}</div>
                        <div className="pr2-rdate">📅 postar em {fmtDate(t.scheduled_at)}</div>
                      </div>
                      {who
                        ? <button className="pr2-assignee" onClick={() => cycleAssignee(t)}><span className="pr2-avatar-sm">{initialsOf(who.name)}</span>{who.name}</button>
                        : <button className="pr2-assignee unassigned" onClick={() => cycleAssignee(t)}>+ atribuir</button>}
                    </div>
                    <input className="pr2-refinput" type="url" placeholder="Link do vídeo de referência" value={t.reference_link || ''} onChange={e => onRefChange(t.id, e.target.value)} />
                    <textarea className="pr2-notes" placeholder="Anotações..." value={t.notes || ''} onChange={e => onNotesChange(t.id, e.target.value)} />
                  </div>
                )
              })}
            </div>
            <button className="pr2-add-content" onClick={addContent}>+ Adicionar conteúdo</button>
          </div>
        )}
      </div>
    </>
  )
}

function CalendarGrid({ monthCursor, calTasks, selectedDay, onSelectDay }: {
  monthCursor: Date; calTasks: (Task & { folderName: string })[]; selectedDay: string; onSelectDay: (d: string) => void
}) {
  const year = monthCursor.getFullYear(), month = monthCursor.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstWeekday = new Date(year, month, 1).getDay()
  const today = todayIso()
  const postsByDay: Record<string, (Task & { folderName: string })[]> = {}
  calTasks.forEach(t => { const d = t.scheduled_at.slice(8, 10); (postsByDay[d] ||= []).push(t) })

  const cells: React.ReactNode[] = []
  ;['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].forEach(d => cells.push(<div key={'dow' + d} className="pr2-cal-dow">{d}</div>))
  for (let i = 0; i < firstWeekday; i++) cells.push(<div key={'empty' + i} className="pr2-cal-cell empty" />)
  for (let d = 1; d <= daysInMonth; d++) {
    const dayStr = String(d).padStart(2, '0')
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${dayStr}`
    const posts = postsByDay[dayStr] || []
    const shown = posts.slice(0, 4); const rest = posts.length - shown.length
    cells.push(
      <div key={iso} className={`pr2-cal-cell ${iso === today ? 'today' : ''} ${iso === selectedDay ? 'selected' : ''}`} onClick={() => onSelectDay(iso)}>
        <div className="pr2-cal-daynum">{d}</div>
        <div className="pr2-cal-dots">
          {shown.map(p => <span key={p.id} className={`pr2-cal-dot ${isOverdue(p) ? 'overdue' : ''}`} style={{ background: typeColor(p.title) }} />)}
          {rest > 0 && <span className="pr2-cal-more">+{rest}</span>}
        </div>
      </div>
    )
  }
  return <div className="pr2-cal-grid">{cells}</div>
}

function DayPanel({ calTasks, selectedDay, memberOf }: {
  calTasks: (Task & { folderName: string })[]; selectedDay: string; memberOf: (id: string | null) => TeamRow | null
}) {
  const posts = calTasks.filter(t => t.scheduled_at.slice(0, 10) === selectedDay)
  return (
    <div className="pr2-day-panel">
      <div className="pr2-day-panel-head">{weekLabel(selectedDay)}</div>
      {posts.length === 0 && <div className="pr2-day-empty">Nada programado pra postar nesse dia.</div>}
      {posts.map(p => {
        const st = statusOf(p.video_status); const who = memberOf(p.assigned_to); const overdue = isOverdue(p)
        return (
          <div key={p.id} className="pr2-day-card" style={overdue ? { borderColor: 'var(--danger)' } : {}}>
            <div className="pr2-rico" style={{ background: typeColor(p.title) }}>{typeIcon(p.title)}</div>
            <div className="pr2-day-mid">
              <div className="pr2-day-event">{p.folderName}</div>
              <div className="pr2-day-type"><span className="sw" style={{ background: typeColor(p.title) }} />{p.title}{who ? ' · ' + who.name : ''}</div>
            </div>
            {overdue && <span className="pr2-overdue-tag">⚠️</span>}
            <div className="pr2-day-status" style={{ background: st.bg, color: st.color }}>{st.label}</div>
          </div>
        )
      })}
    </div>
  )
}
