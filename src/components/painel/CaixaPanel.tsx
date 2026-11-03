'use client'
import { useCallback, useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'
import { qzPrintRaw, buildCaixaReport, isRawBtMode, printViaRawBt, type CaixaReportData } from '@/lib/qzPrint'

// Caixa de UM canal (PDV ou Mesas — cada um tem a própria gaveta). Abre dentro da
// tela do próprio canal. O servidor calcula tudo (src/lib/caixa.ts); aqui só se
// abre, movimenta e fecha. Delivery fica de fora.

type Linha = { valor: number; qtd: number }
type Resumo = { trocoInicial: number; porForma: Record<string, Linha>; totalVendas: number; suprimentos: number; sangrias: number; dinheiroVendas: number; dinheiroEsperado: number }
type Mov = { id?: string; tipo: 'sangria' | 'suprimento'; valor: number; motivo: string | null; por: string | null; criado_em: string }
type Caixa = { id: string; status: string; troco_inicial: number; aberto_em: string; aberto_por: string | null; fechado_em: string | null; fechado_por: string | null; dinheiro_esperado: number | null; dinheiro_contado: number | null; diferenca: number | null; observacao: string | null; resumo: (Resumo & { movimentos?: Mov[] }) | null }
export type Canal = 'pdv' | 'mesa'
type Estado = { caixa: Caixa | null; resumo?: Resumo; movimentos?: Mov[]; adotado: boolean; historico: Caixa[] }

const FORMA: Record<string, string> = { dinheiro: 'Dinheiro', pix: 'Pix', cartao: 'Cartão', cartao_credito: 'Cartão crédito', cartao_debito: 'Cartão débito', cashback: 'Cashback', vale_alimentacao: 'Vale alimentação', vale_refeicao: 'Vale refeição', outro: 'Outra forma' }
const nomeForma = (k: string) => FORMA[k] || k.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
const brl = (n: number) => 'R$ ' + (Number.isFinite(n) ? n : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const digitsToNum = (d: string) => (parseInt(d || '0', 10) || 0) / 100
const digitsShow = (d: string) => digitsToNum(d).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

function reportData(companyName: string, canal: Canal, cx: Caixa, resumo: Resumo, movs: Mov[]): CaixaReportData {
  return {
    canalLabel: canal === 'pdv' ? 'PDV' : 'MESAS', companyName, abertoEm: cx.aberto_em, fechadoEm: cx.fechado_em, abertoPor: cx.aberto_por, fechadoPor: cx.fechado_por,
    trocoInicial: resumo.trocoInicial,
    porForma: Object.entries(resumo.porForma).map(([k, v]) => ({ label: nomeForma(k), valor: v.valor, qtd: v.qtd })),
    totalVendas: resumo.totalVendas,
    movimentos: movs.map(m => ({ tipo: m.tipo, valor: m.valor, motivo: m.motivo, criadoEm: m.criado_em })),
    dinheiroEsperado: resumo.dinheiroEsperado, dinheiroContado: cx.dinheiro_contado, diferenca: cx.diferenca, observacao: cx.observacao,
  }
}

export default function CaixaPanel({ companyId, companyName, canal, printerName, onClose, onMudou }: {
  companyId: string; companyName: string; canal: Canal; printerName: string; onClose: () => void; onMudou?: () => void
}) {
  const [est, setEst] = useState<Estado | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [troco, setTroco] = useState('')
  const [operador, setOperador] = useState(() => { try { return localStorage.getItem('caixa_operador') || '' } catch { return '' } })
  const [modal, setModal] = useState<null | 'sangria' | 'suprimento' | 'fechar'>(null)
  const [mValor, setMValor] = useState('')
  const [mMotivo, setMMotivo] = useState('')
  const [mPin, setMPin] = useState('')
  const [contado, setContado] = useState('')
  const [obs, setObs] = useState('')
  const [fechado, setFechado] = useState<Caixa | null>(null)

  const call = useCallback(async (acao: string, extra: Record<string, unknown> = {}) => {
    setBusy(true)
    try {
      const res = await adminFetch('/api/caixa', { method: 'POST', body: JSON.stringify({ companyId, canal, acao, operador: operador.trim(), ...extra }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(data.error || 'Não consegui concluir.'); return null }
      setMsg('')
      return data
    } catch { setMsg('Sem conexão. Tente de novo.'); return null } finally { setBusy(false) }
  }, [companyId, canal, operador])

  const carregar = useCallback(async () => {
    const r = await call('status')
    if (r) setEst(r as Estado)
  }, [call])

  // Primeira carga: busca direto (sem setState síncrono dentro do efeito).
  useEffect(() => {
    let vivo = true
    adminFetch('/api/caixa', { method: 'POST', body: JSON.stringify({ companyId, canal, acao: 'status' }) })
      .then(async res => { const d = await res.json().catch(() => ({})); if (!vivo) return; if (res.ok) setEst(d as Estado); else setMsg(d.error || 'Não consegui carregar o caixa.') })
      .catch(() => { if (vivo) setMsg('Sem conexão. Tente de novo.') })
    return () => { vivo = false }
  }, [companyId, canal])

  async function imprimir(cx: Caixa, resumo: Resumo, movs: Mov[]) {
    if (!printerName) { setMsg('Configure a impressora em Pedidos → Impressora para imprimir.'); return }
    const conteudo = buildCaixaReport(reportData(companyName, canal, cx, resumo, movs))
    try {
      if (isRawBtMode(printerName)) printViaRawBt(conteudo)
      else await qzPrintRaw(printerName, conteudo)
    } catch { setMsg('Não consegui imprimir. Confira a impressora.') }
  }

  async function abrir() {
    if (!operador.trim()) { setMsg('Diga quem está abrindo o caixa.'); return }
    try { localStorage.setItem('caixa_operador', operador.trim()) } catch { /* ok */ }
    const r = await call('abrir', { troco: digitsToNum(troco) })
    if (r) { setTroco(''); setFechado(null); await carregar(); onMudou?.() }
  }
  async function movimento() {
    if (modal !== 'sangria' && modal !== 'suprimento') return
    const r = await call('movimento', { tipo: modal, valor: digitsToNum(mValor), motivo: mMotivo, pin: mPin })
    if (r) { setModal(null); setMValor(''); setMMotivo(''); setMPin(''); await carregar(); onMudou?.() }
  }
  async function fecharCaixa() {
    const r = await call('fechar', { contado: digitsToNum(contado), observacao: obs })
    if (r?.caixa) { setFechado(r.caixa as Caixa); setModal(null); setContado(''); setObs(''); await carregar(); onMudou?.() }
  }
  function abrirModal(m: 'sangria' | 'suprimento' | 'fechar') { setMsg(''); setMValor(''); setMMotivo(''); setMPin(''); setContado(''); setObs(''); setModal(m) }

  const titulo = canal === 'pdv' ? 'Caixa do PDV' : 'Caixa das mesas'
  if (!est) return (
    <div className="cx-ov" onClick={onClose}><style>{CSS}</style><div className="cx cx-panel" onClick={e => e.stopPropagation()}><p className="cx-load">{msg || 'Carregando…'}</p></div></div>
  )

  const { caixa, resumo, movimentos = [] } = est
  const esperado = resumo?.dinheiroEsperado ?? 0
  const difLive = digitsToNum(contado) - esperado
  const formas = resumo ? Object.entries(resumo.porForma).sort((a, b) => b[1].valor - a[1].valor) : []

  return (
    <div className="cx-ov" onClick={onClose}>
    <div className="cx cx-panel" onClick={e => e.stopPropagation()} role="dialog" aria-label={titulo}>
      <style>{CSS}</style>
      <header className="cx-top">
        <h1>{titulo}</h1>
        <span className={`cx-pill ${caixa ? 'on' : ''}`}>{caixa ? 'Aberto' : 'Fechado'}</span>
        <button className="cx-close" onClick={onClose} aria-label="Fechar">✕</button>
      </header>
      {msg && <div className="cx-err" role="alert">{msg}</div>}

      {fechado && (
        <section className="cx-card ok">
          <h2>Caixa fechado</h2>
          <p>Conferência: esperado {brl(fechado.dinheiro_esperado ?? 0)} · contado {brl(fechado.dinheiro_contado ?? 0)} · {fechado.diferenca === 0 ? <b>sem diferença ✓</b> : <b className={(fechado.diferenca ?? 0) > 0 ? 'sob' : 'fal'}>{(fechado.diferenca ?? 0) > 0 ? 'sobra' : 'falta'} {brl(Math.abs(fechado.diferenca ?? 0))}</b>}</p>
          <div className="cx-row">
            <button className="cx-btn dark" onClick={() => fechado.resumo && imprimir(fechado, fechado.resumo, fechado.resumo.movimentos || [])}>Imprimir relatório</button>
            <button className="cx-btn" onClick={() => setFechado(null)}>Ok</button>
          </div>
        </section>
      )}

      {!caixa && (
        <section className="cx-card">
          <h2>Abrir caixa</h2>
          <p className="cx-sub">{est.adotado ? (canal === 'pdv' ? 'Enquanto o caixa estiver fechado, o PDV não vende.' : 'Enquanto o caixa estiver fechado, as mesas não recebem pagamento.') : (canal === 'pdv' ? 'Ao abrir o primeiro caixa, o PDV passa a exigir caixa aberto para vender.' : 'Ao abrir o primeiro caixa, as mesas passam a exigir caixa aberto para receber.')}</p>
          <div className="cx-form">
            <label>Quem está abrindo<input value={operador} onChange={e => setOperador(e.target.value)} placeholder="Nome" maxLength={40} /></label>
            <label>Troco inicial na gaveta
              <span className="cx-money"><i>R$</i><input inputMode="numeric" value={digitsShow(troco)} onFocus={e => e.target.select()} onChange={e => setTroco(e.target.value.replace(/\D/g, ''))} /></span>
            </label>
            <button className="cx-btn go" disabled={busy} onClick={abrir}>Abrir caixa</button>
          </div>
        </section>
      )}

      {caixa && resumo && (
        <>
          <section className="cx-banner">
            <div><b>Caixa aberto</b><span>desde {quando(caixa.aberto_em)} · por {caixa.aberto_por || '—'}</span></div>
            <div className="cx-row">
              <button className="cx-btn" onClick={() => abrirModal('suprimento')}>+ Suprimento</button>
              <button className="cx-btn" onClick={() => abrirModal('sangria')}>− Sangria</button>
              <button className="cx-btn" onClick={() => imprimir(caixa, resumo, movimentos)}>Imprimir parcial</button>
              <button className="cx-btn danger" onClick={() => abrirModal('fechar')}>Fechar caixa</button>
            </div>
          </section>

          <section className="cx-tiles">
            <div className="t"><em>Troco inicial</em><b>{brl(resumo.trocoInicial)}</b></div>
            <div className="t"><em>Vendas (todas as formas)</em><b>{brl(resumo.totalVendas)}</b></div>
            <div className="t hi"><em>Dinheiro esperado na gaveta</em><b>{brl(esperado)}</b><small>troco + vendas em dinheiro + suprimentos − sangrias</small></div>
          </section>

          <div className="cx-grid">
            <section className="cx-card">
              <h2>Vendas por forma</h2>
              {formas.length === 0 ? <p className="cx-sub">Nenhuma venda desde a abertura.</p> : (
                <div className="cx-list">
                  {formas.map(([k, v]) => <div key={k} className="r"><span>{nomeForma(k)} <small>{v.qtd} {v.qtd === 1 ? 'venda' : 'vendas'}</small></span><b>{brl(v.valor)}</b></div>)}
                </div>
              )}
              <p className="cx-note">Este caixa só conta as vendas deste canal. O delivery e o outro caixa não entram aqui.</p>
            </section>
            <section className="cx-card">
              <h2>Movimentos da gaveta</h2>
              {movimentos.length === 0 ? <p className="cx-sub">Nenhuma sangria ou suprimento ainda.</p> : (
                <div className="cx-list">
                  {movimentos.map((m, i) => (
                    <div key={m.id || i} className="r"><span><i className={m.tipo}>{m.tipo === 'sangria' ? 'Sangria' : 'Suprimento'}</i> {m.motivo || ''} <small>{hora(m.criado_em)}{m.por ? ` · ${m.por}` : ''}</small></span><b className={m.tipo}>{m.tipo === 'sangria' ? '−' : '+'} {brl(m.valor)}</b></div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}

      {est.historico.length > 0 && (
        <section className="cx-card">
          <h2>Caixas anteriores</h2>
          <div className="cx-list">
            {est.historico.map(h => (
              <div key={h.id} className="r">
                <span>{quando(h.aberto_em)} → {h.fechado_em ? quando(h.fechado_em) : ''} <small>{h.aberto_por || ''}{h.resumo ? ` · vendas ${brl(h.resumo.totalVendas)}` : ''}</small></span>
                <span className="cx-row">
                  <i className={`dif ${(h.diferenca ?? 0) === 0 ? 'ok' : (h.diferenca ?? 0) > 0 ? 'sob' : 'fal'}`}>{(h.diferenca ?? 0) === 0 ? 'Sem diferença' : `${(h.diferenca ?? 0) > 0 ? 'Sobra' : 'Falta'} ${brl(Math.abs(h.diferenca ?? 0))}`}</i>
                  {h.resumo && <button className="cx-btn sm" onClick={() => imprimir(h, h.resumo!, h.resumo!.movimentos || [])}>Imprimir</button>}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {(modal === 'sangria' || modal === 'suprimento') && (
        <div className="cx-ov inner" onClick={() => setModal(null)}>
          <div className="cx-modal" role="dialog" aria-label={modal === 'sangria' ? 'Sangria' : 'Suprimento'} onClick={e => e.stopPropagation()}>
            <h2>{modal === 'sangria' ? 'Sangria (retirar dinheiro)' : 'Suprimento (colocar dinheiro)'}</h2>
            <label>Valor<span className="cx-money"><i>R$</i><input autoFocus inputMode="numeric" value={digitsShow(mValor)} onFocus={e => e.target.select()} onChange={e => setMValor(e.target.value.replace(/\D/g, ''))} /></span></label>
            <label>Motivo{modal === 'sangria' ? '' : ' (opcional)'}<input value={mMotivo} onChange={e => setMMotivo(e.target.value)} placeholder={modal === 'sangria' ? 'Ex.: depósito, pagamento de fornecedor' : 'Ex.: reforço de troco'} maxLength={120} /></label>
            {modal === 'sangria' && <label>PIN da supervisão<input className="pin" type="text" inputMode="numeric" autoComplete="off" name="cx-pin-sup" maxLength={6} value={mPin} onChange={e => setMPin(e.target.value.replace(/\D/g, ''))} onKeyDown={e => { if (e.key === 'Enter' && !busy) void movimento() }} /></label>}
            {msg && <div className="cx-err">{msg}</div>}
            <div className="cx-acts"><button className="cx-btn" onClick={() => setModal(null)}>Cancelar</button><button className="cx-btn dark" disabled={busy || !(digitsToNum(mValor) > 0)} onClick={movimento}>Confirmar</button></div>
          </div>
        </div>
      )}

      {modal === 'fechar' && resumo && (
        <div className="cx-ov inner" onClick={() => setModal(null)}>
          <div className="cx-modal" role="dialog" aria-label="Fechar caixa" onClick={e => e.stopPropagation()}>
            <h2>Fechar caixa</h2>
            <p className="cx-sub">Conte o dinheiro que está na gaveta agora e digite o total.</p>
            <label>Dinheiro contado<span className="cx-money"><i>R$</i><input autoFocus inputMode="numeric" value={digitsShow(contado)} onFocus={e => e.target.select()} onChange={e => setContado(e.target.value.replace(/\D/g, ''))} /></span></label>
            <div className="cx-conf">
              <div><span>Esperado</span><b>{brl(esperado)}</b></div>
              <div><span>Contado</span><b>{brl(digitsToNum(contado))}</b></div>
              <div className={Math.abs(difLive) < 0.005 ? 'ok' : difLive > 0 ? 'sob' : 'fal'}><span>{Math.abs(difLive) < 0.005 ? 'Confere' : difLive > 0 ? 'Sobra' : 'Falta'}</span><b>{brl(Math.abs(difLive))}</b></div>
            </div>
            <label>Observação (opcional)<input value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex.: diferença de troco" maxLength={300} /></label>
            {msg && <div className="cx-err">{msg}</div>}
            <div className="cx-acts"><button className="cx-btn" onClick={() => setModal(null)}>Voltar</button><button className="cx-btn danger solid" disabled={busy || !contado} onClick={fecharCaixa}>Fechar caixa</button></div>
          </div>
        </div>
      )}
    </div>
    </div>
  )
}

const CSS = `
.cx,.cx *{box-sizing:border-box}
.cx-ov{position:fixed;inset:0;z-index:90;background:rgba(21,18,16,.6);display:flex;align-items:center;justify-content:center;padding:16px}
.cx-ov.inner{z-index:100}
.cx-panel{width:min(820px,100%);max-height:100%;overflow-y:auto;background:#E9EAE5;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
.cx-close{margin-left:auto;width:44px;height:44px;border:1px solid #b9bab2;border-radius:8px;background:#fff;font-size:16px;cursor:pointer}
.cx{max-width:none;margin:0 auto;padding:20px 16px 28px;display:flex;flex-direction:column;gap:14px;font-family:'Archivo',system-ui,sans-serif;color:#151210}
.cx-load{color:#6F6C67}
.cx-top{display:flex;align-items:center;gap:12px}.cx-top h1{margin:0;font-family:'Anton',sans-serif;font-weight:400;font-size:34px;text-transform:uppercase;letter-spacing:.02em}
.cx-pill{padding:4px 12px;border-radius:99px;background:#E4E2DA;color:#4f4c47;font-weight:700;font-size:12px;letter-spacing:.06em;text-transform:uppercase}.cx-pill.on{background:#DDF1E7;color:#0B5B38}
.cx-err{background:#FBE6E3;color:#B3261A;border-radius:8px;padding:10px 14px;font-weight:600;font-size:14px}
.cx-card{background:#fff;border:1px solid #DCDDD6;border-radius:12px;padding:18px;display:flex;flex-direction:column;gap:12px;min-width:0}
.cx-card.ok{background:#F1FAF5;border-color:#BFE3CF}
.cx-card h2,.cx-modal h2{margin:0;font-family:'Anton',sans-serif;font-weight:400;font-size:22px;text-transform:uppercase;letter-spacing:.02em}
.cx-card h3{margin:6px 0 0;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#4f4c47}
.cx-card p,.cx-modal p{margin:0}.cx-sub{color:#4f4c47;font-size:14px;line-height:1.4}.cx-note{color:#6F6C67;font-size:12.5px}
.cx-form{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:12px;align-items:end}
.cx label{display:flex;flex-direction:column;gap:5px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#4f4c47;font-weight:700}
.cx input{height:50px;border:1px solid #b9bab2;border-radius:8px;padding:0 12px;font-size:17px;font-family:inherit;color:#151210;min-width:0;width:100%;background:#fff;text-transform:none;letter-spacing:0;font-weight:600}
.cx-money{display:flex;align-items:center;border:1px solid #b9bab2;border-radius:8px;background:#fff;padding-left:12px}.cx-money i{font-style:normal;color:#6F6C67;font-weight:700}.cx-money input{border:0;background:transparent;outline:0}
.cx-btn{height:46px;padding:0 16px;border:1px solid #b9bab2;border-radius:10px;background:#fff;color:#151210;font-family:inherit;font-weight:700;font-size:14.5px;cursor:pointer;white-space:nowrap}
.cx-btn.sm{height:36px;padding:0 12px;font-size:13px}.cx-btn.dark{background:#151210;color:#fff;border-color:#151210}.cx-btn.go{background:#0B7347;color:#fff;border-color:#0B7347;height:50px;padding:0 24px}
.cx-btn.danger{color:#B3261A;border-color:#D9A39C}.cx-btn.danger.solid{background:#B3261A;color:#fff;border-color:#B3261A}.cx-btn:disabled{opacity:.5;cursor:not-allowed}
.cx-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.cx-banner{background:#151210;color:#fff;border-radius:12px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.cx-banner>div:first-child{display:flex;flex-direction:column;gap:2px}.cx-banner b{font-size:16px}.cx-banner span{font-size:13px;color:#D6D0C6}
.cx-banner .cx-btn{background:transparent;color:#fff;border-color:#4a423a}.cx-banner .cx-btn.danger{color:#fff;background:#B3261A;border-color:#B3261A}
.cx-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.cx-tiles .t{background:#fff;border:1px solid #DCDDD6;border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:3px;min-width:0}
.cx-tiles em{font-style:normal;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#4f4c47;font-weight:700}
.cx-tiles b{font-family:'Anton',sans-serif;font-weight:400;font-size:32px;line-height:1.05;font-variant-numeric:tabular-nums}.cx-tiles small{font-size:12px;color:#6F6C67}
.cx-tiles .hi{background:#FFF6D6;border-color:#EBD27C}
.cx-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.cx-list{display:flex;flex-direction:column}
.cx-list .r{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-top:1px solid #ECEDE8;font-size:14.5px;flex-wrap:wrap}.cx-list .r:first-child{border-top:0}
.cx-list small{color:#6F6C67;font-size:12.5px;margin-left:4px}.cx-list b{font-variant-numeric:tabular-nums;font-weight:700}
.cx-list i{font-style:normal;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;border-radius:4px;padding:2px 6px;margin-right:4px}
.cx-list i.sangria,.cx-list b.sangria{background:#FBE6E3;color:#B3261A}.cx-list b.sangria{background:transparent}
.cx-list i.suprimento,.cx-list b.suprimento{background:#DDF1E7;color:#0B5B38}.cx-list b.suprimento{background:transparent}
.cx-list i.dif{margin:0}.cx-list i.dif.ok{background:#DDF1E7;color:#0B5B38}.cx-list i.dif.sob{background:#FFF3C9;color:#5C3F00}.cx-list i.dif.fal{background:#FBE6E3;color:#B3261A}
.cx b.sob{color:#5C3F00}.cx b.fal{color:#B3261A}
.cx-modal{width:min(440px,100%);background:#fff;border-radius:14px;padding:22px;display:flex;flex-direction:column;gap:12px;box-shadow:0 20px 60px rgba(0,0,0,.4);max-height:100%;overflow-y:auto}
.cx-acts{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:8px;margin-top:4px}.cx-acts .cx-btn{height:52px}
.cx-conf{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.cx-conf div{background:#F5F6F2;border-radius:8px;padding:8px 10px;display:flex;flex-direction:column;gap:2px}.cx-conf span{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#4f4c47;font-weight:700}.cx-conf b{font-size:16px;font-variant-numeric:tabular-nums}
.cx-conf .ok{background:#DDF1E7}.cx-conf .sob{background:#FFF3C9}.cx-conf .fal{background:#FBE6E3}
@media(max-width:800px){.cx-form{grid-template-columns:minmax(0,1fr)}.cx-tiles{grid-template-columns:minmax(0,1fr)}.cx-grid{grid-template-columns:minmax(0,1fr)}.cx-banner .cx-btn{flex:1}}
`
