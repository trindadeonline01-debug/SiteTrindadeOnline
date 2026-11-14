'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePainelShell } from '@/contexts/PainelShellContext'
import { adminFetch } from '@/lib/adminFetch'
import { formatPhoneDisplay } from '@/lib/phone'

// Cashback da loja (nov/2026): quanto há em aberto, quem tem saldo, quando vence
// e o extrato de cada cliente. Os dados vêm de /api/painel/cashback (as tabelas
// de cashback não têm RLS, só o servidor lê). O % e a validade continuam sendo
// configurados em Configurar cardápio → Cashback.

type Cliente = { phone: string; nome: string | null; saldo: number; ultimaData: string; ultimaTipo: string | null; venceEm: string; diasParaVencer: number }
type Resumo = { aberto: number; clientes: number; gerado: number; geradoMesa: number; geradoDelivery: number; usado: number; expirado: number; aVencer: number; aVencerQtd: number }
type Config = { ativo: boolean; pctDelivery: number; pctMesa: number; dias: number }
type Jogos = { ligado: boolean; premio: boolean; modo: string; max: number; quiz: number[]; caca: number[]; teto: number; acertos: number[] }
type Mov = { tipo: string; valor: number; data: string; origem: string; saldoApos: number }
type Extrato = { phone: string; nome: string | null; saldo: number; venceEm: string | null; movs: Mov[] }

