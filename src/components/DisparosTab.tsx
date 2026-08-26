'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type MediaKind = 'audio' | 'video' | 'image'

interface MediaSlot {
  url: string
  localUrl?: string
}

interface MessageVariation {
  text: string
  mediaType: 'none' | MediaKind
  // Cada tipo de midia guarda seu proprio arquivo -- trocar de aba
  // (Audio/Video/Imagem) so muda qual esta ativo pro envio, sem apagar
  // o que ja foi carregado nos outros
  media: Record<MediaKind, MediaSlot>
}

function emptyMedia(): Record<MediaKind, MediaSlot> {
  return { audio: { url: '' }, video: { url: '' }, image: { url: '' } }
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
    { text: '', mediaType: 'none', media: emptyMedia() },
    { text: '', mediaType: 'none', media: emptyMedia() },
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
  // Chaves no formato "indice:tipo" (ex: "0:video") -- cada slot de midia
  // sobe/mostra progresso de forma independente
  const [mediaUploading, setMediaUploading] = useState<Record<string, boolean>>({})
  const [mediaUploadProgress, setMediaUploadProgress] = useState<Record<string, number>>({})
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

  function updateMediaSlot(i: number, type: MediaKind, updates: Partial<MediaSlot>) {
    setMessages(prev => prev.map((m, j) => j === i ? { ...m, media: { ...m.media, [type]: { ...m.media[type], ...updates } } } : m))
  }

  // Upload via XMLHttpRequest (nao supabase-js) so o xhr.upload tem evento
  // de progresso real -- o cliente padrao do Supabase usa fetch, que nao
  // reporta progresso de envio
  function uploadWithProgress(path: string, blob: Blob, contentType: string, onProgress: (pct: number) => void): Promise<void> {
    return new Promise(async (resolve, reject) => {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/blast-media/${path}`
      const xhr = new XMLHttpRequest()
      xhr.open('POST', url)
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      xhr.setRequestHeader('apikey', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      xhr.setRequestHeader('x-upsert', 'true')
      xhr.setRequestHeader('Content-Type', contentType || 'application/octet-stream')
      xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)) }
      xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.responseText || `HTTP ${xhr.status}`))
      xhr.onerror = () => reject(new Error('Falha de rede no upload'))
      xhr.send(blob)
    })
  }

  // Limites do proprio WhatsApp (nao so do Supabase) -- nao adianta liberar
  // upload maior no bucket se o WhatsApp vai recusar o envio depois
  const MEDIA_SIZE_LIMITS: Record<string, number> = { image: 5 * 1024 * 1024, video: 16 * 1024 * 1024, audio: 16 * 1024 * 1024 }
  const MEDIA_SIZE_LABELS: Record<string, string> = { image: '5MB', video: '16MB', audio: '16MB' }

  async function uploadMediaBlob(i: number, type: MediaKind, blob: Blob, ext: string, contentType?: string) {
    const limit = MEDIA_SIZE_LIMITS[type]
    if (blob.size > limit) {
      alert(`Arquivo muito grande (${(blob.size / 1024 / 1024).toFixed(1)}MB). O WhatsApp só aceita até ${MEDIA_SIZE_LABELS[type]} para esse tipo de mídia.`)
      return
    }

    // Preview local instantanea (URL.createObjectURL) -- toca direto do arquivo
    // que acabou de ser gravado/selecionado, sem depender do upload/rede/CDN.
    // Isso isola: se tocar aqui mas nao no link publico depois, o problema
    // era upload/servidor; se nem aqui tocar, o navegador nao decodifica o
    // que ele mesmo gravou (mais comum no Safari/iOS)
    const oldLocal = messages[i]?.media[type]?.localUrl
    if (oldLocal) URL.revokeObjectURL(oldLocal)
    const localUrl = URL.createObjectURL(blob)
    updateMediaSlot(i, type, { localUrl })

    const key = `${i}:${type}`
    setMediaUploading(prev => ({ ...prev, [key]: true }))
    setMediaUploadProgress(prev => ({ ...prev, [key]: 0 }))
    try {
      const path = `campanha-${Date.now()}-${i}-${type}.${ext}`
      await uploadWithProgress(path, blob, contentType || blob.type || 'application/octet-stream', pct => setMediaUploadProgress(prev => ({ ...prev, [key]: pct })))
      const { data } = supabase.storage.from('blast-media').getPublicUrl(path)
      updateMediaSlot(i, type, { url: data.publicUrl })
    } catch (err: any) {
      alert('Erro ao enviar arquivo: ' + err.message)
    } finally {
      setMediaUploading(prev => ({ ...prev, [key]: false }))
      setMediaUploadProgress(prev => ({ ...prev, [key]: 0 }))
    }
  }

  function handleMediaFile(i: number, type: MediaKind, file: File) {
    const ext = file.name.split('.').pop() || 'bin'
    uploadMediaBlob(i, type, file, ext, file.type)
  }

  // Ordem de preferencia: cada navegador grava num formato diferente
  // (Chrome/Android gravam webm, Safari/iOS grava mp4) — usar sempre
  // 'audio/webm' fixo quebra a reproducao no iPhone
  const AUDIO_MIME_CANDIDATES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']

  // Blobs montados a partir dos pedacos do MediaRecorder costumam sair sem
  // duracao valida no cabecalho (bug conhecido, principalmente webm/mp4
  // gravados incrementalmente) -- o navegador toca numa boa escaneando o
  // arquivo, mas ferramentas de conversao (como a que a Evolution API usa
  // pra transformar em nota de voz) podem entender a duracao como ~0-1s e
  // cortar o audio ali. Decodificar e regravar como WAV corrige isso: o
  // cabeçalho WAV e calculado direto da quantidade real de amostras
  function audioBufferToWav(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels
    const sampleRate = buffer.sampleRate
    const bytesPerSample = 2
    const blockAlign = numChannels * bytesPerSample
    const length = buffer.length * numChannels
    const interleaved = new Float32Array(length)
    for (let ch = 0; ch < numChannels; ch++) {
      const channelData = buffer.getChannelData(ch)
      for (let s = 0; s < buffer.length; s++) interleaved[s * numChannels + ch] = channelData[s]
    }
    const dataSize = interleaved.length * bytesPerSample
    const arrayBuf = new ArrayBuffer(44 + dataSize)
    const view = new DataView(arrayBuf)
    const writeStr = (offset: number, str: string) => { for (let k = 0; k < str.length; k++) view.setUint8(offset + k, str.charCodeAt(k)) }
    writeStr(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); writeStr(8, 'WAVE')
    writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
    view.setUint16(22, numChannels, true); view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * blockAlign, true); view.setUint16(32, blockAlign, true); view.setUint16(34, 16, true)
    writeStr(36, 'data'); view.setUint32(40, dataSize, true)
    let offset = 44
    for (let s = 0; s < interleaved.length; s++, offset += 2) {
      const v = Math.max(-1, Math.min(1, interleaved[s]))
      view.setInt16(offset, v < 0 ? v * 0x8000 : v * 0x7fff, true)
    }
    return new Blob([arrayBuf], { type: 'audio/wav' })
  }

  async function blobToWav(blob: Blob): Promise<Blob> {
    const arrayBuffer = await blob.arrayBuffer()
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    const ctx = new AudioCtx()
    try {
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
      return audioBufferToWav(audioBuffer)
    } finally {
      ctx.close()
    }
  }

  async function startRecording(i: number) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const supportedType = AUDIO_MIME_CANDIDATES.find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(t))
      const recorder = supportedType ? new MediaRecorder(stream, { mimeType: supportedType }) : new MediaRecorder(stream)
      recordedChunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) recordedChunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const actualType = recorder.mimeType || supportedType || 'audio/webm'
        const rawBlob = new Blob(recordedChunksRef.current, { type: actualType })
        try {
          const wavBlob = await blobToWav(rawBlob)
          uploadMediaBlob(i, 'audio', wavBlob, 'wav', 'audio/wav')
        } catch {
          // Se por algum motivo nao conseguir decodificar, manda o arquivo original
          const ext = actualType.includes('mp4') ? 'm4a' : actualType.includes('ogg') ? 'ogg' : 'webm'
          uploadMediaBlob(i, 'audio', rawBlob, ext, actualType)
        }
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

  // Limpa so o arquivo do tipo indicado -- os outros tipos ja carregados
  // nessa variacao continuam intactos
  function removeMedia(i: number, type: MediaKind) {
    const oldLocal = messages[i]?.media[type]?.localUrl
    if (oldLocal) URL.revokeObjectURL(oldLocal)
    updateMediaSlot(i, type, { url: '', localUrl: undefined })
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
      .filter(m => m.text.trim() || (m.mediaType !== 'none' && m.media[m.mediaType as MediaKind]?.url))
      .map(m => ({ text: m.text.trim(), media_url: m.mediaType !== 'none' ? m.media[m.mediaType as MediaKind].url : null, media_type: m.mediaType !== 'none' ? m.mediaType : null }))
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
      setName(''); setMessages([{ text: '', mediaType: 'none', media: emptyMedia() }, { text: '', mediaType: 'none', media: emptyMedia() }]); setScheduledAt('')
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
      .filter(m => m.text.trim() || (m.mediaType !== 'none' && m.media[m.mediaType as MediaKind]?.url))
      .map(m => ({ text: m.text.trim(), media_url: m.mediaType !== 'none' ? m.media[m.mediaType as MediaKind].url : null, media_type: m.mediaType !== 'none' ? m.mediaType : null }))
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
    cardTitle: { fontSize: 11, fontWeight: 700, color: 'var(--sign-dark)', letterSpacing: 1.5, textTransform: 'uppercase' as const, marginBottom: 18 },
    label: { fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6, marginTop: 12 },
    input: { width: '100%', background: '#f9f9f9', border: '1.5px solid #e5e5e5', borderRadius: 10, color: '#111', padding: '11px 14px', fontSize: 13, outline: 'none', marginBottom: 0 },
    textarea: { width: '100%', background: '#f9f9f9', border: '1.5px solid #e5e5e5', borderRadius: 10, color: '#111', padding: '11px 14px', fontSize: 13, outline: 'none', height: 75, resize: 'none' as const, fontFamily: 'inherit' },
    select: { width: '100%', background: '#f9f9f9', border: '1.5px solid #e5e5e5', borderRadius: 10, color: '#111', padding: '11px 14px', fontSize: 13, outline: 'none' },
    btnPrimary: { width: '100%', background: 'var(--sign)', color: 'var(--ink)', border: 'none', padding: 14, borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 10, marginTop: 16 },
    btnGhost: { width: '100%', background: '#fff', color: 'var(--sign-dark)', border: '1.5px solid var(--sign-dark)', padding: 12, borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
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
          <option value="no_hours">🕐 Empresas sem horário cadastrado</option>
          <option value="owner_phone">👤 ADM Empresas (WhatsApp do lojista)</option>
          <option value="residents">🏘️ Só moradores</option>
          <option value="broadcast_list">📋 Lista de transmissão</option>
        </select>
        {filter === 'no_group' && (
          <div style={{ fontSize: 11, color: '#92600a', marginTop: 6 }}>
            ✅ Ao enviar, cada empresa contatada é marcada automaticamente como "Grupo WA" na aba Usuários.
          </div>
        )}
        {filter === 'owner_phone' && (
          <div style={{ fontSize: 11, color: '#92600a', marginTop: 6 }}>
            📱 Manda pro WhatsApp do perfil pessoal do lojista (não pro WhatsApp cadastrado na empresa). Só entra quem tem telefone no perfil.
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
                <button key={val} onClick={() => updateMessageAt(i, { mediaType: val })}
                  style={{ position: 'relative', flex: 1, padding: '7px 6px', borderRadius: 8, border: msg.mediaType === val ? '1.5px solid var(--sign-dark)' : '1.5px solid #e5e5e5', background: msg.mediaType === val ? '#fff8e6' : '#fff', color: msg.mediaType === val ? '#92600a' : '#666', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Archivo,sans-serif' }}>
                  {lbl}
                  {val !== 'none' && msg.media[val].url && (
                    <span style={{ position: 'absolute', top: -4, right: -4, width: 9, height: 9, borderRadius: '50%', background: '#0F8050', border: '1.5px solid #fff' }} />
                  )}
                </button>
              ))}
            </div>

            {msg.mediaType === 'audio' && (() => {
              const slot = msg.media.audio
              const key = `${i}:audio`
              return (
                <div style={{ background: '#fff', border: '1.5px solid #eee', borderRadius: 10, padding: 10 }}>
                  {!slot.url && !slot.localUrl && recordingIndex !== i && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => startRecording(i)} disabled={recordingIndex !== null} style={{ flex: 1, padding: '9px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: recordingIndex !== null ? 0.5 : 1 }}>🔴 Gravar agora</button>
                      <label style={{ flex: 1, padding: '9px', background: '#fff', color: 'var(--sign-dark)', border: '1.5px solid var(--sign-dark)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>
                        📁 Carregar arquivo
                        <input type="file" accept="audio/*" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleMediaFile(i, 'audio', e.target.files[0])} />
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
                  {(slot.localUrl || slot.url) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <audio controls src={slot.localUrl || slot.url} style={{ flex: 1, height: 34 }} />
                      <button onClick={() => removeMedia(i, 'audio')} style={{ background: '#FCEBEB', color: '#E24B4A', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', flexShrink: 0 }}>🗑</button>
                    </div>
                  )}
                  {mediaUploading[key] && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#aaa', marginBottom: 4 }}>
                        <span>Enviando áudio pro servidor...</span>
                        <span>{mediaUploadProgress[key] || 0}%</span>
                      </div>
                      <div style={{ height: 6, background: '#eee', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${mediaUploadProgress[key] || 0}%`, background: 'var(--sign-dark)', borderRadius: 99, transition: 'width .15s' }} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {(msg.mediaType === 'video' || msg.mediaType === 'image') && (() => {
              const type = msg.mediaType as 'video' | 'image'
              const slot = msg.media[type]
              const key = `${i}:${type}`
              return (
                <div style={{ background: '#fff', border: '1.5px solid #eee', borderRadius: 10, padding: 10 }}>
                  {!slot.url && !slot.localUrl && (
                    <label style={{ display: 'block', padding: '9px', background: '#fff', color: 'var(--sign-dark)', border: '1.5px solid var(--sign-dark)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>
                      📁 Carregar {type === 'video' ? 'vídeo' : 'imagem'}
                      <input type="file" accept={type === 'video' ? 'video/*' : 'image/*'} style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleMediaFile(i, type, e.target.files[0])} />
                    </label>
                  )}
                  {(slot.localUrl || slot.url) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {type === 'video' ? (
                        <video controls src={slot.localUrl || slot.url} style={{ maxWidth: 150, maxHeight: 90, borderRadius: 8 }} />
                      ) : (
                        <img src={slot.localUrl || slot.url} alt="Prévia" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />
                      )}
                      <button onClick={() => removeMedia(i, type)} style={{ background: '#FCEBEB', color: '#E24B4A', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', flexShrink: 0 }}>🗑</button>
                    </div>
                  )}
                  {mediaUploading[key] && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#aaa', marginBottom: 4 }}>
                        <span>Enviando {type === 'video' ? 'vídeo' : 'imagem'} pro servidor...</span>
                        <span>{mediaUploadProgress[key] || 0}%</span>
                      </div>
                      <div style={{ height: 6, background: '#eee', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${mediaUploadProgress[key] || 0}%`, background: 'var(--sign-dark)', borderRadius: 99, transition: 'width .15s' }} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        ))}
        {messages.length < 5 && (
          <button style={s.btnAdd} onClick={() => setMessages([...messages, { text: '', mediaType: 'none', media: emptyMedia() }])}>+ Adicionar variação de mensagem</button>
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
              <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--sign-dark)', lineHeight: 1 }}>{previewCount}</div>
              <div>
                <div style={{ fontSize: 12, color: '#92600a', fontWeight: 600 }}>contatos encontrados</div>
                <div style={{ fontSize: 11, color: '#b89030', marginTop: 2 }}>blacklist já removida</div>
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 12, color: '#92600a' }}>
              Tempo estimado<br />
              <strong style={{ fontSize: 16, color: 'var(--sign-dark)' }}>{estimateTime()}</strong>
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
                  <div style={{ background: 'var(--sign-dark)', height: '100%', borderRadius: 99, width: `${pct}%` }} />
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
                        <span style={{ fontSize: 11, color: 'var(--sign-dark)', fontWeight: 600 }}>+ adicionar</span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <input style={{ ...s.input, flex: 1 }} placeholder="Número (contato sem cadastro)" value={manualPhone} onChange={e => setManualPhone(e.target.value)} />
                  <input style={{ ...s.input, flex: 1 }} placeholder="Nome (opcional)" value={manualName} onChange={e => setManualName(e.target.value)} />
                  <button onClick={() => addManualMember(l.id)}
                    style={{ background: '#fff', border: '1.5px solid var(--sign-dark)', color: 'var(--sign-dark)', padding: '11px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
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