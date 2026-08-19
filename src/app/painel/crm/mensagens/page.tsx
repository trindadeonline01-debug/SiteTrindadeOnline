'use client'
import { Fragment, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { compressImage } from '@/lib/compressImage'
import { moduleActive } from '@/lib/modules'
import EmpresaShell from '@/components/EmpresaShell'

type Company = {
  id: string; name: string; slug?: string; crm_whatsapp_enabled: boolean; loja_digital_enabled?: boolean
  entrega_enabled?: boolean
  crm_auto_reply_enabled?: boolean; crm_auto_reply_text?: string | null
}
type Instance = { id: string; instance_name: string; status: string; phone: string | null }
type Contact = {
  id: string; phone: string; name: string | null; last_message_at: string | null; last_read_at: string | null
  presence_state?: string | null; presence_until?: string | null; pinned?: boolean; archived?: boolean
  avatar_url?: string | null; muted?: boolean; notes?: string | null
  last_message_preview?: string | null; last_message_direction?: string | null; unread_count?: number
}
type Message = {
  id: string; direction: 'in' | 'out'; body: string | null; media_type: string | null; media_url: string | null
  sent_at: string; signedUrl?: string | null; status?: string | null; reply_to_id?: string | null
  edited_at?: string | null; deleted_at?: string | null; reaction?: string | null; reaction_by?: string | null
  starred?: boolean
}
type QuickReply = { id: string; shortcut: string; body: string }

type NpOpcao = { id: string; name: string; price: number; max_qty: number | null; photo_url?: string | null }
type NpGrupo = { id: string; name: string; required: boolean; min_select: number; max_select: number; pricing_rule: 'soma' | 'maior_valor'; options: NpOpcao[] }
type NpProduto = {
  id: string; name: string; description: string | null; photo_url: string | null; sale_price: number; category_id: string | null
  promo_type: 'percent' | 'fixed' | null; promo_value: number | null; promo_starts_at: string | null; promo_ends_at: string | null
  esgotado?: boolean; track_stock?: boolean; stock_qty?: number | null
  groups: NpGrupo[]
}
type NpCategoria = { id: string; name: string; display_order: number }
type NpCartLine = { key: string; produtoId: string; name: string; modifiers: { name: string; price: number }[]; unitPrice: number; qty: number }
function npGroupContribution(g: NpGrupo, selectedIdx: number[]): number {
  const prices = selectedIdx.map(oi => g.options[oi].price)
  if (prices.length === 0) return 0
  return g.pricing_rule === 'maior_valor' ? Math.max(...prices) : prices.reduce((a, b) => a + b, 0)
}
function npIsSoldOut(p: NpProduto) { return !!p.esgotado || (!!p.track_stock && (p.stock_qty ?? 0) <= 0) }
function npPromoPrice(p: NpProduto): number | null {
  if (!p.promo_type || !p.promo_value) return null
  const now = Date.now()
  if (p.promo_starts_at && now < new Date(p.promo_starts_at).getTime()) return null
  if (p.promo_ends_at && now > new Date(p.promo_ends_at).getTime()) return null
  return p.promo_type === 'percent' ? p.sale_price * (1 - p.promo_value / 100) : Math.max(0, p.sale_price - p.promo_value)
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']
const EMOJI_PICKER_LIST = '😀😁😂🤣😊😍😘😉😎🥳🤔😅😢😭😡🤯👍👎👏🙏💪🤝❤️🧡💛💚💙💜🔥✨🎉🎂🎁🍕🍔☕🍺⚽🎵📌📷📅✅❌⏰💰💬📞'.match(/./gu) || []

function fmtMoney(n: number) { return 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',') }

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function tickIcon(status?: string | null) {
  if (status === 'read') return <span style={{ color: '#53bdeb' }}>✓✓</span>
  if (status === 'delivered') return <span style={{ color: 'rgba(233,237,239,.6)' }}>✓✓</span>
  return <span style={{ color: 'rgba(233,237,239,.6)' }}>✓</span>
}

function dateSepLabel(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yest = new Date(today); yest.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (sameDay(d, today)) return 'Hoje'
  if (sameDay(d, yest)) return 'Ontem'
  const diffDays = Math.floor((today.getTime() - d.getTime()) / 86400000)
  if (diffDays >= 0 && diffDays < 7) {
    const w = d.toLocaleDateString('pt-BR', { weekday: 'long' })
    return w.charAt(0).toUpperCase() + w.slice(1)
  }
  return d.toLocaleDateString('pt-BR')
}

function extractFirstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<]+/i)
  return m ? m[0].replace(/[).,;:!?]+$/, '') : null
}

