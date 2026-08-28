'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { refreshSessionOnce } from '@/lib/authRefresh'
import { moduleActive } from '@/lib/modules'
import EmpresaShell from '@/components/EmpresaShell'

type Item = { id: string; product_name: string; unit_price: number; qty: number; selected_options: { name: string; price: number }[] }
type Status = 'recebido' | 'em_preparo' | 'pronto' | 'saiu_entrega' | 'entregue' | 'cancelado'
type Pedido = {
  id: string; customer_id: string | null; customer_name: string; customer_phone: string | null; delivery_address: string | null
  origin: string; status: Status; payment_method: string | null; payment_status: string
  delivery_type: 'entrega' | 'retirada'; scheduled_for: string | null
  notes: string | null; subtotal: number; total: number; created_at: string; accepted_at: string | null
  itens: Item[]
}
type NpOpcao = { id: string; name: string; price: number; max_qty: number | null }
type NpGrupo = { id: string; name: string; required: boolean; min_select: number; max_select: number; pricing_rule: 'soma' | 'maior_valor'; options: NpOpcao[] }
function npGroupContribution(g: NpGrupo, selectedIdx: number[]): number {
  const prices = selectedIdx.map(oi => g.options[oi].price)
  if (prices.length === 0) return 0
  return g.pricing_rule === 'maior_valor' ? Math.max(...prices) : prices.reduce((a, b) => a + b, 0)
}
type NpProduto = { id: string; name: string; sale_price: number; category_id: string | null; groups: NpGrupo[] }
type NpCartLine = { key: string; produtoId: string; name: string; modifiers: { name: string; price: number }[]; unitPrice: number; qty: number }

const CUSTOMER_MSG: Partial<Record<Status, string>> = {
  em_preparo: 'Seu pedido já está em preparo!',
  pronto: 'Seu pedido está pronto!',
  saiu_entrega: 'Seu pedido saiu para entrega!',
  entregue: 'Pedido entregue. Bom apetite!',
  cancelado: 'Seu pedido foi cancelado.',
}
function notifyCustomer(customerId: string | null, companyName: string, status: Status) {
  const msg = CUSTOMER_MSG[status]
  if (!customerId || !msg) return
  fetch('/api/push/send', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: companyName, body: msg, target: 'external_user_id', userId: customerId, url: `${window.location.origin}/perfil` }),
  }).catch(() => {})
}
// Além do push no app, manda a atualização como mensagem de WhatsApp de
// verdade pro cliente (mesmo canal usado pra confirmar o pedido).
function notifyCustomerWhatsapp(companyId: string, phone: string | null, status: Status, deliveryType: string) {
  if (!phone) return
  fetch('/api/loja/status-pedido', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, phone, status, deliveryType }),
  }).catch(() => {})
}

const STATUS_LABEL: Record<Status, string> = { recebido: 'Recebido', em_preparo: 'Em preparo', pronto: 'Pronto', saiu_entrega: 'Saiu p/ entrega', entregue: 'Entregue', cancelado: 'Cancelado' }
const ORIGIN_INFO: Record<string, { label: string; bg: string; fg: string }> = {
  cardapio_publico: { label: '🌐 Site', bg: '#E8F0FE', fg: '#1A56B0' },
  conversa: { label: '💬 WhatsApp', bg: '#E4F3EC', fg: '#157A52' },
  balcao: { label: '🏪 Balcão', bg: '#F0EDE8', fg: '#6E6656' },
}
function originInfo(origin: string) { return ORIGIN_INFO[origin] || { label: origin, bg: '#F0EDE8', fg: '#6E6656' } }
const STATUS_COLOR: Record<Status, { bg: string; fg: string }> = {
  recebido: { bg: '#FEF0E0', fg: '#B5690C' }, em_preparo: { bg: '#FEF6DC', fg: '#8A6410' },
  pronto: { bg: '#E4F3EC', fg: '#157A52' }, saiu_entrega: { bg: '#E8F0FE', fg: '#1A56B0' },
  entregue: { bg: '#F0EDE8', fg: '#6E6656' }, cancelado: { bg: '#FBEAEA', fg: '#C43D3D' },
}
const FLOW: Status[] = ['recebido', 'em_preparo', 'pronto', 'saiu_entrega', 'entregue']
const BOARD_COLUMNS: Status[] = ['recebido', 'em_preparo', 'pronto', 'saiu_entrega', 'entregue']
type MobileStageKey = 'recebido' | 'em_preparo' | 'pronto' | 'saiu_entrega' | 'historico'
const MOBILE_STAGES: { key: MobileStageKey; label: string; accent: string; match: (s: Status) => boolean }[] = [
  { key: 'recebido', label: 'Recebido', accent: STATUS_COLOR.recebido.fg, match: s => s === 'recebido' },
  { key: 'em_preparo', label: 'Em preparo', accent: STATUS_COLOR.em_preparo.fg, match: s => s === 'em_preparo' },
  { key: 'pronto', label: 'Pronto', accent: STATUS_COLOR.pronto.fg, match: s => s === 'pronto' },
  { key: 'saiu_entrega', label: 'Saiu p/ entrega', accent: STATUS_COLOR.saiu_entrega.fg, match: s => s === 'saiu_entrega' },
  { key: 'historico', label: 'Histórico', accent: STATUS_COLOR.entregue.fg, match: s => s === 'entregue' || s === 'cancelado' },
]
function getNextAction(p: Pedido): { next: Status; label: string } | null {
  if (p.status === 'recebido') return { next: 'em_preparo', label: 'Iniciar preparo' }
  if (p.status === 'em_preparo') return { next: 'pronto', label: 'Marcar pronto' }
  if (p.status === 'pronto') {
    return p.delivery_type === 'retirada' ? { next: 'entregue', label: 'Cliente retirou' } : { next: 'saiu_entrega', label: 'Saiu para entrega' }
  }
  if (p.status === 'saiu_entrega') return { next: 'entregue', label: 'Marcar entregue' }
  return null
}
function flowFor(p: Pedido): Status[] { return p.delivery_type === 'retirada' ? FLOW.filter(s => s !== 'saiu_entrega') : FLOW }

