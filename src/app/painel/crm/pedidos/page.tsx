'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import CrmShell from '@/components/CrmShell'

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
    body: JSON.stringify({ title: companyName, body: msg, target: 'external_user_id', userId: customerId }),
  }).catch(() => {})
}

const STATUS_LABEL: Record<Status, string> = { recebido: 'Recebido', em_preparo: 'Em preparo', pronto: 'Pronto', saiu_entrega: 'Saiu p/ entrega', entregue: 'Entregue', cancelado: 'Cancelado' }
const STATUS_COLOR: Record<Status, { bg: string; fg: string }> = {
  recebido: { bg: '#FEF0E0', fg: '#B5690C' }, em_preparo: { bg: '#FEF6DC', fg: '#8A6410' },
  pronto: { bg: '#E4F3EC', fg: '#157A52' }, saiu_entrega: { bg: '#E8F0FE', fg: '#1A56B0' },
  entregue: { bg: '#F0EDE8', fg: '#6E6656' }, cancelado: { bg: '#FBEAEA', fg: '#C43D3D' },
}
const FLOW: Status[] = ['recebido', 'em_preparo', 'pronto', 'saiu_entrega', 'entregue']
const ACTIVE: Status[] = ['recebido', 'em_preparo', 'pronto', 'saiu_entrega']
const BOARD_COLUMNS: Status[] = ['recebido', 'em_preparo', 'pronto', 'saiu_entrega', 'entregue']
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
function beep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator(); const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = 880; gain.gain.value = 0.12
    osc.start(); osc.stop(ctx.currentTime + 0.18)
    setTimeout(() => { const o2 = ctx.createOscillator(); o2.connect(gain); o2.frequency.value = 1100; o2.start(); o2.stop(ctx.currentTime + 0.16) }, 200)
  } catch {}
}

