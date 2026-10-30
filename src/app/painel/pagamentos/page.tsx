'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { refreshSessionOnce } from '@/lib/authRefresh'
import { usePainelShell } from '@/contexts/PainelShellContext'
import PeriodFilterBar from '@/components/admin/PeriodFilterBar'
import { PeriodSel, periodRange, periodLabel } from '@/lib/periodFilter'

type MpStatus = {
  connected: boolean
  conta: { mp_email: string | null; application_fee_pct: number; pix_automatico_enabled: boolean; connected_at: string } | null
}
type Pedido = { id: string; payment_method: string | null; payment_status: string; mp_payment_id: string | null; total: number; created_at: string }

const PAY_LABEL: Record<string, string> = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão' }
// Mesma ordem/cores validadas pra identidade categórica (skill de dataviz) —
// nunca reaproveita as cores de status (--open/--alert/--warn/--info) pra
// não fingir que "Pix" é "sucesso" e "Dinheiro" é "aviso".
const PAY_COLOR: Record<string, string> = { pix: '#2a78d6', dinheiro: '#eb6834', cartao: '#1baf7a', outro: '#A79E8B' }

function fmt(n: number) { return 'R$ ' + n.toFixed(2).replace('.', ',') }

export default function PagamentosPage() {
  const { company, loading: shellLoading } = usePainelShell()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [mpStatus, setMpStatus] = useState<MpStatus | null>(null)
  const [period, setPeriod] = useState<PeriodSel>({ kind: 'month' })
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [avisoConectar, setAvisoConectar] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [error, setError] = useState('')
  const [banner, setBanner] = useState<{ kind: 'ok' | 'erro'; msg?: string } | null>(null)

  const lineRef = useRef<HTMLCanvasElement>(null)
  const donutRef = useRef<HTMLCanvasElement>(null)
  const charts = useRef<Record<string, any>>({})

  useEffect(() => {
    if (shellLoading) return
    if (!company || !company.loja_digital_enabled) { window.location.href = '/painel/compartilhar'; return }
    setLoading(false)
    loadStatus(company.id)
  }, [shellLoading, company?.id])

  // Volta do /api/painel/mp/callback — mostra o resultado uma vez e limpa a
  // URL (senão um F5 reexibe o banner de "conectado" pra sempre).
  useEffect(() => {
    const mp = searchParams.get('mp')
    if (!mp) return
    setBanner({ kind: mp === 'ok' ? 'ok' : 'erro', msg: searchParams.get('mp_msg') || undefined })
    if (mp === 'ok' && company?.id) loadStatus(company.id)
    router.replace('/painel/pagamentos')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  useEffect(() => {
    if (!company?.id || !mpStatus?.connected) { setLoadingData(false); return }
    setLoadingData(true)
    const { from, to } = periodRange(period)
    let q = supabase.from('loja_pedidos')
      .select('id,payment_method,payment_status,mp_payment_id,total,created_at')
      .eq('company_id', company.id).neq('status', 'cancelado')
    if (from) q = q.gte('created_at', from)
    if (to) q = q.lt('created_at', to)
    q.order('created_at', { ascending: true }).then(({ data }) => {
      setPedidos((data || []) as Pedido[])
      setLoadingData(false)
    })
  }, [company?.id, period, mpStatus?.connected])

  async function loadStatus(companyId: string) {
    const { data: { session } } = await supabase.auth.getSession()
    const r = await fetch('/api/painel/mp/status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: session?.access_token, company_id: companyId }),
    })
    const data = await r.json()
    setMpStatus(data)
  }

  async function callComRetry(path: string, body: Record<string, any>) {
    const { data: { session } } = await supabase.auth.getSession()
    const call = async () => {
      const r = await fetch(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, access_token: session?.access_token }),
      })
      return { r, data: await r.json() }
    }
    let { r, data } = await call()
    if (r.status === 401) { await refreshSessionOnce(); ({ r, data } = await call()) }
    return { r, data }
  }

  async function conectar() {
    if (!company) return
    setError(''); setConnecting(true)
    const { r, data } = await callComRetry('/api/painel/mp/connect', { company_id: company.id })
    setConnecting(false)
    if (!r.ok || data.error) { setError(data.error || 'Não consegui iniciar a conexão.'); return }
    window.location.href = data.url
  }

  async function desconectar() {
    if (!company) return
    if (!window.confirm('Desconectar o Mercado Pago? O Pix some do carrinho dos clientes até conectar de novo.')) return
    setDisconnecting(true)
    const { r, data } = await callComRetry('/api/painel/mp/desconectar', { company_id: company.id })
    setDisconnecting(false)
    if (!r.ok || data.error) { setError(data.error || 'Não consegui desconectar.'); return }
    setMpStatus({ connected: false, conta: null })
  }

  async function togglePix(enabled: boolean) {
    if (!company || !mpStatus?.conta) return
    setToggling(true)
    setMpStatus(s => s ? { ...s, conta: { ...s.conta!, pix_automatico_enabled: enabled } } : s)
    const { r, data } = await callComRetry('/api/painel/mp/toggle-pix', { company_id: company.id, enabled })
    setToggling(false)
    if (!r.ok || data.error) {
      setMpStatus(s => s ? { ...s, conta: { ...s.conta!, pix_automatico_enabled: !enabled } } : s)
      setError(data.error || 'Não consegui salvar.')
    }
  }

  // "Confirmado": Pix que realmente passou pelo Mercado Pago (tem
  // mp_payment_id). "Fora do MP": qualquer pedido marcado pago SEM
  // mp_payment_id — é a própria loja informando, nunca verificado por
  // pagamento real (mesmo princípio de "Interesse não é venda").
  const pixConfirmados = pedidos.filter(p => p.mp_payment_id && p.payment_status === 'pago')
  const recebidoPix = pixConfirmados.reduce((s, p) => s + Number(p.total), 0)
  const foraDoMp = pedidos.filter(p => p.payment_status === 'pago' && !p.mp_payment_id)
  const recebidoForaDoMp = foraDoMp.reduce((s, p) => s + Number(p.total), 0)

  const porMetodo = (() => {
    const m = new Map<string, number>()
    pedidos.forEach(p => { const k = p.payment_method || 'outro'; m.set(k, (m.get(k) || 0) + 1) })
    return Array.from(m.entries()).map(([metodo, count]) => ({ metodo, count, pct: pedidos.length ? (count / pedidos.length) * 100 : 0 }))
      .sort((a, b) => b.count - a.count)
  })()

  function pixPorDia() {
    const map = new Map<string, number>()
    pixConfirmados.forEach(p => {
      const key = new Date(p.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      map.set(key, (map.get(key) || 0) + Number(p.total))
    })
    return Array.from(map.entries()).map(([label, value]) => ({ label, value }))
  }

  useEffect(() => {
    if (loadingData || !mpStatus?.connected) return
    import('chart.js/auto').then(({ default: Chart }) => {
      Object.values(charts.current).forEach((c: any) => c?.destroy())
      charts.current = {}

      const serie = pixPorDia()
      if (lineRef.current) {
        charts.current.line = new Chart(lineRef.current, {
          type: 'line',
          data: { labels: serie.map(b => b.label), datasets: [{ label: 'Recebido via Pix', data: serie.map(b => b.value), borderColor: '#A87200', backgroundColor: 'rgba(168,114,0,.1)', borderWidth: 2.5, pointRadius: 3, tension: 0.35, fill: true }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
        })
      }
      if (donutRef.current) {
        charts.current.donut = new Chart(donutRef.current, {
          type: 'doughnut',
          data: {
            labels: porMetodo.map(m => PAY_LABEL[m.metodo] || m.metodo),
            datasets: [{ data: porMetodo.map(m => m.count), backgroundColor: porMetodo.map(m => PAY_COLOR[m.metodo] || PAY_COLOR.outro), borderWidth: 0 }],
          },
          options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { family: 'Archivo', size: 11.5 } } } } },
        })
      }
    })
    return () => { Object.values(charts.current).forEach((c: any) => c?.destroy()); charts.current = {} }
  }, [loadingData, mpStatus?.connected, pedidos])

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Archivo,sans-serif', color: 'var(--muted)' }}>Carregando...</div>

  return (
    <div className="mp-wrap">
      <style>{`
        .mp-wrap{ padding:20px 16px 48px; max-width:860px; }
        @media(min-width:768px){ .mp-wrap{ padding:28px 32px 48px; } }
        .mp-title{ font-family:'Anton',sans-serif; font-size:26px; color:var(--ink); letter-spacing:.3px; margin-bottom:4px; }
        .mp-subtitle{ font-size:13.5px; color:var(--muted); margin-bottom:22px; line-height:1.6; }
        .mp-card{ background:#fff; border:1px solid var(--line); border-radius:16px; padding:24px; }
        .mp-btn-primary{ padding:15px; background:var(--sign); color:var(--ink); border:none; border-radius:12px; font-size:14px; font-weight:800; cursor:pointer; font-family:'Archivo',sans-serif; }
        .mp-btn-primary:disabled{ opacity:.6; cursor:default; }
        .mp-btn-ghost-danger{ padding:9px 16px; background:#fff; color:#A83232; border:1.5px solid #F3C9C9; border-radius:9px; font-size:12px; font-weight:700; cursor:pointer; font-family:'Archivo',sans-serif; }
        .mp-toggle{ width:38px; height:22px; border-radius:20px; position:relative; flex:none; cursor:pointer; border:none; background:var(--line); }
        .mp-toggle.on{ background:#0F8A57; }
        .mp-toggle .knob{ position:absolute; top:2px; left:2px; width:18px; height:18px; border-radius:50%; background:#fff; transition:left .15s; }
        .mp-toggle.on .knob{ left:18px; }
        .mp-kpis{ display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-bottom:14px; }
        .mp-kpi{ background:#fff; border:1px solid var(--line); border-radius:14px; padding:16px 18px; }
        .mp-kpi-lbl{ font-size:10.5px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; color:var(--muted); margin-bottom:8px; }
        .mp-kpi-val{ font-family:'Anton',sans-serif; font-size:22px; color:var(--ink); }
        .mp-chart-box{ height:200px; position:relative; }
        .mp-ov{ position:fixed; inset:0; background:rgba(21,18,16,.55); display:flex; align-items:center; justify-content:center; padding:16px; z-index:1000; }
        .mp-modal{ background:#fff; border-radius:16px; padding:22px 20px 18px; width:100%; max-width:420px; max-height:90vh; overflow-y:auto; font-family:'Archivo',sans-serif; }
        .mp-modal h3{ margin:0 0 6px; font-size:17px; font-weight:800; color:var(--ink); }
        .mp-modal p{ margin:0 0 14px; font-size:13px; color:var(--ink-2); line-height:1.55; }
        .mp-modal-lbl{ font-size:10.5px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); margin:0 0 6px; }
        .mp-modal ul{ list-style:none; margin:0 0 14px; padding:0; display:flex; flex-direction:column; gap:6px; }
        .mp-modal li{ display:flex; gap:8px; font-size:13px; color:var(--ink-2); line-height:1.45; }
        .mp-modal-acts{ display:flex; gap:10px; margin-top:4px; }
        .mp-modal-acts button{ flex:1; }
        .mp-btn-ghost{ padding:15px; background:#fff; color:var(--ink); border:1.5px solid var(--line); border-radius:12px; font-size:14px; font-weight:700; cursor:pointer; font-family:'Archivo',sans-serif; }
        .mp-banner{ border-radius:12px; padding:12px 16px; font-size:13px; font-weight:700; margin-bottom:18px; }
      `}</style>

      <div className="mp-title">PAGAMENTOS</div>

      {/* A tela de autorização do Mercado Pago (texto deles, não dá pra mudar)
          diz que o app terá acesso amplo à conta — assusta o lojista (Crepe
          Cone, out/2026). Explica antes o que a gente realmente usa. */}
      {avisoConectar && (
        <div className="mp-ov" role="dialog" aria-modal="true" aria-labelledby="mp-aviso-tit">
          <div className="mp-modal">
            <h3 id="mp-aviso-tit">Antes de conectar</h3>
            <p>No final, o Mercado Pago vai mostrar uma mensagem padrão dizendo que o Trindade Online terá acesso à sua conta. Esse texto é do Mercado Pago e aparece pra qualquer sistema que se conecta. Na prática:</p>
            <div className="mp-modal-lbl">O que a gente usa</div>
            <ul>
              <li><span style={{ color: '#0F8A57', fontWeight: 800 }}>✓</span><span>Gerar o Pix e a cobrança no cartão dos pedidos do seu cardápio</span></li>
              <li><span style={{ color: '#0F8A57', fontWeight: 800 }}>✓</span><span>Confirmar que o pagamento caiu, pra liberar o pedido</span></li>
              <li><span style={{ color: '#0F8A57', fontWeight: 800 }}>✓</span><span>Devolver o valor ao cliente quando um pedido pago é cancelado</span></li>
            </ul>
            <div className="mp-modal-lbl">O que a gente não vê nem mexe</div>
            <ul>
              <li><span style={{ color: '#A83232', fontWeight: 800 }}>✕</span><span>Seu login e sua senha</span></li>
              <li><span style={{ color: '#A83232', fontWeight: 800 }}>✕</span><span>Seu saldo e seu extrato</span></li>
              <li><span style={{ color: '#A83232', fontWeight: 800 }}>✕</span><span>Suas outras vendas e transações</span></li>
              <li><span style={{ color: '#A83232', fontWeight: 800 }}>✕</span><span>Saques e transferências</span></li>
            </ul>
            <p>O dinheiro cai inteiro na sua conta, sem taxa nossa. Pode desconectar quando quiser, aqui mesmo.</p>
            <div className="mp-modal-acts">
              <button className="mp-btn-ghost" onClick={() => setAvisoConectar(false)}>Agora não</button>
              <button className="mp-btn-primary" disabled={connecting} onClick={() => { setAvisoConectar(false); conectar() }}>Entendi, conectar</button>
            </div>
          </div>
        </div>
      )}

      {banner && (
        <div className="mp-banner" style={banner.kind === 'ok' ? { background: '#E4F3EC', color: '#157A52' } : { background: '#FBEAEA', color: '#A83232' }}>
          {banner.kind === 'ok' ? '✓ Mercado Pago conectado com sucesso.' : `Não deu pra conectar — ${banner.msg || 'tenta de novo.'}`}
        </div>
      )}
      {error && <div className="mp-banner" style={{ background: '#FBEAEA', color: '#A83232' }}>{error}</div>}

      {!mpStatus?.connected ? (
        <>
          <div className="mp-subtitle" style={{ maxWidth: 520 }}>
            Conecte sua conta do Mercado Pago pra receber o Pix dos pedidos do cardápio direto na hora — sem combinar na entrega, sem anotar quem já pagou.
          </div>
          <div className="mp-card">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 22 }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--concrete-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flex: 'none' }}>🏦</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Mercado Pago</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 4, fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', background: 'var(--concrete-2)', padding: '4px 10px', borderRadius: 20 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#A79E8B', display: 'inline-block' }} />
                  Nenhuma conta conectada
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
              <div style={{ display: 'flex', gap: 10 }}><span style={{ color: '#0F8A57', fontWeight: 800 }}>✓</span><span style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>Pix automático no carrinho — o cliente paga na hora, sem precisar combinar com você</span></div>
              <div style={{ display: 'flex', gap: 10 }}><span style={{ color: '#0F8A57', fontWeight: 800 }}>✓</span><span style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>O dinheiro cai direto na SUA conta do Mercado Pago — a Trindade Online nunca fica com o valor</span></div>
              <div style={{ display: 'flex', gap: 10 }}><span style={{ color: '#0F8A57', fontWeight: 800 }}>✓</span><span style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>Pedido só é confirmado depois que o pagamento cai — acaba o calote de quem some depois de pedir</span></div>
            </div>
            <button className="mp-btn-primary" style={{ width: '100%' }} disabled={connecting} onClick={() => setAvisoConectar(true)}>
              {connecting ? 'Abrindo o Mercado Pago...' : 'Conectar Mercado Pago →'}
            </button>
            <div style={{ textAlign: 'center', fontSize: 11, color: '#A79E8B', marginTop: 10 }}>
              Você sai do nosso site, entra direto no app do Mercado Pago, autoriza e volta pra cá. A gente nunca vê sua senha.
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="mp-subtitle">Sua conta do Mercado Pago está conectada — os pedidos pagos por Pix no cardápio caem direto aqui.</div>

          <div className="mp-card" style={{ marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ width: 48, height: 48, borderRadius: 13, background: '#E4F3EC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flex: 'none' }}>🏦</div>
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' }}>Mercado Pago</div>
                  {mpStatus.conta?.mp_email && <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 3, fontWeight: 600 }}>{mpStatus.conta.mp_email}</div>}
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 11, fontWeight: 700, color: '#0F8A57', background: '#E4F3EC', padding: '3px 9px', borderRadius: 20 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0F8A57', display: 'inline-block' }} />
                    Conectado desde {mpStatus.conta && new Date(mpStatus.conta.connected_at).toLocaleDateString('pt-BR')}
                  </div>
                </div>
              </div>
              <button className="mp-btn-ghost-danger" disabled={disconnecting} onClick={desconectar}>{disconnecting ? 'Desconectando...' : 'Desconectar'}</button>
            </div>
            <div style={{ borderTop: '1px solid #F0EDE8', paddingTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Pix automático no carrinho</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Desligado, o Pix some do carrinho e volta a ser "combinar na entrega" — a conexão continua ativa.</div>
              </div>
              <button className={`mp-toggle ${mpStatus.conta?.pix_automatico_enabled ? 'on' : ''}`} disabled={toggling} onClick={() => togglePix(!mpStatus.conta?.pix_automatico_enabled)}><span className="knob" /></button>
            </div>
          </div>

          <div style={{ marginBottom: 18 }}><PeriodFilterBar value={period} onChange={setPeriod} /></div>

          {loadingData ? (
            <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12.5, padding: '40px 0' }}>Carregando...</div>
          ) : pedidos.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12.5, padding: '40px 0' }}>Nenhum pedido em {periodLabel(period)}.</div>
          ) : (
            <>
              <div className="mp-kpis">
                <div className="mp-kpi"><div className="mp-kpi-lbl">Recebido via Pix</div><div className="mp-kpi-val">{fmt(recebidoPix)}</div><div style={{ fontSize: 11, fontWeight: 700, color: '#0F8A57', marginTop: 4 }}>{pixConfirmados.length} pedidos · confirmado</div></div>
                <div className="mp-kpi"><div className="mp-kpi-lbl">Taxa da plataforma</div><div className="mp-kpi-val">{fmt(0)}</div><div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginTop: 4 }}>sem taxa — o Trindade Online não desconta nada</div></div>
                <div className="mp-kpi"><div className="mp-kpi-lbl">Caiu integral na sua conta</div><div className="mp-kpi-val">{fmt(recebidoPix)}</div><div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginTop: 4 }}>direto, sem passar por nós</div></div>
              </div>

              <div style={{ background: 'var(--concrete-2)', border: '1px dashed #C9C4B8', borderRadius: 14, padding: '16px 18px', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink)' }}>Fora do Mercado Pago (dinheiro / cartão na entrega)</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, maxWidth: 460, lineHeight: 1.5 }}>Informado pela própria loja ao marcar o pedido como pago — <b>não é confirmado por pagamento real</b>, é só o que foi registrado.</div>
                </div>
                <div style={{ textAlign: 'right', flex: 'none' }}>
                  <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, color: 'var(--ink)' }}>{fmt(recebidoForaDoMp)}</div>
                  <div style={{ fontSize: 10.5, color: '#A79E8B', fontWeight: 700 }}>{foraDoMp.length} pedidos</div>
                </div>
              </div>

              <div className="mp-card" style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)', marginBottom: 2 }}>Recebido via Pix por dia</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>{periodLabel(period)} · valores confirmados pelo Mercado Pago</div>
                <div className="mp-chart-box"><canvas ref={lineRef} /></div>
              </div>

              <div className="mp-card">
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)', marginBottom: 2 }}>Forma de pagamento mais usada</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>{pedidos.length} pedidos em {periodLabel(period)}</div>
                <div className="mp-chart-box"><canvas ref={donutRef} /></div>
                <div style={{ fontSize: 10.5, color: '#A79E8B', marginTop: 14, borderTop: '1px solid #F0EDE8', paddingTop: 10, lineHeight: 1.5 }}>
                  Pix confirmado automaticamente pelo Mercado Pago. Dinheiro e cartão são o que a própria loja marcou ao entregar — não passam por nenhuma confirmação de pagamento.
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