// Pedido "atrasado" — ainda não existe um tempo combinado configurável por
// loja, então usa um teto razoável fixo: mais de 30min parado em
// recebido/em_preparo sem avançar (ESPECIFICACAO.md §10.7 — "pedido parado
// mais tempo que o combinado ganha borda vermelha").
const LATE_THRESHOLD_MIN = 30
function isLate(p: Pedido): boolean {
  if (p.status !== 'recebido' && p.status !== 'em_preparo') return false
  const mins = (Date.now() - new Date(p.created_at).getTime()) / 60000
  return mins > LATE_THRESHOLD_MIN
}

function fmt(n: number) { return 'R$ ' + n.toFixed(2).replace('.', ',') }
function fmtSchedule(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}
// Alerta de pedido novo — o beep antigo (um sine bem baixinho, gain 0.12)
// passava despercebido na correria da cozinha. Onda quadrada (mais "elétrica"/
// alarme que sine) + volume bem mais alto + 2 toques em par, repetidos, pra
// ficar com cara de campainha de pedido chegando, não de notificação discreta.
function beep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const master = ctx.createGain()
    master.gain.value = 0.55
    master.connect(ctx.destination)

    function note(freq: number, start: number, dur: number) {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'square'
      osc.frequency.value = freq
      osc.connect(g); g.connect(master)
      const t0 = ctx.currentTime + start
      g.gain.setValueAtTime(0, t0)
      g.gain.linearRampToValueAtTime(1, t0 + 0.012)
      g.gain.linearRampToValueAtTime(0, t0 + dur)
      osc.start(t0)
      osc.stop(t0 + dur + 0.02)
    }

    // B5 → E6, duas vezes — padrão de "ding-ding" de campainha de balcão
    const NOTE_A = 987.77, NOTE_B = 1318.51
    ;[[NOTE_A, 0], [NOTE_B, 0.15], [NOTE_A, 0.5], [NOTE_B, 0.65]].forEach(([freq, t]) => note(freq, t, 0.14))
  } catch {}
}

