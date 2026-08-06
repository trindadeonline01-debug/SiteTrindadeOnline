'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface Task {
  id: string; title: string; roteiro: string | null; reference_link: string | null
  location: string | null; scheduled_at: string; status: 'pendente' | 'aceito' | 'concluido'
  client?: { name: string; address: string | null } | { name: string; address: string | null }[] | null
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

type AuthState = 'checking' | 'need_login' | 'checking_access' | 'denied' | 'granted'

export default function AgendaEquipePage() {
  const [authState, setAuthState] = useState<AuthState>('checking')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  const [member, setMember] = useState<{ name: string } | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [activeTab, setActiveTab] = useState<'pendente' | 'aceito' | 'concluido'>('pendente')
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null)

  useEffect(() => { checkAccess() }, [])

  async function checkAccess() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setAuthState('need_login'); return }
    setAuthState('checking_access')
    const linkRes = await fetch('/api/agenda', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'team_link', access_token: session.access_token })
    })
    const linkData = await linkRes.json()
    if (!linkData.authorized) { setAuthState('denied'); return }
    setMember(linkData.member)
    await loadTasks(session.access_token)
    setAuthState('granted')
  }

  async function loadTasks(accessToken: string) {
    const res = await fetch('/api/agenda', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'team_my_tasks', access_token: accessToken })
    })
    const data = await res.json()
    setTasks(data.tasks || [])
  }

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setLoading(true)
    const fn = mode === 'login' ? supabase.auth.signInWithPassword({ email, password: senha }) : supabase.auth.signUp({ email, password: senha })
    const { error } = await fn
    setLoading(false)
    if (error) { setErro(mode === 'login' ? 'Email ou senha incorretos.' : error.message); return }
    checkAccess()
  }

  async function handleSair() {
    await supabase.auth.signOut()
    setAuthState('need_login')
    setEmail(''); setSenha(''); setMember(null); setTasks([])
  }

  async function act(action: 'team_accept_task' | 'team_complete_task', taskId: string) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    setBusyTaskId(taskId)
    const res = await fetch('/api/agenda', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, access_token: session.access_token, task_id: taskId })
    })
    const data = await res.json()
    setBusyTaskId(null)
    if (data.error) return alert(data.error)
    loadTasks(session.access_token)
  }

  const grouped = {
    pendente: tasks.filter(t => t.status === 'pendente'),
    aceito: tasks.filter(t => t.status === 'aceito'),
    concluido: tasks.filter(t => t.status === 'concluido'),
  }

  return (
    <>
      <style>{`
        *{box-sizing:border-box;}
        body{margin:0;background:#0B0D10;color:#EDEFF2;font-family:ui-monospace,'SF Mono','Roboto Mono',Menlo,Consolas,monospace;}
        .ag-top{background:#12151A;border-bottom:1px solid #333B46;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;}
        .ag-brand{display:flex;align-items:center;gap:9px;}
        .ag-mark{width:9px;height:9px;background:#FFB020;box-shadow:0 0 8px #FFB020;}
        .ag-brand b{font-family:'Oswald','Arial Narrow',sans-serif;font-weight:700;letter-spacing:1px;font-size:14px;text-transform:uppercase;}
        .ag-brand b span{color:#FFB020;}
        .ag-brand em{font-style:normal;color:#5B6473;font-size:10.5px;letter-spacing:.5px;}
        .ag-sair{font-family:inherit;background:none;border:1px solid #333B46;color:#8B95A3;font-size:11px;padding:7px 12px;cursor:pointer;letter-spacing:.4px;text-transform:uppercase;}
        .ag-wrap{max-width:460px;margin:0 auto;padding:24px 18px 60px;}
        .ag-center{min-height:70vh;display:flex;align-items:center;justify-content:center;padding:24px;}
        .ag-card{background:#12151A;border:1px solid #333B46;padding:26px 24px;width:100%;max-width:360px;}
        .ag-title{font-family:'Oswald','Arial Narrow',sans-serif;font-weight:700;font-size:19px;letter-spacing:.5px;text-transform:uppercase;margin-bottom:6px;}
        .ag-sub{font-size:12.5px;color:#8B95A3;line-height:1.6;margin-bottom:20px;}
        .ag-label{font-size:10px;font-weight:700;color:#5B6473;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:6px;margin-top:14px;}
        .ag-input{width:100%;background:#161A20;border:1px solid #333B46;color:#EDEFF2;padding:11px 12px;font-size:13px;font-family:ui-monospace,monospace;outline:none;}
        .ag-btn{font-family:inherit;width:100%;background:#FFB020;color:#0B0D10;border:none;padding:12px;font-size:13px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;cursor:pointer;margin-top:18px;}
        .ag-btn:disabled{opacity:.6;cursor:default;}
        .ag-toggle{text-align:center;margin-top:14px;font-size:12px;color:#5B6473;}
        .ag-toggle button{font-family:inherit;background:none;border:none;color:#FFB020;cursor:pointer;font-size:12px;text-decoration:underline;}
        .ag-err{font-size:12px;color:#d03b3b;margin-top:10px;}
        .ag-hello .hi{font-size:10.5px;color:#5B6473;letter-spacing:1px;text-transform:uppercase;}
        .ag-hello .name{font-family:'Oswald','Arial Narrow',sans-serif;font-size:22px;text-transform:uppercase;margin-top:4px;margin-bottom:18px;}
        .ag-tabs{display:flex;gap:1px;background:#333B46;border:1px solid #333B46;margin-bottom:16px;}
        .ag-tabs button{flex:1;font-family:inherit;font-size:10.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;padding:10px 4px;border:none;background:#12151A;color:#8B95A3;cursor:pointer;}
        .ag-tabs button.on{background:#FFB020;color:#0B0D10;}
        .ag-task{background:#12151A;border:1px solid #333B46;border-left:3px solid #FFB020;padding:18px;margin-bottom:14px;}
        .ag-client{font-family:ui-monospace,monospace;font-size:15px;font-weight:700;}
        .ag-when{font-size:11px;color:#5B6473;margin-top:3px;letter-spacing:.3px;}
        .ag-roteiro-label{font-size:10px;font-weight:700;color:#5B6473;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;margin-top:14px;}
        .ag-roteiro{font-size:12px;color:#8B95A3;line-height:1.7;background:#161A20;border:1px solid #232830;padding:11px 13px;white-space:pre-wrap;}
        .ag-link{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:12px;background:#161A20;border:1px solid #232830;padding:10px 13px;}
        .ag-link a{font-size:11px;color:#38D9C9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:none;}
        .ag-link button{font-family:inherit;flex-shrink:0;font-size:10px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:#FFB020;background:none;border:1px solid #7a5714;padding:5px 9px;cursor:pointer;}
        .ag-action{font-family:inherit;width:100%;margin-top:14px;border:none;padding:13px;font-size:12.5px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;cursor:pointer;}
        .ag-action.accept{background:#2a78d6;color:#fff;}
        .ag-action.done{background:#0ca30c;color:#fff;}
        .ag-empty{text-align:center;color:#5B6473;font-size:12px;padding:30px 0;}
      `}</style>

      <div className="ag-top">
        <div className="ag-brand"><span className="ag-mark" /><b>TRINDADE <span>ONLINE</span></b><em>/ AGENDA</em></div>
        {authState === 'granted' && <button className="ag-sair" onClick={handleSair}>Sair</button>}
      </div>

      {(authState === 'checking' || authState === 'checking_access') && (
        <div className="ag-center"><div style={{ color: '#5B6473', fontSize: 13 }}>Carregando...</div></div>
      )}

      {authState === 'need_login' && (
        <div className="ag-center">
          <div className="ag-card">
            <div className="ag-title">Agenda de Produção</div>
            <div className="ag-sub">Área exclusiva pra equipe autorizada. {mode === 'login' ? 'Entre com seu email e senha.' : 'Crie sua senha usando o email que recebeu o convite.'}</div>
            <form onSubmit={handleAuth}>
              <label className="ag-label">Email</label>
              <input className="ag-input" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              <label className="ag-label">Senha</label>
              <input className="ag-input" type="password" value={senha} onChange={e => setSenha(e.target.value)} required minLength={6} />
              {erro && <div className="ag-err">{erro}</div>}
              <button className="ag-btn" disabled={loading}>{loading ? '...' : mode === 'login' ? 'Entrar' : 'Criar senha e entrar'}</button>
            </form>
            <div className="ag-toggle">
              {mode === 'login' ? <>Primeira vez aqui? <button onClick={() => setMode('signup')}>Criar senha</button></> : <>Já tem senha? <button onClick={() => setMode('login')}>Entrar</button></>}
            </div>
          </div>
        </div>
      )}

      {authState === 'denied' && (
        <div className="ag-center">
          <div className="ag-card">
            <div className="ag-title">Acesso não autorizado</div>
            <div className="ag-sub">Esse email não está liberado pra Agenda de Produção. Fale com o administrador.</div>
            <button className="ag-btn" onClick={handleSair}>Voltar</button>
          </div>
        </div>
      )}

      {authState === 'granted' && (
        <div className="ag-wrap">
          <div className="ag-hello">
            <div className="hi">Sessão ativa</div>
            <div className="name">{member?.name}</div>
          </div>

          <div className="ag-tabs">
            <button className={activeTab === 'pendente' ? 'on' : ''} onClick={() => setActiveTab('pendente')}>Pendentes ({grouped.pendente.length})</button>
            <button className={activeTab === 'aceito' ? 'on' : ''} onClick={() => setActiveTab('aceito')}>Aceitos ({grouped.aceito.length})</button>
            <button className={activeTab === 'concluido' ? 'on' : ''} onClick={() => setActiveTab('concluido')}>Concluídos ({grouped.concluido.length})</button>
          </div>

          {grouped[activeTab].length === 0 && <div className="ag-empty">Nada por aqui.</div>}

          {grouped[activeTab].map(t => {
            const client = one(t.client)
            return (
              <div key={t.id} className="ag-task">
                <div className="ag-client">{client?.name || '—'}</div>
                <div className="ag-when">{fmtWhen(t.scheduled_at)}{t.location ? ` · ${t.location}` : ''}</div>
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 10 }}>{t.title}</div>
                {t.roteiro && <>
                  <div className="ag-roteiro-label">Roteiro</div>
                  <div className="ag-roteiro">{t.roteiro}</div>
                </>}
                {t.reference_link && (
                  <div className="ag-link">
                    <a href={t.reference_link} target="_blank" rel="noopener noreferrer">🔗 {t.reference_link}</a>
                    <button onClick={() => navigator.clipboard.writeText(t.reference_link || '')}>Copiar</button>
                  </div>
                )}
                {t.status === 'pendente' && (
                  <button className="ag-action accept" disabled={busyTaskId === t.id} onClick={() => act('team_accept_task', t.id)}>{busyTaskId === t.id ? '...' : 'Aceitar tarefa'}</button>
                )}
                {t.status === 'aceito' && (
                  <button className="ag-action done" disabled={busyTaskId === t.id} onClick={() => act('team_complete_task', t.id)}>{busyTaskId === t.id ? '...' : 'Marcar como concluído'}</button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
