'use client'
import { useState, useEffect, useMemo } from 'react'

interface Client { id: string; name: string; address: string | null; notes: string | null }
interface TeamMember { id: string; name: string; email: string; phone: string | null; status: string }
interface Task {
  id: string; client_id: string; title: string; roteiro: string | null; reference_link: string | null
  location: string | null; scheduled_at: string; assigned_to: string | null; status: 'pendente' | 'aceito' | 'concluido'
  client?: { name: string } | { name: string }[] | null
  team?: { name: string } | { name: string }[] | null
}

const STATUS_COLOR: Record<string, string> = { pendente: '#fab219', aceito: '#2a78d6', concluido: '#0ca30c', atrasado: '#d03b3b' }
const STATUS_LABEL: Record<string, string> = { pendente: 'Pendente', aceito: 'Aceito', concluido: 'Concluído', atrasado: 'Atrasado' }

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

function isAtrasada(t: Task): boolean {
  return t.status !== 'concluido' && new Date(t.scheduled_at).getTime() < Date.now()
}

function effectiveStatus(t: Task): string {
  return isAtrasada(t) ? 'atrasado' : t.status
}

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function AgendaTab() {
  const [clients, setClients] = useState<Client[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  const [statusFilter, setStatusFilter] = useState('todos')
  const [periodFilter, setPeriodFilter] = useState('todos')

  const [showNewTask, setShowNewTask] = useState(false)
  const [showNewClient, setShowNewClient] = useState(false)
  const [taskForm, setTaskForm] = useState({ client_id: '', title: '', roteiro: '', reference_link: '', location: '', scheduled_at: '', assigned_to: '' })
  const [clientForm, setClientForm] = useState({ name: '', address: '', notes: '' })
  const [teamForm, setTeamForm] = useState({ name: '', email: '', phone: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const res = await fetch('/api/agenda')
    const data = await res.json()
    setClients(data.clients || [])
    setTeam(data.team || [])
    setTasks(data.tasks || [])
    setLoading(false)
  }

  async function call(action: string, payload: any) {
    const res = await fetch('/api/agenda', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }) })
    return res.json()
  }

  async function createTask() {
    if (!taskForm.client_id || !taskForm.title.trim() || !taskForm.scheduled_at) return alert('Preencha cliente, título e data/hora')
    setSaving(true)
    const data = await call('create_task', { ...taskForm, scheduled_at: new Date(taskForm.scheduled_at).toISOString() })
    setSaving(false)
    if (data.error) return alert(data.error)
    setTaskForm({ client_id: '', title: '', roteiro: '', reference_link: '', location: '', scheduled_at: '', assigned_to: '' })
    setShowNewTask(false)
    load()
  }

  async function createClient() {
    if (!clientForm.name.trim()) return alert('Preencha o nome do cliente')
    setSaving(true)
    const data = await call('create_client', clientForm)
    setSaving(false)
    if (data.error) return alert(data.error)
    setClientForm({ name: '', address: '', notes: '' })
    setShowNewClient(false)
    load()
  }

  async function inviteTeam() {
    if (!teamForm.name.trim() || !teamForm.email.trim()) return alert('Preencha nome e email')
    setSaving(true)
    const data = await call('create_team', teamForm)
    setSaving(false)
    if (data.error) return alert(data.error)
    setTeamForm({ name: '', email: '', phone: '' })
    load()
  }

  async function deleteTask(id: string) {
    if (!confirm('Excluir essa tarefa?')) return
    await call('delete_task', { id })
    load()
  }

  const filtered = useMemo(() => {
    const now = Date.now()
    const weekMs = 7 * 24 * 60 * 60 * 1000
    return tasks.filter(t => {
      if (statusFilter !== 'todos' && effectiveStatus(t) !== statusFilter) return false
      if (periodFilter === 'semana' && Math.abs(new Date(t.scheduled_at).getTime() - now) > weekMs) return false
      if (periodFilter === 'mes' && new Date(t.scheduled_at).getMonth() !== new Date().getMonth()) return false
      return true
    })
  }, [tasks, statusFilter, periodFilter])

  const counts = useMemo(() => {
    const c = { pendente: 0, aceito: 0, concluido: 0, atrasado: 0 }
    const thisMonth = new Date().getMonth()
    tasks.forEach(t => {
      const st = effectiveStatus(t)
      if (st === 'concluido') { if (new Date(t.scheduled_at).getMonth() === thisMonth) c.concluido++ }
      else if (st in c) (c as any)[st]++
    })
    return c
  }, [tasks])

  const byPerson = useMemo(() => {
    const map: Record<string, number> = {}
    tasks.forEach(t => {
      const name = one(t.team)?.name || 'Sem responsável'
      map[name] = (map[name] || 0) + 1
    })
    const arr = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6)
    const max = Math.max(1, ...arr.map(a => a[1]))
    return { arr, max }
  }, [tasks])

  const s: Record<string, any> = {
    panel: { background: '#12151A', border: '1px solid #232830', padding: '18px 20px' },
    panelTitle: { fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: '#5B6473', textTransform: 'uppercase' as const, marginBottom: 16 },
    label: { fontSize: 10, fontWeight: 700, color: '#5B6473', textTransform: 'uppercase' as const, letterSpacing: 1, display: 'block', marginBottom: 6, marginTop: 12 },
    input: { width: '100%', background: '#161A20', border: '1px solid #333B46', color: '#EDEFF2', padding: '9px 11px', fontSize: 13, fontFamily: 'ui-monospace,monospace', outline: 'none' },
    btnPrimary: { fontFamily: 'inherit', background: '#FFB020', color: '#0B0D10', border: 'none', padding: '10px 18px', fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' as const, cursor: 'pointer' },
    fchip: (on: boolean) => ({ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' as const, padding: '8px 13px', border: `1px solid ${on ? '#FFB020' : '#333B46'}`, background: on ? '#FFB020' : '#12151A', color: on ? '#0B0D10' : '#8B95A3', cursor: 'pointer' }),
  }

  return (
    <div style={{ background: '#0B0D10', color: '#EDEFF2', fontFamily: 'ui-monospace,SF Mono,Roboto Mono,Menlo,Consolas,monospace', margin: -24, padding: 24 }}>
      <style>{`
        .at-tiles { display:grid; grid-template-columns:repeat(4,1fr); gap:1px; background:#333B46; border:1px solid #333B46; margin-bottom:20px; }
        @media(max-width:760px){ .at-tiles { grid-template-columns:repeat(2,1fr); } }
        .at-grid2 { display:grid; grid-template-columns:1.3fr 1fr; gap:1px; background:#333B46; border:1px solid #333B46; margin-bottom:20px; }
        @media(max-width:900px){ .at-grid2 { grid-template-columns:1fr; } }
        .at-form2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        @media(max-width:600px){ .at-form2 { grid-template-columns:1fr; } }
        .at-task-row { display:grid; grid-template-columns:auto 1fr auto; gap:14px; align-items:center; background:#12151A; padding:14px 16px; }
        .at-task-meta { display:flex; align-items:center; gap:10px; }
        @media(max-width:640px){
          .at-task-row { grid-template-columns:auto 1fr; row-gap:10px; }
          .at-task-meta { grid-column:1 / -1; justify-content:space-between; }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12, borderBottom: '1px solid #333B46', paddingBottom: 14 }}>
        <div style={{ fontFamily: "'Oswald','Arial Narrow',sans-serif", fontWeight: 700, fontSize: 22, letterSpacing: 1, textTransform: 'uppercase' }}>
          Agenda <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 10, color: '#5B6473', border: '1px solid #333B46', padding: '3px 7px', marginLeft: 8 }}>/producao</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ ...s.btnPrimary, background: 'transparent', color: '#8B95A3', border: '1px solid #333B46' }} onClick={() => setShowNewClient(v => !v)}>+ Cliente</button>
          <button style={s.btnPrimary} onClick={() => setShowNewTask(v => !v)}>+ Nova Tarefa</button>
        </div>
      </div>

      {loading ? <div style={{ color: '#5B6473', fontSize: 13 }}>Carregando...</div> : <>

      <div className="at-tiles">
        {(['pendente', 'aceito', 'concluido', 'atrasado'] as const).map(k => (
          <div key={k} style={{ background: '#12151A', padding: 16, borderLeft: `2px solid ${STATUS_COLOR[k]}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: '#5B6473', textTransform: 'uppercase', marginBottom: 10 }}>
              {k === 'concluido' ? 'Concluídos (mês)' : STATUS_LABEL[k] + 's'}
            </div>
            <div style={{ fontFamily: "'Oswald','Arial Narrow',sans-serif", fontSize: 32, fontWeight: 700, color: STATUS_COLOR[k] }}>{String(counts[k]).padStart(2, '0')}</div>
          </div>
        ))}
      </div>

      <div className="at-grid2">
        <div style={s.panel}>
          <div style={s.panelTitle}>Tarefas por pessoa</div>
          {byPerson.arr.length === 0 && <div style={{ fontSize: 12, color: '#5B6473' }}>Sem tarefas ainda.</div>}
          {byPerson.arr.map(([name, count]) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, fontSize: 11.5 }}>
              <span style={{ width: 100, flexShrink: 0, fontWeight: 700 }}>{name.toUpperCase()}</span>
              <div style={{ flex: 1, height: 6, background: '#161A20', border: '1px solid #232830' }}>
                <div style={{ height: '100%', background: '#FFB020', width: `${(count / byPerson.max) * 100}%` }} />
              </div>
              <span style={{ width: 20, textAlign: 'right', color: '#5B6473' }}>{String(count).padStart(2, '0')}</span>
            </div>
          ))}
        </div>

        <div style={s.panel}>
          <div style={s.panelTitle}>Equipe <span style={{ color: '#FFB020' }}>// {team.filter(t => t.status === 'ativo').length} ativos</span></div>
          {team.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, padding: '9px 0', borderBottom: '1px solid #232830' }}>
              <span style={{ width: 26, height: 26, background: '#161A20', border: '1px solid #333B46', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{initials(m.name)}</span>
              <span style={{ fontWeight: 700, flex: 1 }}>{m.name}</span>
              <span style={{ fontSize: 10, color: m.status === 'ativo' ? '#0ca30c' : '#5B6473' }}>{m.status === 'ativo' ? 'ATIVO' : 'CONVIDADO'}</span>
            </div>
          ))}
          {team.length === 0 && <div style={{ fontSize: 12, color: '#5B6473', marginBottom: 10 }}>Ninguém convidado ainda.</div>}
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed #333B46' }}>
            <label style={s.label}>Convidar por email</label>
            <input style={s.input} placeholder="Nome" value={teamForm.name} onChange={e => setTeamForm(f => ({ ...f, name: e.target.value }))} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              <input style={{ ...s.input, flex: '1 1 160px' }} placeholder="email@exemplo.com" value={teamForm.email} onChange={e => setTeamForm(f => ({ ...f, email: e.target.value }))} />
              <input style={{ ...s.input, flex: '1 1 110px', maxWidth: 130 }} placeholder="WhatsApp" value={teamForm.phone} onChange={e => setTeamForm(f => ({ ...f, phone: e.target.value }))} />
              <button style={s.btnPrimary} disabled={saving} onClick={inviteTeam}>Enviar</button>
            </div>
          </div>
        </div>
      </div>

      {showNewClient && (
        <div style={{ ...s.panel, marginBottom: 20 }}>
          <div style={s.panelTitle}>Novo cliente</div>
          <label style={s.label}>Nome</label>
          <input style={s.input} value={clientForm.name} onChange={e => setClientForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Açougue Ponte Seca" />
          <label style={s.label}>Endereço</label>
          <input style={s.input} value={clientForm.address} onChange={e => setClientForm(f => ({ ...f, address: e.target.value }))} placeholder="Ex: Rua Trindade, 214" />
          <label style={s.label}>Observações</label>
          <input style={s.input} value={clientForm.notes} onChange={e => setClientForm(f => ({ ...f, notes: e.target.value }))} placeholder="Opcional" />
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button style={s.btnPrimary} disabled={saving} onClick={createClient}>Salvar cliente</button>
            <button style={{ ...s.btnPrimary, background: 'transparent', color: '#8B95A3', border: '1px solid #333B46' }} onClick={() => setShowNewClient(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {showNewTask && (
        <div style={{ ...s.panel, marginBottom: 20 }}>
          <div style={s.panelTitle}>Nova tarefa</div>
          <div className="at-form2">
            <div>
              <label style={s.label}>Cliente</label>
              <select style={s.input} value={taskForm.client_id} onChange={e => setTaskForm(f => ({ ...f, client_id: e.target.value }))}>
                <option value="">Selecione...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>Responsável</label>
              <select style={s.input} value={taskForm.assigned_to} onChange={e => setTaskForm(f => ({ ...f, assigned_to: e.target.value }))}>
                <option value="">Sem responsável ainda</option>
                {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>
          <label style={s.label}>Título</label>
          <input style={s.input} value={taskForm.title} onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: Reels — Promoção de carnes" />
          <div className="at-form2">
            <div>
              <label style={s.label}>Data e hora da captação</label>
              <input style={s.input} type="datetime-local" value={taskForm.scheduled_at} onChange={e => setTaskForm(f => ({ ...f, scheduled_at: e.target.value }))} />
            </div>
            <div>
              <label style={s.label}>Local</label>
              <input style={s.input} value={taskForm.location} onChange={e => setTaskForm(f => ({ ...f, location: e.target.value }))} placeholder="Ex: Loja do cliente" />
            </div>
          </div>
          <label style={s.label}>Roteiro</label>
          <textarea style={{ ...s.input, resize: 'vertical' as const, minHeight: 70 }} value={taskForm.roteiro} onChange={e => setTaskForm(f => ({ ...f, roteiro: e.target.value }))} placeholder="Escreva o roteiro da gravação..." />
          <label style={s.label}>Link de vídeo de referência</label>
          <input style={s.input} value={taskForm.reference_link} onChange={e => setTaskForm(f => ({ ...f, reference_link: e.target.value }))} placeholder="https://instagram.com/reel/..." />
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button style={s.btnPrimary} disabled={saving} onClick={createTask}>{saving ? 'Salvando...' : 'Salvar tarefa'}</button>
            <button style={{ ...s.btnPrimary, background: 'transparent', color: '#8B95A3', border: '1px solid #333B46' }} onClick={() => setShowNewTask(false)}>Cancelar</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        <span style={s.fchip(statusFilter === 'todos')} onClick={() => setStatusFilter('todos')}>Todos</span>
        <span style={s.fchip(statusFilter === 'pendente')} onClick={() => setStatusFilter('pendente')}>Pendentes</span>
        <span style={s.fchip(statusFilter === 'aceito')} onClick={() => setStatusFilter('aceito')}>Aceitos</span>
        <span style={s.fchip(statusFilter === 'concluido')} onClick={() => setStatusFilter('concluido')}>Concluídos</span>
        <span style={s.fchip(statusFilter === 'atrasado')} onClick={() => setStatusFilter('atrasado')}>Atrasados</span>
        <span style={s.fchip(periodFilter === 'semana')} onClick={() => setPeriodFilter(periodFilter === 'semana' ? 'todos' : 'semana')}>Esta semana</span>
        <span style={s.fchip(periodFilter === 'mes')} onClick={() => setPeriodFilter(periodFilter === 'mes' ? 'todos' : 'mes')}>Este mês</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: '#333B46', border: '1px solid #333B46' }}>
        {filtered.length === 0 && <div style={{ background: '#12151A', padding: 20, fontSize: 12, color: '#5B6473', textAlign: 'center' }}>Nenhuma tarefa nesse filtro.</div>}
        {filtered.map(t => {
          const st = effectiveStatus(t)
          const client = one(t.client)
          const person = one(t.team)
          return (
            <div key={t.id} className="at-task-row" style={{ borderLeft: `3px solid ${STATUS_COLOR[st]}` }}>
              <div style={{ width: 38, height: 38, background: '#161A20', border: '1px solid #333B46', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🎬</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 13, fontWeight: 700, marginBottom: 3 }}>{t.title}</div>
                <div style={{ fontSize: 10.5, color: '#5B6473' }}>{(client?.name || '—').toUpperCase()} · {fmtWhenBR(t.scheduled_at)}{t.location ? ` · ${t.location}` : ''}</div>
              </div>
              <div className="at-task-meta">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {person && <span style={{ width: 26, height: 26, background: '#161A20', border: '1px solid #333B46', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{initials(person.name)}</span>}
                  <span style={{ fontFamily: 'ui-monospace,monospace', display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, padding: '4px 8px', border: `1px solid ${STATUS_COLOR[st]}`, color: STATUS_COLOR[st], textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{STATUS_LABEL[st]}</span>
                </div>
                <button onClick={() => deleteTask(t.id)} style={{ background: 'none', border: 'none', color: '#5B6473', cursor: 'pointer', fontSize: 15 }} title="Excluir">×</button>
              </div>
            </div>
          )
        })}
      </div>
      </>}
    </div>
  )
}

function fmtWhenBR(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
