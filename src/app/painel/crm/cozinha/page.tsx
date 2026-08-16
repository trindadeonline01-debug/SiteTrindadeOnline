'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Item = { id: string; product_name: string; qty: number; selected_options: { name: string; price: number }[] }
type Status = 'recebido' | 'em_preparo' | 'pronto' | 'saiu_entrega' | 'entregue' | 'cancelado'
type Pedido = { id: string; customer_id: string | null; customer_name: string; status: Status; created_at: string; itens: Item[] }

const COLUMNS: { status: Status; label: string; next: Status; action: string; color: string }[] = [
  { status: 'recebido', label: 'Recebido', next: 'em_preparo', action: 'Iniciar preparo', color: '#E24B4A' },
  { status: 'em_preparo', label: 'Em preparo', next: 'pronto', action: 'Marcar pronto', color: '#E8B84B' },
  { status: 'pronto', label: 'Pronto', next: 'saiu_entrega', action: 'Concluir', color: '#3FBE7A' },
]

const CUSTOMER_MSG: Partial<Record<Status, string>> = { pronto: 'Seu pedido está pronto!', saiu_entrega: 'Seu pedido saiu para entrega!' }
function notifyCustomer(customerId: string | null, companyName: string, status: Status) {
  const msg = CUSTOMER_MSG[status]
  if (!customerId || !msg) return
  fetch('/api/push/send', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: companyName, body: msg, target: 'external_user_id', userId: customerId }),
  }).catch(() => {})
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
  const companyIdRef = useRef('')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login?redirect=/painel/crm/cozinha'; return }
      const { data: comp } = await supabase.from('companies').select('id, name, loja_digital_enabled').eq('owner_id', session.user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (!comp || !comp.loja_digital_enabled) { window.location.href = '/painel/crm'; return }
      companyIdRef.current = comp.id
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
    setPedidos((data || []) as any)
  }

  async function advance(id: string, next: Status) {
    const pedido = pedidos.find(p => p.id === id)
    setPedidos(prev => next === 'saiu_entrega' ? prev.filter(p => p.id !== id) : prev.map(p => p.id === id ? { ...p, status: next } : p))
    await supabase.from('loja_pedidos').update({ status: next, updated_at: new Date().toISOString() }).eq('id', id)
    if (pedido) notifyCustomer(pedido.customer_id, companyName, next)
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
        <a className="cz-back" href="/painel/crm/pedidos">Ver todos os pedidos ›</a>
      </div>
      <div className="cz-cols">
        {COLUMNS.map(col => {
          const items = pedidos.filter(p => p.status === col.status)
          return (
            <div className="cz-col" key={col.status} style={{ '--accent': col.color } as React.CSSProperties}>
              <div className="cz-colhead"><span>{col.label}</span><span className="cz-count">{items.length}</span></div>
              {items.length === 0 && <div className="cz-empty">Nada aqui</div>}
              {items.map(p => (
                <div className="cz-card" key={p.id} onClick={() => advance(p.id, col.next)}>
                  <div className="cz-cname">{p.customer_name}</div>
                  <div className="cz-ctime">{timeAgo(p.created_at)} atrás</div>
                  {p.itens?.map(it => (
                    <div key={it.id}>
                      <div className="cz-citem">{it.qty}x {it.product_name}</div>
                      {it.selected_options?.length > 0 && <div className="cz-cmods">{it.selected_options.map(o => o.name).join(', ')}</div>}
                    </div>
                  ))}
                  <button className="cz-cbtn" onClick={e => { e.stopPropagation(); advance(p.id, col.next) }}>{col.action}</button>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
