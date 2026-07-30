'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface MessageVariation {
  text: string
  mediaType: 'none' | 'audio' | 'video' | 'image'
  mediaUrl: string
  localPreviewUrl?: string
}

interface Campaign {
  id: string
  name: string
  messages: { text: string; media_url?: string | null; media_type?: string | null }[]
  filter: string
  list_name?: string | null
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

interface BroadcastList {
  id: string
  name: string
  created_at: string
  member_count: number
}

interface BroadcastMember {
  id: string
  list_id: string
  phone: string
  name: string | null
  company: string | null
  source: string
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
  const [messages, setMessages] = useState<MessageVariation[]>([
    { text: '', mediaType: 'none', mediaUrl: '' },
    { text: '', mediaType: 'none', mediaUrl: '' },
  ])
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
  const [selectedListId, setSelectedListId] = useState('')

  // Listas de transmissão
  const [lists, setLists] = useState<BroadcastList[]>([])
  const [expandedListId, setExpandedListId] = useState<string | null>(null)
  const [listMembers, setListMembers] = useState<BroadcastMember[]>([])
  const [newListName, setNewListName] = useState('')
  const [listSearch, setListSearch] = useState('')
  const [listSearchResults, setListSearchResults] = useState<any[]>([])
  const [manualPhone, setManualPhone] = useState('')
  const [manualName, setManualName] = useState('')

  // Mídia por variação de mensagem
  const [mediaUploading, setMediaUploading] = useState<Record<number, boolean>>({})
  const [recordingIndex, setRecordingIndex] = useState<number | null>(null)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const recordTimerRef = useRef<any>(null)

