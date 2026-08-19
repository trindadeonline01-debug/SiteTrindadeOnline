'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { refreshSessionOnce } from '@/lib/authRefresh'
import EmpresaShell from '@/components/EmpresaShell'

type Wallet = { credits: number; daily_paid_on: string | null }
type DStatus = 'buscando_motoboy' | 'a_caminho' | 'entregue' | 'cancelada' | 'sem_credito'
type DOrder = {
  id: string; customer_name: string; customer_phone: string | null; dropoff_address: string
  status: DStatus; fee: number; motoboy_name: string | null; delivery_code: string
  created_at: string; delivered_at: string | null
}
type PixModal = { kind: 'diaria' | 'credito'; credits: number; payment_id: string; qr: string | null; copy: string | null; value: number }

const STATUS_LABEL: Record<DStatus, string> = {
  buscando_motoboy: 'Chamando motoboy', a_caminho: 'A caminho', entregue: 'Entregue', cancelada: 'Cancelada', sem_credito: 'Sem crédito',
}
const STATUS_COLOR: Record<DStatus, { bg: string; fg: string }> = {
  buscando_motoboy: { bg: '#FEF0E0', fg: '#B5690C' }, a_caminho: { bg: '#E8F0FE', fg: '#1A56B0' },
  entregue: { bg: '#E4F3EC', fg: '#157A52' }, cancelada: { bg: '#FBEAEA', fg: '#C43D3D' }, sem_credito: { bg: '#F0EDE8', fg: '#6E6656' },
}
const CREDIT_PACKS: { credits: number; value: number }[] = [{ credits: 10, value: 50 }, { credits: 20, value: 100 }, { credits: 50, value: 250 }]