export default function PedidosPage() {
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [autoAceitar, setAutoAceitar] = useState(true)
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [filter, setFilter] = useState<'ativos' | 'historico'>('ativos')
  const [openId, setOpenId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const companyIdRef = useRef('')

  const [npOpen, setNpOpen] = useState(false)
  const [npProdutos, setNpProdutos] = useState<NpProduto[]>([])
  const [npLoadingProdutos, setNpLoadingProdutos] = useState(false)
  const [npCart, setNpCart] = useState<NpCartLine[]>([])
  const [npDetail, setNpDetail] = useState<NpProduto | null>(null)
  const [npDetailSel, setNpDetailSel] = useState<number[][]>([])
  const [npNome, setNpNome] = useState('')
  const [npTelefone, setNpTelefone] = useState('')
  const [npEndereco, setNpEndereco] = useState('')
  const [npObs, setNpObs] = useState('')
  const [npPay, setNpPay] = useState<'pix' | 'dinheiro' | 'cartao'>('dinheiro')
  const [npSaving, setNpSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login?redirect=/painel/crm/pedidos'; return }
      const { data: comp } = await supabase.from('companies').select('id, name, loja_digital_enabled, loja_auto_aceitar_pedidos').eq('owner_id', session.user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (!comp || !comp.loja_digital_enabled) { window.location.href = '/painel/crm'; return }
      setCompanyId(comp.id); companyIdRef.current = comp.id
      setCompanyName(comp.name)
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
  }

  async function setStatus(id: string, status: Status) {
    setPedidos(prev => prev.map(p => p.id === id ? { ...p, status } : p))
    await supabase.from('loja_pedidos').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    const pedido = pedidos.find(p => p.id === id)
    if (pedido) notifyCustomer(pedido.customer_id, companyName, status)
  }

  async function acceptPedido(id: string) {
    const now = new Date().toISOString()
    setPedidos(prev => prev.map(p => p.id === id ? { ...p, accepted_at: now, status: 'em_preparo' } : p))
    await supabase.from('loja_pedidos').update({ accepted_at: now, status: 'em_preparo', updated_at: now }).eq('id', id)
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
    setNpOpen(false); setNpCart([]); setNpDetail(null); setNpNome(''); setNpTelefone(''); setNpEndereco(''); setNpObs(''); setNpPay('dinheiro')
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
    const { data: pedido } = await supabase.from('loja_pedidos').insert({
      company_id: companyId, customer_id: null,
      customer_name: npNome.trim(), customer_phone: npTelefone.trim() || null,
      delivery_address: npEndereco.trim() || null, delivery_type: npEndereco.trim() ? 'entrega' : 'retirada', origin: 'balcao', payment_method: npPay,
      subtotal: npTotal, total: npTotal, notes: npObs.trim() || null, accepted_at: new Date().toISOString(),
    }).select('id').single()
    if (pedido) {
      await supabase.from('loja_pedido_itens').insert(npCart.map(l => ({
        pedido_id: pedido.id, produto_id: l.produtoId, product_name: l.name, unit_price: l.unitPrice, qty: l.qty,
        selected_options: l.modifiers,
      })))
      fetch('/api/loja/registrar-pedido', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId, phone: npTelefone.trim() || null, name: npNome.trim(), address: npEndereco.trim() || null,
          total: npTotal, items: npCart.map(l => ({ produtoId: l.produtoId, qty: l.qty })),
        }),
      }).catch(() => {})
    }
    setNpSaving(false)
    closeNovoPedido()
    await loadAll(companyId)
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter,sans-serif', color: '#AAA' }}>Carregando...</div>

  const searched = search.trim()
    ? pedidos.filter(p => p.customer_name.toLowerCase().includes(search.trim().toLowerCase()) || p.id.startsWith(search.trim()))
    : pedidos
  const list = searched.filter(p => filter === 'ativos' ? ACTIVE.includes(p.status) : !ACTIVE.includes(p.status))

  function renderCard(p: Pedido) {
    const open = openId === p.id
    const c = STATUS_COLOR[p.status]
    const needsAccept = !autoAceitar && p.status === 'recebido' && !p.accepted_at
    return (
      <div className={`pd-card ${needsAccept ? 'pd-card-pending' : ''}`} key={p.id} style={{ '--accent': c.fg } as React.CSSProperties} onClick={() => setOpenId(open ? null : p.id)}>
        <div className="pd-row1">
          <div><div className="pd-name">{p.customer_name}</div><div className="pd-time">{timeAgo(p.created_at)} atrás · {p.origin === 'cardapio_publico' ? 'Cardápio' : p.origin === 'balcao' ? 'Balcão' : p.origin}</div></div>
          <span className="pd-badge" style={{ background: c.bg, color: c.fg }}>{STATUS_LABEL[p.status]}</span>
        </div>
        <div className="pd-sum">{p.itens?.length || 0} {p.itens?.length === 1 ? 'item' : 'itens'} · {p.payment_method || '—'} · {p.payment_status === 'pago' ? 'pago' : 'pendente'} · {p.delivery_type === 'retirada' ? '🏪 Retirada' : '🚴 Entrega'}</div>
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
    <CrmShell active="pedidos" companyName={companyName}>
    <div className="pd-wrap">
      <style>{`
        .pd-wrap{ max-width:480px;margin:0 auto;min-height:100vh;background:#F7F5F0;font-family:'Inter',sans-serif;font-size:13px;color:#1A1610;padding-bottom:30px; }
        .pd-head{ padding:22px 16px 14px;display:flex;align-items:center;gap:10px;position:sticky;top:0;background:#F7F5F0;z-index:5; }
        .pd-head h1{ font-size:18px;margin:0;flex:1;font-weight:800; }
        .pd-back{ width:32px;height:32px;border-radius:50%;border:1px solid #E6E0D2;background:#fff;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;text-decoration:none;color:#1A1610; }
        .pd-tabs{ display:flex;gap:8px;padding:0 16px 12px; }
        .pd-tab{ flex:1;padding:8px;border-radius:9px;border:1px solid #E6E0D2;background:#fff;font-weight:700;font-size:12px;color:#6E6656;cursor:pointer; }
        .pd-tab.active{ background:#1A1610;color:#C9951A;border-color:#1A1610; }
        .pd-body{ padding:0 16px; }
        .pd-card{ background:#fff;border:1px solid #EDE8E0;border-radius:12px;padding:12px;margin-bottom:10px;cursor:pointer; }
        .pd-row1{ display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px; }
        .pd-name{ font-weight:800;font-size:13.5px; }
        .pd-time{ font-size:10.5px;color:#A79E8B; }
        .pd-badge{ font-size:10px;font-weight:800;padding:3px 8px;border-radius:7px; }
        .pd-sum{ font-size:11.5px;color:#6E6656; }
        .pd-total{ font-weight:800;font-size:13px;margin-top:4px; }
        .pd-detail{ margin-top:10px;padding-top:10px;border-top:1px dashed #EDE8E0; }
        .pd-item{ display:flex;justify-content:space-between;font-size:11.5px;padding:3px 0; }
        .pd-mods{ font-size:10.5px;color:#A79E8B;padding-left:12px; }
        .pd-chips{ display:flex;flex-wrap:wrap;gap:6px;margin-top:10px; }
        .pd-chip{ font-size:10.5px;font-weight:700;padding:6px 10px;border-radius:8px;border:1px solid #E6E0D2;background:#fff;cursor:pointer;color:#6E6656; }
        .pd-chip.current{ background:#C9951A;color:#1A1610;border-color:#C9951A; }
        .pd-cancel{ font-size:10.5px;color:#C43D3D;font-weight:700;background:none;border:none;cursor:pointer;margin-top:8px; }
        .pd-empty{ text-align:center;color:#A79E8B;padding:40px 0;font-size:12.5px; }
        .pd-card-pending{ border:1.5px solid var(--accent); }
        .pd-accept{ width:100%;margin-top:8px;padding:9px;border-radius:9px;border:none;background:var(--accent);color:#fff;font-weight:800;font-size:12px;cursor:pointer; }
        .pd-next{ width:100%;margin-top:8px;padding:10px;border-radius:9px;border:none;background:var(--accent);color:#fff;font-weight:800;font-size:12.5px;cursor:pointer; }
        .pd-toolbar{ padding:14px 16px;display:flex;flex-direction:column;gap:10px;background:#fff;border-top:1px solid #EDE8E0;border-bottom:1px solid #EDE8E0; }
        .pd-search{ width:100%;padding:9px 12px;border-radius:9px;border:1px solid #E6E0D2;background:#F7F5F0;font-size:12.5px;font-family:inherit; }
        .pd-autotoggle{ display:flex;align-items:center;gap:10px;font-size:11.5px;font-weight:600;color:#6E6656;cursor:pointer; }
        .pd-switch{ width:36px;height:20px;border-radius:11px;background:#E6E0D2;position:relative;cursor:pointer;flex:none; }
        .pd-switch.on{ background:#157A52; }
        .pd-switch .k{ position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s; }
        .pd-switch.on .k{ left:18px; }
        .pd-newbtn{ padding:10px;border-radius:9px;border:none;background:#C9951A;color:#1A1610;font-weight:800;font-size:12.5px;cursor:pointer; }
        .np-overlay{ position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:60;display:flex;align-items:flex-end;justify-content:center; }
        .np-drawer{ background:#F7F5F0;width:100%;max-width:480px;max-height:92vh;border-radius:18px 18px 0 0;display:flex;flex-direction:column;overflow:hidden; }
        .np-head{ padding:16px;border-bottom:1px solid #EDE8E0;display:flex;justify-content:space-between;align-items:center;background:#fff; }
        .np-close{ width:28px;height:28px;border-radius:50%;border:1px solid #E6E0D2;background:#fff;cursor:pointer; }
        .np-body{ flex:1;overflow-y:auto;padding:14px 16px; }
        .np-section-label{ font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#A79E8B;margin:12px 0 6px; }
        .np-input{ width:100%;padding:9px 12px;border-radius:9px;border:1px solid #E6E0D2;background:#fff;font-size:12.5px;font-family:inherit;margin-bottom:8px; }
        .np-paychip{ flex:1;padding:9px;border-radius:9px;border:1.5px solid #E6E0D2;background:#fff;font-size:12px;font-weight:700;cursor:pointer; }
        .np-paychip.active{ background:#1A1610;color:#C9951A;border-color:#1A1610; }
        .np-prodgrid{ display:grid;grid-template-columns:1fr 1fr;gap:8px; }
        .np-prod{ background:#fff;border:1px solid #E6E0D2;border-radius:10px;padding:10px;cursor:pointer; }
        .np-prod-name{ font-size:12px;font-weight:700; }
        .np-prod-price{ font-size:11.5px;color:#6E6656;margin-top:3px; }
        .np-cartline{ display:flex;align-items:center;gap:6px;font-size:12px;padding:6px 0;border-bottom:1px solid #EDE8E0; }
        .np-qtybtn{ width:22px;height:22px;border-radius:6px;border:1px solid #E6E0D2;background:#fff;cursor:pointer;font-weight:800; }
        .np-totalrow{ display:flex;justify-content:space-between;font-weight:800;font-size:14px;padding-top:10px;margin-top:6px;border-top:1px dashed #E6E0D2; }
        .np-back{ background:none;border:none;color:#8A6410;font-weight:700;font-size:12px;cursor:pointer;padding:0; }
        .np-opt{ display:flex;justify-content:space-between;padding:9px 10px;border:1px solid #E6E0D2;border-radius:9px;margin-bottom:6px;font-size:12px;cursor:pointer;background:#fff; }
        .np-opt.active{ border-color:#C9951A;background:#FEF3E2; }
        .np-addcart{ width:100%;padding:12px;border-radius:10px;border:none;background:#C9951A;color:#1A1610;font-weight:800;cursor:pointer; }
        .np-addcart:disabled{ background:#E2DCCB;color:#A79E8B; }
        .np-foot{ padding:12px 16px 16px;border-top:1px solid #EDE8E0;background:#fff; }
        .np-createbtn{ width:100%;padding:13px;border-radius:10px;border:none;background:#157A52;color:#fff;font-weight:800;cursor:pointer; }
        .np-createbtn:disabled{ background:#D8D2C4;color:#8A8577; }
        .pd-group{ margin-bottom:20px; }
        .pd-group-head{ display:flex;justify-content:space-between;align-items:center;padding:2px 2px 8px;font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--accent);border-bottom:2px solid var(--accent);margin-bottom:10px; }
        .pd-group-count{ background:var(--accent);color:#fff;font-size:11px;font-weight:800;padding:2px 9px;border-radius:20px; }
        .pd-board{ display:none; }
        @media(min-width:768px){
          .pd-wrap{ max-width:none;margin:0;padding-bottom:40px; }
          .pd-mobile-only{ display:none; }
          .pd-toolbar{ flex-direction:row;align-items:center;padding:16px 32px;border-top:none; }
          .pd-search{ max-width:280px; }
          .pd-autotoggle{ margin-left:auto; }
          .pd-newbtn{ padding:10px 20px; }
          .pd-board{ display:flex;gap:14px;overflow-x:auto;padding:20px 32px 28px; align-items:flex-start; }
          .pd-board-col{ flex:0 0 250px;background:#EFEBE1;border-radius:14px;padding:10px;max-height:calc(100vh - 190px);display:flex;flex-direction:column;border-top:4px solid var(--accent); }
          .pd-board-colhead{ display:flex;justify-content:space-between;align-items:center;padding:4px 6px 10px;font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--accent); }
          .pd-board-count{ background:var(--accent);color:#fff;font-size:11px;font-weight:800;padding:1px 8px;border-radius:20px; }
          .pd-board-scroll{ overflow-y:auto;flex:1; }
          .pd-board .pd-card{ margin-bottom:8px; }
          .pd-board-empty{ text-align:center;color:#A79E8B;font-size:11px;padding:14px 0; }
        }
      `}</style>
      <div className="pd-mobile-only">
        <div className="pd-head">
          <a href="/painel/crm" className="pd-back">‹</a>
          <h1>Pedidos</h1>
          <a href="/painel/crm/cozinha" style={{ fontSize: 11, fontWeight: 700, color: '#8A6410', background: '#FBF1DC', padding: '7px 12px', borderRadius: 8, textDecoration: 'none' }}>🍳 Cozinha</a>
        </div>
        <div className="pd-tabs">
          <button className={`pd-tab ${filter === 'ativos' ? 'active' : ''}`} onClick={() => setFilter('ativos')}>Ativos ({pedidos.filter(p => ACTIVE.includes(p.status)).length})</button>
          <button className={`pd-tab ${filter === 'historico' ? 'active' : ''}`} onClick={() => setFilter('historico')}>Histórico</button>
        </div>
        <div className="pd-body">
          {list.length === 0 && <div className="pd-empty">Nenhum pedido por aqui.</div>}
          {filter === 'ativos'
            ? ACTIVE.map(status => {
                const items = list.filter(p => p.status === status)
                if (items.length === 0) return null
                return (
                  <div className="pd-group" key={status} style={{ '--accent': STATUS_COLOR[status].fg } as React.CSSProperties}>
                    <div className="pd-group-head"><span>{STATUS_LABEL[status]}</span><span className="pd-group-count">{items.length}</span></div>
                    {items.map(renderCard)}
                  </div>
                )
              })
            : list.map(renderCard)}
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
                {items.length === 0 && <div className="pd-board-empty">Nada aqui</div>}
                {items.map(renderCard)}
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
                <input className="np-input" placeholder="Endereço (deixe em branco se for retirada)" value={npEndereco} onChange={e => setNpEndereco(e.target.value)} />
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
                <button className="np-createbtn" disabled={npSaving || !npNome.trim() || npCart.length === 0} onClick={npCriarPedido}>{npSaving ? 'Criando...' : 'Criar pedido'}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </CrmShell>
  )
}