  useEffect(() => {
    checkWaStatus()
    loadCampaigns()
    loadBlacklist()
    loadLists()
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

  async function loadLists() {
    const { data: listsData } = await supabase.from('broadcast_lists').select('*').order('name')
    const { data: membersData } = await supabase.from('broadcast_list_members').select('list_id')
    const counts: Record<string, number> = {}
    ;(membersData || []).forEach((m: any) => { counts[m.list_id] = (counts[m.list_id] || 0) + 1 })
    setLists((listsData || []).map((l: any) => ({ ...l, member_count: counts[l.id] || 0 })))
  }

  async function createList() {
    if (!newListName.trim()) return
    const { data, error } = await supabase.from('broadcast_lists').insert({ name: newListName.trim() }).select().single()
    if (error) return alert('Erro: ' + error.message)
    setNewListName('')
    await loadLists()
    if (data) setExpandedListId(data.id)
  }

  async function deleteList(id: string) {
    if (!confirm('Excluir esta lista de transmissão? Os contatos salvos nela serão perdidos.')) return
    await supabase.from('broadcast_lists').delete().eq('id', id)
    if (expandedListId === id) setExpandedListId(null)
    if (selectedListId === id) setSelectedListId('')
    await loadLists()
  }

  async function toggleExpandList(id: string) {
    if (expandedListId === id) { setExpandedListId(null); return }
    setExpandedListId(id)
    setListSearch(''); setListSearchResults([])
    const { data } = await supabase.from('broadcast_list_members').select('*').eq('list_id', id).order('created_at', { ascending: false })
    setListMembers(data || [])
  }

  async function searchForList(q: string) {
    setListSearch(q)
    if (q.length < 2) { setListSearchResults([]); return }
    const results: any[] = []
    const { data: companies } = await supabase.from('companies').select('name, phone').ilike('name', `%${q}%`).not('phone', 'is', null).limit(5)
    const { data: byPhone } = await supabase.from('companies').select('name, phone').ilike('phone', `%${q}%`).not('phone', 'is', null).limit(3)
    ;(companies || []).forEach((c: any) => results.push({ name: c.name, phone: c.phone, company: c.name, source: 'company' }))
    ;(byPhone || []).forEach((c: any) => { if (!results.find(r => r.phone === c.phone)) results.push({ name: c.name, phone: c.phone, company: c.name, source: 'company' }) })
    const { data: residents } = await supabase.from('profiles').select('name, phone').eq('user_type', 'user').ilike('name', `%${q}%`).not('phone', 'is', null).limit(5)
    ;(residents || []).forEach((r: any) => results.push({ name: r.name, phone: r.phone, company: '', source: 'resident' }))
    const { data: residentsByPhone } = await supabase.from('profiles').select('name, phone').eq('user_type', 'user').ilike('phone', `%${q}%`).not('phone', 'is', null).limit(3)
    ;(residentsByPhone || []).forEach((r: any) => { if (!results.find(res => res.phone === r.phone)) results.push({ name: r.name, phone: r.phone, company: '', source: 'resident' }) })
    setListSearchResults(results.slice(0, 8))
  }

  async function addMemberToList(listId: string, member: { phone: string; name: string; company?: string; source: string }) {
    const { error } = await supabase.from('broadcast_list_members').insert({
      list_id: listId, phone: member.phone, name: member.name, company: member.company || null, source: member.source
    })
    if (error) {
      if (error.code === '23505') alert('Esse número já está nesta lista.')
      else alert('Erro: ' + error.message)
      return
    }
    setListSearch(''); setListSearchResults([])
    await toggleExpandListRefresh(listId)
    await loadLists()
  }

  async function addManualMember(listId: string) {
    if (!manualPhone.trim()) return
    await addMemberToList(listId, { phone: manualPhone.trim(), name: manualName.trim() || manualPhone.trim(), source: 'manual' })
    setManualPhone(''); setManualName('')
  }

  async function toggleExpandListRefresh(listId: string) {
    const { data } = await supabase.from('broadcast_list_members').select('*').eq('list_id', listId).order('created_at', { ascending: false })
    setListMembers(data || [])
  }

  async function removeMember(memberId: string, listId: string) {
    await supabase.from('broadcast_list_members').delete().eq('id', memberId)
    await toggleExpandListRefresh(listId)
    await loadLists()
  }

  function updateMessageAt(i: number, updates: Partial<MessageVariation>) {
    setMessages(prev => prev.map((m, j) => j === i ? { ...m, ...updates } : m))
  }

  async function uploadMediaBlob(i: number, blob: Blob, ext: string, contentType?: string) {
    // Preview local instantanea (URL.createObjectURL) -- toca direto do arquivo
    // que acabou de ser gravado/selecionado, sem depender do upload/rede/CDN.
    // Isso isola: se tocar aqui mas nao no link publico depois, o problema
    // era upload/servidor; se nem aqui tocar, o navegador nao decodifica o
    // que ele mesmo gravou (mais comum no Safari/iOS)
    const oldLocal = messages[i]?.localPreviewUrl
    if (oldLocal) URL.revokeObjectURL(oldLocal)
    const localUrl = URL.createObjectURL(blob)
    updateMessageAt(i, { localPreviewUrl: localUrl })

    setMediaUploading(prev => ({ ...prev, [i]: true }))
    try {
      const path = `campanha-${Date.now()}-${i}.${ext}`
      const { error } = await supabase.storage.from('blast-media').upload(path, blob, { upsert: true, contentType: contentType || blob.type || undefined })
      if (error) { alert('Erro ao enviar arquivo: ' + error.message); return }
      const { data } = supabase.storage.from('blast-media').getPublicUrl(path)
      updateMessageAt(i, { mediaUrl: data.publicUrl })
    } finally {
      setMediaUploading(prev => ({ ...prev, [i]: false }))
    }
  }

  function handleMediaFile(i: number, file: File) {
    const ext = file.name.split('.').pop() || 'bin'
    uploadMediaBlob(i, file, ext, file.type)
  }

  // Ordem de preferencia: cada navegador grava num formato diferente
  // (Chrome/Android gravam webm, Safari/iOS grava mp4) — usar sempre
  // 'audio/webm' fixo quebra a reproducao no iPhone
  const AUDIO_MIME_CANDIDATES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']

  async function startRecording(i: number) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const supportedType = AUDIO_MIME_CANDIDATES.find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(t))
      const recorder = supportedType ? new MediaRecorder(stream, { mimeType: supportedType }) : new MediaRecorder(stream)
      recordedChunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) recordedChunksRef.current.push(e.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const actualType = recorder.mimeType || supportedType || 'audio/webm'
        const ext = actualType.includes('mp4') ? 'm4a' : actualType.includes('ogg') ? 'ogg' : 'webm'
        const blob = new Blob(recordedChunksRef.current, { type: actualType })
        uploadMediaBlob(i, blob, ext, actualType)
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setRecordingIndex(i)
      setRecordSeconds(0)
      recordTimerRef.current = setInterval(() => setRecordSeconds(s => s + 1), 1000)
    } catch {
      alert('Não foi possível acessar o microfone. Verifique a permissão do navegador.')
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    setRecordingIndex(null)
    clearInterval(recordTimerRef.current)
  }

