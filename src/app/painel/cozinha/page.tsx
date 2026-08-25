'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { refreshSessionOnce } from '@/lib/authRefresh'
import { moduleActive } from '@/lib/modules'

type Item = { id: string; product_name: string; qty: number; selected_options: { name: string; price: number }[] }
type Status = 'recebido' | 'em_preparo' | 'pronto' | 'saiu_entrega' | 'entregue' | 'cancelado'
type Pedido = { id: string; customer_id: string | null; customer_name: string; customer_phone: string | null; delivery_address: string | null; status: Status; created_at: string; accepted_at: string | null; delivery_type: 'entrega' | 'retirada'; scheduled_for: string | null; itens: Item[] }

const COLUMNS: { status: Status; label: string; next: Status; action: string; color: string }[] = [
  { status: 'recebido', label: 'Recebido', next: 'em_preparo', action: 'Iniciar preparo', color: '#E24B4A' },
  { status: 'em_preparo', label: 'Em preparo', next: 'pronto', action: 'Marcar pronto', color: '#E8B84B' },
  { status: 'pronto', label: 'Pronto', next: 'saiu_entrega', action: 'Concluir', color: '#3FBE7A' },
]
function nextForCard(p: Pedido, col: typeof COLUMNS[number]) {
  if (col.status === 'pronto' && p.delivery_type === 'retirada') return { next: 'entregue' as Status, action: 'Cliente retirou' }
  return { next: col.next, action: col.action }
}

const CUSTOMER_MSG: Partial<Record<Status, string>> = { em_preparo: 'Seu pedido já está em preparo!', pronto: 'Seu pedido está pronto!', saiu_entrega: 'Seu pedido saiu para entrega!', entregue: 'Pedido entregue. Bom apetite!' }
function notifyCustomer(customerId: string | null, companyName: string, status: Status) {
  const msg = CUSTOMER_MSG[status]
  if (!customerId || !msg) return
  fetch('/api/push/send', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: companyName, body: msg, target: 'external_user_id', userId: customerId, url: `${window.location.origin}/perfil` }),
  }).catch(() => {})
}
function notifyCustomerWhatsapp(companyId: string, phone: string | null, status: Status, deliveryType: string) {
  if (!phone) return
  fetch('/api/loja/status-pedido', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, phone, status, deliveryType }),
  }).catch(() => {})
}

