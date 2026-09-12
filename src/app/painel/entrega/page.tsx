'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { refreshSessionOnce } from '@/lib/authRefresh'
import { usePainelShell } from '@/contexts/PainelShellContext'

type Wallet = { credits: number; diasDisponiveis: number }
type Precos = { today: string; dayType: 'util' | 'fds' | 'feriado'; diaria: number; entrega: number; pacoteDias: number; pacoteDesconto: number }
type DStatus = 'buscando_motoboy' | 'a_caminho' | 'entregue' | 'cancelada' | 'sem_credito'
type DOrder = {
  id: string; customer_name: string; customer_phone: string | null; dropoff_address: string
  status: DStatus; fee: number; motoboy_name: string | null; delivery_code: string
  created_at: string; delivered_at: string | null
}
type LedgerKind = 'diaria' | 'compra_credito' | 'consumo' | 'diaria_consumo'
type LedgerRow = { id: string; kind: LedgerKind; amount: number; credits_delta: number; delivery_order_id: string | null; created_at: string }
type PixModal = { kind: 'diaria' | 'credito' | 'combo'; credits: number; dias: number; payment_id: string; qr: string | null; copy: string | null; value: number }
type View = 'geral' | 'relatorio'

const STATUS_LABEL: Record<DStatus, string> = {
  buscando_motoboy: 'Chamando motoboy', a_caminho: 'A caminho', entregue: 'Entregue', cancelada: 'Cancelada', sem_credito: 'Sem crédito',
}
const STATUS_COLOR: Record<DStatus, { bg: string; fg: string }> = {
  buscando_motoboy: { bg: '#FEF0E0', fg: '#B5690C' }, a_caminho: { bg: '#E8F0FE', fg: '#1A56B0' },
  entregue: { bg: '#E4F3EC', fg: '#157A52' }, cancelada: { bg: '#FBEAEA', fg: '#C43D3D' }, sem_credito: { bg: '#F0EDE8', fg: '#6E6656' },
}
const LEDGER_LABEL: Record<LedgerKind, string> = {
  diaria: 'Compra de diária', compra_credito: 'Compra de crédito', consumo: 'Entrega confirmada (crédito)', diaria_consumo: 'Diária consumida',
}
function fmt(n: number) { return 'R$ ' + n.toFixed(2).replace('.', ',') }
function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min`
  return `${Math.floor(mins / 60)}h`
}
function fmtDataHora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function EntregaPage() {
  const { company, loading: shellLoading } = usePainelShell()
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('geral')
  const [companyId, setCompanyId] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [crmEnabled, setCrmEnabled] = useState(false)
  const [lojaDigitalEnabled, setLojaDigitalEnabled] = useState(false)
  const [wallet, setWallet] = useState<Wallet>({ credits: 0, diasDisponiveis: 0 })
  const [precos, setPrecos] = useState<Precos | null>(null)
  const [diasSel, setDiasSel] = useState(1)
  const [creditosSel, setCreditosSel] = useState(0)
  const [orders, setOrders] = useState<DOrder[]>([])
  const [ledger, setLedger] = useState<LedgerRow[] | null>(null)
  const [pixModal, setPixModal] = useState<PixModal | null>(null)
  const [paying, setPaying] = useState<string | null>(null)
  const [payError, setPayError] = useState('')
  const [copied, setCopied] = useState(false)
  const companyIdRef = useRef('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [novaOpen, setNovaOpen] = useState(false)
  const [novaForm, setNovaForm] = useState({ nome: '', telefone: '', endereco: '' })
  const [novaSaving, setNovaSaving] = useState(false)
  const [novaError, setNovaError] = useState('')

  useEffect(() => {
    if (shellLoading) return
    if (!company || !company.entrega_enabled) { window.location.href = '/painel'; return }
    setCompanyId(company.id); companyIdRef.current = company.id
    setCompanyName(company.name)
    setCrmEnabled(company.crm_whatsapp_enabled)
    setLojaDigitalEnabled(company.loja_digital_enabled)
    loadAll(company.id)
    fetch('/api/entrega/precos').then(r => r.json()).then(setPrecos).catch(() => {})
    setLoading(false)

    const channel = supabase.channel(`entrega-${company.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_orders', filter: `company_id=eq.${company.id}` }, () => loadOrders(companyIdRef.current))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'company_delivery_wallet', filter: `company_id=eq.${company.id}` }, () => loadWallet(companyIdRef.current))
      .subscribe()

    // Enquanto essa tela estiver aberta, garante que oferta de motoboy que
    // estourou o prazo de resposta seja repassada mesmo sem nenhuma
    // mensagem nova no WhatsApp pra disparar isso.
    const tickIv = setInterval(() => { fetch('/api/entrega/tick').catch(() => {}) }, 15000)

    return () => { supabase.removeChannel(channel); clearInterval(tickIv); if (pollRef.current) clearInterval(pollRef.current) }
  }, [shellLoading, company?.id])

  useEffect(() => {
    if (view === 'relatorio' && ledger === null && companyId) loadLedger(companyId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, companyId])

  async function loadAll(cid: string) {
    await Promise.all([loadWallet(cid), loadOrders(cid)])
  }
  async function loadWallet(cid: string) {
    const { data } = await supabase.from('company_delivery_wallet').select('credits, dias_diaria_disponiveis').eq('company_id', cid).maybeSingle()
    setWallet({ credits: data?.credits || 0, diasDisponiveis: data?.dias_diaria_disponiveis || 0 })
  }
  async function loadOrders(cid: string) {
    const since = new Date(); since.setHours(0, 0, 0, 0)
    const { data } = await supabase.from('delivery_orders').select('*').eq('company_id', cid).gte('created_at', since.toISOString()).order('created_at', { ascending: false })
    setOrders((data || []) as DOrder[])
  }
  async function loadLedger(cid: string) {
    const { data } = await supabase.from('delivery_credit_ledger').select('*').eq('company_id', cid).order('created_at', { ascending: false }).limit(100)
    setLedger((data || []) as LedgerRow[])
  }

  const diasDisponiveis = wallet.diasDisponiveis
  const ativaHoje = diasDisponiveis > 0

  async function iniciarPagamento(kind: 'diaria' | 'credito' | 'combo', dias = 0, credits = 0) {
    setPayError('')
    setPaying(`${kind}${dias}${credits}`)

    const call = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/entrega/pagar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: session?.access_token, company_id: companyId, kind, dias, credits }),
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
    setPixModal({ kind, credits, dias, payment_id: String(data.payment_id), qr: data.qr_code_image, copy: data.pix_copy_paste, value: data.value })
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

  function comprar() {
    const dias = diasSel
    const credits = creditosSel
    if (dias === 0 && credits === 0) return
    const kind = dias > 0 && credits > 0 ? 'combo' : dias > 0 ? 'diaria' : 'credito'
    iniciarPagamento(kind, dias, credits)
  }

  const totalPreview = precos ? (() => {
    const dias = diasSel
    const diariaTotal = dias * precos.diaria
    const desconto = dias === precos.pacoteDias ? precos.pacoteDesconto : 0
    return Math.max(0, diariaTotal - desconto) + creditosSel * precos.entrega
  })() : 0

  // Entrega avulsa — pra empresa que não tem o módulo Cardápio/Pedidos e
  // ainda assim quer chamar um motoboy (ela gerencia o pedido por fora,
  // por telefone, WhatsApp pessoal, balcão, o que for).
  async function criarEntregaAvulsa() {
    setNovaError('')
    if (!novaForm.nome.trim() || !novaForm.endereco.trim()) { setNovaError('Preenche nome e endereço de entrega.'); return }
    setNovaSaving(true)
    const call = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/entrega/criar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: session?.access_token, company_id: companyId,
          customer_name: novaForm.nome.trim(), customer_phone: novaForm.telefone.trim() || null, dropoff_address: novaForm.endereco.trim(),
        }),
      })
      return { r, data: await r.json() }
    }
    let { r: res, data } = await call()
    if (res.status === 401) { await refreshSessionOnce(); ({ r: res, data } = await call()) }
    setNovaSaving(false)
    if (!res.ok || data.error) { setNovaError((data.error || 'Não consegui chamar o motoboy.') + (res.status === 401 ? ' — atualiza a página (F5) e tenta de novo.' : '')); return }
    setNovaOpen(false)
    setNovaForm({ nome: '', telefone: '', endereco: '' })
    await loadOrders(companyId)
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

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Archivo,sans-serif', color: '#A79E8B' }}>Carregando...</div>

  const diariaOptions = precos ? [
    { dias: 0, label: 'Nenhuma', price: 0 },
    { dias: 1, label: 'Hoje', price: precos.diaria },
    { dias: precos.pacoteDias, label: `Pacote — ${precos.pacoteDias} dias`, price: precos.diaria * precos.pacoteDias - precos.pacoteDesconto, save: precos.pacoteDesconto },
  ] : []

  return (
    <>
    <div className="en-wrap">
      <style>{`
        /* Mobile primeiro (mesmo corte de 768px do resto do painel) — tela
           cheia sem cartão flutuante estreito. A versão >=1024px usa duas
           colunas de verdade em vez da coluna única esticada que sobrava
           mobile em tela de desktop (achado real do Ricardo, set/2026). */
        *{box-sizing:border-box;}
        .en-wrap{ width:100%;font-family:'Archivo',sans-serif;font-size:13px;color:var(--ink);padding:16px 14px 40px; }
        .en-topbar{ display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:16px; }
        .en-title{ font-family:'Anton',sans-serif;font-size:20px;letter-spacing:.5px;margin:0;flex:none; }
        .en-tabs{ display:flex;gap:6px;background:#F0EDE8;border-radius:10px;padding:3px;flex:none; }
        .en-tab{ border:none;background:none;padding:7px 13px;border-radius:8px;font-size:12px;font-weight:700;color:#6E6656;cursor:pointer;font-family:inherit; }
        .en-tab.on{ background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.12); }
        .en-chips{ display:flex;gap:8px;flex-wrap:wrap; }
        .en-chip{ display:flex;align-items:center;gap:6px;background:#fff;border:1.5px solid #EDE8E0;border-radius:20px;padding:6px 12px;font-size:12px;font-weight:800; }
        .en-chip b{ font-family:'Anton',sans-serif;font-size:14px; }
        .en-chip.warn{ background:#FBEAEA;border-color:#F3C6C6;color:#A83232; }
        .en-chip.ok{ background:#E4F3EC;border-color:#BFE4D2;color:#157A52; }
        .en-topbar-spacer{ flex:1 1 auto; }
        .en-head-sub{ font-size:12px;color:#6E6656;margin:0 0 16px;line-height:1.5; }
        .en-summary{ display:flex;gap:20px;flex-wrap:wrap;margin-bottom:16px; }
        .en-summary-item .n{ font-family:'Anton',sans-serif;font-size:24px;color:var(--ink);line-height:1; }
        .en-summary-item .l{ font-size:10.5px;color:#A79E8B;margin-top:2px; }
        .en-card{ background:#fff;border:1px solid #EDE8E0;border-radius:14px;padding:16px;margin-bottom:14px; }
        .en-kicker{ font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#A79E8B;margin-bottom:10px; }
        .en-btn{ font-family:inherit;font-size:12.5px;font-weight:750;border-radius:9px;border:none;padding:9px 15px;cursor:pointer; }
        .en-btn-gold{ background:var(--sign);color:var(--ink); }
        .en-btn-gold:disabled{ opacity:.5;cursor:not-allowed; }
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
        .en-modal-bg{ position:fixed;inset:0;background:rgba(26,22,14,.55);display:flex;align-items:center;justify-content:center;z-index:10050;padding:16px; }
        .en-modal{ background:#fff;border-radius:16px;padding:24px;max-width:340px;width:100%;text-align:center; }
        .en-modal h3{ font-family:'Anton',sans-serif;font-size:19px;margin:0 0 4px; }
        .en-modal-val{ font-size:13px;color:#6E6656;margin-bottom:14px; }
        .en-qr-wrap{ background:#fff;padding:8px;border:2px solid #EDE8E0;border-radius:12px;display:inline-block;margin-bottom:14px; }
        .en-qr{ width:190px;height:190px;display:block; }
        .en-copy-wrap{ display:flex;gap:6px;margin-bottom:14px; }
        .en-copy-input{ flex:1;min-width:0;padding:9px 10px;border:1.5px solid #E0DDD8;border-radius:8px;font-size:10.5px;font-family:monospace;color:#333;background:#FAFAF8; }
        .en-copy-btn{ background:var(--sign);color:var(--ink);border:none;padding:9px 14px;border-radius:8px;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap; }
        .en-modal-wait{ font-size:11.5px;color:#A79E8B;margin-bottom:12px; }
        .en-modal-close{ background:none;border:none;color:#8A6410;font-weight:700;font-size:12px;cursor:pointer; }
        .en-order-code{ margin-top:8px;font-size:11px;color:#6E6656;background:#FEF3E2;border-radius:8px;padding:7px 10px; }
        .en-order-code b{ font-family:'Anton',sans-serif;font-size:15px;letter-spacing:2px;color:#8A6410; }
        .en-order-code span{ color:#A79E8B; }
        .en-flabel{ display:block;font-size:11px;font-weight:700;color:#6E6656;margin:10px 0 5px; }
        .en-finput{ width:100%;padding:9px 12px;border-radius:9px;border:1px solid #E6E0D2;font-size:13px;font-family:inherit;box-sizing:border-box; }
        .en-grid{ display:block; }
        .en-ledger{ width:100%;border-collapse:collapse;font-size:12px; }
        .en-ledger th{ text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#A79E8B;padding:6px 8px;border-bottom:1px solid #EDE8E0; }
        .en-ledger td{ padding:9px 8px;border-bottom:1px solid #F5F3EE;color:#3A342A; }
        .en-ledger tr:last-child td{ border-bottom:none; }
        .en-ledger-pos{ color:#157A52;font-weight:700; }
        .en-ledger-neg{ color:#A83232;font-weight:700; }
        @media(min-width:1024px){
          .en-wrap{ padding:24px 32px 40px; }
          .en-grid{ display:grid;grid-template-columns:1fr 360px;gap:16px;align-items:start; }
          .en-grid-main{ order:1; }
          .en-grid-side{ order:2;display:flex;flex-direction:column; }
        }
      `}</style>

      <div className="en-topbar">
        <h1 className="en-title">🏍️ Entrega</h1>
        <div className="en-tabs">
          <button className={`en-tab ${view === 'geral' ? 'on' : ''}`} onClick={() => setView('geral')}>Visão geral</button>
          <button className={`en-tab ${view === 'relatorio' ? 'on' : ''}`} onClick={() => setView('relatorio')}>Relatório</button>
        </div>
        <div className="en-topbar-spacer" />
        <div className="en-chips">
          <span className={`en-chip ${ativaHoje ? 'ok' : 'warn'}`}>🗓️ <b>{diasDisponiveis}</b> diária{diasDisponiveis !== 1 ? 's' : ''}</span>
          <span className="en-chip">🏍️ <b>{wallet.credits}</b> crédito{wallet.credits !== 1 ? 's' : ''}</span>
        </div>
        <button className="en-btn en-btn-gold" onClick={() => { setNovaError(''); setNovaOpen(true) }}>+ Nova entrega</button>
      </div>

      {view === 'geral' && (
        <>
          <p className="en-head-sub">{precos ? `${fmt(precos.entrega)} por entrega dentro da Trindade, sempre descontado do crédito. A diária de ${fmt(precos.diaria)} só é cobrada pra chamar motoboy avulso (pedido de fora) — pedido feito pela própria plataforma usa só o crédito.` : 'Carregando preços...'} O motoboy é da plataforma — só chamar. {ativaHoje ? 'Só é descontada 1 diária no dia em que a primeira entrega avulsa é confirmada — dia sem nenhuma entrega não gasta nada, fica pro próximo.' : 'Sem diária disponível só trava o botão "+ Nova entrega" (pedido avulso).'}</p>

          <div className="en-summary">
            <div className="en-summary-item"><div className="n">{orders.length}</div><div className="l">entregas hoje</div></div>
            <div className="en-summary-item"><div className="n">{fmt(orders.filter(o => o.status !== 'cancelada' && o.status !== 'sem_credito').reduce((s, o) => s + Number(o.fee), 0))}</div><div className="l">em taxas hoje</div></div>
          </div>

          <div className="en-grid">
            <div className="en-grid-main">
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
                      {o.status !== 'entregue' && o.status !== 'cancelada' && (
                        <div className="en-order-code">Código de entrega: <b>{o.delivery_code}</b> <span>— repassa pro cliente se ele não receber pelo WhatsApp</span></div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="en-grid-side">
              <div className="en-card">
                <div className="en-kicker">Comprar diária e crédito</div>
                {precos && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#6E6656', marginBottom: 6 }}>Diária {ativaHoje && <span style={{ fontWeight: 400, color: '#A79E8B' }}>· você já tem {diasDisponiveis}</span>}</div>
                    <div className="en-buy-row" style={{ marginBottom: 14 }}>
                      {diariaOptions.map(opt => (
                        <button key={opt.dias} className="en-buy-chip" style={diasSel === opt.dias ? { borderColor: 'var(--sign)', background: '#FEF3E2' } : undefined} onClick={() => setDiasSel(opt.dias)}>
                          <b>{opt.label}</b> {opt.dias > 0 ? fmt(opt.price) : ''} {opt.save ? <span style={{ color: '#157A52', fontWeight: 700 }}>(economiza {fmt(opt.save)})</span> : null}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <div style={{ fontSize: 12, fontWeight: 700, color: '#6E6656', marginBottom: 6 }}>Créditos de entrega (opcional)</div>
                <div className="en-buy-row" style={{ marginBottom: 14 }}>
                  {[0, 10, 20, 50].map(c => (
                    <button key={c} className="en-buy-chip" style={creditosSel === c ? { borderColor: 'var(--sign)', background: '#FEF3E2' } : undefined} onClick={() => setCreditosSel(c)}>
                      <b>{c === 0 ? 'Nenhum' : `+${c} entregas`}</b> {c > 0 && precos ? fmt(c * precos.entrega) : ''}
                    </button>
                  ))}
                </div>
                <button className="en-btn en-btn-gold" style={{ width: '100%' }} disabled={!precos || (diasSel === 0 && creditosSel === 0) || paying !== null}
                  onClick={comprar}>
                  {paying ? 'Gerando Pix...' : `Pagar ${fmt(totalPreview)} via Pix`}
                </button>
                {payError && <div className="en-error">{payError}</div>}
              </div>
            </div>
          </div>
        </>
      )}

      {view === 'relatorio' && (
        <div className="en-card">
          <div className="en-kicker">Extrato — diária e crédito</div>
          {ledger === null && <div className="en-empty">Carregando...</div>}
          {ledger !== null && ledger.length === 0 && <div className="en-empty">Nenhum movimento ainda.</div>}
          {ledger !== null && ledger.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="en-ledger">
                <thead>
                  <tr><th>Quando</th><th>Movimento</th><th>Valor</th><th>Crédito</th></tr>
                </thead>
                <tbody>
                  {ledger.map(l => (
                    <tr key={l.id}>
                      <td>{fmtDataHora(l.created_at)}</td>
                      <td>{LEDGER_LABEL[l.kind] || l.kind}</td>
                      <td>{l.amount > 0 ? fmt(Number(l.amount)) : '—'}</td>
                      <td className={l.credits_delta > 0 ? 'en-ledger-pos' : l.credits_delta < 0 ? 'en-ledger-neg' : undefined}>
                        {l.credits_delta > 0 ? `+${l.credits_delta}` : l.credits_delta < 0 ? l.credits_delta : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {pixModal && (
        <div className="en-modal-bg" onClick={e => { if (e.target === e.currentTarget) fecharModal() }}>
          <div className="en-modal">
            <h3>
              {pixModal.kind === 'diaria' && (pixModal.dias > 1 ? `Diária — ${pixModal.dias} dias` : 'Diária de entrega')}
              {pixModal.kind === 'credito' && `+${pixModal.credits} entregas`}
              {pixModal.kind === 'combo' && `Diária${pixModal.dias > 1 ? ` (${pixModal.dias}d)` : ''} + ${pixModal.credits} entregas`}
            </h3>
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

      {novaOpen && (
        <div className="en-modal-bg" onClick={e => { if (e.target === e.currentTarget) setNovaOpen(false) }}>
          <div className="en-modal" style={{ textAlign: 'left' }}>
            <h3 style={{ marginBottom: 10 }}>Nova entrega</h3>
            <label className="en-flabel">Nome do cliente</label>
            <input className="en-finput" value={novaForm.nome} onChange={e => setNovaForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Kelli Verissimo" />
            <label className="en-flabel">WhatsApp do cliente (opcional)</label>
            <input className="en-finput" value={novaForm.telefone} onChange={e => setNovaForm(f => ({ ...f, telefone: e.target.value }))} placeholder="21 99999-9999" inputMode="tel" />
            <label className="en-flabel">Endereço de entrega</label>
            <input className="en-finput" value={novaForm.endereco} onChange={e => setNovaForm(f => ({ ...f, endereco: e.target.value }))} placeholder="Rua, número, bairro" />
            {novaError && <div className="en-error">{novaError}</div>}
            <button className="en-btn en-btn-gold" style={{ width: '100%', marginTop: 12 }} disabled={novaSaving} onClick={criarEntregaAvulsa}>
              {novaSaving ? 'Chamando motoboy...' : '🏍️ Chamar motoboy'}
            </button>
            <button className="en-modal-close" style={{ width: '100%', marginTop: 8 }} onClick={() => setNovaOpen(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
    </>
  )
}