function linkifyText(text: string) {
  const parts = text.split(/(https?:\/\/[^\s<]+)/gi)
  return parts.map((part, i) => /^https?:\/\//i.test(part)
    ? <a key={i} href={part} target="_blank" rel="noreferrer">{part}</a>
    : <span key={i}>{part}</span>)
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
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [mediaError, setMediaError] = useState('')
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editingMessage, setEditingMessage] = useState<Message | null>(null)
  const [contactFilter, setContactFilter] = useState<'todas' | 'nao_lidas' | 'arquivadas'>('todas')
  const [contactSearch, setContactSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [quickRepliesOpen, setQuickRepliesOpen] = useState(false)
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([])
  const [quickReplyForm, setQuickReplyForm] = useState<{ shortcut: string; body: string } | null>(null)
  const [messageSearchHits, setMessageSearchHits] = useState<{ id: string; contact_id: string; body: string; sent_at: string; contactName: string }[]>([])
  const [starredOpen, setStarredOpen] = useState(false)
  const [autoReplyOpen, setAutoReplyOpen] = useState(false)
  const [autoReplyDraft, setAutoReplyDraft] = useState({ enabled: false, text: '' })
  const [savingAutoReply, setSavingAutoReply] = useState(false)
  const [npOpen, setNpOpen] = useState(false)
  const [npProdutos, setNpProdutos] = useState<NpProduto[]>([])
  const [npCategorias, setNpCategorias] = useState<NpCategoria[]>([])
  const [npSearch, setNpSearch] = useState('')
  const [npFilterCat, setNpFilterCat] = useState('all')
  const [npLoadingProdutos, setNpLoadingProdutos] = useState(false)
  const [npCart, setNpCart] = useState<NpCartLine[]>([])
  const [npCartOpen, setNpCartOpen] = useState(false)
  const [npDetail, setNpDetail] = useState<NpProduto | null>(null)
  const [npDetailSel, setNpDetailSel] = useState<number[][]>([])
  const [npDeliveryType, setNpDeliveryType] = useState<'entrega' | 'retirada'>('entrega')
  const [npEndereco, setNpEndereco] = useState('')
  const [npObs, setNpObs] = useState('')
  const [npPay, setNpPay] = useState<'pix' | 'dinheiro' | 'cartao'>('dinheiro')
  const [npSaving, setNpSaving] = useState(false)
  const [npError, setNpError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null)
  const [mobileActionsFor, setMobileActionsFor] = useState<string | null>(null)
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [contactActionsFor, setContactActionsFor] = useState<string | null>(null)
  const contactPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [contactPicker, setContactPicker] = useState<{ mode: 'forward' | 'shareContact'; forMessage?: Message } | null>(null)
  const [linkPreviews, setLinkPreviews] = useState<Record<string, { title: string | null; image: string | null; siteName: string | null } | null>>({})
  const linkPreviewFetching = useRef<Set<string>>(new Set())
  const avatarFetching = useRef<Set<string>>(new Set())

  const companyRef = useRef<Company | null>(null)
  const selectedRef = useRef<Contact | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const videoInputRef = useRef<HTMLInputElement | null>(null)
  const docInputRef = useRef<HTMLInputElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const discardRecordingRef = useRef(false)
  const mediaUrlCacheRef = useRef<Map<string, string>>(new Map())
  const msgBodyRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login?redirect=/painel/crm/mensagens'; return }
      const { data: comp } = await supabase
        .from('companies').select('id, name, slug, crm_whatsapp_enabled, loja_digital_enabled, entrega_enabled, trial_modules_until, crm_auto_reply_enabled, crm_auto_reply_text')
        .eq('owner_id', session.user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (!comp) { window.location.href = '/painel/crm'; return }
      // Guarda os flags já resolvidos (real OU dentro do período de teste) —
      // o resto do arquivo lê company.crm_whatsapp_enabled/etc direto, sem
      // precisar saber se veio do plano de verdade ou de um teste liberado.
      const effectiveComp = {
        ...comp,
        crm_whatsapp_enabled: moduleActive(comp.crm_whatsapp_enabled, comp.trial_modules_until),
        loja_digital_enabled: moduleActive(comp.loja_digital_enabled, comp.trial_modules_until),
        entrega_enabled: moduleActive(comp.entrega_enabled, comp.trial_modules_until),
      }
      setCompany(effectiveComp as Company)
      companyRef.current = effectiveComp as Company
      if (effectiveComp.crm_whatsapp_enabled) await loadInstance(comp.id)
      loadQuickReplies(comp.id)
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
      .from('crm_contacts').select('id, phone, name, last_message_at, last_read_at, presence_state, presence_until, pinned, archived, avatar_url, muted, notes, last_message_preview, last_message_direction, unread_count')
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

  async function toggleMute(c: Contact, e: React.MouseEvent) {
    e.stopPropagation()
    const muted = !c.muted
    setContacts(prev => prev.map(x => x.id === c.id ? { ...x, muted } : x))
    await supabase.from('crm_contacts').update({ muted }).eq('id', c.id)
  }

  async function saveNotes(contactId: string, notes: string) {
    setContacts(prev => prev.map(x => x.id === contactId ? { ...x, notes } : x))
    await supabase.from('crm_contacts').update({ notes: notes.trim() || null }).eq('id', contactId)
  }

  async function toggleStar(m: Message) {
    const starred = !m.starred
    setMessages(prev => prev.map(x => x.id === m.id ? { ...x, starred } : x))
    await supabase.from('crm_messages').update({ starred }).eq('id', m.id)
  }

  // Toque-e-segure no mobile (igual ao WhatsApp de verdade) pra abrir o menu
  // de ações da mensagem — em vez de deixar os ícones sempre visíveis, o que
  // poluía a tela e ainda brigava com a seleção nativa de texto do celular.
  function handleBubblePressStart(id: string) {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current)
    pressTimerRef.current = setTimeout(() => {
      setMobileActionsFor(id)
      pressTimerRef.current = null
      if (navigator.vibrate) navigator.vibrate(12)
    }, 420)
  }
  function cancelBubblePress() {
    if (pressTimerRef.current) { clearTimeout(pressTimerRef.current); pressTimerRef.current = null }
  }

  // Mesma lógica pra fixar/silenciar/arquivar na lista de conversas — fica
  // escondido e só abre no toque-e-segure do contato, ancorado na borda
  // direita da tela (em vez de ocupar espaço fixo na fileira o tempo todo).
  function handleContactPressStart(id: string) {
    if (contactPressTimerRef.current) clearTimeout(contactPressTimerRef.current)
    contactPressTimerRef.current = setTimeout(() => {
      setContactActionsFor(id)
      contactPressTimerRef.current = null
      if (navigator.vibrate) navigator.vibrate(12)
    }, 420)
  }
  function cancelContactPress() {
    if (contactPressTimerRef.current) { clearTimeout(contactPressTimerRef.current); contactPressTimerRef.current = null }
  }

  async function loadQuickReplies(companyId: string) {
    const { data } = await supabase.from('crm_quick_replies').select('id, shortcut, body').eq('company_id', companyId).order('shortcut')
    setQuickReplies((data || []) as QuickReply[])
  }

  async function saveQuickReply() {
    if (!company || !quickReplyForm?.shortcut.trim() || !quickReplyForm?.body.trim()) return
    const { data } = await supabase.from('crm_quick_replies')
      .insert({ company_id: company.id, shortcut: quickReplyForm.shortcut.trim(), body: quickReplyForm.body.trim() })
      .select('id, shortcut, body').single()
    if (data) setQuickReplies(prev => [...prev, data as QuickReply].sort((a, b) => a.shortcut.localeCompare(b.shortcut)))
    setQuickReplyForm(null)
  }

  async function deleteQuickReply(id: string) {
    setQuickReplies(prev => prev.filter(q => q.id !== id))
    await supabase.from('crm_quick_replies').delete().eq('id', id)
  }

  function useQuickReply(q: QuickReply) {
    setText(t => t ? `${t}\n${q.body}` : q.body)
    setQuickRepliesOpen(false)
  }

  async function openNovoPedido() {
    if (!company) return
    setNpOpen(true)
    if (npProdutos.length === 0) {
      setNpLoadingProdutos(true)
      const [{ data: cats }, { data: prods }] = await Promise.all([
        supabase.from('loja_categorias').select('id, name, display_order').eq('company_id', company.id).order('display_order'),
        supabase.from('loja_produtos').select('*, groups:loja_opcoes_grupo(*, options:loja_opcoes(*))').eq('company_id', company.id).eq('active', true).order('display_order'),
      ])
      setNpCategorias((cats || []) as any)
      setNpProdutos((prods || []) as any)
      setNpLoadingProdutos(false)
    }
  }
  function closeNovoPedido() {
    setNpOpen(false); setNpCart([]); setNpDetail(null); setNpDeliveryType('entrega'); setNpEndereco(''); setNpObs(''); setNpPay('dinheiro'); setNpSearch(''); setNpFilterCat('all'); setNpCartOpen(false); setNpError('')
  }
  function npAddToCart(produtoId: string, name: string, price: number, modifiers: { name: string; price: number }[] = []) {
    const key = produtoId + '|' + modifiers.map(m => m.name).sort().join('+')
    setNpCart(prev => {
      const existing = prev.find(l => l.key === key)
      if (existing) return prev.map(l => l.key === key ? { ...l, qty: l.qty + 1 } : l)
      return [...prev, { key, produtoId, name, modifiers, unitPrice: price, qty: 1 }]
    })
  }
  function npChangeQty(key: string, delta: number) {
    setNpCart(prev => prev.map(l => l.key === key ? { ...l, qty: l.qty + delta } : l).filter(l => l.qty > 0))
  }
  function npOpenDetail(p: NpProduto) {
    if (!p.groups || p.groups.length === 0) { npAddToCart(p.id, p.name, p.sale_price); return }
    setNpDetail(p); setNpDetailSel(p.groups.map(() => []))
  }
  function npToggleOpt(gi: number, oi: number) {
    if (!npDetail) return
    const g = npDetail.groups[gi]
    setNpDetailSel(sel => sel.map((s, i) => {
      if (i !== gi) return s
      const active = s.includes(oi)
      if (g.max_select === 1) return active ? [] : [oi]
      if (active) return s.filter(x => x !== oi)
      if (s.length < g.max_select) return [...s, oi]
      return s
    }))
  }
  const npDetailReqMet = npDetail ? npDetail.groups.every((g, gi) => !g.required || npDetailSel[gi].length >= g.min_select) : true
  const npDetailPrice = npDetail ? npDetail.sale_price + npDetail.groups.reduce((s, g, gi) => s + npGroupContribution(g, npDetailSel[gi]), 0) : 0
  function npConfirmDetail() {
    if (!npDetail || !npDetailReqMet) return
    const modifiers: { name: string; price: number }[] = []
    npDetail.groups.forEach((g, gi) => npDetailSel[gi].forEach(oi => modifiers.push({ name: g.options[oi].name, price: g.options[oi].price })))
    npAddToCart(npDetail.id, npDetail.name, npDetailPrice, modifiers)
    setNpDetail(null)
  }
  const npTotal = npCart.reduce((s, l) => s + l.unitPrice * l.qty, 0)
  async function npCriarPedido() {
    if (!company || !selectedLive || npCart.length === 0) return
    setNpSaving(true)
    setNpError('')
    if (npDeliveryType === 'entrega' && !npEndereco.trim()) { setNpError('Preenche o endereço de entrega.'); setNpSaving(false); return }
    const { data: pedido, error: pedidoErr } = await supabase.from('loja_pedidos').insert({
      company_id: company.id, customer_id: null,
      customer_name: selectedLive.name || selectedLive.phone, customer_phone: selectedLive.phone,
      delivery_address: npDeliveryType === 'entrega' ? npEndereco.trim() : null, delivery_type: npDeliveryType, origin: 'conversa', payment_method: npPay,
      subtotal: npTotal, total: npTotal, notes: npObs.trim() || null, accepted_at: new Date().toISOString(),
    }).select('id').single()
    if (pedidoErr || !pedido) {
      setNpError(pedidoErr?.message || 'Não consegui criar o pedido — tenta de novo.')
      setNpSaving(false)
      return
    }
    const { error: itensErr } = await supabase.from('loja_pedido_itens').insert(npCart.map(l => ({
      pedido_id: pedido.id, produto_id: l.produtoId, product_name: l.name, unit_price: l.unitPrice, qty: l.qty,
      selected_options: l.modifiers,
    })))
    if (itensErr) {
      setNpError('Pedido criado, mas falhou ao salvar os itens: ' + itensErr.message)
      setNpSaving(false)
      return
    }
    fetch('/api/loja/registrar-pedido', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: company.id, phone: selectedLive.phone, name: selectedLive.name || selectedLive.phone,
        address: npDeliveryType === 'entrega' ? npEndereco.trim() : null, total: npTotal, subtotal: npTotal, deliveryFee: 0,
        paymentMethod: npPay, deliveryType: npDeliveryType, notes: npObs.trim() || null,
        items: npCart.map(l => ({ produtoId: l.produtoId, name: l.name, qty: l.qty, unitPrice: l.unitPrice, modifiers: l.modifiers })),
      }),
    }).catch(() => {})
    setNpSaving(false)
    closeNovoPedido()
  }

  async function saveAutoReply() {
    if (!company) return
    setSavingAutoReply(true)
    const crm_auto_reply_enabled = autoReplyDraft.enabled
    const crm_auto_reply_text = autoReplyDraft.text.trim() || null
    await supabase.from('companies').update({ crm_auto_reply_enabled, crm_auto_reply_text }).eq('id', company.id)
    setCompany({ ...company, crm_auto_reply_enabled, crm_auto_reply_text })
    setSavingAutoReply(false)
    setAutoReplyOpen(false)
  }

  async function loadMessages(contactId: string) {
    const { data } = await supabase
      .from('crm_messages').select('id, direction, body, media_type, media_url, sent_at, status, reply_to_id, edited_at, deleted_at, reaction, reaction_by, starred')
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
      setContacts(prev => prev.map(x => x.id === c.id ? { ...x, last_read_at: now, unread_count: 0 } : x))
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

  // Campo de digitação cresce em altura (como no WhatsApp) em vez de rolar
  // o texto na horizontal — o textarea é de uma linha só até o texto quebrar.
  useEffect(() => {
    const el = composerRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [text])

  // Cronômetro visível durante a gravação de áudio, pra ficar claro que
  // está gravando de verdade (sem isso o usuário não tinha nenhum feedback).
  useEffect(() => {
    if (!recording) { setRecordSeconds(0); return }
    const start = Date.now()
    const id = setInterval(() => setRecordSeconds(Math.floor((Date.now() - start) / 1000)), 250)
    return () => clearInterval(id)
  }, [recording])

  // Prévia de link (imagem/título/site) estilo WhatsApp pra mensagens de
  // texto com URL — busca uma vez por URL e guarda em cache local.
  useEffect(() => {
    for (const m of messages) {
      if (m.deleted_at || m.media_type || !m.body) continue
      const url = extractFirstUrl(m.body)
      if (!url || linkPreviewFetching.current.has(url) || url in linkPreviews) continue
      linkPreviewFetching.current.add(url)
      fetch(`/api/crm/link-preview?url=${encodeURIComponent(url)}`)
        .then(r => r.json())
        .then(data => setLinkPreviews(prev => ({ ...prev, [url]: (data?.title || data?.image) ? data : null })))
        .catch(() => setLinkPreviews(prev => ({ ...prev, [url]: null })))
    }
  }, [messages, linkPreviews])

  // Foto de perfil real do contato — busca uma vez por contato (em cache no
  // banco depois disso) em vez de mostrar só as iniciais igual antes.
  useEffect(() => {
    if (!company?.id) return
    const missing = contacts.filter(c => c.avatar_url === undefined || c.avatar_url === null).slice(0, 30)
    if (missing.length === 0) return
    supabase.auth.getSession().then(({ data: { session } }) => {
      const token = session?.access_token
      if (!token) return
      for (const c of missing) {
        if (avatarFetching.current.has(c.id)) continue
        avatarFetching.current.add(c.id)
        fetch('/api/crm/avatar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: token, company_id: company.id, contact_id: c.id }),
        })
          .then(r => r.json())
          .then(data => setContacts(prev => prev.map(x => x.id === c.id ? { ...x, avatar_url: data?.url || '' } : x)))
          .catch(() => setContacts(prev => prev.map(x => x.id === c.id ? { ...x, avatar_url: '' } : x)))
      }
    })
  }, [contacts, company?.id])

  // Busca de mensagem em todas as conversas de uma vez (não só na aberta) —
  // só dispara quando a busca da lista de contatos não bate com nenhum nome/
  // telefone, pra não competir com o filtro normal de contato por nome.
  useEffect(() => {
    const term = contactSearch.trim()
    if (!company?.id || term.length < 3) { setMessageSearchHits([]); return }
    const matchesContact = contacts.some(c => (c.name || '').toLowerCase().includes(term.toLowerCase()) || c.phone.includes(term))
    if (matchesContact) { setMessageSearchHits([]); return }
    const id = setTimeout(async () => {
      const { data } = await supabase
        .from('crm_messages').select('id, contact_id, body, sent_at')
        .eq('company_id', company.id).ilike('body', `%${term}%`).is('deleted_at', null)
        .order('sent_at', { ascending: false }).limit(25)
      const byId = new Map(contacts.map(c => [c.id, c.name || c.phone]))
      setMessageSearchHits((data || []).map(m => ({ ...m, contactName: byId.get(m.contact_id) || '' })).filter(m => m.contactName))
    }, 350)
    return () => clearTimeout(id)
  }, [contactSearch, company?.id, contacts])

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
              status: row.status, reply_to_id: row.reply_to_id, reaction: row.reaction, reaction_by: row.reaction_by,
            }]
            const existing = prev[idx]
            const resolvedSignedUrl = signedUrl || existing.signedUrl || null
            const unchanged = existing.body === row.body && existing.status === row.status
              && existing.media_url === row.media_url && existing.reply_to_id === (row.reply_to_id ?? null)
              && existing.signedUrl === resolvedSignedUrl && existing.reaction === (row.reaction ?? null)
            if (unchanged) return prev
            const next = [...prev]
            next[idx] = {
              ...existing, body: row.body, media_type: row.media_type, media_url: row.media_url,
              sent_at: row.sent_at, status: row.status, reply_to_id: row.reply_to_id, signedUrl: resolvedSignedUrl,
              reaction: row.reaction, reaction_by: row.reaction_by,
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
          edited_at: row.edited_at, deleted_at: row.deleted_at, reaction: row.reaction, reaction_by: row.reaction_by,
          signedUrl: row.deleted_at ? null : m.signedUrl,
        } : m))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'crm_contacts', filter: `company_id=eq.${company.id}` }, (payload) => {
        const row = payload.new as any
        setContacts(prev => prev.map(c => c.id === row.id ? {
          ...c, presence_state: row.presence_state, presence_until: row.presence_until, name: row.name,
          last_message_at: row.last_message_at, last_read_at: row.last_read_at, pinned: row.pinned, archived: row.archived,
          last_message_preview: row.last_message_preview, last_message_direction: row.last_message_direction,
          unread_count: row.unread_count,
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

  async function sendMedia(mediaType: 'image' | 'audio' | 'video' | 'document', blob: Blob, ext: string, contentType: string, fileName?: string) {
    if (!selected || !company || sending) return
    setSending(true); setMediaError('')
    const replyId = replyTo?.id || null
    setReplyTo(null)
    const clientId = crypto.randomUUID()
    const localUrl = URL.createObjectURL(blob)
    setMessages(prev => [...prev, {
      id: clientId, direction: 'out', body: mediaType === 'document' ? (fileName || 'Documento') : null,
      media_type: mediaType, media_url: null, sent_at: new Date().toISOString(), signedUrl: localUrl, status: 'sent', reply_to_id: replyId,
    }])
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
      body: JSON.stringify({ access_token: session?.access_token, company_id: company.id, contact_id: selected.id, media_path: path, media_type: mediaType, file_name: fileName, reply_to_id: replyId, client_message_id: clientId }),
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

  async function shareLocation() {
    if (!selected || !company) return
    if (!navigator.geolocation) { setMediaError('geolocalização não disponível nesse navegador'); return }
    setMediaError('')
    navigator.geolocation.getCurrentPosition(async pos => {
      const location = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      setSending(true)
      const clientId = crypto.randomUUID()
      setMessages(prev => [...prev, { id: clientId, direction: 'out', body: JSON.stringify(location), media_type: 'location', media_url: null, sent_at: new Date().toISOString(), status: 'sent', reply_to_id: null }])
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/crm/enviar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: session?.access_token, company_id: company.id, contact_id: selected.id, location, client_message_id: clientId }),
      })
      if (!res.ok) { const data = await res.json().catch(() => null); setMediaError(data?.error || 'falha ao enviar localização'); setMessages(prev => prev.filter(m => m.id !== clientId)) }
      setSending(false)
    }, () => setMediaError('não consegui pegar sua localização — confere a permissão do navegador'))
  }

  async function shareContact(target: Contact) {
    if (!selected || !company) return
    setContactPicker(null)
    setSending(true)
    const contactShare = { name: target.name || target.phone, phone: target.phone }
    const clientId = crypto.randomUUID()
    setMessages(prev => [...prev, { id: clientId, direction: 'out', body: JSON.stringify(contactShare), media_type: 'contact', media_url: null, sent_at: new Date().toISOString(), status: 'sent', reply_to_id: null }])
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/crm/enviar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: session?.access_token, company_id: company.id, contact_id: selected.id, contact_share: contactShare, client_message_id: clientId }),
    })
    if (!res.ok) { const data = await res.json().catch(() => null); setMediaError(data?.error || 'falha ao compartilhar contato'); setMessages(prev => prev.filter(m => m.id !== clientId)) }
    setSending(false)
  }

  async function forwardMessage(msg: Message, target: Contact) {
    if (!company) return
    setContactPicker(null)
    const { data: { session } } = await supabase.auth.getSession()
    const isMedia = msg.media_type && msg.media_type !== 'location' && msg.media_type !== 'contact' && msg.media_type !== 'sticker'
    await fetch('/api/crm/enviar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: session?.access_token, company_id: company.id, contact_id: target.id,
        text: !msg.media_type ? (msg.body || undefined) : undefined,
        media_path: isMedia ? (msg.media_url || undefined) : undefined,
        media_type: isMedia ? msg.media_type : undefined,
        file_name: msg.media_type === 'document' ? (msg.body || undefined) : undefined,
        location: msg.media_type === 'location' && msg.body ? JSON.parse(msg.body) : undefined,
        contact_share: msg.media_type === 'contact' && msg.body ? JSON.parse(msg.body) : undefined,
      }),
    }).catch(() => {})
    if (target.id === selected?.id) await loadMessages(target.id)
  }

  async function sendReaction(m: Message, emoji: string) {
    if (!company) return
    setReactionPickerFor(null)
    const removing = m.reaction === emoji
    setMessages(prev => prev.map(x => x.id === m.id ? { ...x, reaction: removing ? null : emoji, reaction_by: removing ? null : 'out' } : x))
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/crm/reagir', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: session?.access_token, company_id: company.id, message_id: m.id, emoji: removing ? '' : emoji }),
    }).catch(() => {})
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
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    setMediaError('')
    for (const file of files) {
      try {
        const compressed = await compressImage(file)
        // Usa o tipo real do arquivo comprimido (a compressão pode gerar
        // webp, ou manter o formato original nos fallbacks) — antes estava
        // sempre rotulado como jpg/jpeg mesmo quando o conteúdo era outro.
        const contentType = compressed.type || file.type || 'image/jpeg'
        const ext = contentType.includes('webp') ? 'webp' : contentType.includes('png') ? 'png' : 'jpg'
        await sendMedia('image', compressed, ext, contentType)
      } catch (err: any) {
        // Sem isso, uma falha na compressão (foto grande demais, HEIC do
        // iPhone, etc.) travava o loop em silêncio — parecia que o clique
        // no "enviar" simplesmente não fazia nada.
        setMediaError(err?.message || 'não consegui enviar essa foto — tenta outra imagem')
      }
    }
  }

  async function onPickVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 30 * 1024 * 1024) { setMediaError('vídeo muito grande (máx. 30MB)'); return }
    const ext = file.name.split('.').pop() || 'mp4'
    await sendMedia('video', file, ext, file.type || 'video/mp4')
  }

  async function onPickDocument(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 30 * 1024 * 1024) { setMediaError('arquivo muito grande (máx. 30MB)'); return }
    const ext = file.name.split('.').pop() || 'bin'
    await sendMedia('document', file, ext, file.type || 'application/octet-stream', file.name)
  }

  async function startRecording() {
    setMediaError('')
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMediaError('gravação de áudio não é suportada neste navegador')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Nem todo navegador grava no mesmo formato — Safari/iOS não suporta
      // webm, por exemplo. Sem negociar isso, a gravação parecia funcionar
      // localmente mas o áudio chegava corrompido/ilegível do outro lado.
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/aac']
      const mimeType = candidates.find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(t))
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      audioChunksRef.current = []
      discardRecordingRef.current = false
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        if (discardRecordingRef.current) return
        if (audioChunksRef.current.length === 0) { setMediaError('a gravação ficou vazia — tenta de novo'); return }
        const actualType = mr.mimeType || mimeType || 'audio/webm'
        const ext = actualType.includes('mp4') ? 'mp4' : actualType.includes('ogg') ? 'ogg' : actualType.includes('aac') ? 'aac' : 'webm'
        const blob = new Blob(audioChunksRef.current, { type: actualType })
        await sendMedia('audio', blob, ext, actualType)
      }
      mr.onerror = (e: any) => {
        setMediaError('erro durante a gravação: ' + (e?.error?.message || e?.error?.name || 'desconhecido'))
        stream.getTracks().forEach(t => t.stop())
        setRecording(false)
      }
      mr.start()
      mediaRecorderRef.current = mr
      setRecording(true)
    } catch (err: any) {
      if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
        setMediaError('permissão de microfone negada — libera o microfone nas configurações do navegador pra esse site e tenta de novo')
      } else if (err?.name === 'NotFoundError') {
        setMediaError('nenhum microfone encontrado neste aparelho')
      } else {
        setMediaError('não consegui gravar áudio (' + (err?.name || err?.message || 'erro desconhecido') + ')')
      }
    }
  }
  function stopRecording() {
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }
  function cancelRecording() {
    discardRecordingRef.current = true
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
    <EmpresaShell active="mensagens" companyName={company.name} companySlug={company.slug} lojaDigitalEnabled={company.loja_digital_enabled} crmEnabled={company.crm_whatsapp_enabled} entregaEnabled={company.entrega_enabled}>
      <div className="msg-page">
        <style>{`
          .msg-page{padding:0;min-width:0;}
          .msg-connect{max-width:360px;margin:40px auto;text-align:center;background:#fff;border:1px solid #EDE8E0;border-radius:16px;padding:28px 22px;}
          .msg-qr{width:200px;height:200px;margin:16px auto;border-radius:12px;border:1px solid #EDE8E0;overflow:hidden;background:#F7F5F0;display:flex;align-items:center;justify-content:center;}
          .msg-qr img{width:100%;height:100%;object-fit:contain;}
          .msg-btn{padding:11px 22px;border-radius:10px;border:none;background:#C9951A;color:#1A1610;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit;}
          .msg-btn:disabled{opacity:.5;cursor:not-allowed;}
          .msg-err{color:#C43D3D;font-size:12px;margin-top:12px;line-height:1.5;}
          .msg-shell{display:grid;grid-template-columns:1fr;border:none;border-radius:0;overflow:hidden;background:#111b21;height:calc(100vh - var(--es-tabbar-h, 74px));min-height:420px;}
          @media(min-width:768px){.msg-shell{grid-template-columns:420px 1fr;border:none;border-radius:0;background:#111b21;height:calc(100vh - var(--es-topbar-h, 65px));}}
          .msg-list{background:#111b21;border-right:1px solid #2f3b43;overflow-y:auto;min-height:0;}
          @media(max-width:767px){.msg-list{display:${selected ? 'none' : 'block'};}}
          .msg-item{display:flex;gap:14px;padding:16px;border-bottom:1px solid #202c33;cursor:pointer;align-items:center;position:relative;}
          .msg-item.sel{background:#2a3942;}
          .msg-item:hover{background:#202c33;}
          .msg-item.actions-open{background:#2a3942;}
          .msg-avatar{width:34px;height:34px;border-radius:50%;background:#374045;border:none;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;color:#cfd6da;flex:none;overflow:hidden;}
          .msg-avatar img{width:100%;height:100%;object-fit:cover;}
          .msg-avatar-lg{width:52px;height:52px;font-size:17px;}
          .msg-item-txt{flex:1;min-width:0;}
          .msg-item-row1{display:flex;align-items:baseline;justify-content:space-between;gap:8px;}
          .msg-item-row2{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:3px;}
          .msg-item-name{font-weight:700;font-size:16px;color:#e9edef;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
          .msg-item-time{font-size:12.5px;color:#8696a0;flex:none;}
          .msg-item-time.unread{color:#00a884;font-weight:700;}
          .msg-item-preview{flex:1;min-width:0;font-size:13.5px;color:#8696a0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
          .msg-item-tick{color:#8696a0;margin-right:4px;font-size:12px;}
          .msg-item-unread-badge{flex:none;background:#00a884;color:#0b141a;font-size:11.5px;font-weight:800;min-width:21px;height:21px;border-radius:11px;display:flex;align-items:center;justify-content:center;padding:0 6px;}
          .msg-item-actions{display:none;gap:2px;flex:none;}
          @media(hover:hover) and (pointer:fine){.msg-item:hover .msg-item-actions{display:flex;}}
          .msg-item-actions button{background:none;border:none;font-size:19px;cursor:pointer;padding:8px;border-radius:50%;opacity:.75;width:38px;height:38px;display:flex;align-items:center;justify-content:center;}
          .msg-item-actions button:hover{opacity:1;background:#2f3b43;}
          .msg-item-actions button.on{opacity:1;color:#C9951A;}
          @media(max-width:767px){
            /* Igual às mensagens: escondido por padrão, só abre no
               toque-e-segure do contato (ver handleContactPressStart),
               encostado na borda direita da tela — não ocupa espaço fixo
               na fileira o tempo todo. */
            .msg-item{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;}
            .msg-item-actions{display:none;}
            .msg-item-actions.mobile-open{
              display:flex;position:absolute;top:50%;right:0;transform:translateY(-50%);
              background:#233138;border-radius:26px 0 0 26px;padding:6px 4px 6px 8px;box-shadow:-4px 0 14px rgba(0,0,0,.4);z-index:20;
            }
            .msg-item-actions.mobile-open button{opacity:.9;font-size:19px;width:40px;height:40px;}
          }
          .msg-list-toolbar{position:sticky;top:0;z-index:5;background:#111b21;padding:10px 12px 8px;display:flex;flex-direction:column;gap:8px;}
          .msg-list-search{width:100%;padding:9px 14px;border-radius:20px;border:none;background:#202c33;color:#e9edef;font-size:13px;font-family:inherit;}
          .msg-list-search::placeholder{color:#8696a0;}
          .msg-list-chips{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;}
          .msg-list-chips::-webkit-scrollbar{display:none;}
          .msg-list-chip{flex:none;padding:6px 14px;border-radius:16px;border:none;background:#202c33;color:#cfd6da;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap;}
          .msg-list-chip.on{background:#00a884;color:#fff;}
          .msg-search-hits{padding:4px 0 2px;}
          .msg-search-hit-row{padding:8px 12px;cursor:pointer;border-bottom:1px solid #202c33;}
          .msg-search-hit-row:hover{background:#202c33;}
          .msg-search-hit-name{font-size:12px;font-weight:700;color:#00a884;}
          .msg-search-hit-body{font-size:12px;color:#cfd6da;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
          .msg-notes-box{background:#233138;border:1px solid #2f3b43;border-radius:14px;width:340px;max-width:92vw;padding:16px;}
          .msg-notes-box h4{margin:0 0 10px;color:#e9edef;font-size:14px;}
          .msg-notes-box textarea{width:100%;min-height:100px;border-radius:10px;border:1px solid #2f3b43;background:#2a3942;color:#e9edef;font-size:13px;font-family:inherit;padding:10px;resize:vertical;}
          .msg-notes-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px;}
          .msg-notes-actions button{padding:8px 16px;border-radius:8px;border:none;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;}
          .msg-notes-save{background:#00a884;color:#fff;}
          .msg-notes-cancel{background:#2a3942;color:#cfd6da;}
          .msg-qr-item{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid #2f3b43;}
          .msg-qr-item:hover{background:#182229;}
          .msg-qr-item-txt{flex:1;min-width:0;cursor:pointer;}
          .msg-qr-item-shortcut{font-size:12.5px;font-weight:700;color:#00a884;}
          .msg-qr-item-body{font-size:11.5px;color:#8696a0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
          .msg-qr-item button{background:none;border:none;color:#8696a0;font-size:14px;cursor:pointer;padding:4px;}
          .msg-qr-new{padding:12px 16px;display:flex;flex-direction:column;gap:8px;}
          .msg-qr-new input,.msg-qr-new textarea{border-radius:8px;border:1px solid #2f3b43;background:#2a3942;color:#e9edef;font-size:12.5px;font-family:inherit;padding:8px 10px;}
          .msg-qr-new textarea{min-height:60px;resize:vertical;}
          .msg-star-badge{position:absolute;top:-9px;left:6px;background:#233138;border:1px solid #2f3b43;border-radius:10px;font-size:11px;padding:1px 4px;line-height:1.3;}
          .np-box{background:#233138;border-radius:14px;width:440px;max-width:94vw;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;position:relative;}
          @media(max-width:600px){.np-box{width:100vw;max-width:100vw;height:100vh;max-height:100vh;border-radius:0;}}
          .np-head{display:flex;align-items:center;gap:8px;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #2f3b43;color:#e9edef;font-size:14px;flex:none;}
          .np-head b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
          .np-close,.np-back{background:none;border:none;color:#8696a0;font-size:16px;cursor:pointer;flex:none;}
          .np-body{overflow-y:auto;flex:1;min-height:0;}
          .np-empty{padding:20px;text-align:center;color:#8696a0;font-size:12.5px;}
          .np-search{padding:10px 16px;flex:none;}
          .np-search input{width:100%;padding:9px 14px;border-radius:20px;border:none;background:#2a3942;color:#e9edef;font-size:13px;font-family:inherit;}
          .np-search input::placeholder{color:#8696a0;}
          .np-catbar{display:flex;gap:8px;padding:0 16px 10px;overflow-x:auto;flex:none;scrollbar-width:none;}
          .np-catbar::-webkit-scrollbar{display:none;}
          .np-catchip{flex:none;padding:6px 14px;border-radius:16px;border:none;background:#2a3942;color:#cfd6da;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;}
          .np-catchip.on{background:#00a884;color:#fff;}
          .np-sec{padding:12px 16px 6px;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#8696a0;}
          .np-products{display:flex;flex-direction:column;padding-bottom:8px;}
          .np-prod{display:flex;align-items:center;gap:10px;padding:9px 16px;cursor:pointer;}
          .np-prod:hover{background:#182229;}
          .np-prod.soldout{opacity:.5;cursor:default;}
          .np-prod-photo{width:46px;height:46px;border-radius:9px;overflow:hidden;flex:none;background:#2a3942;display:flex;align-items:center;justify-content:center;font-size:20px;}
          .np-prod-photo img{width:100%;height:100%;object-fit:cover;}
          .np-prod-mid{flex:1;min-width:0;}
          .np-prod-name{font-size:13px;color:#e9edef;font-weight:600;}
          .np-prod-desc{font-size:11px;color:#8696a0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px;}
          .np-prod-price{font-size:12.5px;color:#00a884;font-weight:700;margin-top:2px;}
          .np-prod-price .was{font-size:10.5px;color:#8696a0;text-decoration:line-through;margin-left:5px;font-weight:600;}
          .np-addbtn{flex:none;width:28px;height:28px;border-radius:8px;border:1.5px solid #00a884;background:none;color:#00a884;font-size:15px;font-weight:800;cursor:pointer;}
          .np-chev{flex:none;width:24px;height:24px;border-radius:50%;border:none;background:#2a3942;color:#8696a0;font-size:13px;font-weight:800;cursor:pointer;}
          .np-cartbar{flex:none;margin:0 12px 12px;padding:12px 16px;border-radius:12px;background:#00a884;color:#fff;display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:700;cursor:pointer;}
          .np-cart{padding:12px 16px;display:flex;flex-direction:column;gap:8px;}
          .np-cart-line{display:flex;align-items:center;gap:8px;font-size:12.5px;color:#e9edef;}
          .np-cart-line-txt{flex:1;min-width:0;}
          .np-cart-line-mods{font-size:10.5px;color:#8696a0;}
          .np-cart-line-qty{display:flex;align-items:center;gap:6px;background:#2a3942;border-radius:14px;padding:2px 8px;flex:none;}
          .np-cart-line-qty button{background:none;border:none;color:#00a884;font-size:14px;cursor:pointer;width:18px;}
          .np-cart-line-price{font-weight:700;flex:none;width:60px;text-align:right;}
          .np-input{width:100%;padding:9px 11px;border-radius:9px;border:1px solid #2f3b43;background:#2a3942;color:#e9edef;font-size:12.5px;font-family:inherit;}
          textarea.np-input{min-height:50px;resize:vertical;}
          .np-pay-row{display:flex;gap:8px;}
          .np-pay-btn{flex:1;padding:8px;border-radius:9px;border:1px solid #2f3b43;background:#2a3942;color:#cfd6da;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;}
          .np-pay-btn.on{background:#00a884;color:#fff;border-color:#00a884;}
          .np-error{color:#e0645a;font-size:11.5px;line-height:1.5;}
          .np-confirm-btn{width:100%;padding:11px;border-radius:9px;border:none;background:#00a884;color:#fff;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit;margin-top:4px;flex:none;}
          .np-confirm-btn:disabled{opacity:.5;cursor:not-allowed;}
          .np-hero{height:170px;flex:none;background:linear-gradient(135deg,#2a3942,#182229);display:flex;align-items:center;justify-content:center;font-size:44px;position:relative;overflow:hidden;}
          .np-hero img{width:100%;height:100%;object-fit:cover;}
          .np-hero-back{position:absolute;top:12px;left:12px;width:34px;height:34px;border-radius:50%;background:rgba(0,0,0,.45);border:none;color:#fff;font-size:18px;font-weight:800;cursor:pointer;}
          .np-detail-body{overflow-y:auto;flex:1;min-height:0;padding:14px 16px;}
          .np-detail-name{font-size:16px;font-weight:800;color:#e9edef;margin-bottom:4px;}
          .np-detail-desc{font-size:12px;color:#8696a0;line-height:1.5;margin-bottom:12px;}
          .np-group{margin-bottom:16px;}
          .np-group-title{font-size:12.5px;font-weight:700;color:#e9edef;margin-bottom:8px;}
          .np-req{color:#e0645a;font-weight:600;}
          .np-opt{display:flex;align-items:center;gap:8px;padding:6px 0;font-size:12.5px;color:#cfd6da;cursor:pointer;}
          .np-opt-price{margin-left:auto;color:#00a884;font-weight:700;}
          .msg-thread{display:flex;flex-direction:column;min-height:0;}
          @media(max-width:767px){.msg-thread{display:${selected ? 'flex' : 'none'};position:fixed;inset:0;z-index:10000;background:#0b141a;}}
          .msg-thead{padding:12px 16px;background:#202c33;border-bottom:1px solid #2f3b43;display:flex;align-items:center;gap:10px;flex:none;color:#e9edef;}
          .msg-back{display:none;background:none;border:none;font-size:24px;cursor:pointer;color:#aebac1;width:40px;height:40px;align-items:center;justify-content:center;border-radius:50%;flex:none;transition:background .15s;}
          .msg-back:hover{background:rgba(255,255,255,.08);}
          @media(max-width:767px){.msg-back{display:flex;font-size:30px;width:46px;height:46px;}}
          .msg-body{flex:1;min-height:0;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;background-color:#0b141a;background-image:radial-gradient(rgba(255,255,255,.035) 1px,transparent 1px),radial-gradient(rgba(255,255,255,.02) 1px,transparent 1px);background-size:26px 26px,26px 26px;background-position:0 0,13px 13px;scrollbar-width:none;-ms-overflow-style:none;}
          .msg-body::-webkit-scrollbar{display:none;}
          .msg-list{scrollbar-width:none;-ms-overflow-style:none;}
          .msg-list::-webkit-scrollbar{display:none;}
          .msg-date-sep{align-self:center;background:#182229;color:#8696a0;font-size:11px;font-weight:600;padding:5px 12px;border-radius:8px;margin:6px 0;}
          .msg-bubble-row{display:flex;position:relative;}
          .msg-bubble-row.out{justify-content:flex-end;}
          .msg-bubble{position:relative;max-width:84%;padding:6px 9px 8px;border-radius:8px;font-size:13.5px;line-height:1.45;box-shadow:0 1px 1px rgba(0,0,0,.3);color:#e9edef;white-space:pre-wrap;overflow-wrap:break-word;}
          .msg-bubble-row.in .msg-bubble{background:#202c33;border-bottom-left-radius:2px;}
          .msg-bubble-row.out .msg-bubble{background:#005c4b;border-bottom-right-radius:2px;}
          .msg-bubble a{color:#53bdeb;text-decoration:underline;}
          .msg-bubble .t{font-size:10.5px;color:rgba(233,237,239,.6);margin-top:3px;text-align:right;display:flex;justify-content:flex-end;gap:4px;align-items:center;}
          .msg-media-img{display:block;max-width:100%;width:260px;height:auto;max-height:320px;object-fit:cover;border-radius:6px;margin-bottom:4px;cursor:pointer;}
          .msg-media-fail{font-size:12px;color:#8696a0;font-style:italic;}
          .msg-audio-wrap{max-width:calc(84vw - 40px);overflow:hidden;}
          .msg-bubble audio{display:block;width:220px;max-width:100%;height:34px;}
          .msg-bubble video{display:block;max-width:260px;max-height:320px;border-radius:6px;margin-bottom:4px;}
          .msg-sticker{display:block;width:120px;height:120px;object-fit:contain;margin-bottom:4px;}
          .msg-doc,.msg-loc,.msg-vcard{display:flex;align-items:center;gap:10px;padding:4px 2px;text-decoration:none;color:inherit;}
          .msg-doc-ico,.msg-loc-ico,.msg-vcard-ico{font-size:22px;flex:none;}
          .msg-doc-name{font-size:12.5px;font-weight:600;word-break:break-all;}
          .msg-loc a,.msg-vcard-name{color:#e9edef;font-weight:700;font-size:12.5px;text-decoration:none;}
          .msg-reply-quote{background:rgba(255,255,255,.08);border-left:3px solid #C9951A;border-radius:6px;padding:5px 8px;margin-bottom:5px;font-size:11.5px;color:#c8ccce;max-height:36px;overflow:hidden;}
          .msg-link-preview{display:block;background:rgba(0,0,0,.18);border-radius:8px;overflow:hidden;margin-top:2px;margin-bottom:2px;text-decoration:none;color:inherit;}
          .msg-link-preview-img{display:block;width:100%;max-height:180px;object-fit:cover;background:#0b141a;}
          .msg-link-preview-body{padding:7px 9px;}
          .msg-link-preview-title{font-size:12.5px;font-weight:700;color:#e9edef;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
          .msg-link-preview-site{font-size:10.5px;color:#8696a0;margin-top:4px;display:flex;align-items:center;gap:4px;}
          .msg-bubble-wrap{display:flex;align-items:center;gap:2px;max-width:84%;}
          .msg-bubble-wrap .msg-bubble{max-width:100%;}
          .msg-bubble-actions{display:flex;gap:0;flex:none;width:0;overflow:hidden;position:relative;}
          @media(hover:hover) and (pointer:fine){.msg-bubble-row:hover .msg-bubble-actions{width:auto;overflow:visible;}}
          @media(max-width:767px){
            /* Igual ao WhatsApp: os ícones ficam escondidos e só aparecem
               num menu flutuante ao toque-e-segure na bolha (ver
               handleBubblePressStart) — nada de fileira de ícones sempre
               visível grudada em cada mensagem. */
            .msg-bubble{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;}
            .msg-bubble-actions{display:none;width:0;overflow:hidden;}
            .msg-bubble-actions.mobile-open{
              display:flex;position:absolute;bottom:100%;margin-bottom:8px;width:auto;overflow:visible;
              background:#233138;border-radius:26px;padding:5px 6px;box-shadow:0 4px 14px rgba(0,0,0,.4);z-index:20;
            }
            .msg-bubble-row.in .msg-bubble-actions.mobile-open{left:0;}
            .msg-bubble-row.out .msg-bubble-actions.mobile-open{right:0;order:0;}
            .msg-bubble-row.actions-open{position:relative;z-index:16;}
            .msg-bubble-row.actions-open .msg-bubble{filter:brightness(1.18);}
            .msg-bubble-actions.mobile-open .msg-reply-btn{opacity:1;font-size:19px;padding:9px;min-width:40px;min-height:40px;display:flex;align-items:center;justify-content:center;}
            .msg-actions-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.32);z-index:15;}
          }
          .msg-reply-btn{background:none;border:none;font-size:13px;color:#8696a0;cursor:pointer;opacity:0;transition:opacity .15s;padding:4px;flex:none;}
          @media(hover:hover) and (pointer:fine){.msg-bubble-row:hover .msg-reply-btn{opacity:1;}}
          .msg-reaction-badge{position:absolute;bottom:-9px;right:6px;background:#233138;border:1px solid #2f3b43;border-radius:10px;font-size:12px;padding:1px 5px;line-height:1.3;box-shadow:0 1px 2px rgba(0,0,0,.3);}
          .msg-reaction-picker{position:absolute;bottom:100%;left:50%;transform:translateX(-50%);display:flex;gap:2px;background:#233138;border:1px solid #2f3b43;border-radius:20px;padding:4px 6px;box-shadow:0 4px 12px rgba(0,0,0,.35);margin-bottom:6px;z-index:10;}
          .msg-reaction-picker button{background:none;border:none;font-size:17px;cursor:pointer;padding:3px;border-radius:50%;}
          .msg-reaction-picker button.sel{background:#005c4b;}
          .msg-attach-menu{position:absolute;bottom:100%;left:0;margin-bottom:8px;background:#233138;border:1px solid #2f3b43;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.35);padding:6px;display:flex;flex-direction:column;gap:2px;min-width:150px;z-index:10;}
          .msg-attach-menu button{background:none;border:none;text-align:left;padding:9px 10px;border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit;color:#e9edef;}
          .msg-attach-menu button:hover{background:#182229;}
          .msg-emoji-picker{position:absolute;bottom:100%;left:0;margin-bottom:8px;background:#233138;border:1px solid #2f3b43;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.35);padding:8px;display:grid;grid-template-columns:repeat(8,1fr);gap:2px;width:280px;max-height:220px;overflow-y:auto;z-index:10;}
          .msg-emoji-picker button{background:none;border:none;font-size:18px;cursor:pointer;padding:4px;border-radius:6px;}
          .msg-emoji-picker button:hover{background:#182229;}
          .msg-picker{background:#fff;border-radius:14px;width:320px;max-width:92vw;max-height:70vh;display:flex;flex-direction:column;overflow:hidden;}
          .msg-picker-title{padding:16px;font-weight:800;font-size:14px;border-bottom:1px solid #EDE8E0;}
          .msg-picker-list{overflow-y:auto;flex:1;}
          .msg-picker-item{display:flex;align-items:center;gap:10px;padding:10px 16px;cursor:pointer;font-size:13px;}
          .msg-picker-item:hover{background:#F7F5F0;}
          .msg-picker-cancel{padding:14px;border:none;border-top:1px solid #EDE8E0;background:none;font-weight:700;font-size:13px;color:#C43D3D;cursor:pointer;font-family:inherit;}
          .msg-reply-bar{display:flex;align-items:center;gap:10px;padding:8px 14px;background:#202c33;border-top:1px solid #2f3b43;font-size:12px;}
          .msg-reply-bar-txt{flex:1;min-width:0;color:#c8ccce;border-left:3px solid #C9951A;padding-left:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
          .msg-reply-bar button{background:none;border:none;font-size:15px;cursor:pointer;color:#8696a0;flex:none;}
          .msg-presence{font-size:11px;color:#53bdeb;font-weight:600;}
          .msg-thead-search-btn{background:rgba(255,255,255,.07);border:none;font-size:19px;cursor:pointer;flex:none;color:#e9edef;width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;transition:background .15s;}
          .msg-thead-search-btn:hover{background:rgba(255,255,255,.14);}
          @media(max-width:767px){.msg-thead-search-btn{width:48px;height:48px;font-size:22px;}}
          .msg-search-input{flex:1;padding:9px 14px;border-radius:20px;border:1px solid #2f3b43;background:#2a3942;color:#e9edef;font-size:13px;font-family:inherit;}
          .msg-search-hit{background:#FBEEC5;color:#1A1610;border-radius:3px;padding:0 1px;}
          .msg-deleted{font-size:12.5px;color:#8696a0;font-style:italic;}
          .msg-edited-tag{font-size:9.5px;color:#8696a0;}
          .msg-online-dot{width:8px;height:8px;border-radius:50%;background:#3FBF6F;border:2px solid #202c33;position:absolute;margin-left:24px;margin-top:22px;}
          .msg-lightbox{position:fixed;inset:0;background:rgba(10,8,4,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:10050;padding:24px;}
          .msg-lightbox img{max-width:92vw;max-height:76vh;object-fit:contain;border-radius:6px;}
          .msg-lightbox-close{position:absolute;top:16px;right:16px;width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.14);border:none;color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;}
          .msg-lightbox-actions{display:flex;gap:12px;margin-top:18px;}
          .msg-lightbox-actions button{background:#fff;color:#1A1610;border:none;padding:10px 20px;border-radius:24px;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit;}
          .msg-lightbox-actions button.ghost{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.4);}
          .msg-composer{padding:8px 8px;background:#0b141a;display:flex;gap:8px;align-items:flex-end;flex:none;}
          .msg-composer-pill{flex:1;min-width:0;display:flex;align-items:center;background:#2a3942;border-radius:26px;padding:2px 4px 2px 4px;}
          .msg-recording-pill{padding:6px 6px 6px 16px;gap:10px;}
          .msg-recording-dot{width:11px;height:11px;border-radius:50%;background:#e0645a;flex:none;animation:msgRecPulse 1.1s ease-in-out infinite;}
          @keyframes msgRecPulse{0%,100%{opacity:1;}50%{opacity:.25;}}
          .msg-recording-txt{flex:1;color:#e9edef;font-size:14px;font-variant-numeric:tabular-nums;}
          .msg-composer-pill textarea{flex:1;min-width:0;border:none;background:none;color:#e9edef;font-size:14.5px;font-family:inherit;padding:10px 4px;resize:none;max-height:120px;line-height:1.35;scrollbar-width:none;-ms-overflow-style:none;}
          .msg-composer-pill textarea::-webkit-scrollbar{display:none;}
          .msg-composer-pill textarea::placeholder{color:#8696a0;}
          .msg-composer-icon{width:36px;height:36px;flex:none;background:none;border:none;color:#8696a0;font-size:19px;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:50%;}
          .msg-composer-icon:disabled{opacity:.4;cursor:not-allowed;}
          .msg-mic-send{width:46px;height:46px;flex:none;border-radius:50%;border:none;background:#2a3942;color:#e9edef;font-size:19px;cursor:pointer;display:flex;align-items:center;justify-content:center;}
          .msg-mic-send.send{background:#00a884;color:#fff;}
          .msg-mic-send.active{background:#3a1414;color:#e0645a;}
          .msg-mic-send:disabled{opacity:.5;cursor:not-allowed;}
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
              {contactActionsFor && <div className="msg-actions-backdrop" onClick={() => setContactActionsFor(null)} />}
              <div className="msg-list-toolbar">
                <input
                  className="msg-list-search" placeholder="Pesquisar conversa"
                  value={contactSearch} onChange={e => setContactSearch(e.target.value)}
                />
                <div className="msg-list-chips">
                  <button className={`msg-list-chip ${contactFilter === 'todas' ? 'on' : ''}`} onClick={() => setContactFilter('todas')}>Todas</button>
                  <button className={`msg-list-chip ${contactFilter === 'nao_lidas' ? 'on' : ''}`} onClick={() => setContactFilter('nao_lidas')}>Não lidas</button>
                  <button className={`msg-list-chip ${contactFilter === 'arquivadas' ? 'on' : ''}`} onClick={() => setContactFilter('arquivadas')}>Arquivadas</button>
                  <button className="msg-list-chip" onClick={() => setStarredOpen(true)}>⭐ Marcadas</button>
                  <button
                    className="msg-list-chip" title="Resposta automática fora do horário"
                    onClick={() => { setAutoReplyDraft({ enabled: !!company?.crm_auto_reply_enabled, text: company?.crm_auto_reply_text || '' }); setAutoReplyOpen(true) }}
                  >⚙️</button>
                </div>
                {messageSearchHits.length > 0 && (
                  <div className="msg-search-hits">
                    {messageSearchHits.map(h => (
                      <div key={h.id} className="msg-search-hit-row" onClick={() => { const c = contacts.find(x => x.id === h.contact_id); if (c) openContact(c) }}>
                        <div className="msg-search-hit-name">{h.contactName}</div>
                        <div className="msg-search-hit-body">{h.body}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {(() => {
                const term = contactSearch.trim().toLowerCase()
                const base = contacts
                  .filter(c => contactFilter === 'arquivadas' ? c.archived : !c.archived)
                  .filter(c => contactFilter !== 'nao_lidas' || (!!c.last_message_at && (!c.last_read_at || c.last_read_at < c.last_message_at)))
                  .filter(c => !term || (c.name || '').toLowerCase().includes(term) || c.phone.includes(term))
                const pinned = base.filter(c => c.pinned)
                const rest = base.filter(c => !c.pinned)
                const rows = [...pinned, ...rest]
                const emptyMsg = term ? 'Nenhuma conversa encontrada.'
                  : contactFilter === 'arquivadas' ? 'Nenhuma conversa arquivada.'
                  : contactFilter === 'nao_lidas' ? 'Nenhuma conversa não lida.'
                  : 'Nenhuma conversa ainda.'
                return (
                  <>
                    {rows.length === 0 && <div style={{ padding: 20, fontSize: 12.5, color: '#8696a0', textAlign: 'center' }}>{emptyMsg}</div>}
                    {rows.map(c => {
                      const unread = !!c.last_message_at && (!c.last_read_at || c.last_read_at < c.last_message_at)
                      return (
                        <div
                          key={c.id}
                          className={`msg-item ${selected?.id === c.id ? 'sel' : ''}${contactActionsFor === c.id ? ' actions-open' : ''}`}
                          onClick={() => { if (contactActionsFor === c.id) { setContactActionsFor(null); return } openContact(c) }}
                          onTouchStart={() => handleContactPressStart(c.id)}
                          onTouchMove={cancelContactPress}
                          onTouchEnd={cancelContactPress}
                          onContextMenu={e => e.preventDefault()}
                        >
                          <div className="msg-avatar msg-avatar-lg">{c.avatar_url ? <img src={c.avatar_url} alt="" /> : (c.name || c.phone).slice(0, 2).toUpperCase()}</div>
                          <div className="msg-item-txt">
                            <div className="msg-item-row1">
                              <div className="msg-item-name">{c.muted && '🔕 '}{c.name || c.phone}</div>
                              <div className={`msg-item-time${unread ? ' unread' : ''}`}>{c.last_message_at ? fmtTime(c.last_message_at) : ''}</div>
                            </div>
                            <div className="msg-item-row2">
                              <div className="msg-item-preview">
                                {c.last_message_direction === 'out' && <span className="msg-item-tick">✓✓</span>}
                                {c.last_message_preview || ''}
                              </div>
                              {!!c.unread_count && <span className="msg-item-unread-badge">{c.unread_count > 99 ? '99+' : c.unread_count}</span>}
                            </div>
                          </div>
                          <div className={`msg-item-actions${contactActionsFor === c.id ? ' mobile-open' : ''}`}>
                            <button title={c.pinned ? 'Desafixar' : 'Fixar'} className={c.pinned ? 'on' : ''} onClick={e => { togglePin(c, e); setContactActionsFor(null) }}>📌</button>
                            <button title={c.muted ? 'Reativar notificações' : 'Silenciar'} onClick={e => { toggleMute(c, e); setContactActionsFor(null) }}>{c.muted ? '🔔' : '🔕'}</button>
                            <button title={c.archived ? 'Desarquivar' : 'Arquivar'} onClick={e => { toggleArchive(c, e); setContactActionsFor(null) }}>🗄</button>
                          </div>
                        </div>
                      )
                    })}
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
                        <button className="msg-back" style={{ display: 'flex' }} onClick={() => { setSearchOpen(false); setSearchTerm('') }}>✕</button>
                      </>
                    ) : (
                      <>
                        <button className="msg-back" onClick={() => setSelected(null)}>‹</button>
                        <div style={{ position: 'relative' }}>
                          <div className="msg-avatar">{selectedLive?.avatar_url ? <img src={selectedLive.avatar_url} alt="" /> : (selectedLive?.name || selectedLive?.phone || '').slice(0, 2).toUpperCase()}</div>
                          {isOnline && !isTyping && <div className="msg-online-dot" />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }} onClick={() => { setNotesDraft(selectedLive?.notes || ''); setNotesOpen(true) }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#e9edef', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedLive?.muted && '🔕 '}{selectedLive?.name || selectedLive?.phone}</div>
                          <div style={{ fontSize: 11.5, color: '#8696a0' }}>
                            {isTyping ? <span className="msg-presence">digitando...</span> : isOnline ? <span className="msg-presence">online</span> : selectedLive?.notes ? <span style={{ color: '#C9951A' }}>📝 {selectedLive.notes}</span> : selectedLive?.phone}
                          </div>
                        </div>
                        {company?.loja_digital_enabled && (
                          <button className="msg-thead-search-btn" title="Novo pedido" onClick={openNovoPedido}>🧾</button>
                        )}
                        <button className="msg-thead-search-btn" title="Buscar na conversa" onClick={() => setSearchOpen(true)}>🔍</button>
                      </>
                    )}
                  </div>
                  <div className="msg-body" ref={msgBodyRef}>
                    {mobileActionsFor && <div className="msg-actions-backdrop" onClick={() => setMobileActionsFor(null)} />}
                    {(searchTerm.trim() ? messages.filter(m => m.body?.toLowerCase().includes(searchTerm.toLowerCase())) : messages).map((m, idx, arr) => {
                      const quoted = m.reply_to_id ? messages.find(x => x.id === m.reply_to_id) : null
                      let location: any = null, vcard: any = null
                      if (m.media_type === 'location' && m.body) { try { location = JSON.parse(m.body) } catch {} }
                      if (m.media_type === 'contact' && m.body) { try { vcard = JSON.parse(m.body) } catch {} }
                      const canEditDelete = m.direction === 'out' && !m.deleted_at
                      const prev = arr[idx - 1]
                      const showDateSep = !prev || new Date(prev.sent_at).toDateString() !== new Date(m.sent_at).toDateString()
                      const url = !m.media_type && !m.deleted_at && m.body ? extractFirstUrl(m.body) : null
                      const preview = url ? linkPreviews[url] : null
                      const textWithoutUrl = url && m.body ? m.body.replace(url, '').trim() : m.body
                      return (
                        <Fragment key={m.id}>
                        {showDateSep && <div className="msg-date-sep">{dateSepLabel(m.sent_at)}</div>}
                        <div className={`msg-bubble-row ${m.direction === 'out' ? 'out' : 'in'}${mobileActionsFor === m.id ? ' actions-open' : ''}`}>
                          <div className="msg-bubble-wrap">
                          <div
                            className="msg-bubble"
                            onTouchStart={() => handleBubblePressStart(m.id)}
                            onTouchMove={cancelBubblePress}
                            onTouchEnd={cancelBubblePress}
                            onContextMenu={e => e.preventDefault()}
                          >
                            {m.deleted_at ? (
                              <div className="msg-deleted">🚫 {m.direction === 'out' ? 'Você apagou essa mensagem' : 'Mensagem apagada'}</div>
                            ) : (
                              <>
                                {quoted && <div className="msg-reply-quote">{replySnippet(quoted)}</div>}
                                {m.media_type === 'image' && (m.signedUrl ? <img className="msg-media-img" src={m.signedUrl} alt="" onClick={() => setLightbox(m.signedUrl!)} /> : <div className="msg-media-fail">📷 imagem indisponível</div>)}
                                {m.media_type === 'video' && (m.signedUrl ? <video controls src={m.signedUrl} /> : <div className="msg-media-fail">🎥 vídeo indisponível</div>)}
                                {m.media_type === 'audio' && (m.signedUrl ? <div className="msg-audio-wrap"><audio controls src={m.signedUrl} /></div> : <div className="msg-media-fail">🎤 áudio indisponível</div>)}
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
                                {m.media_type !== 'location' && m.media_type !== 'contact' && m.media_type !== 'document' && m.body && (
                                  searchTerm.trim()
                                    ? highlightMatch(m.body, searchTerm)
                                    : (url ? (textWithoutUrl && <div style={{ marginBottom: 4 }}>{linkifyText(textWithoutUrl)}</div>) : linkifyText(m.body))
                                )}
                                {url && preview !== null && (
                                  <a className="msg-link-preview" href={url} target="_blank" rel="noreferrer">
                                    {preview?.image && <img className="msg-link-preview-img" src={preview.image} alt="" />}
                                    <div className="msg-link-preview-body">
                                      <div className="msg-link-preview-title">{preview?.title || url}</div>
                                      <div className="msg-link-preview-site">🔗 {preview?.siteName || new URL(url).hostname.replace(/^www\./, '')}</div>
                                    </div>
                                  </a>
                                )}
                              </>
                            )}
                            <div className="t">
                              {m.edited_at && !m.deleted_at && <span className="msg-edited-tag">editada</span>}
                              {fmtTime(m.sent_at)}{m.direction === 'out' && !m.deleted_at && tickIcon(m.status)}
                            </div>
                            {m.reaction && !m.deleted_at && <div className="msg-reaction-badge">{m.reaction}</div>}
                            {m.starred && !m.deleted_at && <div className="msg-star-badge">⭐</div>}
                          </div>
                          {!m.deleted_at && (
                            <div className={`msg-bubble-actions${mobileActionsFor === m.id ? ' mobile-open' : ''}`}>
                              {reactionPickerFor === m.id && (
                                <div className="msg-reaction-picker" onMouseLeave={() => setReactionPickerFor(null)}>
                                  {QUICK_REACTIONS.map(em => (
                                    <button key={em} onClick={() => { sendReaction(m, em); setMobileActionsFor(null) }} className={m.reaction === em ? 'sel' : ''}>{em}</button>
                                  ))}
                                </div>
                              )}
                              <button className="msg-reply-btn" title="Reagir" onClick={() => setReactionPickerFor(v => v === m.id ? null : m.id)}>😊</button>
                              <button className="msg-reply-btn" title="Responder" onClick={() => { setReplyTo(m); setMobileActionsFor(null) }}>↩</button>
                              {m.media_type !== 'sticker' && <button className="msg-reply-btn" title="Encaminhar" onClick={() => { setContactPicker({ mode: 'forward', forMessage: m }); setMobileActionsFor(null) }}>➡️</button>}
                              <button className="msg-reply-btn" title={m.starred ? 'Desmarcar' : 'Marcar'} onClick={() => { toggleStar(m); setMobileActionsFor(null) }}>{m.starred ? '⭐' : '☆'}</button>
                              {canEditDelete && !m.media_type && <button className="msg-reply-btn" title="Editar" onClick={() => { startEdit(m); setMobileActionsFor(null) }}>✏️</button>}
                              {canEditDelete && <button className="msg-reply-btn" title="Apagar" onClick={() => { deleteMessage(m); setMobileActionsFor(null) }}>🗑</button>}
                            </div>
                          )}
                          </div>
                        </div>
                        </Fragment>
                      )
                    })}
                  </div>
                  {mediaError && <div className="msg-err" style={{ padding: '8px 14px', background: '#202c33' }}>{mediaError}</div>}
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
                    <input type="file" accept="image/*" multiple ref={fileInputRef} style={{ display: 'none' }} onChange={onPickImage} />
                    <input type="file" accept="video/*" ref={videoInputRef} style={{ display: 'none' }} onChange={onPickVideo} />
                    <input type="file" ref={docInputRef} style={{ display: 'none' }} onChange={onPickDocument} />
                    {recording ? (
                      <div className="msg-composer-pill msg-recording-pill">
                        <span className="msg-recording-dot" />
                        <span className="msg-recording-txt">Gravando... {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, '0')}</span>
                        <button className="msg-composer-icon" title="Cancelar gravação" onClick={cancelRecording}>🗑</button>
                      </div>
                    ) : (
                      <div className="msg-composer-pill">
                        <div style={{ position: 'relative' }}>
                          {emojiPickerOpen && (
                            <div className="msg-emoji-picker" onMouseLeave={() => setEmojiPickerOpen(false)}>
                              {EMOJI_PICKER_LIST.map((em, i) => (
                                <button key={i} onClick={() => { setText(t => t + em); setEmojiPickerOpen(false) }}>{em}</button>
                              ))}
                            </div>
                          )}
                          <button className="msg-composer-icon" disabled={sending} onClick={() => setEmojiPickerOpen(v => !v)} title="Emoji">😊</button>
                        </div>
                        <textarea
                          ref={composerRef} rows={1}
                          placeholder={editingMessage ? 'Editar mensagem' : 'Mensagem'}
                          value={text}
                          onChange={e => setText(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                        />
                        <div style={{ position: 'relative' }}>
                          {attachMenuOpen && (
                            <div className="msg-attach-menu" onMouseLeave={() => setAttachMenuOpen(false)}>
                              <button onClick={() => { fileInputRef.current?.click(); setAttachMenuOpen(false) }}>🖼 Foto(s)</button>
                              <button onClick={() => { videoInputRef.current?.click(); setAttachMenuOpen(false) }}>🎥 Vídeo</button>
                              <button onClick={() => { docInputRef.current?.click(); setAttachMenuOpen(false) }}>📄 Documento</button>
                              <button onClick={() => { shareLocation(); setAttachMenuOpen(false) }}>📍 Localização</button>
                              <button onClick={() => { setContactPicker({ mode: 'shareContact' }); setAttachMenuOpen(false) }}>👤 Contato</button>
                              <button onClick={() => { setQuickRepliesOpen(true); setAttachMenuOpen(false) }}>⚡ Resposta rápida</button>
                            </div>
                          )}
                          <button className="msg-composer-icon" disabled={sending || !!editingMessage} onClick={() => setAttachMenuOpen(v => !v)} title="Anexar">📎</button>
                        </div>
                        <button className="msg-composer-icon" disabled={sending || !!editingMessage} onClick={() => fileInputRef.current?.click()} title="Câmera">📷</button>
                      </div>
                    )}
                    <button
                      className={`msg-mic-send ${recording ? 'active' : text.trim() ? 'send' : ''}`}
                      disabled={sending || (!text.trim() && !recording && !!editingMessage)}
                      onClick={recording ? stopRecording : text.trim() ? sendMessage : startRecording}
                      title={recording ? 'Parar e enviar' : text.trim() ? 'Enviar' : 'Gravar áudio'}
                    >
                      {recording ? '⏹' : text.trim() ? (editingMessage ? '✓' : '➤') : '🎤'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {lightbox && (
          <div className="msg-lightbox" onClick={() => setLightbox(null)}>
            <button className="msg-lightbox-close" onClick={e => { e.stopPropagation(); setLightbox(null) }} title="Fechar">✕</button>
            <img src={lightbox} alt="" onClick={e => e.stopPropagation()} />
            <div className="msg-lightbox-actions" onClick={e => e.stopPropagation()}>
              <button onClick={() => downloadImage(lightbox)}>⬇ Baixar</button>
              <button className="ghost" onClick={() => setLightbox(null)}>✕ Fechar</button>
            </div>
          </div>
        )}

        {contactPicker && (
          <div className="msg-lightbox" onClick={() => setContactPicker(null)}>
            <div className="msg-picker" onClick={e => e.stopPropagation()}>
              <div className="msg-picker-title">{contactPicker.mode === 'forward' ? 'Encaminhar mensagem pra...' : 'Compartilhar contato'}</div>
              <div className="msg-picker-list">
                {contacts.length === 0 && <div style={{ padding: 16, fontSize: 12.5, color: '#A79E8B' }}>Nenhum contato ainda.</div>}
                {contacts.map(c => (
                  <div key={c.id} className="msg-picker-item" onClick={() => contactPicker.mode === 'forward' ? forwardMessage(contactPicker.forMessage!, c) : shareContact(c)}>
                    <div className="msg-avatar">{(c.name || c.phone).slice(0, 2).toUpperCase()}</div>
                    <div>{c.name || c.phone}</div>
                  </div>
                ))}
              </div>
              <button className="msg-picker-cancel" onClick={() => setContactPicker(null)}>Cancelar</button>
            </div>
          </div>
        )}

        {notesOpen && selectedLive && (
          <div className="msg-lightbox" onClick={() => setNotesOpen(false)}>
            <div className="msg-notes-box" onClick={e => e.stopPropagation()}>
              <h4>📝 Nota sobre {selectedLive.name || selectedLive.phone}</h4>
              <textarea
                autoFocus placeholder="Só você vê essa nota — o cliente não tem acesso."
                value={notesDraft} onChange={e => setNotesDraft(e.target.value)}
              />
              <div className="msg-notes-actions">
                <button className="msg-notes-cancel" onClick={() => setNotesOpen(false)}>Cancelar</button>
                <button className="msg-notes-save" onClick={() => { saveNotes(selectedLive.id, notesDraft); setNotesOpen(false) }}>Salvar</button>
              </div>
            </div>
          </div>
        )}

        {npOpen && selectedLive && (() => {
          const term = npSearch.trim().toLowerCase()
          const visible = npProdutos.filter(p => !term || p.name.toLowerCase().includes(term) || (p.description || '').toLowerCase().includes(term))
          return (
            <div className="msg-lightbox" onClick={closeNovoPedido}>
              <div className="np-box" onClick={e => e.stopPropagation()}>
                {npDetail ? (
                  <>
                    <div className="np-hero">
                      {npDetail.photo_url ? <img src={npDetail.photo_url} alt="" /> : <span>🍽️</span>}
                      <button className="np-hero-back" onClick={() => setNpDetail(null)}>‹</button>
                    </div>
                    <div className="np-detail-body">
                      <div className="np-detail-name">{npDetail.name}</div>
                      {npDetail.description && <div className="np-detail-desc">{npDetail.description}</div>}
                      {npDetail.groups.map((g, gi) => (
                        <div key={g.id} className="np-group">
                          <div className="np-group-title">{g.name}{g.required && <span className="np-req"> · obrigatório</span>}</div>
                          {g.options.map((o, oi) => (
                            <label key={o.id} className="np-opt">
                              <input type={g.max_select === 1 ? 'radio' : 'checkbox'} checked={npDetailSel[gi]?.includes(oi) || false} onChange={() => npToggleOpt(gi, oi)} />
                              <span>{o.name}</span>
                              {o.price > 0 && <span className="np-opt-price">+{fmtMoney(o.price)}</span>}
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                    <button className="np-confirm-btn" disabled={!npDetailReqMet} onClick={npConfirmDetail}>Adicionar — {fmtMoney(npDetailPrice)}</button>
                  </>
                ) : npCartOpen ? (
                  <>
                    <div className="np-head">
                      <button className="np-back" onClick={() => setNpCartOpen(false)}>‹</button>
                      <b>Carrinho — {selectedLive.name || selectedLive.phone}</b>
                      <button className="np-close" onClick={closeNovoPedido}>✕</button>
                    </div>
                    <div className="np-body">
                      <div className="np-cart">
                        {npCart.map(l => (
                          <div key={l.key} className="np-cart-line">
                            <div className="np-cart-line-txt">
                              <div>{l.name}</div>
                              {l.modifiers.length > 0 && <div className="np-cart-line-mods">{l.modifiers.map(m => m.name).join(', ')}</div>}
                            </div>
                            <div className="np-cart-line-qty">
                              <button onClick={() => npChangeQty(l.key, -1)}>−</button>
                              <span>{l.qty}</span>
                              <button onClick={() => npChangeQty(l.key, 1)}>+</button>
                            </div>
                            <div className="np-cart-line-price">{fmtMoney(l.unitPrice * l.qty)}</div>
                          </div>
                        ))}
                        <div className="np-pay-row">
                          <button className={`np-pay-btn ${npDeliveryType === 'entrega' ? 'on' : ''}`} onClick={() => setNpDeliveryType('entrega')}>🚚 Entrega</button>
                          <button className={`np-pay-btn ${npDeliveryType === 'retirada' ? 'on' : ''}`} onClick={() => setNpDeliveryType('retirada')}>🏪 Retirada</button>
                        </div>
                        {npDeliveryType === 'entrega' && (
                          <input className="np-input" placeholder="Endereço de entrega" value={npEndereco} onChange={e => setNpEndereco(e.target.value)} />
                        )}
                        <textarea className="np-input" placeholder="Observações" value={npObs} onChange={e => setNpObs(e.target.value)} />
                        <div className="np-pay-row">
                          {(['dinheiro', 'pix', 'cartao'] as const).map(p => (
                            <button key={p} className={`np-pay-btn ${npPay === p ? 'on' : ''}`} onClick={() => setNpPay(p)}>{p === 'dinheiro' ? 'Dinheiro' : p === 'pix' ? 'Pix' : 'Cartão'}</button>
                          ))}
                        </div>
                        {npError && <div className="np-error">{npError}</div>}
                        <button className="np-confirm-btn" disabled={npSaving || npCart.length === 0} onClick={npCriarPedido}>{npSaving ? 'Criando...' : `Criar pedido — ${fmtMoney(npTotal)}`}</button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="np-head"><b>🧾 Novo pedido — {selectedLive.name || selectedLive.phone}</b><button className="np-close" onClick={closeNovoPedido}>✕</button></div>
                    <div className="np-search"><input placeholder="Buscar produto..." value={npSearch} onChange={e => setNpSearch(e.target.value)} /></div>
                    <div className="np-catbar">
                      <button className={`np-catchip ${npFilterCat === 'all' ? 'on' : ''}`} onClick={() => setNpFilterCat('all')}>Tudo</button>
                      {npCategorias.map(c => (
                        <button key={c.id} className={`np-catchip ${npFilterCat === c.id ? 'on' : ''}`} onClick={() => setNpFilterCat(c.id)}>{c.name}</button>
                      ))}
                    </div>
                    <div className="np-body">
                      <div className="np-products">
                        {npLoadingProdutos && <div className="np-empty">Carregando catálogo...</div>}
                        {!npLoadingProdutos && npProdutos.length === 0 && <div className="np-empty">Nenhum produto ativo no catálogo.</div>}
                        {!npLoadingProdutos && term && visible.length === 0 && <div className="np-empty">Nenhum produto encontrado.</div>}
                        {npCategorias.filter(c => npFilterCat === 'all' || npFilterCat === c.id).map(cat => {
                          const items = visible.filter(p => p.category_id === cat.id)
                          if (items.length === 0) return null
                          return (
                            <div key={cat.id}>
                              <div className="np-sec">{cat.name}</div>
                              {items.map(p => {
                                const promo = npPromoPrice(p)
                                const hasOpts = p.groups && p.groups.length > 0
                                const soldOut = npIsSoldOut(p)
                                return (
                                  <div key={p.id} className={`np-prod ${soldOut ? 'soldout' : ''}`} onClick={() => { if (soldOut) return; hasOpts ? npOpenDetail(p) : npAddToCart(p.id, p.name, promo ?? p.sale_price) }}>
                                    <div className="np-prod-photo">{p.photo_url ? <img src={p.photo_url} alt="" /> : '🍽️'}</div>
                                    <div className="np-prod-mid">
                                      <div className="np-prod-name">{p.name}</div>
                                      {p.description && <div className="np-prod-desc">{p.description}</div>}
                                      {soldOut
                                        ? <div className="np-prod-price" style={{ color: '#e0645a' }}>Esgotado</div>
                                        : <div className="np-prod-price">{fmtMoney(promo ?? p.sale_price)}{promo != null && <span className="was">{fmtMoney(p.sale_price)}</span>}</div>}
                                    </div>
                                    {!soldOut && (hasOpts ? <button className="np-chev">›</button> : <button className="np-addbtn">+</button>)}
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })}
                        {/* Produtos sem categoria cadastrada — ainda tem que aparecer */}
                        {(npFilterCat === 'all') && visible.filter(p => !p.category_id).length > 0 && (
                          <div>
                            <div className="np-sec">Outros</div>
                            {visible.filter(p => !p.category_id).map(p => {
                              const promo = npPromoPrice(p)
                              const hasOpts = p.groups && p.groups.length > 0
                              const soldOut = npIsSoldOut(p)
                              return (
                                <div key={p.id} className={`np-prod ${soldOut ? 'soldout' : ''}`} onClick={() => { if (soldOut) return; hasOpts ? npOpenDetail(p) : npAddToCart(p.id, p.name, promo ?? p.sale_price) }}>
                                  <div className="np-prod-photo">{p.photo_url ? <img src={p.photo_url} alt="" /> : '🍽️'}</div>
                                  <div className="np-prod-mid">
                                    <div className="np-prod-name">{p.name}</div>
                                    {p.description && <div className="np-prod-desc">{p.description}</div>}
                                    {soldOut
                                      ? <div className="np-prod-price" style={{ color: '#e0645a' }}>Esgotado</div>
                                      : <div className="np-prod-price">{fmtMoney(promo ?? p.sale_price)}{promo != null && <span className="was">{fmtMoney(p.sale_price)}</span>}</div>}
                                  </div>
                                  {!soldOut && (hasOpts ? <button className="np-chev">›</button> : <button className="np-addbtn">+</button>)}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                    {npCart.length > 0 && (
                      <div className="np-cartbar" onClick={() => setNpCartOpen(true)}>
                        <span>{npCart.reduce((s, l) => s + l.qty, 0)} {npCart.reduce((s, l) => s + l.qty, 0) === 1 ? 'item' : 'itens'} · Ver carrinho</span>
                        <b>{fmtMoney(npTotal)}</b>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })()}

        {autoReplyOpen && (
          <div className="msg-lightbox" onClick={() => setAutoReplyOpen(false)}>
            <div className="msg-notes-box" onClick={e => e.stopPropagation()}>
              <h4>🤖 Resposta automática fora do horário</h4>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#cfd6da', marginBottom: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={autoReplyDraft.enabled} onChange={e => setAutoReplyDraft(d => ({ ...d, enabled: e.target.checked }))} />
                Ativar resposta automática
              </label>
              <div style={{ fontSize: 11, color: '#8696a0', marginBottom: 8, lineHeight: 1.5 }}>
                Manda essa mensagem sozinha quando um cliente escreve fora do horário de funcionamento cadastrado no perfil da empresa (no máximo uma vez a cada 3h por conversa).
              </div>
              <textarea
                placeholder="Ex: Nossa loja está fechada agora. Voltamos amanhã às 9h! Deixe sua mensagem que respondemos assim que abrir 🙂"
                value={autoReplyDraft.text} onChange={e => setAutoReplyDraft(d => ({ ...d, text: e.target.value }))}
              />
              <div className="msg-notes-actions">
                <button className="msg-notes-cancel" onClick={() => setAutoReplyOpen(false)}>Cancelar</button>
                <button className="msg-notes-save" disabled={savingAutoReply} onClick={saveAutoReply}>{savingAutoReply ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </div>
          </div>
        )}

        {quickRepliesOpen && (
          <div className="msg-lightbox" onClick={() => { setQuickRepliesOpen(false); setQuickReplyForm(null) }}>
            <div className="msg-picker" onClick={e => e.stopPropagation()}>
              <div className="msg-picker-title">⚡ Respostas rápidas</div>
              <div className="msg-picker-list">
                {quickReplies.length === 0 && !quickReplyForm && <div style={{ padding: 16, fontSize: 12.5, color: '#8696a0' }}>Nenhuma resposta salva ainda.</div>}
                {quickReplies.map(q => (
                  <div key={q.id} className="msg-qr-item">
                    <div className="msg-qr-item-txt" onClick={() => useQuickReply(q)}>
                      <div className="msg-qr-item-shortcut">{q.shortcut}</div>
                      <div className="msg-qr-item-body">{q.body}</div>
                    </div>
                    <button title="Apagar" onClick={() => deleteQuickReply(q.id)}>🗑</button>
                  </div>
                ))}
                {quickReplyForm ? (
                  <div className="msg-qr-new">
                    <input autoFocus placeholder="Título curto (ex: Horário de funcionamento)" value={quickReplyForm.shortcut} onChange={e => setQuickReplyForm(f => f && { ...f, shortcut: e.target.value })} />
                    <textarea placeholder="Texto da resposta" value={quickReplyForm.body} onChange={e => setQuickReplyForm(f => f && { ...f, body: e.target.value })} />
                    <div className="msg-notes-actions">
                      <button className="msg-notes-cancel" onClick={() => setQuickReplyForm(null)}>Cancelar</button>
                      <button className="msg-notes-save" onClick={saveQuickReply}>Salvar</button>
                    </div>
                  </div>
                ) : (
                  <button className="msg-picker-item" style={{ color: '#00a884', fontWeight: 700 }} onClick={() => setQuickReplyForm({ shortcut: '', body: '' })}>+ Nova resposta rápida</button>
                )}
              </div>
              <button className="msg-picker-cancel" onClick={() => { setQuickRepliesOpen(false); setQuickReplyForm(null) }}>Fechar</button>
            </div>
          </div>
        )}

        {starredOpen && (
          <StarredMessagesPanel
            companyId={company?.id}
            contacts={contacts}
            onOpenContact={c => { setStarredOpen(false); openContact(c) }}
            onClose={() => setStarredOpen(false)}
          />
        )}
      </div>
    </EmpresaShell>
  )
}

// Painel com todas as mensagens marcadas com estrela, de qualquer conversa —
// mesmo conceito do "Mensagens favoritas" do WhatsApp, que junta tudo numa
// lista só em vez de precisar abrir conversa por conversa procurando.
function StarredMessagesPanel({
  companyId, contacts, onOpenContact, onClose,
}: {
  companyId?: string
  contacts: Contact[]
  onOpenContact: (c: Contact) => void
  onClose: () => void
}) {
  const [items, setItems] = useState<{ id: string; contact_id: string; body: string | null; media_type: string | null; sent_at: string }[] | null>(null)

  useEffect(() => {
    if (!companyId) return
    supabase
      .from('crm_messages').select('id, contact_id, body, media_type, sent_at')
      .eq('company_id', companyId).eq('starred', true).is('deleted_at', null)
      .order('sent_at', { ascending: false })
      .then(({ data }) => setItems(data || []))
  }, [companyId])

  const byId = new Map(contacts.map(c => [c.id, c.name || c.phone]))

  return (
    <div className="msg-lightbox" onClick={onClose}>
      <div className="msg-picker" onClick={e => e.stopPropagation()}>
        <div className="msg-picker-title">⭐ Mensagens marcadas</div>
        <div className="msg-picker-list">
          {items === null && <div style={{ padding: 16, fontSize: 12.5, color: '#8696a0' }}>Carregando...</div>}
          {items?.length === 0 && <div style={{ padding: 16, fontSize: 12.5, color: '#8696a0' }}>Nenhuma mensagem marcada ainda — toque no ☆ ao lado de uma mensagem pra marcar.</div>}
          {items?.map(m => (
            <div key={m.id} className="msg-search-hit-row" onClick={() => { const c = contacts.find(x => x.id === m.contact_id); if (c) onOpenContact(c) }}>
              <div className="msg-search-hit-name">{byId.get(m.contact_id) || ''}</div>
              <div className="msg-search-hit-body">{m.body || replySnippet({ media_type: m.media_type } as Message)}</div>
            </div>
          ))}
        </div>
        <button className="msg-picker-cancel" onClick={onClose}>Fechar</button>
      </div>
    </div>
  )
}