  function removeMedia(i: number) {
    const oldLocal = messages[i]?.localPreviewUrl
    if (oldLocal) URL.revokeObjectURL(oldLocal)
    updateMessageAt(i, { mediaType: 'none', mediaUrl: '', localPreviewUrl: undefined })
  }

  async function calcPreview() {
    const res = await fetch('/api/blast/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter, list_id: filter === 'broadcast_list' ? selectedListId : undefined })
    })
    const data = await res.json()
    setPreviewCount(data.count ?? null)
  }

  useEffect(() => { calcPreview() }, [filter, selectedListId])

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
    const validMessages = messages
      .filter(m => m.text.trim() || (m.mediaType !== 'none' && m.mediaUrl))
      .map(m => ({ text: m.text.trim(), media_url: m.mediaType !== 'none' ? m.mediaUrl : null, media_type: m.mediaType !== 'none' ? m.mediaType : null }))
    if (validMessages.length === 0) return alert('Adicione pelo menos uma mensagem ou uma mídia (aguarde o upload terminar)')
    if (filter === 'broadcast_list' && !selectedListId) return alert('Escolha uma lista de transmissão')
    if (Object.values(mediaUploading).some(Boolean)) return alert('Aguarde o envio da mídia terminar')
    setLoading(true)
    try {
      const listName = filter === 'broadcast_list' ? (lists.find(l => l.id === selectedListId)?.name || null) : null
      const res = await fetch('/api/blast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          name,
          messages: validMessages,
          filter,
          list_id: filter === 'broadcast_list' ? selectedListId : undefined,
          list_name: listName,
          delay_min: delayMin,
          delay_max: delayMax,
          scheduled_at: scheduledAt || null,
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
      setName(''); setMessages([{ text: '', mediaType: 'none', mediaUrl: '' }, { text: '', mediaType: 'none', mediaUrl: '' }]); setScheduledAt('')
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
    if (Object.values(mediaUploading).some(Boolean)) return alert('Aguarde o envio da mídia terminar')
    const validMessages = messages
      .filter(m => m.text.trim() || (m.mediaType !== 'none' && m.mediaUrl))
      .map(m => ({ text: m.text.trim(), media_url: m.mediaType !== 'none' ? m.mediaUrl : null, media_type: m.mediaType !== 'none' ? m.mediaType : null }))
    if (validMessages.length === 0) return alert("Adicione pelo menos uma mensagem ou uma mídia (aguarde o upload terminar)")
    setTestSending(true)
    setTestSent(false)
    try {
      const res = await fetch("/api/blast/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: testSelected.phone, name: testSelected.name, company: testSelected.name, messages: validMessages,
        })
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
          <option value="companies">🏪 Todas as empresas (pagas + gratuitas)</option>
          <option value="paid">💛 Só empresas pagas</option>
          <option value="unpaid">⭕ Só empresas não pagas</option>
          <option value="no_group">📵 Empresas sem grupo WA</option>
          <option value="residents">🏘️ Só moradores</option>
          <option value="broadcast_list">📋 Lista de transmissão</option>
        </select>
        {filter === 'no_group' && (
          <div style={{ fontSize: 11, color: '#92600a', marginTop: 6 }}>
            ✅ Ao enviar, cada empresa contatada é marcada automaticamente como "Grupo WA" na aba Usuários.
          </div>
        )}
        {filter === 'broadcast_list' && (
          <>
            <select style={{ ...s.select, marginTop: 8 }} value={selectedListId} onChange={e => setSelectedListId(e.target.value)}>
              <option value="">Selecione uma lista...</option>
              {lists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.member_count} contatos)</option>)}
            </select>
            {lists.length === 0 && (
              <div style={{ fontSize: 11, color: '#92600a', marginTop: 6 }}>
                Nenhuma lista criada ainda. Crie uma no card "📋 Listas de Transmissão" mais abaixo.
              </div>
            )}
          </>
        )}

        <label style={s.label}>
          Variações de mensagem <span style={{ color: '#aaa', fontWeight: 400 }}>(até 5 — sorteadas aleatoriamente, cada uma com sua própria mídia)</span>
        </label>
        <div style={{ marginBottom: 8 }}>
          <button onClick={() => updateMessageAt(activeTextarea, { text: (messages[activeTextarea]?.text || '') + '{{nome}}' })} style={{ ...s.varTag, cursor: 'pointer', border: '1px solid #f0d080' }}>{'+ {{nome}}'}</button>
          <button onClick={() => updateMessageAt(activeTextarea, { text: (messages[activeTextarea]?.text || '') + '{{empresa}}' })} style={{ ...s.varTag, cursor: 'pointer', border: '1px solid #f0d080' }}>{'+ {{empresa}}'}</button>
        </div>

        {messages.map((msg, i) => (
          <div key={i} style={{ background: '#fafafa', border: '1.5px solid #eee', borderRadius: 12, padding: 12, marginBottom: 10 }}>
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <textarea
                style={{ ...s.textarea, paddingRight: 36, background: '#fff' }} onFocus={() => setActiveTextarea(i)}
                value={msg.text}
                onChange={e => updateMessageAt(i, { text: e.target.value })}
                placeholder={`Variação ${i + 1}...`}
              />
              {messages.length > 1 && (
                <button onClick={() => setMessages(messages.filter((_, j) => j !== i))}
                  style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 18 }}>×</button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {([['none','Nenhuma'],['audio','🎙️ Áudio'],['video','🎥 Vídeo'],['image','🖼️ Imagem']] as const).map(([val,lbl]) => (
                <button key={val} onClick={() => { if (val !== msg.mediaType) removeMedia(i); updateMessageAt(i, { mediaType: val }) }}
                  style={{ flex: 1, padding: '7px 6px', borderRadius: 8, border: msg.mediaType === val ? '1.5px solid #C9951A' : '1.5px solid #e5e5e5', background: msg.mediaType === val ? '#fff8e6' : '#fff', color: msg.mediaType === val ? '#92600a' : '#666', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                  {lbl}
                </button>
              ))}
            </div>

            {msg.mediaType === 'audio' && (
              <div style={{ background: '#fff', border: '1.5px solid #eee', borderRadius: 10, padding: 10 }}>
                {!msg.mediaUrl && !msg.localPreviewUrl && recordingIndex !== i && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => startRecording(i)} disabled={recordingIndex !== null} style={{ flex: 1, padding: '9px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: recordingIndex !== null ? 0.5 : 1 }}>🔴 Gravar agora</button>
                    <label style={{ flex: 1, padding: '9px', background: '#fff', color: '#C9951A', border: '1.5px solid #C9951A', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>
                      📁 Carregar arquivo
                      <input type="file" accept="audio/*" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleMediaFile(i, e.target.files[0])} />
                    </label>
                  </div>
                )}
                {recordingIndex === i && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#E24B4A' }} />
                    <div style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>Gravando... {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, '0')}</div>
                    <button onClick={stopRecording} style={{ padding: '7px 14px', background: '#E24B4A', color: '#fff', border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>⏹ Parar</button>
                  </div>
                )}
                {(msg.localPreviewUrl || msg.mediaUrl) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <audio controls src={msg.localPreviewUrl || msg.mediaUrl} style={{ flex: 1, height: 34 }} />
                    <button onClick={() => removeMedia(i)} style={{ background: '#FCEBEB', color: '#E24B4A', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', flexShrink: 0 }}>🗑</button>
                  </div>
                )}
                {mediaUploading[i] && <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>Enviando áudio pro servidor...</div>}
              </div>
            )}

            {(msg.mediaType === 'video' || msg.mediaType === 'image') && (
              <div style={{ background: '#fff', border: '1.5px solid #eee', borderRadius: 10, padding: 10 }}>
                {!msg.mediaUrl && !msg.localPreviewUrl && (
                  <label style={{ display: 'block', padding: '9px', background: '#fff', color: '#C9951A', border: '1.5px solid #C9951A', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>
                    📁 Carregar {msg.mediaType === 'video' ? 'vídeo' : 'imagem'}
                    <input type="file" accept={msg.mediaType === 'video' ? 'video/*' : 'image/*'} style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleMediaFile(i, e.target.files[0])} />
                  </label>
                )}
                {(msg.localPreviewUrl || msg.mediaUrl) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {msg.mediaType === 'video' ? (
                      <video controls src={msg.localPreviewUrl || msg.mediaUrl} style={{ maxWidth: 150, maxHeight: 90, borderRadius: 8 }} />
                    ) : (
                      <img src={msg.localPreviewUrl || msg.mediaUrl} alt="Prévia" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />
                    )}
                    <button onClick={() => removeMedia(i)} style={{ background: '#FCEBEB', color: '#E24B4A', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', flexShrink: 0 }}>🗑</button>
                  </div>
                )}
                {mediaUploading[i] && <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>Enviando pro servidor...</div>}
              </div>
            )}
          </div>
        ))}
        {messages.length < 5 && (
          <button style={s.btnAdd} onClick={() => setMessages([...messages, { text: '', mediaType: 'none', mediaUrl: '' }])}>+ Adicionar variação de mensagem</button>
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
                <div style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>
                  {c.total_contacts} contatos no total{c.list_name ? ` · 📋 ${c.list_name}` : ''}
                </div>
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
                  {c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : ''} · {c.total_contacts} contatos{c.list_name ? ` · 📋 ${c.list_name}` : ''}
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

      {/* LISTAS DE TRANSMISSÃO */}
      <div style={s.card}>
        <div style={s.cardTitle}>📋 Listas de Transmissão</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input style={{ ...s.input, flex: 1 }} placeholder="Nome da nova lista (ex: Feirantes da Praça)" value={newListName} onChange={e => setNewListName(e.target.value)} />
          <button onClick={createList}
            style={{ background: '#111', color: '#fff', border: 'none', padding: '11px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            + Nova lista
          </button>
        </div>

        {lists.length === 0 && <div style={{ color: '#aaa', fontSize: 13 }}>Nenhuma lista criada ainda.</div>}

        {lists.map(l => (
          <div key={l.id} style={{ border: '1.5px solid #eee', borderRadius: 12, marginBottom: 8, overflow: 'hidden' }}>
            <div onClick={() => toggleExpandList(l.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer', background: '#f9f9f9' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{l.name}</div>
                <div style={{ fontSize: 11, color: '#aaa' }}>{l.member_count} contato{l.member_count !== 1 ? 's' : ''}</div>
              </div>
              <button onClick={e => { e.stopPropagation(); deleteList(l.id) }}
                style={{ background: 'none', border: 'none', color: '#ddd', cursor: 'pointer', fontSize: 16 }}>🗑</button>
              <span style={{ color: '#aaa', fontSize: 12 }}>{expandedListId === l.id ? '▲' : '▼'}</span>
            </div>

            {expandedListId === l.id && (
              <div style={{ padding: 14, borderTop: '1.5px solid #eee' }}>
                <input style={s.input} placeholder="Buscar por nome ou número..." value={listSearch} onChange={e => searchForList(e.target.value)} />
                {listSearchResults.length > 0 && (
                  <div style={{ background: '#fff', border: '1.5px solid #eee', borderRadius: 10, overflow: 'hidden', marginTop: 8 }}>
                    {listSearchResults.map((r: any) => (
                      <div key={r.phone} onClick={() => addMemberToList(l.id, r)}
                        style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 28, height: 28, background: '#f0f0f0', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
                          {r.source === 'company' ? '🏪' : '👤'}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</div>
                          <div style={{ fontSize: 11, color: '#aaa' }}>{r.phone}</div>
                        </div>
                        <span style={{ fontSize: 11, color: '#C9951A', fontWeight: 600 }}>+ adicionar</span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <input style={{ ...s.input, flex: 1 }} placeholder="Número (contato sem cadastro)" value={manualPhone} onChange={e => setManualPhone(e.target.value)} />
                  <input style={{ ...s.input, flex: 1 }} placeholder="Nome (opcional)" value={manualName} onChange={e => setManualName(e.target.value)} />
                  <button onClick={() => addManualMember(l.id)}
                    style={{ background: '#fff', border: '1.5px solid #C9951A', color: '#C9951A', padding: '11px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    + Manual
                  </button>
                </div>

                <div style={{ marginTop: 14 }}>
                  {listMembers.length === 0 && <div style={{ color: '#aaa', fontSize: 12 }}>Nenhum contato nesta lista ainda.</div>}
                  {listMembers.map(m => (
                    <div key={m.id} style={s.blRow}>
                      <div style={{ fontSize: 16 }}>{m.source === 'company' ? '🏪' : m.source === 'resident' ? '👤' : '✏️'}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{m.name || m.phone}</div>
                        <div style={{ fontSize: 11, color: '#aaa' }}>{m.phone}{m.company ? ` — ${m.company}` : ''}</div>
                      </div>
                      <button onClick={() => removeMember(m.id, l.id)}
                        style={{ background: 'none', border: 'none', color: '#ddd', cursor: 'pointer', fontSize: 16 }}>🗑</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

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