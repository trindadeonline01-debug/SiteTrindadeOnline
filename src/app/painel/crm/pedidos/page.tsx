'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Item = { id: string; product_name: string; unit_price: number; qty: number; selected_options: { name: string; price: number }[] }
type Status = 'recebido' | 'em_preparo' | 'pronto' | 'saiu_entrega' | 'entregue' | 'cancelado'
type Pedido = {
  id: string; customer_name: string; customer_phone: string | null; delivery_address: string | null
  origin: string; status: Status; payment_method: string | null; payment_status: string
  notes: string | null; subtotal: number; total: number; created_at: string
  itens: Item[]
}

const STATUS_LABEL: Record<Status, string> = { recebido: 'Recebido', em_preparo: 'Em preparo', pronto: 'Pronto', saiu_entrega: 'Saiu p/ entrega', entregue: 'Entregue', cancelado: 'Cancelado' }
const STATUS_COLOR: Record<Status, { bg: string; fg: string }> = {
  recebido: { bg: '#FEF0E0', fg: '#B5690C' }, em_preparo: { bg: '#FEF6DC', fg: '#8A6410' },
  pronto: { bg: '#E4F3EC', fg: '#157A52' }, saiu_entrega: { bg: '#E8F0FE', fg: '#1A56B0' },
  entregue: { bg: '#F0EDE8', fg: '#6E6656' }, cancelado: { bg: '#FBEAEA', fg: '#C43D3D' },
}
const FLOW: Status[] = ['recebido', 'em_preparo', 'pronto', 'saiu_entrega', 'entregue']
const ACTIVE: Status[] = ['recebido', 'em_preparo', 'pronto', 'saiu_entrega']

function fmt(n: number) { return 'R$ ' + n.toFixed(2).replace('.', ',') }
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
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [filter, setFilter] = useState<'ativos' | 'historico'>('ativos')
  const [openId, setOpenId] = useState<string | null>(null)
  const companyIdRef = useRef('')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login?redirect=/painel/crm/pedidos'; return }
      const { data: comp } = await supabase.from('companies').select('id, loja_digital_enabled').eq('owner_id', session.user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (!comp || !comp.loja_digital_enabled) { window.location.href = '/painel/crm'; return }
      setCompanyId(comp.id); companyIdRef.current = comp.id
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
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter,sans-serif', color: '#AAA' }}>Carregando...</div>

  const list = pedidos.filter(p => filter === 'ativos' ? ACTIVE.includes(p.status) : !ACTIVE.includes(p.status))

  return (
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
      `}</style>
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
        {list.map(p => {
          const open = openId === p.id
          const c = STATUS_COLOR[p.status]
          return (
            <div className="pd-card" key={p.id} onClick={() => setOpenId(open ? null : p.id)}>
              <div className="pd-row1">
                <div><div className="pd-name">{p.customer_name}</div><div className="pd-time">{timeAgo(p.created_at)} atrás · {p.origin === 'cardapio_publico' ? 'Cardápio' : p.origin}</div></div>
                <span className="pd-badge" style={{ background: c.bg, color: c.fg }}>{STATUS_LABEL[p.status]}</span>
              </div>
              <div className="pd-sum">{p.itens?.length || 0} {p.itens?.length === 1 ? 'item' : 'itens'} · {p.payment_method || '—'} · {p.payment_status === 'pago' ? 'pago' : 'pendente'}</div>
              <div className="pd-total">{fmt(p.total)}</div>
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
                    {FLOW.map(s => <button key={s} className={`pd-chip ${p.status === s ? 'current' : ''}`} onClick={() => setStatus(p.id, s)}>{STATUS_LABEL[s]}</button>)}
                  </div>
                  {p.status !== 'cancelado' && p.status !== 'entregue' && <button className="pd-cancel" onClick={() => setStatus(p.id, 'cancelado')}>Cancelar pedido</button>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