export default function PedidosPage() {
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [crmEnabled, setCrmEnabled] = useState(false)
  const [entregaEnabled, setEntregaEnabled] = useState(false)
  const [autoAceitar, setAutoAceitar] = useState(true)
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [mobileStage, setMobileStage] = useState<MobileStageKey>('recebido')
  const [openId, setOpenId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const companyIdRef = useRef('')
  const [deliveryCalled, setDeliveryCalled] = useState<Set<string>>(new Set())
  const [motoErrors, setMotoErrors] = useState<Record<string, string>>({})
  const [motoLoading, setMotoLoading] = useState<string | null>(null)
  // Ref (não state) pra travar na hora — o disparo automático e um clique
  // manual no mesmo pedido não podem rodar ao mesmo tempo, e esperar o
  // re-render do state seria tarde demais pra evitar a corrida.
  const callingMotoboyRef = useRef<Set<string>>(new Set())

  const [npOpen, setNpOpen] = useState(false)
  const [npProdutos, setNpProdutos] = useState<NpProduto[]>([])
  const [npLoadingProdutos, setNpLoadingProdutos] = useState(false)
  const [npCart, setNpCart] = useState<NpCartLine[]>([])
  const [npDetail, setNpDetail] = useState<NpProduto | null>(null)
  const [npDetailSel, setNpDetailSel] = useState<number[][]>([])
  const [npNome, setNpNome] = useState('')
  const [npTelefone, setNpTelefone] = useState('')
  const [npDeliveryType, setNpDeliveryType] = useState<'entrega' | 'retirada'>('entrega')
  const [npEndereco, setNpEndereco] = useState('')
  const [npObs, setNpObs] = useState('')
  const [npPay, setNpPay] = useState<'pix' | 'dinheiro' | 'cartao'>('dinheiro')
  const [npSaving, setNpSaving] = useState(false)
  const [npError, setNpError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login?redirect=/painel/pedidos'; return }
      const { data: comp } = await supabase.from('companies').select('id, name, loja_digital_enabled, loja_auto_aceitar_pedidos, crm_whatsapp_enabled, entrega_enabled, trial_modules_until').eq('owner_id', session.user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (!comp || !moduleActive(comp.loja_digital_enabled, comp.trial_modules_until)) { window.location.href = '/painel/compartilhar'; return }
      setCompanyId(comp.id); companyIdRef.current = comp.id
      setCompanyName(comp.name)
      setCrmEnabled(moduleActive(comp.crm_whatsapp_enabled, comp.trial_modules_until))
      setEntregaEnabled(moduleActive(comp.entrega_enabled, comp.trial_modules_until))
      setAutoAceitar(comp.loja_auto_aceitar_pedidos !== false)
      await loadAll(comp.id)
      setLoading(false)

      const channel = supabase.channel(`pedidos-${comp.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'loja_pedidos', filter: `company_id=eq.${comp.id}` }, payload => {
          if (payload.eventType === 'INSERT') { beep(); loadAll(companyIdRef.current) }
          else loadAll(companyIdRef.current)
        })
        .subscribe()
      return () => { supabase.removeChannel(channel) }
    })
  }, [])

  async function loadAll(cid: string) {
    const { data } = await supabase.from('loja_pedidos').select('*, itens:loja_pedido_itens(*)').eq('company_id', cid).order('created_at', { ascending: false }).limit(100)
    setPedidos((data || []) as any)
    const { data: entregas } = await supabase.from('delivery_orders').select('pedido_id').eq('company_id', cid).not('pedido_id', 'is', null)
    setDeliveryCalled(new Set((entregas || []).map(e => e.pedido_id as string)))
  }

  async function chamarMotoboy(p: Pedido) {
    if (callingMotoboyRef.current.has(p.id)) return // já tem uma chamada rodando pra esse pedido
    callingMotoboyRef.current.add(p.id)
    setMotoErrors(prev => { const n = { ...prev }; delete n[p.id]; return n })
    setMotoLoading(p.id)

    const call = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/entrega/criar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: session?.access_token, company_id: companyId, pedido_id: p.id,
          customer_name: p.customer_name, customer_phone: p.customer_phone, dropoff_address: p.delivery_address,
        }),
      })
      return { r, data: await r.json() }
    }

    let { r: res, data } = await call()
    // Token pode ter ficado velho (aba em segundo plano no celular sem
    // renovar sozinha) — força renovar a sessão (compartilhada, pra não
    // rodar duas renovações em paralelo) e tenta de novo antes de mostrar
    // erro pro lojista.
    if (res.status === 401) {
      await refreshSessionOnce()
      ;({ r: res, data } = await call())
    }
    callingMotoboyRef.current.delete(p.id)
    setMotoLoading(null)
    if (res.status === 401) {
      setMotoErrors(prev => ({ ...prev, [p.id]: (data.error || 'sessão inválida') + ' — atualiza a página (F5) e tenta de novo.' }))
      return
    }
    if (!res.ok || data.error) { setMotoErrors(prev => ({ ...prev, [p.id]: data.error || 'Não consegui chamar o motoboy.' })); return }
    setDeliveryCalled(prev => new Set(prev).add(p.id))
  }

  // Assim que o pedido entra em preparo, já chama o motoboy — ele viaja até
  // a loja enquanto o prato fica pronto, em vez de ficar esperando parado.
  function maybeAutoChamarMotoboy(pedido: Pedido) {
    if (entregaEnabled && pedido.delivery_type === 'entrega' && pedido.delivery_address && !deliveryCalled.has(pedido.id)) {
      chamarMotoboy(pedido)
    }
  }

  async function setStatus(id: string, status: Status) {
    setPedidos(prev => prev.map(p => p.id === id ? { ...p, status } : p))
    await supabase.from('loja_pedidos').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    const pedido = pedidos.find(p => p.id === id)
    if (pedido) {
      notifyCustomer(pedido.customer_id, companyName, status)
      notifyCustomerWhatsapp(companyId, pedido.customer_phone, status, pedido.delivery_type)
      if (status === 'em_preparo') maybeAutoChamarMotoboy(pedido)
    }
  }

  // payment_status nunca tinha jeito de mudar depois que o pedido era criado —
  // ficava travado em "pendente" pra sempre, mesmo entregue e pago, porque não
  // existe gateway de pagamento automático pro pedido da loja (só a intenção
  // declarada no checkout). O lojista marca manualmente quando recebeu.
  async function togglePaymentStatus(id: string) {
    const pedido = pedidos.find(p => p.id === id)
    if (!pedido) return
    const next = pedido.payment_status === 'pago' ? 'pendente' : 'pago'
    setPedidos(prev => prev.map(p => p.id === id ? { ...p, payment_status: next } : p))
    await supabase.from('loja_pedidos').update({ payment_status: next, updated_at: new Date().toISOString() }).eq('id', id)
  }

  async function acceptPedido(id: string) {
    const now = new Date().toISOString()
    setPedidos(prev => prev.map(p => p.id === id ? { ...p, accepted_at: now, status: 'em_preparo' } : p))
    await supabase.from('loja_pedidos').update({ accepted_at: now, status: 'em_preparo', updated_at: now }).eq('id', id)
    const pedido = pedidos.find(p => p.id === id)
    if (pedido) {
      notifyCustomer(pedido.customer_id, companyName, 'em_preparo')
      notifyCustomerWhatsapp(companyId, pedido.customer_phone, 'em_preparo', pedido.delivery_type)
      maybeAutoChamarMotoboy(pedido)
    }
  }

  async function toggleAutoAceitar() {
    const next = !autoAceitar
    setAutoAceitar(next)
    await supabase.from('companies').update({ loja_auto_aceitar_pedidos: next }).eq('id', companyId)
  }

  async function openNovoPedido() {
    setNpOpen(true)
    if (npProdutos.length === 0) {
      setNpLoadingProdutos(true)
      const { data } = await supabase.from('loja_produtos').select('id, name, sale_price, category_id, groups:loja_opcoes_grupo(*, options:loja_opcoes(*))').eq('company_id', companyId).eq('active', true).order('display_order')
      setNpProdutos((data || []) as any)
      setNpLoadingProdutos(false)
    }
  }
  function closeNovoPedido() {
    setNpOpen(false); setNpCart([]); setNpDetail(null); setNpNome(''); setNpTelefone(''); setNpDeliveryType('entrega'); setNpEndereco(''); setNpObs(''); setNpPay('dinheiro'); setNpError('')
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
  function npOpenDetail(p: NpProduto) { setNpDetail(p); setNpDetailSel(p.groups.map(() => [])) }
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
    if (!npNome.trim() || npCart.length === 0) return
    setNpSaving(true)
    setNpError('')
    if (npDeliveryType === 'entrega' && !npEndereco.trim()) { setNpError('Preenche o endereço de entrega.'); setNpSaving(false); return }
    const { data: pedido, error: pedidoErr } = await supabase.from('loja_pedidos').insert({
      company_id: companyId, customer_id: null,
      customer_name: npNome.trim(), customer_phone: npTelefone.trim() || null,
      delivery_address: npDeliveryType === 'entrega' ? npEndereco.trim() : null, delivery_type: npDeliveryType, origin: 'balcao', payment_method: npPay,
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
        companyId, phone: npTelefone.trim() || null, name: npNome.trim(), address: npDeliveryType === 'entrega' ? npEndereco.trim() : null,
        total: npTotal, subtotal: npTotal, deliveryFee: 0,
        paymentMethod: npPay, deliveryType: npDeliveryType, notes: npObs.trim() || null,
        items: npCart.map(l => ({ produtoId: l.produtoId, name: l.name, qty: l.qty, unitPrice: l.unitPrice, modifiers: l.modifiers })),
      }),
    }).catch(() => {})
    setNpSaving(false)
    closeNovoPedido()
    await loadAll(companyId)
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Archivo,sans-serif', color: '#AAA' }}>Carregando...</div>

  const searched = search.trim()
    ? pedidos.filter(p => p.customer_name.toLowerCase().includes(search.trim().toLowerCase()) || p.id.startsWith(search.trim()))
    : pedidos
  const currentStage = MOBILE_STAGES.find(t => t.key === mobileStage)!
  const mobileList = searched.filter(p => currentStage.match(p.status))

  function renderCard(p: Pedido) {
    const open = openId === p.id
    const c = STATUS_COLOR[p.status]
    const o = originInfo(p.origin)
    const needsAccept = !autoAceitar && p.status === 'recebido' && !p.accepted_at
    const late = isLate(p)
    // Pagamento é estado do pedido, não um detalhe solto no meio do resumo
    // (dívida #5 — "entregue · pendente" parecia estado impossível quando
    // misturado na mesma linha). Continua podendo coexistir de verdade
    // (COD entregue sem cobrar ainda é real), mas com destaque visual
    // separado — e mais forte quando já foi entregue e ainda não foi pago.
    const payUnpaidAfterDelivery = p.payment_status !== 'pago' && (p.status === 'entregue' || p.status === 'saiu_entrega')
    return (
      <div className={`pd-card ${needsAccept ? 'pd-card-pending' : ''} ${late ? 'pd-card-late' : ''}`} key={p.id} style={{ '--accent': c.fg, borderLeft: `4px solid ${o.fg}` } as React.CSSProperties} onClick={() => setOpenId(open ? null : p.id)}>
        <div className="pd-row1">
          <div>
            <div className="pd-name">{p.customer_name}</div>
            <div className="pd-time">{timeAgo(p.created_at)} atrás</div>
          </div>
          <span className="pd-badge" style={{ background: c.bg, color: c.fg }}>{STATUS_LABEL[p.status]}</span>
        </div>
        <div className="pd-origin-badge" style={{ background: o.bg, color: o.fg }}>{o.label}</div>
        {late && <div className="pd-late-flag">⚠ Parado há mais de {LATE_THRESHOLD_MIN}min sem avançar</div>}
        <div className="pd-sum">
          {p.itens?.length || 0} {p.itens?.length === 1 ? 'item' : 'itens'} · {p.payment_method || '—'} · {p.delivery_type === 'retirada' ? '🏪 Retirada' : '🚴 Entrega'}
        </div>
        <span
          className="pd-pay-chip"
          onClick={e => { e.stopPropagation(); togglePaymentStatus(p.id) }}
          style={{ background: p.payment_status === 'pago' ? '#E4F3EC' : payUnpaidAfterDelivery ? '#FBEAEA' : '#FEF6DC', color: p.payment_status === 'pago' ? '#157A52' : payUnpaidAfterDelivery ? '#C43D3D' : '#8A6410' }}
          title="Toca pra marcar como pago/pendente"
        >
          {p.payment_status === 'pago' ? '✓ Pago' : payUnpaidAfterDelivery ? '⚠ Entregue sem cobrar' : '💰 Pagamento pendente'}
        </span>
        {p.scheduled_for && <div className="pd-sum" style={{ color: '#B5690C', fontWeight: 700 }}>📅 Agendado pra {fmtSchedule(p.scheduled_for)}</div>}
        <div className="pd-total">{fmt(p.total)}</div>
        {needsAccept && <button className="pd-accept" onClick={e => { e.stopPropagation(); acceptPedido(p.id) }}>✓ Aceitar pedido</button>}
        {!needsAccept && !open && getNextAction(p) && (
          <button className="pd-next" onClick={e => { e.stopPropagation(); setStatus(p.id, getNextAction(p)!.next) }}>{getNextAction(p)!.label} →</button>
        )}
        {open && (
          <div className="pd-detail" onClick={e => e.stopPropagation()}>
            {p.itens?.map(it => (
              <div key={it.id}>
                <div className="pd-item"><span>{it.qty}x {it.product_name}</span><span>{fmt(it.unit_price * it.qty)}</span></div>
                {it.selected_options?.length > 0 && <div className="pd-mods">{it.selected_options.map(o => o.name).join(', ')}</div>}
              </div>
            ))}
            {p.delivery_address && <div style={{ marginTop: 8, fontSize: 11.5 }}>📍 {p.delivery_address}</div>}
            {p.customer_phone && <div style={{ fontSize: 11.5, marginTop: 2 }}>📞 {p.customer_phone}</div>}
            {p.notes && <div style={{ fontSize: 11.5, marginTop: 2, color: '#6E6656' }}>Obs: {p.notes}</div>}
            {entregaEnabled && p.delivery_type === 'entrega' && p.status !== 'cancelado' && (
              deliveryCalled.has(p.id) ? (
                <div style={{ marginTop: 8, fontSize: 11.5, fontWeight: 700, color: '#157A52' }}>🏍️ Motoboy chamado — acompanhe em Entrega</div>
              ) : (
                <>
                  <button className="pd-next" style={{ marginTop: 8 }} disabled={motoLoading === p.id} onClick={e => { e.stopPropagation(); chamarMotoboy(p) }}>
                    {motoLoading === p.id ? 'Chamando...' : '🏍️ Chamar motoboy'}
                  </button>
                  {motoErrors[p.id] && <div style={{ color: '#C43D3D', fontSize: 11, marginTop: 4 }}>{motoErrors[p.id]}</div>}
                </>
              )
            )}
            <div className="pd-chips">
              {flowFor(p).map(s => <button key={s} className={`pd-chip ${p.status === s ? 'current' : ''}`} onClick={() => setStatus(p.id, s)}>{STATUS_LABEL[s]}</button>)}
            </div>
            {p.status !== 'cancelado' && p.status !== 'entregue' && <button className="pd-cancel" onClick={() => setStatus(p.id, 'cancelado')}>Cancelar pedido</button>}
          </div>
        )}
      </div>
    )
  }

  const cancelados = searched.filter(p => p.status === 'cancelado')

  return (
    <EmpresaShell active="pedidos" companyName={companyName} lojaDigitalEnabled crmEnabled={crmEnabled} entregaEnabled={entregaEnabled}>
    <div className="pd-wrap">
      <style>{`
        .pd-wrap{ width:100%;max-width:480px;margin:0 auto;min-height:100vh;background:var(--concrete);font-family:'Archivo',sans-serif;font-size:13px;color:var(--ink);padding-bottom:30px;overflow-x:hidden;min-width:0; }
        .pd-head{ padding:22px 12px 10px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 10px;position:sticky;top:0;background:#F7F5F0;z-index:5; }
        .pd-head-left{ display:flex;align-items:center;gap:6px;min-width:0; }
        .pd-head-right{ display:flex;align-items:center;gap:6px;flex:none; }
        .pd-head h1{ font-size:16.5px;margin:0;font-weight:800;flex:none;white-space:nowrap; }
        .pd-back{ flex:none;width:30px;height:30px;border-radius:50%;border:1px solid #E6E0D2;background:#fff;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;text-decoration:none;color:#1A1610; }
        .pd-auto-pill{ flex:none;display:flex;align-items:center;gap:4px;background:#fff;border:1px solid #E6E0D2;border-radius:20px;padding:5px 8px;cursor:pointer; }
        .pd-auto-pill .pd-switch{ width:24px;height:15px;border-radius:8px; }
        .pd-auto-pill .pd-switch .k{ width:11px;height:11px;top:2px;left:2px; }
        .pd-auto-pill .pd-switch.on .k{ left:11px; }
        .pd-new-pill{ flex:none;width:26px;height:26px;border-radius:50%;background:var(--sign);color:var(--ink);border:none;font-size:15px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center; }
        .pd-searchbar{ padding:0 16px 12px; }
        .pd-tabs{ display:flex;gap:8px;padding:0 16px 12px;overflow-x:auto; }
        .pd-tab{ flex:none;display:flex;align-items:center;gap:6px;padding:8px 13px;border-radius:20px;border:1.5px solid #E6E0D2;background:#fff;font-weight:700;font-size:12.5px;color:#6E6656;cursor:pointer;white-space:nowrap; }
        .pd-tab.active{ background:var(--accent);color:#fff;border-color:var(--accent); }
        .pd-tab-count{ font-variant-numeric:tabular-nums;background:#EDE8E0;color:#6E6656;font-size:10.5px;font-weight:800;padding:1px 7px;border-radius:20px; }
        .pd-tab.active .pd-tab-count{ background:rgba(255,255,255,.3);color:#fff; }
        .pd-body{ padding:0 16px; }
        .pd-card{ background:#fff;border:1px solid #EDE8E0;border-radius:12px;padding:12px;margin-bottom:10px;cursor:pointer; }
        .pd-row1{ display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px; }
        .pd-name{ font-weight:800;font-size:13.5px; }
        .pd-time{ font-size:10.5px;color:#A79E8B; }
        .pd-badge{ font-size:10px;font-weight:800;padding:3px 8px;border-radius:7px; }
        .pd-origin-badge{ display:inline-block;font-size:10px;font-weight:800;padding:3px 8px;border-radius:7px;margin-bottom:8px; }
        .pd-sum{ font-size:11.5px;color:#6E6656; }
        .pd-total{ font-weight:800;font-size:13px;margin-top:4px; }
        .pd-detail{ margin-top:10px;padding-top:10px;border-top:1px dashed #EDE8E0; }
        .pd-item{ display:flex;justify-content:space-between;font-size:11.5px;padding:3px 0; }
        .pd-mods{ font-size:10.5px;color:#A79E8B;padding-left:12px; }
        .pd-chips{ display:flex;flex-wrap:wrap;gap:6px;margin-top:10px; }
        .pd-chip{ font-size:10.5px;font-weight:700;padding:6px 10px;border-radius:8px;border:1px solid #E6E0D2;background:#fff;cursor:pointer;color:#6E6656; }
        .pd-chip.current{ background:var(--sign);color:var(--ink);border-color:var(--sign); }
        .pd-cancel{ font-size:10.5px;color:#C43D3D;font-weight:700;background:none;border:none;cursor:pointer;margin-top:8px; }
        .pd-empty{ text-align:center;color:#A79E8B;padding:40px 0;font-size:12.5px; }
        .pd-card-pending{ border:1.5px solid var(--accent); }
        .pd-accept{ width:100%;margin-top:8px;padding:9px;border-radius:9px;border:none;background:var(--accent);color:#fff;font-weight:800;font-size:12px;cursor:pointer; }
        .pd-next{ width:100%;margin-top:8px;padding:10px;border-radius:9px;border:none;background:var(--accent);color:#fff;font-weight:800;font-size:12.5px;cursor:pointer; }
        .pd-toolbar{ display:none; }
        .pd-search{ width:100%;padding:9px 12px;border-radius:9px;border:1px solid #E6E0D2;background:#F7F5F0;font-size:12.5px;font-family:inherit; }
        .pd-autotoggle{ display:flex;align-items:center;gap:10px;font-size:11.5px;font-weight:600;color:#6E6656;cursor:pointer; }
        .pd-switch{ width:36px;height:20px;border-radius:11px;background:#E6E0D2;position:relative;cursor:pointer;flex:none; }
        .pd-switch.on{ background:#157A52; }
        .pd-switch .k{ position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s; }
        .pd-switch.on .k{ left:18px; }
        .pd-newbtn{ padding:10px;border-radius:9px;border:none;background:var(--sign);color:var(--ink);font-weight:800;font-size:12.5px;cursor:pointer; }
        .np-overlay{ position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:60;display:flex;align-items:flex-end;justify-content:center; }
        .np-drawer{ background:#F7F5F0;width:100%;max-width:480px;max-height:92vh;border-radius:18px 18px 0 0;display:flex;flex-direction:column;overflow:hidden; }
        .np-head{ padding:16px;border-bottom:1px solid #EDE8E0;display:flex;justify-content:space-between;align-items:center;background:#fff; }
        .np-close{ width:28px;height:28px;border-radius:50%;border:1px solid #E6E0D2;background:#fff;cursor:pointer; }
        .np-body{ flex:1;overflow-y:auto;padding:14px 16px; }
        .np-section-label{ font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#A79E8B;margin:12px 0 6px; }
        .np-input{ width:100%;padding:9px 12px;border-radius:9px;border:1px solid #E6E0D2;background:#fff;font-size:12.5px;font-family:inherit;margin-bottom:8px; }
        .np-paychip{ flex:1;padding:9px;border-radius:9px;border:1.5px solid #E6E0D2;background:#fff;font-size:12px;font-weight:700;cursor:pointer; }
        .np-paychip.active{ background:var(--ink);color:var(--sign);border-color:var(--ink); }
        .np-prodgrid{ display:grid;grid-template-columns:1fr 1fr;gap:8px; }
        .np-prod{ background:#fff;border:1px solid #E6E0D2;border-radius:10px;padding:10px;cursor:pointer; }
        .np-prod-name{ font-size:12px;font-weight:700; }
        .np-prod-price{ font-size:11.5px;color:#6E6656;margin-top:3px; }
        .np-cartline{ display:flex;align-items:center;gap:6px;font-size:12px;padding:6px 0;border-bottom:1px solid #EDE8E0; }
        .np-qtybtn{ width:22px;height:22px;border-radius:6px;border:1px solid #E6E0D2;background:#fff;cursor:pointer;font-weight:800; }
        .np-totalrow{ display:flex;justify-content:space-between;font-weight:800;font-size:14px;padding-top:10px;margin-top:6px;border-top:1px dashed #E6E0D2; }
        .np-back{ background:none;border:none;color:#8A6410;font-weight:700;font-size:12px;cursor:pointer;padding:0; }
        .np-opt{ display:flex;justify-content:space-between;padding:9px 10px;border:1px solid #E6E0D2;border-radius:9px;margin-bottom:6px;font-size:12px;cursor:pointer;background:#fff; }
        .np-opt.active{ border-color:var(--sign-dark);background:#FEF3E2; }
        .np-addcart{ width:100%;padding:12px;border-radius:10px;border:none;background:var(--sign);color:var(--ink);font-weight:800;cursor:pointer; }
        .np-addcart:disabled{ background:#E2DCCB;color:#A79E8B; }
        .np-foot{ padding:12px 16px 16px;border-top:1px solid #EDE8E0;background:#fff; }
        .np-createbtn{ width:100%;padding:13px;border-radius:10px;border:none;background:#157A52;color:#fff;font-weight:800;cursor:pointer; }
        .np-createbtn:disabled{ background:#D8D2C4;color:#8A8577; }
        .pd-board{ display:none; }
        @media(min-width:768px){
          .pd-wrap{ max-width:none;margin:0;padding-bottom:40px; }
          .pd-mobile-only{ display:none; }
          .pd-toolbar{ display:flex;flex-direction:row;align-items:center;padding:16px 32px;gap:10px;background:#fff;border-bottom:1px solid #EDE8E0; }
          .pd-search{ max-width:280px; }
          .pd-autotoggle{ margin-left:auto; }
          .pd-newbtn{ padding:10px 20px; }
          .pd-board{ display:flex;gap:14px;overflow-x:auto;padding:20px 32px 28px; align-items:flex-start; }
          .pd-board-col{ flex:0 0 250px;background:#EFEBE1;border-radius:14px;padding:10px;max-height:calc(100vh - 190px);display:flex;flex-direction:column;border-top:4px solid var(--accent); }
          .pd-board-colhead{ display:flex;justify-content:space-between;align-items:center;padding:4px 6px 10px;font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--accent); }
          .pd-board-count{ background:var(--accent);color:#fff;font-size:11px;font-weight:800;padding:1px 8px;border-radius:20px; }
          .pd-board-scroll{ overflow-y:auto;flex:1; }
          .pd-board .pd-card{ margin-bottom:8px; }
          .pd-board-empty-msg{ text-align:center;color:#A79E8B;font-size:11.5px;padding:20px 8px; }
        }
        .pd-card-late{ border:1.5px solid #C43D3D !important; }
        .pd-late-flag{ color:#C43D3D;font-weight:800;font-size:10.5px;margin-top:4px; }
        .pd-pay-chip{ display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:800;padding:3px 9px;border-radius:7px;margin-top:6px;cursor:pointer; }
      `}</style>
      <div className="pd-mobile-only">
        <div className="pd-head">
          <div className="pd-head-left">
            <a href="/painel/compartilhar" className="pd-back">‹</a>
            <h1>Pedidos</h1>
            <label className="pd-auto-pill" title="Aceitar pedidos automaticamente">
              <div className={`pd-switch ${autoAceitar ? 'on' : ''}`} onClick={toggleAutoAceitar}><div className="k" /></div>
            </label>
          </div>
          <div className="pd-head-right">
            <button className="pd-new-pill" onClick={openNovoPedido} title="Novo pedido">+</button>
            <a href="/painel/cozinha" style={{ fontSize: 11, fontWeight: 700, color: '#8A6410', background: '#FBF1DC', padding: '7px 12px', borderRadius: 8, textDecoration: 'none' }}>🍳 Cozinha</a>
          </div>
        </div>
        <div className="pd-searchbar">
          <input className="pd-search" placeholder="Buscar por cliente..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="pd-tabs">
          {MOBILE_STAGES.map(t => {
            const count = searched.filter(p => t.match(p.status)).length
            return (
              <button key={t.key} className={`pd-tab ${mobileStage === t.key ? 'active' : ''}`} style={{ '--accent': t.accent } as React.CSSProperties} onClick={() => setMobileStage(t.key)}>
                {t.label} <span className="pd-tab-count">{count}</span>
              </button>
            )
          })}
        </div>
        <div className="pd-body">
          {mobileList.length === 0 && <div className="pd-empty">Nenhum pedido em {currentStage.label.toLowerCase()}.</div>}
          {mobileList.map(renderCard)}
        </div>
      </div>

      <div className="pd-toolbar">
        <input className="pd-search" placeholder="Buscar por cliente..." value={search} onChange={e => setSearch(e.target.value)} />
        <label className="pd-autotoggle">
          <div className={`pd-switch ${autoAceitar ? 'on' : ''}`} onClick={toggleAutoAceitar}><div className="k" /></div>
          Aceitar pedidos automaticamente
        </label>
        <button className="pd-newbtn" onClick={openNovoPedido}>+ Novo pedido</button>
      </div>

      <div className="pd-board">
        {BOARD_COLUMNS.map(status => {
          const items = searched.filter(p => p.status === status)
          return (
            <div className="pd-board-col" key={status} style={{ '--accent': STATUS_COLOR[status].fg } as React.CSSProperties}>
              <div className="pd-board-colhead"><span>{STATUS_LABEL[status]}</span><span className="pd-board-count">{items.length}</span></div>
              <div className="pd-board-scroll">
                {items.length === 0 ? <div className="pd-board-empty-msg">Nenhum pedido</div> : items.map(renderCard)}
              </div>
            </div>
          )
        })}
        {cancelados.length > 0 && (
          <div className="pd-board-col" key="cancelado" style={{ '--accent': '#C43D3D' } as React.CSSProperties}>
            <div className="pd-board-colhead"><span>Cancelados</span><span className="pd-board-count">{cancelados.length}</span></div>
            <div className="pd-board-scroll">{cancelados.map(renderCard)}</div>
          </div>
        )}
      </div>

      {npOpen && (
        <div className="np-overlay" onClick={closeNovoPedido}>
          <div className="np-drawer" onClick={e => e.stopPropagation()}>
            <div className="np-head"><b>Novo pedido — Balcão/Telefone</b><button className="np-close" onClick={closeNovoPedido}>✕</button></div>
            {!npDetail ? (
              <div className="np-body">
                <div className="np-section-label">Cliente</div>
                <input className="np-input" placeholder="Nome do cliente" value={npNome} onChange={e => setNpNome(e.target.value)} />
                <input className="np-input" placeholder="Telefone (opcional)" value={npTelefone} onChange={e => setNpTelefone(e.target.value)} />

                <div className="np-section-label">Entrega</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <button className={`np-paychip ${npDeliveryType === 'entrega' ? 'active' : ''}`} onClick={() => setNpDeliveryType('entrega')}>🚚 Entrega</button>
                  <button className={`np-paychip ${npDeliveryType === 'retirada' ? 'active' : ''}`} onClick={() => setNpDeliveryType('retirada')}>🏪 Retirada</button>
                </div>
                {npDeliveryType === 'entrega' && (
                  <input className="np-input" placeholder="Endereço de entrega" value={npEndereco} onChange={e => setNpEndereco(e.target.value)} />
                )}
                <input className="np-input" placeholder="Observação (opcional)" value={npObs} onChange={e => setNpObs(e.target.value)} />

                <div className="np-section-label">Pagamento</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  {(['dinheiro', 'pix', 'cartao'] as const).map(m => (
                    <button key={m} className={`np-paychip ${npPay === m ? 'active' : ''}`} onClick={() => setNpPay(m)}>{m === 'pix' ? 'Pix' : m === 'dinheiro' ? 'Dinheiro' : 'Cartão'}</button>
                  ))}
                </div>

                <div className="np-section-label">Itens do pedido</div>
                {npLoadingProdutos && <div style={{ fontSize: 12, color: '#A79E8B' }}>Carregando catálogo...</div>}
                {!npLoadingProdutos && npProdutos.length === 0 && <div style={{ fontSize: 12, color: '#A79E8B' }}>Nenhum produto ativo no catálogo.</div>}
                <div className="np-prodgrid">
                  {npProdutos.map(p => (
                    <div key={p.id} className="np-prod" onClick={() => p.groups?.length ? npOpenDetail(p) : npAddToCart(p.id, p.name, Number(p.sale_price))}>
                      <div className="np-prod-name">{p.name}</div>
                      <div className="np-prod-price">{fmt(Number(p.sale_price))}</div>
                    </div>
                  ))}
                </div>

                {npCart.length > 0 && (
                  <>
                    <div className="np-section-label">Carrinho</div>
                    {npCart.map(l => (
                      <div key={l.key} className="np-cartline">
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700 }}>{l.name}</div>
                          {l.modifiers.length > 0 && <div style={{ fontSize: 10.5, color: '#A79E8B' }}>{l.modifiers.map(m => m.name).join(', ')}</div>}
                        </div>
                        <button className="np-qtybtn" onClick={() => npChangeQty(l.key, -1)}>−</button>
                        <span style={{ width: 20, textAlign: 'center' }}>{l.qty}</span>
                        <button className="np-qtybtn" onClick={() => npChangeQty(l.key, 1)}>+</button>
                        <b style={{ width: 60, textAlign: 'right' }}>{fmt(l.unitPrice * l.qty)}</b>
                      </div>
                    ))}
                    <div className="np-totalrow"><span>Total</span><span>{fmt(npTotal)}</span></div>
                  </>
                )}
              </div>
            ) : (
              <div className="np-body">
                <button className="np-back" onClick={() => setNpDetail(null)}>‹ Voltar</button>
                <div style={{ fontWeight: 800, fontSize: 15, margin: '10px 0' }}>{npDetail.name}</div>
                {npDetail.groups.map((g, gi) => (
                  <div key={g.id} style={{ marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 12.5 }}>{g.name}</div>
                    <div style={{ fontSize: 10.5, color: '#A79E8B', marginBottom: 6 }}>
                      {g.required ? `Obrigatório · Escolha ${g.min_select}${g.max_select > g.min_select ? '-' + g.max_select : ''}` : `Opcional · Escolha até ${g.max_select}`}
                    </div>
                    {g.options.map((o, oi) => {
                      const active = npDetailSel[gi]?.includes(oi)
                      return (
                        <div key={o.id} className={`np-opt ${active ? 'active' : ''}`} onClick={() => npToggleOpt(gi, oi)}>
                          <span>{o.name}</span><span>{o.price > 0 ? '+ ' + fmt(o.price) : 'Grátis'}</span>
                        </div>
                      )
                    })}
                  </div>
                ))}
                <button className="np-addcart" disabled={!npDetailReqMet} onClick={npConfirmDetail}>Adicionar — {fmt(npDetailPrice)}</button>
              </div>
            )}
            {!npDetail && (
              <div className="np-foot">
                {npError && <div style={{ color: '#C43D3D', fontSize: 11.5, lineHeight: 1.5, marginBottom: 8 }}>{npError}</div>}
                <button className="np-createbtn" disabled={npSaving || !npNome.trim() || npCart.length === 0} onClick={npCriarPedido}>{npSaving ? 'Criando...' : 'Criar pedido'}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </EmpresaShell>
  )
}