function fmt(n: number) { return 'R$ ' + n.toFixed(2).replace('.', ',') }
function todayStr() { return new Date().toISOString().slice(0, 10) }
function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min`
  return `${Math.floor(mins / 60)}h`
}

export default function EntregaPage() {
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [crmEnabled, setCrmEnabled] = useState(false)
  const [wallet, setWallet] = useState<Wallet>({ credits: 0, daily_paid_on: null })
  const [orders, setOrders] = useState<DOrder[]>([])
  const [pixModal, setPixModal] = useState<PixModal | null>(null)
  const [paying, setPaying] = useState<string | null>(null)
  const [payError, setPayError] = useState('')
  const [copied, setCopied] = useState(false)
  const companyIdRef = useRef('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login?redirect=/painel/crm/entrega'; return }
      const { data: comp } = await supabase.from('companies').select('id, name, loja_digital_enabled, crm_whatsapp_enabled').eq('owner_id', session.user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (!comp || !comp.loja_digital_enabled) { window.location.href = '/painel/crm'; return }
      setCompanyId(comp.id); companyIdRef.current = comp.id
      setCompanyName(comp.name)
      setCrmEnabled(!!comp.crm_whatsapp_enabled)
      await loadAll(comp.id)
      setLoading(false)

      const channel = supabase.channel(`entrega-${comp.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_orders', filter: `company_id=eq.${comp.id}` }, () => loadOrders(companyIdRef.current))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'company_delivery_wallet', filter: `company_id=eq.${comp.id}` }, () => loadWallet(companyIdRef.current))
        .subscribe()

      // Enquanto essa tela estiver aberta, garante que oferta de motoboy que
      // estourou o prazo de resposta seja repassada mesmo sem nenhuma
      // mensagem nova no WhatsApp pra disparar isso.
      const tickIv = setInterval(() => { fetch('/api/entrega/tick').catch(() => {}) }, 15000)

      return () => { supabase.removeChannel(channel); clearInterval(tickIv) }
    })
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  async function loadAll(cid: string) {
    await Promise.all([loadWallet(cid), loadOrders(cid)])
  }
  async function loadWallet(cid: string) {
    const { data } = await supabase.from('company_delivery_wallet').select('credits, daily_paid_on').eq('company_id', cid).maybeSingle()
    setWallet({ credits: data?.credits || 0, daily_paid_on: data?.daily_paid_on || null })
  }
  async function loadOrders(cid: string) {
    const since = new Date(); since.setHours(0, 0, 0, 0)
    const { data } = await supabase.from('delivery_orders').select('*').eq('company_id', cid).gte('created_at', since.toISOString()).order('created_at', { ascending: false })
    setOrders((data || []) as DOrder[])
  }

  const ativaHoje = wallet.daily_paid_on === todayStr()

  async function iniciarPagamento(kind: 'diaria' | 'credito', credits = 0) {
    setPayError('')
    setPaying(kind + credits)

    const call = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/entrega/pagar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: session?.access_token, company_id: companyId, kind, credits }),
      })
      return { r, data: await r.json() }
    }

    let { r: res, data } = await call()
    if (res.status === 401) {
      await refreshSessionOnce()
      ;({ r: res, data } = await call())
    }
    setPaying(null)
    if (res.status === 401) { setPayError((data.error || 'sessão inválida') + ' — atualiza a página (F5) e tenta de novo.'); return }
    if (!res.ok || data.error) { setPayError(data.error || 'Não consegui gerar o Pix — tenta de novo.'); return }
    setPixModal({ kind, credits, payment_id: String(data.payment_id), qr: data.qr_code_image, copy: data.pix_copy_paste, value: data.value })
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      const r = await fetch('/api/entrega/checar-pagamento', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: data.payment_id, company_id: companyId }),
      })
      const j = await r.json()
      if (j.paid) {
        if (pollRef.current) clearInterval(pollRef.current)
        setPixModal(null)
        await loadWallet(companyId)
      }
    }, 4000)
  }

  function copiarPix() {
    if (!pixModal?.copy) return
    navigator.clipboard.writeText(pixModal.copy)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }
  function fecharModal() {
    if (pollRef.current) clearInterval(pollRef.current)
    setPixModal(null)
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter,sans-serif', color: '#A79E8B' }}>Carregando...</div>

  return (
    <EmpresaShell active="entrega" companyName={companyName} lojaDigitalEnabled crmEnabled={crmEnabled}>
    <div className="en-wrap">
      <style>{`
        .en-wrap{ width:100%;max-width:560px;margin:0 auto;font-family:'Inter',sans-serif;font-size:13px;color:#1A1610;padding:20px 14px 40px; }
        .en-head{ margin-bottom:18px; }
        .en-head h1{ font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:.5px;margin:0 0 4px; }
        .en-head p{ font-size:12.5px;color:#6E6656;margin:0;line-height:1.5; }
        .en-summary{ display:flex;gap:20px;flex-wrap:wrap;margin-bottom:16px; }
        .en-summary-item .n{ font-family:'Bebas Neue',sans-serif;font-size:24px;color:#1A1610;line-height:1; }
        .en-summary-item .l{ font-size:10.5px;color:#A79E8B;margin-top:2px; }
        .en-card{ background:#fff;border:1px solid #EDE8E0;border-radius:14px;padding:16px;margin-bottom:14px; }
        .en-kicker{ font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#A79E8B;margin-bottom:10px; }
        .en-status-row{ display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap; }
        .en-pill{ display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:750;padding:6px 12px;border-radius:20px; }
        .en-pill.on{ background:#E4F3EC;color:#157A52; }
        .en-pill.off{ background:#FBEAEA;color:#C43D3D; }
        .en-dot{ width:7px;height:7px;border-radius:50%;background:currentColor; }
        .en-hint{ font-size:11.5px;color:#A79E8B;margin-top:8px;line-height:1.5; }
        .en-btn{ font-family:inherit;font-size:12.5px;font-weight:750;border-radius:9px;border:none;padding:9px 15px;cursor:pointer; }
        .en-btn-gold{ background:#C9951A;color:#1A1610; }
        .en-btn-gold:disabled{ opacity:.5;cursor:not-allowed; }
        .en-credit-hero{ display:flex;align-items:baseline;gap:8px;margin:2px 0 2px; }
        .en-credit-num{ font-family:'Bebas Neue',sans-serif;font-size:36px;color:#8A6410;line-height:1; }
        .en-credit-label{ font-size:12.5px;color:#6E6656; }
        .en-credit-note{ font-size:11.5px;color:#A79E8B;margin-bottom:12px; }
        .en-buy-row{ display:flex;gap:8px;flex-wrap:wrap; }
        .en-buy-chip{ font-size:12px;font-weight:700;color:#1A1610;background:#fff;border:1px solid #E6E0D2;border-radius:9px;padding:9px 12px;cursor:pointer;text-align:left;line-height:1.4; }
        .en-buy-chip:disabled{ opacity:.5;cursor:not-allowed; }
        .en-buy-chip b{ display:block;color:#8A6410;font-size:13px; }
        .en-error{ color:#C43D3D;font-size:11.5px;margin-top:10px; }
        .en-order{ border-bottom:1px solid #EDE8E0;padding:11px 0; }
        .en-order:last-child{ border-bottom:none; }
        .en-order-row1{ display:flex;justify-content:space-between;gap:8px;align-items:baseline; }
        .en-order-name{ font-weight:700;font-size:13px; }
        .en-order-time{ font-size:10.5px;color:#A79E8B; }
        .en-order-addr{ font-size:11.5px;color:#6E6656;margin-top:2px; }
        .en-order-row2{ display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px; }
        .en-order-moto{ font-size:11.5px;color:#6E6656; }
        .en-order-moto.empty{ color:#A79E8B;font-style:italic; }
        .en-badge{ font-size:11px;font-weight:750;padding:5px 10px;border-radius:16px; }
        .en-empty{ text-align:center;color:#A79E8B;padding:24px 0;font-size:12.5px; }
        .en-modal-bg{ position:fixed;inset:0;background:rgba(26,22,14,.55);display:flex;align-items:center;justify-content:center;z-index:200;padding:16px; }
        .en-modal{ background:#fff;border-radius:16px;padding:24px;max-width:340px;width:100%;text-align:center; }
        .en-modal h3{ font-family:'Bebas Neue',sans-serif;font-size:19px;margin:0 0 4px; }
        .en-modal-val{ font-size:13px;color:#6E6656;margin-bottom:14px; }
        .en-qr-wrap{ background:#fff;padding:8px;border:2px solid #EDE8E0;border-radius:12px;display:inline-block;margin-bottom:14px; }
        .en-qr{ width:190px;height:190px;display:block; }
        .en-copy-wrap{ display:flex;gap:6px;margin-bottom:14px; }
        .en-copy-input{ flex:1;min-width:0;padding:9px 10px;border:1.5px solid #E0DDD8;border-radius:8px;font-size:10.5px;font-family:monospace;color:#333;background:#FAFAF8; }
        .en-copy-btn{ background:#C9951A;color:#fff;border:none;padding:9px 14px;border-radius:8px;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap; }
        .en-modal-wait{ font-size:11.5px;color:#A79E8B;margin-bottom:12px; }
        .en-modal-close{ background:none;border:none;color:#8A6410;font-weight:700;font-size:12px;cursor:pointer; }
      `}</style>

      <div className="en-head">
        <h1>🏍️ Entrega</h1>
        <p>Diária de R$ 30,00 pra liberar o dia, mais R$ 5,00 por entrega dentro da Trindade. O motoboy é da plataforma — só chamar.</p>
      </div>

      <div className="en-summary">
        <div className="en-summary-item"><div className="n">{orders.length}</div><div className="l">entregas hoje</div></div>
        <div className="en-summary-item"><div className="n">{fmt(orders.filter(o => o.status !== 'cancelada' && o.status !== 'sem_credito').reduce((s, o) => s + Number(o.fee), 0))}</div><div className="l">em taxas hoje</div></div>
      </div>

      <div className="en-card">
        <div className="en-kicker">Status de hoje</div>
        <div className="en-status-row">
          <span className={`en-pill ${ativaHoje ? 'on' : 'off'}`}><span className="en-dot" /> {ativaHoje ? 'Diária ativa' : 'Diária não paga'}</span>
          {!ativaHoje && <button className="en-btn en-btn-gold" disabled={paying === 'diaria0'} onClick={() => iniciarPagamento('diaria')}>{paying === 'diaria0' ? 'Gerando Pix...' : 'Pagar diária — R$ 30,00'}</button>}
        </div>
        <div className="en-hint">A diária vale só pra hoje — amanhã cedo ela zera e precisa pagar de novo pra liberar as entregas (mesmo com crédito sobrando).</div>
      </div>

      <div className="en-card">
        <div className="en-kicker">Crédito de entrega</div>
        <div className="en-credit-hero"><span className="en-credit-num">{wallet.credits}</span><span className="en-credit-label">entregas disponíveis</span></div>
        <div className="en-credit-note">R$ 5,00 por entrega dentro da Trindade · consumido a cada corrida concluída</div>
        <div className="en-buy-row">
          {CREDIT_PACKS.map(p => (
            <button key={p.credits} className="en-buy-chip" disabled={paying === 'credito' + p.credits} onClick={() => iniciarPagamento('credito', p.credits)}>
              <b>+{p.credits} entregas</b> {paying === 'credito' + p.credits ? 'Gerando Pix...' : fmt(p.value)}
            </button>
          ))}
        </div>
        {payError && <div className="en-error">{payError}</div>}
      </div>

      <div className="en-card">
        <div className="en-kicker">Entregas de hoje</div>
        {orders.length === 0 && <div className="en-empty">Nenhuma entrega hoje ainda.</div>}
        {orders.map(o => {
          const c = STATUS_COLOR[o.status]
          return (
            <div className="en-order" key={o.id}>
              <div className="en-order-row1">
                <span className="en-order-name">{o.customer_name}</span>
                <span className="en-order-time">{timeAgo(o.created_at)} atrás</span>
              </div>
              <div className="en-order-addr">{o.dropoff_address}</div>
              <div className="en-order-row2">
                <span className={`en-order-moto ${!o.motoboy_name ? 'empty' : ''}`}>{o.motoboy_name || '— aguardando aceite —'}</span>
                <span className="en-badge" style={{ background: c.bg, color: c.fg }}>{STATUS_LABEL[o.status]}</span>
              </div>
            </div>
          )
        })}
      </div>

      {pixModal && (
        <div className="en-modal-bg" onClick={e => { if (e.target === e.currentTarget) fecharModal() }}>
          <div className="en-modal">
            <h3>{pixModal.kind === 'diaria' ? 'Diária de entrega' : `+${pixModal.credits} entregas`}</h3>
            <div className="en-modal-val">{fmt(pixModal.value)} via Pix</div>
            {pixModal.qr && (
              <div className="en-qr-wrap"><img src={`data:image/png;base64,${pixModal.qr}`} alt="QR Code Pix" className="en-qr" /></div>
            )}
            {pixModal.copy && (
              <div className="en-copy-wrap">
                <input type="text" readOnly value={pixModal.copy} className="en-copy-input" />
                <button className="en-copy-btn" onClick={copiarPix}>{copied ? '✓ Copiado' : 'Copiar'}</button>
              </div>
            )}
            <div className="en-modal-wait">Assim que o Pix cair, essa tela fecha sozinha.</div>
            <button className="en-modal-close" onClick={fecharModal}>Fechar</button>
          </div>
        </div>
      )}
    </div>
    </EmpresaShell>
  )
}
