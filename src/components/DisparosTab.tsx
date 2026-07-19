'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Campaign {
  id: string
  name: string
  messages: string[]
  filter: string
  delay_min: number
  delay_max: number
  status: string
  total_contacts: number
  sent_count: number
  failed_count: number
  scheduled_at: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

interface BlastLog {
  id: string
  campaign_id: string
  phone: string
  contact_name: string
  company_name: string
  message_sent: string
  status: string
  error_message: string | null
  sent_at: string | null
}

interface BlacklistItem {
  id: string
  phone: string
  contact_name: string
  reason: string
  created_at: string
}

export default function DisparosTab() {
  const [waStatus, setWaStatus] = useState<'connected' | 'disconnected' | 'loading'>('loading')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [logs, setLogs] = useState<BlastLog[]>([])
  const [blacklist, setBlacklist] = useState<BlacklistItem[]>([])
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  // Form
  const [name, setName] = useState('')
  const [filter, setFilter] = useState('all')
  const [messages, setMessages] = useState(['', ''])
  const [delayMin, setDelayMin] = useState(10)
  const [delayMax, setDelayMax] = useState(60)
  const [scheduledAt, setScheduledAt] = useState('')
  const [blPhone, setBlPhone] = useState('')
  const [blName, setBlName] = useState('')
  const [blReason, setBlReason] = useState('')
  const [testSearch, setTestSearch] = useState('')
  const [testResults, setTestResults] = useState<any[]>([])
  const [testSelected, setTestSelected] = useState<any>(null)
  const [testSending, setTestSending] = useState(false)
  const [testSent, setTestSent] = useState(false)
  const [activeTextarea, setActiveTextarea] = useState<number>(0)

  useEffect(() => {
    checkWaStatus()
    loadCampaigns()
    loadBlacklist()
    const interval = setInterval(() => {
      loadCampaigns()
      if (selectedCampaign) loadLogs(selectedCampaign)
    }, 8000)
    return () => clearInterval(interval)
  }, [selectedCampaign])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  async function checkWaStatus() {
    try {
      const res = await fetch('/api/blast/status')
      const data = await res.json()
      setWaStatus(data.connected ? 'connected' : 'disconnected')
    } catch {
      setWaStatus('disconnected')
    }
  }

  async function loadCampaigns() {
    const res = await fetch('/api/blast')
    const data = await res.json()
    setCampaigns(data.campaigns || [])
  }

  async function loadLogs(campaignId: string) {
    const res = await fetch(`/api/blast?campaign_id=${campaignId}`)
    const data = await res.json()
    setLogs(data.logs || [])
  }

  async function loadBlacklist() {
    const { data } = await supabase.from('blast_blacklist').select('*').order('created_at', { ascending: false })
    setBlacklist(data || [])
  }

  async function calcPreview() {
    const res = await fetch('/api/blast/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter })
    })
    const data = await res.json()
    setPreviewCount(data.count ?? null)
  }

  useEffect(() => { calcPreview() }, [filter])

  function estimateTime() {
    if (!previewCount) return ''
    const avg = (delayMin + delayMax) / 2
    const totalSecs = previewCount * avg
    if (totalSecs < 60) return `~${Math.round(totalSecs)}s`
    if (totalSecs < 3600) return `~${Math.round(totalSecs / 60)} min`
    return `~${(totalSecs / 3600).toFixed(1)}h`
  }

  async function createCampaign(startNow: boolean) {
    if (!name.trim()) return alert('Dê um nome para a campanha')
    const validMessages = messages.filter(m => m.trim())
    if (validMessages.length === 0) return alert('Adicione pelo menos uma mensagem')
    setLoading(true)
    try {
      const res = await fetch('/api/blast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          name,
          messages: validMessages,
          filter,
          delay_min: delayMin,
          delay_max: delayMax,
          scheduled_at: scheduledAt || null
        })
      })
      const data = await res.json()
      if (!data.ok) return alert('Erro: ' + data.error)
      if (startNow) {
        await fetch('/api/blast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'start', campaign_id: data.campaign_id })
        })
      }
      setName(''); setMessages(['', '']); setScheduledAt('')
      await loadCampaigns()
      if (data.campaign_id) { setSelectedCampaign(data.campaign_id); loadLogs(data.campaign_id) }
    } finally {
      setLoading(false)
    }
  }

  async function pauseCampaign(id: string) {
    await fetch('/api/blast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'pause', campaign_id: id }) })
    await loadCampaigns()
  }

  async function resumeCampaign(id: string) {
    await fetch('/api/blast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start', campaign_id: id }) })
    await loadCampaigns()
  }

  async function cancelCampaign(id: string) {
    if (!confirm('Cancelar campanha?')) return
    await fetch('/api/blast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', campaign_id: id }) })
    await loadCampaigns()
  }

  async function searchTestContact(q: string) {
    if (q.length < 2) { setTestResults([]); return }
    const results: any[] = []
    const { data: companies } = await supabase.from("companies").select("name, phone").ilike("name", `%${q}%`).not("phone", "is", null).limit(5)
    const { data: byPhone } = await supabase.from("companies").select("name, phone").ilike("phone", `%${q}%`).not("phone", "is", null).limit(3)
    ;(companies || []).forEach((c: any) => results.push({ name: c.name, phone: c.phone, type: "company" }))
    ;(byPhone || []).forEach((c: any) => { if (!results.find(r => r.phone === c.phone)) results.push({ name: c.name, phone: c.phone, type: "company" }) })
    const { data: residents } = await supabase.from("profiles").select("name, phone").eq("user_type", "user").ilike("name", `%${q}%`).not("phone", "is", null).limit(5)
    ;(residents || []).forEach((r: any) => results.push({ name: r.name, phone: r.phone, type: "resident" }))
    setTestResults(results.slice(0, 8))
  }

  async function sendTest() {
    if (!testSelected) return
    const validMessages = messages.filter((m: string) => m.trim())
    if (validMessages.length === 0) return alert("Adicione pelo menos uma mensagem")
    setTestSending(true)
    setTestSent(false)
    try {
      const res = await fetch("https://api.trindadeonline.com.br/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: testSelected.phone, name: testSelected.name, company: testSelected.name, messages: validMessages })
      })
      const data = await res.json()
      if (data.ok) { setTestSent(true); setTimeout(() => setTestSent(false), 3000) }
      else alert("Erro: " + data.error)
    } finally {
      setTestSending(false)
    }
  }

  async function addBlacklist() {
    if (!blPhone.trim()) return
    await supabase.from('blast_blacklist').insert({ phone: blPhone, contact_name: blName, reason: blReason })
    setBlPhone(''); setBlName(''); setBlReason('')
    loadBlacklist()
  }

  async function removeBlacklist(id: string) {
    await supabase.from('blast_blacklist').delete().eq('id', id)
    loadBlacklist()
  }

  const activeCampaigns = campaigns.filter(c => c.status === 'running' || c.status === 'paused')
  const historyCampaigns = campaigns.filter(c => c.status === 'completed' || c.status === 'failed')

  const s: Record<string, any> = {
    wrap: { padding: '0 0 40px 0' },
    card: { background: '#fff', borderRadius: 16, padding: 24, marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' },
    cardTitle: { fontSize: 11, fontWeight: 700, color: '#C9951A', letterSpacing: 1.5, textTransform: 'uppercase' as const, marginBottom: 18 },
    label: { fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6, marginTop: 12 },
    input: { width: '100%', background: '#f9f9f9', border: '1.5px solid #e5e5e5', borderRadius: 10, color: '#111', padding: '11px 14px', fontSize: 13, outline: 'none', marginBottom: 0 },
    textarea: { width: '100%', background: '#f9f9f9', border: '1.5px solid #e5e5e5', borderRadius: 10, color: '#111', padding: '11px 14px', fontSize: 13, outline: 'none', height: 75, resize: 'none' as const, fontFamily: 'inherit' },
    select: { width: '100%', background: '#f9f9f9', border: '1.5px solid #e5e5e5', borderRadius: 10, color: '#111', padding: '11px 14px', fontSize: 13, outline: 'none' },
    btnPrimary: { width: '100%', background: '#C9951A', color: '#111', border: 'none', padding: 14, borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 10, marginTop: 16 },
    btnGhost: { width: '100%', background: '#fff', color: '#C9951A', border: '1.5px solid #C9951A', padding: 12, borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
    btnAdd: { width: '100%', background: '#fafafa', border: '1.5px dashed #ddd', color: '#aaa', padding: 10, borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', marginTop: 6 },
    varTag: { background: '#fff8e6', border: '1px solid #f0d080', color: '#92600a', fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 6, fontFamily: 'monospace', marginRight: 6 },
    previewBox: { background: 'linear-gradient(135deg,#fff8e6,#fef3c7)', border: '1.5px solid #f0d080', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
    badge: (status: string) => {
      const map: Record<string, any> = {
        running: { background: '#fde68a', color: '#92400e' },
        completed: { background: '#dcfce7', color: '#166534' },
        paused: { background: '#dbeafe', color: '#1e40af' },
        failed: { background: '#fee2e2', color: '#991b1b' },
        pending: { background: '#f3f4f6', color: '#555' },
        queued: { background: '#f3f4f6', color: '#555' },
      }
      return { ...(map[status] || map.pending), fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 20 }
    },
    progressBar: { background: '#f0e0b0', borderRadius: 99, height: 8, overflow: 'hidden', marginBottom: 10 },
    logBox: { background: '#f9f9f9', border: '1.5px solid #eee', borderRadius: 12, padding: '14px 16px', height: 200, overflowY: 'auto' as const, fontSize: 12, lineHeight: '1.8', fontFamily: 'monospace' },
    histRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: '#f9f9f9', borderRadius: 12, marginBottom: 8, border: '1.5px solid #eee' },
    blRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#f9f9f9', borderRadius: 10, marginBottom: 6, border: '1.5px solid #eee' },
  }

  return (
    <div style={s.wrap}>

      {/* STATUS WHATSAPP */}
      <div style={s.card}>
        <div style={s.cardTitle}>📱 WhatsApp</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, background: waStatus === 'connected' ? '#dcfce7' : '#fee2e2', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>💬</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Trindade Online</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>instância: trindade</div>
          </div>
          <div style={{ background: waStatus === 'connected' ? '#dcfce7' : '#fee2e2', color: waStatus === 'connected' ? '#166534' : '#991b1b', fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20 }}>
            {waStatus === 'loading' ? '...' : waStatus === 'connected' ? '● Conectado' : '● Desconectado'}
          </div>
        </div>
      </div>

      {/* NOVA CAMPANHA */}
      <div style={s.card}>
        <div style={s.cardTitle}>🚀 Nova Campanha</div>

        <label style={s.label}>Nome da campanha</label>
        <input style={s.input} value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Promoção de julho — empresas free" />

        <label style={s.label}>Público-alvo</label>
        <select style={s.select} value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">👥 Todos (empresas + moradores)</option>
          <option value="paid">💛 Só empresas pagas</option>
          <option value="unpaid">⭕ Só empresas não pagas</option>
          <option value="residents">🏘️ Só moradores</option>
        </select>

        <label style={s.label}>
          Variações de mensagem <span style={{ color: '#aaa', fontWeight: 400 }}>(até 5 — sorteadas aleatoriamente)</span>
        </label>
        <div style={{ marginBottom: 8 }}>
          <button onClick={() => { const m = [...messages]; m[activeTextarea] = (m[activeTextarea] || '') + '{{nome}}'; setMessages(m) }} style={{ ...s.varTag, cursor: 'pointer', border: '1px solid #f0d080' }}>{'+ {{nome}}'}</button>
          <button onClick={() => { const m = [...messages]; m[activeTextarea] = (m[activeTextarea] || '') + '{{empresa}}'; setMessages(m) }} style={{ ...s.varTag, cursor: 'pointer', border: '1px solid #f0d080' }}>{'+ {{empresa}}'}</button>
        </div>

        {messages.map((msg, i) => (
          <div key={i} style={{ position: 'relative', marginBottom: 8 }}>
            <textarea
              style={{ ...s.textarea, paddingRight: 36 }} onFocus={() => setActiveTextarea(i)}
              value={msg}
              onChange={e => { const m = [...messages]; m[i] = e.target.value; setMessages(m) }}
              placeholder={`Variação ${i + 1}...`}
            />
            {messages.length > 1 && (
              <button onClick={() => setMessages(messages.filter((_, j) => j !== i))}
                style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 18 }}>×</button>
            )}
          </div>
        ))}
        {messages.length < 5 && (
          <button style={s.btnAdd} onClick={() => setMessages([...messages, ''])}>+ Adicionar variação de mensagem</button>
        )}

        <label style={s.label}>Intervalo entre envios (segundos)</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 4 }}>
          <div>
            <label style={{ ...s.label, color: '#aaa', marginTop: 0 }}>Mínimo</label>
            <input style={s.input} type="number" value={delayMin} onChange={e => setDelayMin(Number(e.target.value))} min={5} />
          </div>
          <div>
            <label style={{ ...s.label, color: '#aaa', marginTop: 0 }}>Máximo</label>
            <input style={s.input} type="number" value={delayMax} onChange={e => setDelayMax(Number(e.target.value))} min={10} />
          </div>
        </div>

        <label style={s.label}>Agendamento <span style={{ color: '#aaa', fontWeight: 400 }}>(opcional)</span></label>
        <input style={s.input} type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />

        {previewCount !== null && (
          <div style={s.previewBox}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: '#C9951A', lineHeight: 1 }}>{previewCount}</div>
              <div>
                <div style={{ fontSize: 12, color: '#92600a', fontWeight: 600 }}>contatos encontrados</div>
                <div style={{ fontSize: 11, color: '#b89030', marginTop: 2 }}>blacklist já removida</div>
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 12, color: '#92600a' }}>
              Tempo estimado<br />
              <strong style={{ fontSize: 16, color: '#C9951A' }}>{estimateTime()}</strong>
            </div>
          </div>
        )}

        {/* ENVIO DE TESTE */}
        <div style={{ background: '#f9f9f9', border: '1.5px solid #eee', borderRadius: 12, padding: 16, marginTop: 16, marginBottom: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: 1.5, textTransform: 'uppercase' as const, marginBottom: 12 }}>🧪 Envio de Teste</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              style={{ ...s.input, flex: 1 }}
              placeholder="Buscar por nome ou número..."
              value={testSearch}
              onChange={e => { setTestSearch(e.target.value); searchTestContact(e.target.value) }}
            />
          </div>
          {testResults.length > 0 && (
            <div style={{ background: '#fff', border: '1.5px solid #eee', borderRadius: 10, overflow: 'hidden', marginBottom: 10 }}>
              {testResults.map((r: any) => (
                <div key={r.phone} onClick={() => { setTestSelected(r); setTestResults([]) }}
                  style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, background: '#f0f0f0', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                    {r.type === 'company' ? '🏪' : '👤'}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: '#aaa' }}>{r.phone}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {testSelected && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff8e6', border: '1.5px solid #f0d080', borderRadius: 10, padding: '10px 14px', marginBottom: 10 }}>
              <div style={{ fontSize: 20 }}>{testSelected.type === 'company' ? '🏪' : '👤'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{testSelected.name}</div>
                <div style={{ fontSize: 11, color: '#92600a' }}>{testSelected.phone}</div>
              </div>
              <button onClick={() => setTestSelected(null)} style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>
          )}
          <button
            onClick={sendTest}
            disabled={!testSelected || testSending}
            style={{ width: '100%', background: testSelected ? '#111' : '#eee', color: testSelected ? '#fff' : '#aaa', border: 'none', padding: '11px 0', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: testSelected ? 'pointer' : 'not-allowed' }}>
            {testSending ? 'Enviando...' : testSent ? '✓ Enviado!' : '📤 Enviar teste para este número'}
          </button>
        </div>

        <button style={s.btnPrimary} onClick={() => createCampaign(true)} disabled={loading}>
          {loading ? 'Criando...' : '🚀 Criar e Disparar Agora'}
        </button>
        <button style={s.btnGhost} onClick={() => createCampaign(false)} disabled={loading}>
          📅 Criar e Agendar
        </button>
      </div>

      {/* CAMPANHAS ATIVAS */}
      {activeCampaigns.length > 0 && (
        <div style={s.card}>
          <div style={s.cardTitle}>📊 Em Andamento</div>
          {activeCampaigns.map(c => {
            const pct = c.total_contacts > 0 ? Math.round(((c.sent_count + c.failed_count) / c.total_contacts) * 100) : 0
            return (
              <div key={c.id} style={{ background: '#fff8e6', border: '1.5px solid #f0d080', borderRadius: 14, padding: 18, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={s.badge(c.status)}>{c.status === 'running' ? 'EM ANDAMENTO' : 'PAUSADA'}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{c.name}</div>
                </div>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>{c.total_contacts} contatos no total</div>
                <div style={s.progressBar}>
                  <div style={{ background: '#C9951A', height: '100%', borderRadius: 99, width: `${pct}%` }} />
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                  <span style={{ color: '#166534', fontWeight: 600 }}>✓ {c.sent_count} enviados</span>
                  <span style={{ color: '#991b1b', fontWeight: 600 }}>✗ {c.failed_count} falhas</span>
                  <span style={{ color: '#888' }}>◦ {c.total_contacts - c.sent_count - c.failed_count} pendentes</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button onClick={() => { setSelectedCampaign(c.id); loadLogs(c.id) }}
                    style={{ background: '#fff', border: '1.5px solid #ddd', color: '#555', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    📋 Ver log
                  </button>
                  {c.status === 'running' && (
                    <button onClick={() => pauseCampaign(c.id)}
                      style={{ background: '#fff', border: '1.5px solid #fde68a', color: '#92400e', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      ⏸ Pausar
                    </button>
                  )}
                  {c.status === 'paused' && (
                    <button onClick={() => resumeCampaign(c.id)}
                      style={{ background: '#dcfce7', border: 'none', color: '#166534', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      ▶ Retomar
                    </button>
                  )}
                  <button onClick={() => cancelCampaign(c.id)}
                    style={{ background: '#fff', border: '1.5px solid #fecaca', color: '#991b1b', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    ✕ Cancelar
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* LOG */}
      {selectedCampaign && (
        <div style={s.card}>
          <div style={s.cardTitle}>📋 Log em Tempo Real</div>
          <div style={s.logBox} ref={logRef}>
            {logs.length === 0 && <div style={{ color: '#aaa' }}>Nenhuma entrada no log ainda...</div>}
            {logs.map(l => (
              <div key={l.id} style={{ color: l.status === 'sent' ? '#166534' : l.status === 'failed' ? '#991b1b' : '#aaa' }}>
                {l.sent_at ? new Date(l.sent_at).toLocaleTimeString('pt-BR') : '...'} —{' '}
                {l.status === 'sent' ? '✓' : l.status === 'failed' ? '✗' : '◦'}{' '}
                {l.contact_name} ({l.phone}){l.error_message ? ` — ${l.error_message}` : ''}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* HISTÓRICO */}
      {historyCampaigns.length > 0 && (
        <div style={s.card}>
          <div style={s.cardTitle}>🗂️ Histórico</div>
          {historyCampaigns.map(c => (
            <div key={c.id} style={s.histRow}>
              <div style={s.badge(c.status)}>{c.status === 'completed' ? 'CONCLUÍDA' : 'CANCELADA'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                  {c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : ''} · {c.total_contacts} contatos
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 12 }}>
                <div style={{ color: '#166534', fontWeight: 600 }}>✓ {c.sent_count}</div>
                <div style={{ color: '#991b1b' }}>✗ {c.failed_count}</div>
              </div>
              <button onClick={() => { setSelectedCampaign(c.id); loadLogs(c.id) }}
                style={{ background: '#f0f0f0', border: 'none', color: '#555', padding: '7px 14px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                Ver log
              </button>
            </div>
          ))}
        </div>
      )}

      {/* BLACKLIST */}
      <div style={s.card}>
        <div style={s.cardTitle}>🚫 Blacklist — Não Perturbe</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, marginBottom: 14 }}>
          <input style={s.input} placeholder="Número" value={blPhone} onChange={e => setBlPhone(e.target.value)} />
          <input style={s.input} placeholder="Nome (opcional)" value={blName} onChange={e => setBlName(e.target.value)} />
          <input style={s.input} placeholder="Motivo (opcional)" value={blReason} onChange={e => setBlReason(e.target.value)} />
          <button onClick={addBlacklist}
            style={{ background: '#111', color: '#fff', border: 'none', padding: '11px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            + Adicionar
          </button>
        </div>
        {blacklist.length === 0 && <div style={{ color: '#aaa', fontSize: 13 }}>Nenhum número na blacklist.</div>}
        {blacklist.map(b => (
          <div key={b.id} style={s.blRow}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{b.phone}{b.contact_name ? ` — ${b.contact_name}` : ''}</div>
              {b.reason && <div style={{ fontSize: 11, color: '#aaa' }}>{b.reason}</div>}
            </div>
            <button onClick={() => removeBlacklist(b.id)}
              style={{ background: 'none', border: 'none', color: '#ddd', cursor: 'pointer', fontSize: 16 }}>🗑</button>
          </div>
        ))}
      </div>

    </div>
  )
}