const brl = (n: number) => 'R$ ' + (Number.isFinite(n) ? n : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = (n: number) => String(n).replace('.', ',') + '%'
const dm = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
const TIPO_ULT: Record<string, string> = { credito: 'ganhou', debito: 'usou', estorno: 'devolvido', expirado: 'venceu' }

type Filtro = 'todos' | 'vencem' | 'maior'

export default function CashbackPage() {
  const { company, loading: shellLoading } = usePainelShell()
  const companyId = company?.id
  const [config, setConfig] = useState<Config | null>(null)
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [busca, setBusca] = useState('')
  const [jogos, setJogos] = useState<Jogos | null>(null)
  const [edQuiz, setEdQuiz] = useState<string[]>([])
  const [edCaca, setEdCaca] = useState<string[]>([])
  const [edTeto, setEdTeto] = useState('50')
  const [jgMsg, setJgMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [jgBusy, setJgBusy] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const [extrato, setExtrato] = useState<Extrato | null>(null)
  const [carregandoExtrato, setCarregandoExtrato] = useState(false)
  const painelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (shellLoading || !companyId) return
    let vivo = true
    adminFetch('/api/painel/cashback', { method: 'POST', body: JSON.stringify({ companyId }) })
      .then(async r => {
        const j = await r.json()
        if (!vivo) return
        if (!r.ok) { setErro(j.error || 'Não consegui carregar o cashback.'); return }
        setErro(''); setConfig(j.config); setResumo(j.resumo); setClientes(j.clientes || [])
      })
      .catch(() => { if (vivo) setErro('Não consegui carregar o cashback. Tente de novo.') })
    return () => { vivo = false }
  }, [shellLoading, companyId])

  useEffect(() => {
    if (shellLoading || !companyId) return
    let vivo = true
    adminFetch('/api/painel/cashback', { method: 'POST', body: JSON.stringify({ companyId, action: 'jogos' }) })
      .then(async r => {
        const j = await r.json()
        if (!vivo || !r.ok) return
        setJogos(j); setEdQuiz(j.quiz.map(String)); setEdCaca(j.caca.map(String)); setEdTeto(String(j.teto))
      })
      .catch(() => {})
    return () => { vivo = false }
  }, [shellLoading, companyId])

  async function salvarJogos() {
    if (!companyId || jgBusy) return
    setJgBusy(true); setJgMsg(null)
    try {
      const r = await adminFetch('/api/painel/cashback', { method: 'POST', body: JSON.stringify({ companyId, action: 'jogos_salvar', quiz: edQuiz.map(x => (x.trim() === '' ? '' : Number(x.replace(',', '.')))), caca: edCaca.map(x => (x.trim() === '' ? '' : Number(x.replace(',', '.')))), teto: Number(edTeto.replace(',', '.')) }) })
      const j = await r.json()
      if (!r.ok) { setJgMsg({ ok: false, t: j.error || 'Não consegui salvar.' }); return }
      setJogos(g => (g ? { ...g, quiz: j.quiz, caca: j.caca, teto: j.teto } : g))
      setJgMsg({ ok: true, t: 'Percentuais salvos. Valem para quem jogar a partir de agora; quem já garantiu um prêmio mantém o percentual que garantiu.' })
    } catch { setJgMsg({ ok: false, t: 'Não consegui salvar. Tente de novo.' }) } finally { setJgBusy(false) }
  }
  const padraoJogos = () => { setEdQuiz(['2', '3', '5', '6', '8', '10']); setEdCaca(['2', '3', '5', '8', '10']); setEdTeto('50'); setJgMsg(null) }
  const exemploConta = 200
  const exemplo = (v: string) => { const n = Number(v.replace(',', '.')); const t = Number(edTeto.replace(',', '.')) || 0; if (!Number.isFinite(n)) return 0; const b = exemploConta * n / 100; return t > 0 ? Math.min(b, t) : b }

  const abrir = useCallback((phone: string) => {
    if (!companyId) return
    setSel(phone); setCarregandoExtrato(true)
    adminFetch('/api/painel/cashback', { method: 'POST', body: JSON.stringify({ companyId, action: 'extrato', phone }) })
      .then(async r => {
        const j = await r.json()
        if (r.ok) setExtrato(j); else setErro(j.error || 'Não consegui abrir o extrato.')
      })
      .catch(() => setErro('Não consegui abrir o extrato.'))
      .finally(() => setCarregandoExtrato(false))
    if (typeof window !== 'undefined' && window.innerWidth < 900) setTimeout(() => painelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
  }, [companyId])

  const lista = useMemo(() => {
    let l = clientes
    if (filtro === 'vencem') l = l.filter(c => c.diasParaVencer <= 7)
    const q = busca.trim().toLowerCase()
    if (q) {
      const dig = q.replace(/\D/g, '')
      l = l.filter(c => (c.nome || '').toLowerCase().includes(q) || (dig && c.phone.includes(dig)))
    }
    if (filtro === 'maior') l = [...l].sort((a, b) => b.saldo - a.saldo)
    else if (filtro === 'vencem') l = [...l].sort((a, b) => a.diasParaVencer - b.diasParaVencer)
    return l
  }, [clientes, filtro, busca])

  const mesNome = new Date().toLocaleDateString('pt-BR', { month: 'long', timeZone: 'America/Sao_Paulo' })

  return (
    <div className="cb">
      <style>{CSS}</style>
      <header className="cb-top">
        <div><span className="cb-eyebrow">{company?.name || ''}</span><h1>Cashback</h1></div>
        <div className="cb-rules">
          {config && <span>{config.ativo ? `Delivery ${pct(config.pctDelivery)} · Mesa ${pct(config.pctMesa)} · vale por ${config.dias} dias` : 'Cashback desligado'}</span>}
          <Link className="cb-btn" href="/painel/compartilhar">Ajustar regras</Link>
        </div>
      </header>

      {erro && <div className="cb-err" role="alert">{erro}</div>}
      {config && !config.ativo && <div className="cb-warn">O cashback está desligado nesta loja. Os saldos antigos continuam valendo até vencer, mas ninguém ganha cashback novo. Para ligar, use “Ajustar regras”.</div>}
      {!resumo && !erro && <p className="cb-sub">Carregando…</p>}

      {resumo && (
        <>
          <section className="cb-kpis">
            <div className="cb-kpi main"><em>Saldo em aberto</em><b>{brl(resumo.aberto)}</b><small>{resumo.clientes} {resumo.clientes === 1 ? 'cliente com saldo' : 'clientes com saldo'}</small></div>
            <div className="cb-kpi"><em>Gerado em {mesNome}</em><b>{brl(resumo.gerado)}</b><small>Delivery {brl(resumo.geradoDelivery)} · Mesa {brl(resumo.geradoMesa)}</small></div>
            <div className="cb-kpi"><em>Usado no mês</em><b>{brl(resumo.usado)}</b><small>abatido em pedidos e contas</small></div>
            <div className="cb-kpi"><em>Venceu no mês</em><b>{brl(resumo.expirado)}</b><small>saldo sem uso por {config?.dias ?? 90} dias</small></div>
            <div className={'cb-kpi' + (resumo.aVencerQtd ? ' alert' : '')}><em>Vence em 7 dias</em><b>{brl(resumo.aVencer)}</b><small>{resumo.aVencerQtd ? `${resumo.aVencerQtd} ${resumo.aVencerQtd === 1 ? 'cliente' : 'clientes'} para lembrar` : 'nenhum saldo perto de vencer'}</small></div>
          </section>

          {jogos && (
            <section className="cb-card cb-jg">
              <div className="cb-jg-h">
                <div><h2>Prêmio dos jogos</h2><p className="cb-sub">Quanto de cashback o cliente garante jogando o Quiz e o Caça-Palavras pelo QR da mesa. Só vira valor quando ele paga a conta.</p></div>
                <span className={'cb-tag' + (jogos.ligado && jogos.premio ? ' on' : '')}>{!jogos.ligado ? 'Jogos desligados' : jogos.premio ? 'Prêmio ligado' : 'Só ranking'}</span>
              </div>
              {!jogos.ligado ? (
                <p className="cb-empty">Os jogos ainda não estão ligados na sua loja. Fale com a Trindade Online para ligar o Quiz e o Caça-Palavras.</p>
              ) : (
                <>
                  {!jogos.premio && <div className="cb-warn" style={{ margin: '0 16px' }}>O prêmio está desligado: os jogos valem só para o ranking. Quem liga o prêmio é a Trindade Online. Você já pode deixar os percentuais prontos.</div>}
                  <div className="cb-jg-grp">
                    <div><b>Caça-Palavras</b><small>% da conta que o cliente garante ao concluir cada nível</small></div>
                    <div className="cb-jg-in">
                      {edCaca.map((v, i) => (
                        <label key={i}><span>Nível {i + 1}</span><div><input inputMode="numeric" value={v} onChange={e => setEdCaca(a => a.map((x, k) => (k === i ? e.target.value : x)))} aria-label={`Percentual do nível ${i + 1} do caça-palavras`} /><i>%</i></div></label>
                      ))}
                    </div>
                  </div>
                  <div className="cb-jg-grp">
                    <div><b>Quiz Pesca Premiada</b><small>% da conta garantido em cada marco de acertos</small></div>
                    <div className="cb-jg-in">
                      {edQuiz.map((v, i) => (
                        <label key={i}><span>{jogos.acertos[i]} acertos</span><div><input inputMode="numeric" value={v} onChange={e => setEdQuiz(a => a.map((x, k) => (k === i ? e.target.value : x)))} aria-label={`Percentual dos ${jogos.acertos[i]} acertos do quiz`} /><i>%</i></div></label>
                      ))}
                    </div>
                  </div>
                  <div className="cb-jg-grp">
                    <div className="cb-jg-in">
                      <label><span>Teto por conta</span><div><i>R$</i><input inputMode="decimal" value={edTeto} onChange={e => setEdTeto(e.target.value)} aria-label="Teto do prêmio por conta em reais" /></div></label>
                    </div>
                    <small>Exemplo numa conta de {brl(exemploConta)}: Caça-Palavras nível 1 = <b>{brl(exemplo(edCaca[0] || '0'))}</b> · nível 5 = <b>{brl(exemplo(edCaca[4] || '0'))}</b>. Os percentuais precisam subir (ou ficar iguais) a cada etapa e vão de 0% a {jogos.max}%. Cada cliente ganha no máximo 1 prêmio por conta e 1 a cada 7 dias, somando os dois jogos.</small>
                  </div>
                  {jgMsg && <div className={jgMsg.ok ? 'cb-ok' : 'cb-err'} role="status" style={{ margin: '0 16px' }}>{jgMsg.t}</div>}
                  <div className="cb-jg-bt">
                    <button type="button" className="cb-btn primary" disabled={jgBusy} onClick={salvarJogos}>{jgBusy ? 'Salvando…' : 'Salvar percentuais'}</button>
                    <button type="button" className="cb-btn" disabled={jgBusy} onClick={padraoJogos}>Voltar ao padrão</button>
                  </div>
                </>
              )}
            </section>
          )}

          <div className="cb-cols">
            <section className="cb-card">
              <div className="cb-tools">
                <div className="cb-chips">
                  <button type="button" className={'cb-chip' + (filtro === 'todos' ? ' on' : '')} onClick={() => setFiltro('todos')}>Todos {clientes.length}</button>
                  <button type="button" className={'cb-chip' + (filtro === 'vencem' ? ' on' : '')} onClick={() => setFiltro('vencem')}>Vencem em 7 dias {resumo.aVencerQtd}</button>
                  <button type="button" className={'cb-chip' + (filtro === 'maior' ? ' on' : '')} onClick={() => setFiltro('maior')}>Maior saldo</button>
                </div>
                <input className="cb-search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome ou telefone" aria-label="Buscar cliente" />
              </div>
              {lista.length === 0 ? (
                <p className="cb-empty">{clientes.length === 0 ? 'Ainda não há clientes com saldo. O cashback aparece aqui depois do primeiro pedido entregue ou da primeira conta de mesa fechada.' : 'Nenhum cliente nesse filtro.'}</p>
              ) : (
                <ul className="cb-list">
                  <li className="cb-row head" aria-hidden="true"><span>Cliente</span><span className="r">Saldo</span><span className="hide-s">Última mov.</span><span>Vence em</span></li>
                  {lista.map(c => (
                    <li key={c.phone}>
                      <button type="button" className={'cb-row' + (sel === c.phone ? ' sel' : '')} onClick={() => abrir(c.phone)}>
                        <span><b>{c.nome || 'Sem nome'}</b><small>{formatPhoneDisplay(c.phone)}</small></span>
                        <b className="r n">{brl(c.saldo)}</b>
                        <span className="hide-s">{dm(c.ultimaData)}{c.ultimaTipo ? ' · ' + (TIPO_ULT[c.ultimaTipo] || '') : ''}</span>
                        <span className={c.diasParaVencer <= 7 ? 'late' : ''}>{dm(c.venceEm)}{c.diasParaVencer <= 7 ? ` · ${Math.max(c.diasParaVencer, 0)} ${c.diasParaVencer === 1 ? 'dia' : 'dias'}` : ''}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <aside className="cb-card cb-ext" ref={painelRef} aria-live="polite">
              {!sel && <p className="cb-empty">Toque em um cliente para ver o extrato dele.</p>}
              {sel && carregandoExtrato && !extrato && <p className="cb-sub">Carregando…</p>}
              {sel && extrato && extrato.phone === sel && (
                <>
                  <em className="cb-eyebrow">Extrato do cliente</em>
                  <b className="cb-name">{extrato.nome || 'Sem nome'}</b>
                  <span className="cb-sub">{formatPhoneDisplay(extrato.phone)}{extrato.venceEm ? ` · vale até ${dm(extrato.venceEm)}` : ''}</span>
                  <div className="cb-saldo"><b>{brl(extrato.saldo)}</b><span>de saldo</span></div>
                  <ul className="cb-mv">
                    {extrato.movs.length === 0 && <li className="cb-empty">Sem movimentos.</li>}
                    {extrato.movs.map((m, i) => {
                      const pos = m.tipo === 'credito' || m.tipo === 'estorno'
                      return (
                        <li key={i}>
                          <span className="cb-sub">{dm(m.data)}</span>
                          <div><b className={pos ? 'pos' : 'neg'}>{m.tipo === 'credito' ? 'Ganhou' : m.tipo === 'estorno' ? 'Devolvido' : m.tipo === 'expirado' ? 'Venceu' : 'Usou'} {pos ? '+' : '−'}{brl(m.valor)}</b>{m.origem && <small>{m.origem}</small>}</div>
                          <span className="cb-sub n" title="Saldo depois do movimento">{brl(m.saldoApos)}</span>
                        </li>
                      )
                    })}
                  </ul>
                  <small className="cb-sub">A coluna da direita é o saldo depois de cada movimento.</small>
                  <Link className="cb-btn" href="/painel/clientes">Abrir CRM</Link>
                </>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  )
}

const CSS = `
.cb,.cb *{box-sizing:border-box}
.cb{max-width:1180px;margin:0 auto;padding:20px 16px 60px;display:flex;flex-direction:column;gap:14px;font-family:'Archivo',system-ui,sans-serif;color:#151210}
.cb-top{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap}
.cb-top h1{margin:0;font-family:'Anton',sans-serif;font-weight:400;font-size:38px;line-height:1.1;text-transform:uppercase;letter-spacing:.02em}
.cb-eyebrow{display:block;font-style:normal;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6F6C67;font-weight:700}
.cb-rules{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13px;color:#6F6C67}
.cb-btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 14px;border:1px solid #151210;background:#fff;border-radius:6px;color:#151210;font-weight:600;font-size:13px;text-decoration:none;font-family:inherit}
.cb-sub{color:#6F6C67;font-size:13px}
.cb-err{background:#FBE6E3;color:#B3261A;border-radius:8px;padding:10px 14px;font-weight:600;font-size:14px}
.cb-warn{background:#FFF6D6;border:1px solid #EBD27C;border-radius:8px;padding:10px 14px;font-size:14px}
.cb-kpis{display:grid;grid-template-columns:1.3fr repeat(4,minmax(0,1fr));gap:10px}
.cb-kpi{background:#fff;border:1px solid #DCDDD6;border-radius:8px;padding:14px 16px;display:flex;flex-direction:column;gap:3px;min-width:0}
.cb-kpi em{font-style:normal;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6F6C67;font-weight:700}
.cb-kpi b{font-family:'Anton',sans-serif;font-weight:400;font-size:28px;line-height:1.1;font-variant-numeric:tabular-nums}
.cb-kpi small{font-size:12px;color:#6F6C67}
.cb-kpi.main{background:#FFC531;border-color:#FFC531}.cb-kpi.main em,.cb-kpi.main small{color:#151210}.cb-kpi.main b{font-size:34px}
.cb-kpi.alert em,.cb-kpi.alert b{color:#B42318}
.cb-jg{padding:16px 0 16px}
.cb-jg-h{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:0 16px 8px;flex-wrap:wrap}
.cb-jg-h h2{margin:0;font-family:'Anton',sans-serif;font-weight:400;font-size:24px;text-transform:uppercase;letter-spacing:.02em}
.cb-tag{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:6px 10px;border-radius:999px;background:#ECEDE7;color:#6F6C67;white-space:nowrap}
.cb-tag.on{background:#DDF3E7;color:#0F6B45}
.cb-jg-grp{padding:10px 16px;display:grid;gap:8px;border-top:1px solid #ECEDE7;margin-top:8px}
.cb-jg-grp b{display:block;font-size:14px}
.cb-jg-grp small{display:block;font-size:12.5px;color:#6F6C67;line-height:1.45}
.cb-jg-grp small b{display:inline;font-size:inherit;color:#151210}
.cb-jg-in{display:flex;gap:10px;flex-wrap:wrap}
.cb-jg-in label{display:grid;gap:4px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6F6C67}
.cb-jg-in label div{display:flex;align-items:center;gap:4px;border:1px solid #DCDDD6;border-radius:6px;padding:0 10px;background:#fff;min-height:44px}
.cb-jg-in input{width:54px;border:0;outline:0;font:inherit;font-size:16px;font-weight:700;color:#151210;background:transparent;text-align:right;font-variant-numeric:tabular-nums}
.cb-jg-in label div:focus-within{border-color:#151210;box-shadow:0 0 0 2px #FFC531}
.cb-jg-in i{font-style:normal;font-weight:700;color:#6F6C67}
.cb-ok{background:#DDF3E7;color:#0F6B45;border-radius:8px;padding:10px 14px;font-weight:600;font-size:14px}
.cb-jg-bt{display:flex;gap:10px;flex-wrap:wrap;padding:6px 16px 0}
.cb-btn.primary{background:#FFC531;border-color:#FFC531}
.cb-btn:disabled{opacity:.6}
.cb-cols{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:16px;align-items:start}
.cb-card{background:#fff;border:1px solid #DCDDD6;border-radius:8px;overflow:hidden;min-width:0}
.cb-tools{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 16px;flex-wrap:wrap}
.cb-chips{display:flex;gap:6px;flex-wrap:wrap}
.cb-chip{min-height:40px;padding:0 14px;border-radius:999px;border:1px solid #DCDDD6;background:#fff;font:inherit;font-size:13px;cursor:pointer;color:#151210}
.cb-chip.on{background:#151210;color:#fff;border-color:#151210}
.cb-search{min-height:40px;border:1px solid #DCDDD6;border-radius:6px;padding:0 12px;font:inherit;font-size:14px;width:210px;max-width:100%}
.cb-list{list-style:none;margin:0;padding:0}
.cb-row{display:grid;grid-template-columns:minmax(0,1.7fr) 100px 120px 120px;gap:12px;align-items:center;width:100%;min-height:56px;padding:6px 16px;border:0;border-top:1px solid #ECEDE7;background:#fff;font:inherit;font-size:14px;text-align:left;color:#151210;cursor:pointer}
.cb-row small{display:block;font-size:12px;color:#6F6C67;font-weight:400}
.cb-row.sel{background:#FFF1C7}
.cb-row.head{min-height:34px;background:#F5F6F2;border-top:0;cursor:default;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6F6C67;font-weight:700}
.cb-row .r{text-align:right}.n{font-variant-numeric:tabular-nums}
.cb-row .late{color:#B42318;font-weight:700}
.cb-empty{padding:18px 16px;margin:0;color:#6F6C67;font-size:14px;line-height:1.5}
.cb-ext{padding:16px;display:flex;flex-direction:column;gap:4px;position:sticky;top:12px}
.cb-name{font-size:18px}
.cb-saldo{display:flex;align-items:baseline;gap:8px;margin:8px 0 6px}.cb-saldo b{font-family:'Anton',sans-serif;font-weight:400;font-size:34px;font-variant-numeric:tabular-nums}.cb-saldo span{font-size:13px;color:#6F6C67}
.cb-mv{list-style:none;margin:0 0 8px;padding:0;max-height:420px;overflow-y:auto}
.cb-mv li{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:10px;padding:10px 0;border-top:1px solid #ECEDE7;font-size:13px}
.cb-mv small{display:block;font-size:12px;color:#6F6C67}
.cb-mv .pos{color:#0F8A57}.cb-mv .neg{color:#B42318}
@media(max-width:1000px){.cb-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.cb-kpi.main{grid-column:1/-1}.cb-cols{grid-template-columns:minmax(0,1fr)}.cb-ext{position:static}}
@media(max-width:640px){.cb-row{grid-template-columns:minmax(0,1fr) 92px 96px}.cb-row .hide-s{display:none}.cb-search{width:100%}.cb-top h1{font-size:32px}}
`