function fmtSchedule(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min`
  return `${Math.floor(mins / 60)}h${mins % 60}`
}
function beep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator(); const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = 880; gain.gain.value = 0.12
    osc.start(); osc.stop(ctx.currentTime + 0.18)
  } catch {}
}

export default function CozinhaPage() {
  const [loading, setLoading] = useState(true)
  const [companyName, setCompanyName] = useState('')
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [deliveryCalled, setDeliveryCalled] = useState<Set<string>>(new Set())
  const callingMotoboyRef = useRef<Set<string>>(new Set())
  const companyIdRef = useRef('')
  const autoAceitarRef = useRef(true)
  const entregaEnabledRef = useRef(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login?redirect=/painel/cozinha'; return }
      const { data: comp } = await supabase.from('companies').select('id, name, loja_digital_enabled, loja_auto_aceitar_pedidos, entrega_enabled, trial_modules_until').eq('owner_id', session.user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (!comp || !moduleActive(comp.loja_digital_enabled, comp.trial_modules_until)) { window.location.href = '/painel/compartilhar'; return }
      companyIdRef.current = comp.id
      autoAceitarRef.current = comp.loja_auto_aceitar_pedidos !== false
      entregaEnabledRef.current = moduleActive(comp.entrega_enabled, comp.trial_modules_until)
      setCompanyName(comp.name)
      await loadAll(comp.id)
      setLoading(false)

      const channel = supabase.channel(`cozinha-${comp.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'loja_pedidos', filter: `company_id=eq.${comp.id}` }, payload => {
          if (payload.eventType === 'INSERT') beep()
          loadAll(companyIdRef.current)
        })
        .subscribe()
      return () => { supabase.removeChannel(channel) }
    })
  }, [])

  async function loadAll(cid: string) {
    const { data } = await supabase.from('loja_pedidos').select('*, itens:loja_pedido_itens(*)').eq('company_id', cid).in('status', ['recebido', 'em_preparo', 'pronto']).order('created_at', { ascending: true })
    const rows = (data || []) as Pedido[]
    setPedidos(autoAceitarRef.current ? rows : rows.filter(p => p.status !== 'recebido' || p.accepted_at))
    const { data: entregas } = await supabase.from('delivery_orders').select('pedido_id').eq('company_id', cid).not('pedido_id', 'is', null)
    setDeliveryCalled(new Set((entregas || []).map(e => e.pedido_id as string)))
  }

  // Assim que o pedido entra em preparo, já chama o motoboy — ele viaja até
  // a loja enquanto o prato fica pronto, em vez de ficar esperando parado.
  async function chamarMotoboy(p: Pedido) {
    if (callingMotoboyRef.current.has(p.id)) return
    callingMotoboyRef.current.add(p.id)
    setDeliveryCalled(prev => new Set(prev).add(p.id))
    const call = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      return fetch('/api/entrega/criar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: session?.access_token, company_id: companyIdRef.current, pedido_id: p.id,
          customer_name: p.customer_name, customer_phone: p.customer_phone, dropoff_address: p.delivery_address,
        }),
      })
    }
    let res = await call()
    if (res.status === 401) { await refreshSessionOnce(); res = await call() }
    callingMotoboyRef.current.delete(p.id)
    if (!res.ok) setDeliveryCalled(prev => { const n = new Set(prev); n.delete(p.id); return n })
  }
  function maybeAutoChamarMotoboy(pedido: Pedido) {
    if (entregaEnabledRef.current && pedido.delivery_type === 'entrega' && pedido.delivery_address && !deliveryCalled.has(pedido.id)) chamarMotoboy(pedido)
  }

  async function advance(id: string, next: Status) {
    const pedido = pedidos.find(p => p.id === id)
    const leavesKds = next === 'saiu_entrega' || next === 'entregue'
    setPedidos(prev => leavesKds ? prev.filter(p => p.id !== id) : prev.map(p => p.id === id ? { ...p, status: next } : p))
    await supabase.from('loja_pedidos').update({ status: next, updated_at: new Date().toISOString() }).eq('id', id)
    if (pedido) {
      notifyCustomer(pedido.customer_id, companyName, next)
      notifyCustomerWhatsapp(companyIdRef.current, pedido.customer_phone, next, pedido.delivery_type)
      if (next === 'em_preparo') maybeAutoChamarMotoboy(pedido)
    }
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter,sans-serif', color: '#AAA', background: '#111' }}>Carregando...</div>

  return (
    <div className="cz-wrap">
      <style>{`
        .cz-wrap{ min-height:100vh;background:#141210;font-family:'Inter',sans-serif;color:#fff; }
        .cz-head{ display:flex;align-items:center;gap:12px;padding:16px 20px;background:#0D0B09;border-bottom:1px solid #2A2620; }
        .cz-head h1{ font-size:20px;font-weight:800;margin:0;flex:1; }
        .cz-back{ color:#C9951A;text-decoration:none;font-size:14px;font-weight:700; }
        .cz-cols{ display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:16px; min-height:calc(100vh - 64px); }
        .cz-col{ background:#1C1914;border-radius:14px;padding:12px;display:flex;flex-direction:column;min-height:200px;border-top:4px solid var(--accent); }
        .cz-colhead{ display:flex;justify-content:space-between;align-items:center;padding:4px 6px 12px;font-weight:800;font-size:15px;text-transform:uppercase;letter-spacing:.04em;color:var(--accent); }
        .cz-count{ background:var(--accent);color:#141210;font-size:12px;font-weight:800;padding:2px 9px;border-radius:20px; }
        .cz-card{ background:#2A2620;border-radius:12px;padding:14px;margin-bottom:10px;cursor:pointer;border:1px solid #3A3428;border-left:4px solid var(--accent); transition:transform .1s; }
        .cz-card:active{ transform:scale(.97); }
        .cz-cname{ font-weight:800;font-size:16px;margin-bottom:2px; }
        .cz-ctime{ font-size:11px;color:#A79E8B;margin-bottom:8px; }
        .cz-citem{ font-size:13.5px;padding:2px 0;color:#F0EDE8; }
        .cz-cmods{ font-size:11px;color:#C9951A;padding-left:14px; }
        .cz-cbtn{ margin-top:10px;width:100%;padding:10px;border-radius:9px;border:none;background:var(--accent);color:#141210;font-weight:800;font-size:13px;cursor:pointer; }
        .cz-empty{ text-align:center;color:#5A5346;font-size:12.5px;padding:30px 0; }
        @media(max-width:820px){ .cz-cols{ grid-template-columns:1fr; } }
      `}</style>
      <div className="cz-head">
        <h1>🍳 Cozinha</h1>
        <a className="cz-back" href="/painel/pedidos">Ver todos os pedidos ›</a>
      </div>
      <div className="cz-cols">
        {COLUMNS.map(col => {
          const items = pedidos.filter(p => p.status === col.status)
          return (
            <div className="cz-col" key={col.status} style={{ '--accent': col.color } as React.CSSProperties}>
              <div className="cz-colhead"><span>{col.label}</span><span className="cz-count">{items.length}</span></div>
              {items.length === 0 && <div className="cz-empty">Nada aqui</div>}
              {items.map(p => {
                const { next, action } = nextForCard(p, col)
                return (
                  <div className="cz-card" key={p.id} onClick={() => advance(p.id, next)}>
                    <div className="cz-cname">{p.customer_name}</div>
                    <div className="cz-ctime">{timeAgo(p.created_at)} atrás · {p.delivery_type === 'retirada' ? '🏪 Retirada' : '🚴 Entrega'}{p.scheduled_for ? ` · 📅 ${fmtSchedule(p.scheduled_for)}` : ''}</div>
                    {p.itens?.map(it => (
                      <div key={it.id}>
                        <div className="cz-citem">{it.qty}x {it.product_name}</div>
                        {it.selected_options?.length > 0 && <div className="cz-cmods">{it.selected_options.map(o => o.name).join(', ')}</div>}
                      </div>
                    ))}
                    <button className="cz-cbtn" onClick={e => { e.stopPropagation(); advance(p.id, next) }}>{action}</button>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
