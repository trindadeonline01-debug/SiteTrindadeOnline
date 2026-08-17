'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { compressImage } from '@/lib/compressImage'
import CrmShell from '@/components/CrmShell'

type Company = { id: string; name: string; crm_whatsapp_enabled: boolean }
type Instance = { id: string; instance_name: string; status: string; phone: string | null }
type Contact = {
  id: string; phone: string; name: string | null; last_message_at: string | null; last_read_at: string | null
  presence_state?: string | null; presence_until?: string | null; pinned?: boolean; archived?: boolean
}
type Message = {
  id: string; direction: 'in' | 'out'; body: string | null; media_type: string | null; media_url: string | null
  sent_at: string; signedUrl?: string | null; status?: string | null; reply_to_id?: string | null
  edited_at?: string | null; deleted_at?: string | null
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function tickIcon(status?: string | null) {
  if (status === 'read') return <span style={{ color: '#4FA8E8' }}>✓✓</span>
  if (status === 'delivered') return <span style={{ color: '#A79E8B' }}>✓✓</span>
  return <span style={{ color: '#A79E8B' }}>✓</span>
}

function highlightMatch(text: string, term: string) {
  if (!term.trim()) return text
  const idx = text.toLowerCase().indexOf(term.toLowerCase())
  if (idx === -1) return text
  return <>{text.slice(0, idx)}<mark className="msg-search-hit">{text.slice(idx, idx + term.length)}</mark>{text.slice(idx + term.length)}</>
}

function replySnippet(m: Message): string {
  if (m.body && m.media_type !== 'location' && m.media_type !== 'contact') return m.body
  switch (m.media_type) {
    case 'image': return '📷 Foto'
    case 'video': return '🎥 Vídeo'
    case 'audio': return '🎤 Áudio'
    case 'document': return `📄 ${m.body || 'Documento'}`
    case 'sticker': return '🏷️ Figurinha'
    case 'location': return '📍 Localização'
    case 'contact': return '👤 Contato'
    default: return ''
  }
}

export default function MensagensPage() {
  const [loading, setLoading] = useState(true)
  const [company, setCompany] = useState<Company | null>(null)
  const [instance, setInstance] = useState<Instance | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [connectError, setConnectError] = useState('')

  const [contacts, setContacts] = useState<Contact[]>([])
  const [selected, setSelected] = useState<Contact | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [recording, setRecording] = useState(false)
  const [mediaError, setMediaError] = useState('')
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editingMessage, setEditingMessage] = useState<Message | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const companyRef = useRef<Company | null>(null)
  const selectedRef = useRef<Contact | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const mediaUrlCacheRef = useRef<Map<string, string>>(new Map())
  const msgBodyRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login?redirect=/painel/crm/mensagens'; return }
      const { data: comp } = await supabase
        .from('companies').select('id, name, crm_whatsapp_enabled')
        .eq('owner_id', session.user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (!comp) { window.location.href = '/painel/crm'; return }
      setCompany(comp as Company)
      companyRef.current = comp as Company
      if (comp.crm_whatsapp_enabled) await loadInstance(comp.id)
      setLoading(false)
    })
  }, [])

  async function loadInstance(companyId: string) {
    const { data } = await supabase
      .from('crm_whatsapp_instances').select('id, instance_name, status, phone')
      .eq('company_id', companyId).order('created_at', { ascending: false }).limit(1).maybeSingle()
    setInstance((data as Instance) || null)
    if (data?.status === 'connected') await loadContacts(companyId)
    return data as Instance | null
  }

  async function loadContacts(companyId: string) {
    const { data } = await supabase
      .from('crm_contacts').select('id, phone, name, last_message_at, last_read_at, presence_state, presence_until, pinned, archived')
      .eq('company_id', companyId).not('last_message_at', 'is', null)
      .order('last_message_at', { ascending: false })
    setContacts((data || []) as Contact[])
  }

  async function togglePin(c: Contact, e: React.MouseEvent) {
    e.stopPropagation()
    const pinned = !c.pinned
    setContacts(prev => prev.map(x => x.id === c.id ? { ...x, pinned } : x))
    await supabase.from('crm_contacts').update({ pinned }).eq('id', c.id)
  }

  async function toggleArchive(c: Contact, e: React.MouseEvent) {
    e.stopPropagation()
    const archived = !c.archived
    setContacts(prev => prev.map(x => x.id === c.id ? { ...x, archived } : x))
    if (archived && selected?.id === c.id) setSelected(null)
    await supabase.from('crm_contacts').update({ archived }).eq('id', c.id)
  }

  async function loadMessages(contactId: string) {
    const { data } = await supabase
      .from('crm_messages').select('id, direction, body, media_type, media_url, sent_at, status, reply_to_id, edited_at, deleted_at')
      .eq('contact_id', contactId).order('sent_at', { ascending: true })
    const msgs = (data || []) as Message[]
    const withUrls = await Promise.all(msgs.map(async m => {
      if (!m.media_url) return m
      // O poll roda a cada poucos segundos — reusa a URL já assinada pra essa
      // mensagem em vez de gerar uma nova a cada recarga, senão a troca de
      // `src` no meio da reprodução reinicia o áudio (e a imagem pisca).
      const cached = mediaUrlCacheRef.current.get(m.id)
      if (cached) return { ...m, signedUrl: cached }
      const { data: signed } = await supabase.storage.from('crm-midia').createSignedUrl(m.media_url, 3600)
      if (signed?.signedUrl) mediaUrlCacheRef.current.set(m.id, signed.signedUrl)
      return { ...m, signedUrl: signed?.signedUrl || null }
    }))
    setMessages(withUrls)
  }

  async function openContact(c: Contact) {
    setSelected(c)
    selectedRef.current = c
    setReplyTo(null)
    setEditingMessage(null)
    setSearchOpen(false); setSearchTerm('')
    await loadMessages(c.id)
    if (c.last_message_at && (!c.last_read_at || c.last_read_at < c.last_message_at)) {
      const now = new Date().toISOString()
      setContacts(prev => prev.map(x => x.id === c.id ? { ...x, last_read_at: now } : x))
      const { data: { session } } = await supabase.auth.getSession()
      // Marca lido no nosso banco E manda o read receipt real pra Evolution
      // (tique azul do lado do cliente também), não só localmente.
      fetch('/api/crm/ler', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: session?.access_token, company_id: companyRef.current?.id, contact_id: c.id }),
      }).catch(() => {})
    }
  }

  // Sempre gruda no fim: ao abrir a conversa e sempre que a lista de
  // mensagens mudar (nova mensagem chegando ou enviada), rola pro final.
  useEffect(() => {
    if (msgBodyRef.current) msgBodyRef.current.scrollTop = msgBodyRef.current.scrollHeight
  }, [messages])

  // Realtime: mensagem nova (recebida, ou mandada pelo celular fora do CRM),
  // status de entrega/leitura e presença (digitando/online) chegam na hora
  // via websocket em vez de esperar o poll. O poll abaixo vira só uma rede
  // de segurança pra caso a conexão de realtime cair.
  useEffect(() => {
    if (!company) return
    const channel = supabase
      .channel(`crm-messages-${company.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crm_messages', filter: `company_id=eq.${company.id}` }, async (payload) => {
        const row = payload.new as any
        loadContacts(company.id)
        if (selectedRef.current && row.contact_id === selectedRef.current.id) {
          let signedUrl: string | null = null
          if (row.media_url) {
            const cached = mediaUrlCacheRef.current.get(row.id)
            if (cached) signedUrl = cached
            else {
              const { data: signed } = await supabase.storage.from('crm-midia').createSignedUrl(row.media_url, 3600)
              signedUrl = signed?.signedUrl || null
              if (signedUrl) mediaUrlCacheRef.current.set(row.id, signedUrl)
            }
          }
          // Se já existe (bolha otimista com o mesmo id gerado no navegador),
          // reconcilia os campos em vez de duplicar. E se nada de fato mudou
          // (eco da nossa própria mensagem de texto, já idêntica), devolve a
          // MESMA referência do array — o React não re-renderiza nesse caso,
          // então não pisca à toa.
          setMessages(prev => {
            const idx = prev.findIndex(m => m.id === row.id)
            if (idx === -1) return [...prev, {
              id: row.id, direction: row.direction, body: row.body,
              media_type: row.media_type, media_url: row.media_url, sent_at: row.sent_at, signedUrl,
              status: row.status, reply_to_id: row.reply_to_id,
            }]
            const existing = prev[idx]
            const resolvedSignedUrl = signedUrl || existing.signedUrl || null
            const unchanged = existing.body === row.body && existing.status === row.status
              && existing.media_url === row.media_url && existing.reply_to_id === (row.reply_to_id ?? null)
              && existing.signedUrl === resolvedSignedUrl
            if (unchanged) return prev
            const next = [...prev]
            next[idx] = {
              ...existing, body: row.body, media_type: row.media_type, media_url: row.media_url,
              sent_at: row.sent_at, status: row.status, reply_to_id: row.reply_to_id, signedUrl: resolvedSignedUrl,
            }
            return next
          })
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'crm_messages', filter: `company_id=eq.${company.id}` }, (payload) => {
        const row = payload.new as any
        // status de entrega/leitura, edição ou exclusão da mensagem
        setMessages(prev => prev.map(m => m.id === row.id ? {
          ...m, status: row.status, body: row.body, media_type: row.media_type, media_url: row.media_url,
          edited_at: row.edited_at, deleted_at: row.deleted_at,
          signedUrl: row.deleted_at ? null : m.signedUrl,
        } : m))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'crm_contacts', filter: `company_id=eq.${company.id}` }, (payload) => {
        const row = payload.new as any
        setContacts(prev => prev.map(c => c.id === row.id ? {
          ...c, presence_state: row.presence_state, presence_until: row.presence_until, name: row.name,
          last_message_at: row.last_message_at, last_read_at: row.last_read_at, pinned: row.pinned, archived: row.archived,
        } : c))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [company?.id])

  // Poll de segurança (bem mais espaçado agora que o realtime cobre a maioria dos casos).
  useEffect(() => {
    if (instance?.status !== 'connected' || !company) return
    const iv = setInterval(() => loadContacts(company.id), 15000)
    return () => clearInterval(iv)
  }, [instance?.status, company?.id])

  useEffect(() => {
    if (!selected) return
    const iv = setInterval(() => loadMessages(selected.id), 10000)
    return () => clearInterval(iv)
  }, [selected?.id])

  // Poll de conexão enquanto o QR está na tela, até status virar 'connected'
  useEffect(() => {
    if (!qrCode || !company) return
    const iv = setInterval(async () => {
      const inst = await loadInstance(company.id)
      if (inst?.status === 'connected') { setQrCode(null); clearInterval(iv) }
    }, 3000)
    return () => clearInterval(iv)
  }, [qrCode, company?.id])

  async function connectWhatsapp() {
    if (!company) return
    setConnecting(true); setConnectError(''); setQrCode(null)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setConnecting(false); return }
    try {
      const res = await fetch('/api/crm/whatsapp/connect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: token, company_id: company.id }),
      })
      const data = await res.json()
      if (!res.ok) { setConnectError(data.error || 'falha ao conectar'); setConnecting(false); return }
      setQrCode(data.qrcode_base64 || null)
      if (!data.qrcode_base64) setConnectError('Instância criada mas sem QR code na resposta — me chama que eu vejo o retorno bruto da Evolution.')
      await loadInstance(company.id)
    } catch (err: any) {
      setConnectError(err.message || 'falha ao conectar')
    }
    setConnecting(false)
  }

  function startEdit(m: Message) {
    setReplyTo(null)
    setEditingMessage(m)
    setText(m.body || '')
  }

  function cancelEdit() {
    setEditingMessage(null)
    setText('')
  }

  async function submitEdit() {
    if (!editingMessage || !text.trim() || !company || sending) return
    setSending(true)
    const { data: { session } } = await supabase.auth.getSession()
    const newBody = text.trim()
    const msgId = editingMessage.id
    setText(''); setEditingMessage(null)
    // Otimista — o eco do Realtime confirma depois.
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, body: newBody, edited_at: new Date().toISOString() } : m))
    const res = await fetch('/api/crm/editar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: session?.access_token, company_id: company.id, message_id: msgId, text: newBody }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setMediaError(data?.error || 'falha ao editar')
    }
    setSending(false)
  }

  async function deleteMessage(m: Message) {
    if (!company || !window.confirm('Apagar essa mensagem pra todos?')) return
    setMessages(prev => prev.map(x => x.id === m.id ? { ...x, deleted_at: new Date().toISOString(), body: null, media_type: null, media_url: null, signedUrl: null } : x))
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/crm/apagar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: session?.access_token, company_id: company.id, message_id: m.id }),
    }).catch(() => {})
  }

  async function sendMessage() {
    if (editingMessage) return submitEdit()
    if (!text.trim() || !selected || !company || sending) return
    setSending(true)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    const body = text.trim()
    const replyId = replyTo?.id || null
    setText('')
    setReplyTo(null)
    // Otimista com o MESMO id que o servidor vai usar no insert — assim o
    // eco do Realtime reconcilia em vez de criar uma bolha duplicada, e não
    // precisa recarregar tudo do banco depois (o que causava o piscar).
    const clientId = crypto.randomUUID()
    setMessages(prev => [...prev, { id: clientId, direction: 'out', body, media_type: null, media_url: null, sent_at: new Date().toISOString(), status: 'sent', reply_to_id: replyId }])
    const res = await fetch('/api/crm/enviar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: token, company_id: company.id, contact_id: selected.id, text: body, reply_to_id: replyId, client_message_id: clientId }),
    })
    if (!res.ok) { setText(body); setMessages(prev => prev.filter(m => m.id !== clientId)) }
    setSending(false)
  }

  async function sendMedia(mediaType: 'image' | 'audio', blob: Blob, ext: string, contentType: string) {
    if (!selected || !company || sending) return
    setSending(true); setMediaError('')
    const replyId = replyTo?.id || null
    setReplyTo(null)
    const clientId = crypto.randomUUID()
    const localUrl = URL.createObjectURL(blob)
    setMessages(prev => [...prev, { id: clientId, direction: 'out', body: null, media_type: mediaType, media_url: null, sent_at: new Date().toISOString(), signedUrl: localUrl, status: 'sent', reply_to_id: replyId }])
    const path = `${company.id}/${selected.id}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('crm-midia').upload(path, blob, { contentType })
    if (upErr) {
      setMediaError('falha ao subir mídia: ' + upErr.message); setSending(false)
      setMessages(prev => prev.filter(m => m.id !== clientId)); URL.revokeObjectURL(localUrl)
      return
    }
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/crm/enviar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: session?.access_token, company_id: company.id, contact_id: selected.id, media_path: path, media_type: mediaType, reply_to_id: replyId, client_message_id: clientId }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => null); setMediaError(data?.error || 'falha ao enviar')
      setMessages(prev => prev.filter(m => m.id !== clientId)); URL.revokeObjectURL(localUrl)
    } else {
      // Espera o eco do Realtime trocar pela URL assinada real antes de
      // revogar o blob local, senão a mídia pisca quebrada por um instante.
      setTimeout(() => URL.revokeObjectURL(localUrl), 5000)
    }
    setSending(false)
  }

  async function downloadImage(url: string) {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      a.download = `foto-trindade-${Date.now()}.jpg`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objUrl)
    } catch {
      window.open(url, '_blank')
    }
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const compressed = await compressImage(file)
    await sendMedia('image', compressed, 'jpg', 'image/jpeg')
  }

  async function startRecording() {
    setMediaError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      audioChunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        await sendMedia('audio', blob, 'webm', 'audio/webm')
      }
      mr.start()
      mediaRecorderRef.current = mr
      setRecording(true)
    } catch {
      setMediaError('não consegui acessar o microfone — confere a permissão do navegador')
    }
  }
  function stopRecording() {
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter,sans-serif', color: '#AAA' }}>Carregando...</div>

  if (!company?.crm_whatsapp_enabled) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'Inter,sans-serif', background: '#F0EDE8', textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>💬</div>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>CRM de WhatsApp</div>
        <div style={{ fontSize: 13, color: '#666', maxWidth: 300, lineHeight: 1.6, marginBottom: 20 }}>
          Atenda seus clientes pelo WhatsApp direto do painel, com histórico de conversa e filtros de quem sumiu. Ainda não está ativo pra {company?.name}.
        </div>
        <a href="/painel/crm" style={{ background: '#C9951A', color: '#fff', padding: '11px 24px', borderRadius: 10, textDecoration: 'none', fontWeight: 700, fontSize: 13 }}>Voltar</a>
      </div>
    )
  }

  const selectedLive = selected ? (contacts.find(c => c.id === selected.id) || selected) : null
  const isTyping = !!selectedLive?.presence_state && (selectedLive.presence_state === 'composing' || selectedLive.presence_state === 'recording')
    && !!selectedLive.presence_until && new Date(selectedLive.presence_until) > new Date()
  const isOnline = selectedLive?.presence_state === 'available'

  return (
    <CrmShell active="mensagens" companyName={company.name}>
      <div className="msg-page">
        <style>{`
          .msg-page{padding:20px 16px 80px;min-width:0;}
          @media(min-width:768px){.msg-page{padding:28px 32px;}}
          .msg-connect{max-width:360px;margin:40px auto;text-align:center;background:#fff;border:1px solid #EDE8E0;border-radius:16px;padding:28px 22px;}
          .msg-qr{width:200px;height:200px;margin:16px auto;border-radius:12px;border:1px solid #EDE8E0;overflow:hidden;background:#F7F5F0;display:flex;align-items:center;justify-content:center;}
          .msg-qr img{width:100%;height:100%;object-fit:contain;}
          .msg-btn{padding:11px 22px;border-radius:10px;border:none;background:#C9951A;color:#1A1610;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit;}
          .msg-btn:disabled{opacity:.5;cursor:not-allowed;}
          .msg-err{color:#C43D3D;font-size:12px;margin-top:12px;line-height:1.5;}
          .msg-shell{display:grid;grid-template-columns:1fr;border:1px solid #EDE8E0;border-radius:14px;overflow:hidden;background:#fff;height:calc(100vh - 140px);min-height:420px;}
          @media(min-width:768px){.msg-shell{grid-template-columns:280px 1fr;}}
          .msg-list{border-right:1px solid #EDE8E0;overflow-y:auto;min-height:0;}
          @media(max-width:767px){.msg-list{display:${selected ? 'none' : 'block'};}}
          .msg-item{display:flex;gap:10px;padding:12px 14px;border-bottom:1px solid #F0EDE8;cursor:pointer;align-items:center;}
          .msg-item.sel{background:#FBF1DC;}
          .msg-item:hover{background:#F7F5F0;}
          .msg-avatar{width:34px;height:34px;border-radius:50%;background:#F0EDE8;border:1px solid #EDE8E0;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;color:#6E6656;flex:none;}
          .msg-item-txt{flex:1;min-width:0;}
          .msg-item-name{font-weight:700;font-size:13px;}
          .msg-item-time{font-size:10.5px;color:#A79E8B;}
          .msg-unread{width:8px;height:8px;border-radius:50%;background:#C9951A;flex:none;}
          .msg-item-actions{display:none;gap:4px;flex:none;}
          .msg-item:hover .msg-item-actions{display:flex;}
          .msg-item-actions button{background:none;border:none;font-size:13px;cursor:pointer;padding:4px;border-radius:6px;opacity:.6;}
          .msg-item-actions button:hover{opacity:1;background:#EFE8D8;}
          .msg-archived-toggle{width:100%;padding:12px 14px;background:none;border:none;border-top:1px solid #F0EDE8;color:#8A6410;font-weight:700;font-size:12px;cursor:pointer;text-align:left;font-family:inherit;}
          .msg-thread{display:flex;flex-direction:column;min-height:0;}
          @media(max-width:767px){.msg-thread{display:${selected ? 'flex' : 'none'};}}
          .msg-thead{padding:12px 16px;border-bottom:1px solid #EDE8E0;display:flex;align-items:center;gap:10px;flex:none;}
          .msg-back{display:none;background:none;border:none;font-size:18px;cursor:pointer;color:#8A6410;}
          @media(max-width:767px){.msg-back{display:block;}}
          .msg-body{flex:1;min-height:0;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;background:#F7F5F0;}
          .msg-bubble-row{display:flex;position:relative;}
          .msg-bubble-row.out{justify-content:flex-end;}
          .msg-bubble{position:relative;max-width:76%;padding:9px 13px;border-radius:14px;font-size:13px;line-height:1.45;}
          .msg-bubble-row.in .msg-bubble{background:#fff;border:1px solid #EDE8E0;border-bottom-left-radius:4px;}
          .msg-bubble-row.out .msg-bubble{background:#FBF1DC;border:1px solid #F0E2BC;border-bottom-right-radius:4px;}
          .msg-bubble .t{font-size:10px;color:#A79E8B;margin-top:5px;text-align:right;display:flex;justify-content:flex-end;gap:4px;align-items:center;}
          .msg-media-img{display:block;max-width:100%;width:260px;height:auto;max-height:320px;object-fit:cover;border-radius:8px;margin-bottom:4px;cursor:pointer;}
          .msg-media-fail{font-size:12px;color:#A79E8B;font-style:italic;}
          .msg-bubble audio{display:block;max-width:220px;height:34px;}
          .msg-bubble video{display:block;max-width:260px;max-height:320px;border-radius:8px;margin-bottom:4px;}
          .msg-sticker{display:block;width:120px;height:120px;object-fit:contain;margin-bottom:4px;}
          .msg-doc,.msg-loc,.msg-vcard{display:flex;align-items:center;gap:10px;padding:4px 2px;text-decoration:none;color:inherit;}
          .msg-doc-ico,.msg-loc-ico,.msg-vcard-ico{font-size:22px;flex:none;}
          .msg-doc-name{font-size:12.5px;font-weight:600;word-break:break-all;}
          .msg-loc a,.msg-vcard-name{color:#8A6410;font-weight:700;font-size:12.5px;}
          .msg-reply-quote{background:rgba(0,0,0,.05);border-left:3px solid #C9951A;border-radius:6px;padding:5px 8px;margin-bottom:5px;font-size:11.5px;color:#6E6656;max-height:36px;overflow:hidden;}
          .msg-bubble-wrap{display:flex;align-items:center;gap:2px;max-width:76%;}
          .msg-bubble-wrap .msg-bubble{max-width:100%;}
          .msg-bubble-actions{display:flex;gap:0;flex:none;}
          .msg-reply-btn{background:none;border:none;font-size:13px;color:#A79E8B;cursor:pointer;opacity:0;transition:opacity .15s;padding:4px;flex:none;}
          .msg-bubble-row:hover .msg-reply-btn{opacity:1;}
          .msg-reply-bar{display:flex;align-items:center;gap:10px;padding:8px 14px;background:#F7F5F0;border-top:1px solid #EDE8E0;font-size:12px;}
          .msg-reply-bar-txt{flex:1;min-width:0;color:#6E6656;border-left:3px solid #C9951A;padding-left:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
          .msg-reply-bar button{background:none;border:none;font-size:15px;cursor:pointer;color:#A79E8B;flex:none;}
          .msg-presence{font-size:11px;color:#4FA8E8;font-weight:600;}
          .msg-thead-search-btn{background:none;border:none;font-size:16px;cursor:pointer;padding:6px;flex:none;color:#8A6410;}
          .msg-search-input{flex:1;padding:9px 14px;border-radius:20px;border:1px solid #EDE8E0;background:#F7F5F0;font-size:13px;font-family:inherit;}
          .msg-search-hit{background:#FBEEC5;border-radius:3px;padding:0 1px;}
          .msg-deleted{font-size:12.5px;color:#A79E8B;font-style:italic;}
          .msg-edited-tag{font-size:9.5px;color:#A79E8B;}
          .msg-online-dot{width:8px;height:8px;border-radius:50%;background:#3FBF6F;border:2px solid #fff;position:absolute;margin-left:24px;margin-top:22px;}
          .msg-lightbox{position:fixed;inset:0;background:rgba(10,8,4,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:200;padding:24px;}
          .msg-lightbox img{max-width:92vw;max-height:76vh;object-fit:contain;border-radius:6px;}
          .msg-lightbox-actions{display:flex;gap:12px;margin-top:18px;}
          .msg-lightbox-actions button{background:#fff;color:#1A1610;border:none;padding:10px 20px;border-radius:24px;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit;}
          .msg-lightbox-actions button.ghost{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.4);}
          .msg-composer{padding:12px 14px;border-top:1px solid #EDE8E0;display:flex;gap:8px;align-items:center;flex:none;}
          .msg-composer input{flex:1;padding:11px 14px;border-radius:22px;border:1px solid #EDE8E0;background:#F7F5F0;font-size:13px;font-family:inherit;}
          .msg-send{width:38px;height:38px;border-radius:50%;background:#C9951A;border:none;color:#1A1610;font-weight:800;cursor:pointer;flex:none;}
          .msg-attach,.msg-mic{width:36px;height:36px;border-radius:50%;background:#F7F5F0;border:1px solid #EDE8E0;font-size:15px;cursor:pointer;flex:none;}
          .msg-mic.active{background:#FBEAEA;border-color:#C43D3D;color:#C43D3D;}
          .msg-empty{flex:1;display:flex;align-items:center;justify-content:center;color:#A79E8B;font-size:13px;}
        `}</style>

        {instance?.status !== 'connected' ? (
          <div className="msg-connect">
            <div style={{ fontSize: 36, marginBottom: 8 }}>📱</div>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>Conectar WhatsApp</div>
            <div style={{ fontSize: 12.5, color: '#666', lineHeight: 1.6 }}>Escaneie o QR code com o WhatsApp da loja pra ativar o atendimento aqui dentro.</div>
            {qrCode ? (
              <>
                <div className="msg-qr"><img src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`} alt="QR Code" /></div>
                <div style={{ fontSize: 11.5, color: '#888' }}>Aguardando leitura...</div>
              </>
            ) : (
              <button className="msg-btn" style={{ marginTop: 16 }} disabled={connecting} onClick={connectWhatsapp}>
                {connecting ? 'Gerando QR code...' : 'Gerar QR code'}
              </button>
            )}
            {connectError && <div className="msg-err">{connectError}</div>}
          </div>
        ) : (
          <div className="msg-shell">
            <div className="msg-list">
              {(() => {
                const visible = contacts.filter(c => showArchived ? c.archived : !c.archived)
                const pinned = visible.filter(c => c.pinned)
                const rest = visible.filter(c => !c.pinned)
                const archivedCount = contacts.filter(c => c.archived).length
                const rows = [...pinned, ...rest]
                return (
                  <>
                    {rows.length === 0 && <div style={{ padding: 20, fontSize: 12.5, color: '#A79E8B', textAlign: 'center' }}>{showArchived ? 'Nenhuma conversa arquivada.' : 'Nenhuma conversa ainda.'}</div>}
                    {rows.map(c => {
                      const unread = !!c.last_message_at && (!c.last_read_at || c.last_read_at < c.last_message_at)
                      return (
                        <div key={c.id} className={`msg-item ${selected?.id === c.id ? 'sel' : ''}`} onClick={() => openContact(c)}>
                          <div className="msg-avatar">{(c.name || c.phone).slice(0, 2).toUpperCase()}</div>
                          <div className="msg-item-txt">
                            <div className="msg-item-name">{c.pinned && '📌 '}{c.name || c.phone}</div>
                            <div className="msg-item-time">{c.last_message_at ? fmtTime(c.last_message_at) : ''}</div>
                          </div>
                          <div className="msg-item-actions">
                            <button title={c.pinned ? 'Desafixar' : 'Fixar'} onClick={e => togglePin(c, e)}>📌</button>
                            <button title={c.archived ? 'Desarquivar' : 'Arquivar'} onClick={e => toggleArchive(c, e)}>🗄</button>
                          </div>
                          {unread && <div className="msg-unread" />}
                        </div>
                      )
                    })}
                    {archivedCount > 0 && (
                      <button className="msg-archived-toggle" onClick={() => setShowArchived(v => !v)}>
                        {showArchived ? '‹ Voltar' : `🗄 Ver arquivadas (${archivedCount})`}
                      </button>
                    )}
                  </>
                )
              })()}
            </div>
            <div className="msg-thread">
              {!selected ? (
                <div className="msg-empty">Selecione uma conversa</div>
              ) : (
                <>
                  <div className="msg-thead">
                    {searchOpen ? (
                      <>
                        <input
                          className="msg-search-input" autoFocus placeholder="Buscar na conversa..."
                          value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                          onKeyDown={e => e.key === 'Escape' && (setSearchOpen(false), setSearchTerm(''))}
                        />
                        <button className="msg-back" style={{ display: 'block' }} onClick={() => { setSearchOpen(false); setSearchTerm('') }}>✕</button>
                      </>
                    ) : (
                      <>
                        <button className="msg-back" onClick={() => setSelected(null)}>‹</button>
                        <div style={{ position: 'relative' }}>
                          <div className="msg-avatar">{(selectedLive?.name || selectedLive?.phone || '').slice(0, 2).toUpperCase()}</div>
                          {isOnline && !isTyping && <div className="msg-online-dot" />}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{selectedLive?.name || selectedLive?.phone}</div>
                          <div style={{ fontSize: 11.5, color: '#888' }}>
                            {isTyping ? <span className="msg-presence">digitando...</span> : isOnline ? <span className="msg-presence">online</span> : selectedLive?.phone}
                          </div>
                        </div>
                        <button className="msg-thead-search-btn" title="Buscar na conversa" onClick={() => setSearchOpen(true)}>🔍</button>
                      </>
                    )}
                  </div>
                  <div className="msg-body" ref={msgBodyRef}>
                    {(searchTerm.trim() ? messages.filter(m => m.body?.toLowerCase().includes(searchTerm.toLowerCase())) : messages).map(m => {
                      const quoted = m.reply_to_id ? messages.find(x => x.id === m.reply_to_id) : null
                      let location: any = null, vcard: any = null
                      if (m.media_type === 'location' && m.body) { try { location = JSON.parse(m.body) } catch {} }
                      if (m.media_type === 'contact' && m.body) { try { vcard = JSON.parse(m.body) } catch {} }
                      const canEditDelete = m.direction === 'out' && !m.deleted_at
                      return (
                        <div key={m.id} className={`msg-bubble-row ${m.direction === 'out' ? 'out' : 'in'}`}>
                          <div className="msg-bubble-wrap">
                          <div className="msg-bubble">
                            {m.deleted_at ? (
                              <div className="msg-deleted">🚫 {m.direction === 'out' ? 'Você apagou essa mensagem' : 'Mensagem apagada'}</div>
                            ) : (
                              <>
                                {quoted && <div className="msg-reply-quote">{replySnippet(quoted)}</div>}
                                {m.media_type === 'image' && (m.signedUrl ? <img className="msg-media-img" src={m.signedUrl} alt="" onClick={() => setLightbox(m.signedUrl!)} /> : <div className="msg-media-fail">📷 imagem indisponível</div>)}
                                {m.media_type === 'video' && (m.signedUrl ? <video controls src={m.signedUrl} /> : <div className="msg-media-fail">🎥 vídeo indisponível</div>)}
                                {m.media_type === 'audio' && (m.signedUrl ? <audio controls src={m.signedUrl} /> : <div className="msg-media-fail">🎤 áudio indisponível</div>)}
                                {m.media_type === 'sticker' && (m.signedUrl ? <img className="msg-sticker" src={m.signedUrl} alt="" /> : <div className="msg-media-fail">🏷️ figurinha indisponível</div>)}
                                {m.media_type === 'document' && (m.signedUrl
                                  ? <a className="msg-doc" href={m.signedUrl} target="_blank" rel="noreferrer"><span className="msg-doc-ico">📄</span><span className="msg-doc-name">{m.body || 'Documento'}</span></a>
                                  : <div className="msg-media-fail">📄 documento indisponível</div>)}
                                {m.media_type === 'location' && location && (
                                  <a className="msg-loc" href={`https://www.google.com/maps?q=${location.lat},${location.lng}`} target="_blank" rel="noreferrer">
                                    <span className="msg-loc-ico">📍</span><span>{location.name || location.address || 'Ver localização no mapa'}</span>
                                  </a>
                                )}
                                {m.media_type === 'contact' && vcard && (
                                  <div className="msg-vcard"><span className="msg-vcard-ico">👤</span><span className="msg-vcard-name">{vcard.name || vcard.phone || 'Contato'}</span></div>
                                )}
                                {m.media_type !== 'location' && m.media_type !== 'contact' && m.media_type !== 'document' && m.body && highlightMatch(m.body, searchTerm)}
                              </>
                            )}
                            <div className="t">
                              {m.edited_at && !m.deleted_at && <span className="msg-edited-tag">editada</span>}
                              {fmtTime(m.sent_at)}{m.direction === 'out' && !m.deleted_at && tickIcon(m.status)}
                            </div>
                          </div>
                          {!m.deleted_at && (
                            <div className="msg-bubble-actions">
                              <button className="msg-reply-btn" title="Responder" onClick={() => setReplyTo(m)}>↩</button>
                              {canEditDelete && !m.media_type && <button className="msg-reply-btn" title="Editar" onClick={() => startEdit(m)}>✏️</button>}
                              {canEditDelete && <button className="msg-reply-btn" title="Apagar" onClick={() => deleteMessage(m)}>🗑</button>}
                            </div>
                          )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {mediaError && <div className="msg-err" style={{ padding: '0 14px' }}>{mediaError}</div>}
                  {editingMessage ? (
                    <div className="msg-reply-bar">
                      <div className="msg-reply-bar-txt">✏️ Editando mensagem</div>
                      <button onClick={cancelEdit}>✕</button>
                    </div>
                  ) : replyTo && (
                    <div className="msg-reply-bar">
                      <div className="msg-reply-bar-txt">Respondendo: {replySnippet(replyTo)}</div>
                      <button onClick={() => setReplyTo(null)}>✕</button>
                    </div>
                  )}
                  <div className="msg-composer">
                    <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={onPickImage} />
                    <button className="msg-attach" disabled={sending || recording || !!editingMessage} onClick={() => fileInputRef.current?.click()} title="Enviar foto">📎</button>
                    <button className={`msg-mic ${recording ? 'active' : ''}`} disabled={sending || !!editingMessage} onClick={recording ? stopRecording : startRecording} title={recording ? 'Parar e enviar' : 'Gravar áudio'}>{recording ? '⏹' : '🎤'}</button>
                    <input placeholder={editingMessage ? 'Editar mensagem...' : 'Escrever mensagem...'} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} disabled={recording} />
                    <button className="msg-send" disabled={sending || recording || !text.trim()} onClick={sendMessage}>{editingMessage ? '✓' : '➤'}</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {lightbox && (
          <div className="msg-lightbox" onClick={() => setLightbox(null)}>
            <img src={lightbox} alt="" onClick={e => e.stopPropagation()} />
            <div className="msg-lightbox-actions" onClick={e => e.stopPropagation()}>
              <button onClick={() => downloadImage(lightbox)}>⬇ Baixar</button>
              <button className="ghost" onClick={() => setLightbox(null)}>✕ Fechar</button>
            </div>
          </div>
        )}
      </div>
    </CrmShell>
  )
}
