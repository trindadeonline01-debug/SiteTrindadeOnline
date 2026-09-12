'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { usePainelShell } from '@/contexts/PainelShellContext'

type LojaMotoboy = { id: string; nome: string; whatsapp: string; ativo: boolean; created_at: string }
type PedidoEntrega = { motoboy_id: string; delivery_fee: number; created_at: string }
type Filtro = 'hoje' | 'ontem' | '7d' | 'mes'

function fmt(n: number) { return 'R$ ' + n.toFixed(2).replace('.', ',') }
function sameDay(a: Date, b: Date) { return a.toDateString() === b.toDateString() }
function diasAtras(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d }

// Cadastro de motoboy PRÓPRIO da loja (nome + WhatsApp, sem valor por
// entrega — a taxa já vem do pedido, calculada por bairro) e o relatório
// de quantas entregas cada um fez e quanto tem a receber, por período —
// mockup aprovado por Ricardo, set/2026. Não tem nada a ver com o motoboy
// da plataforma (Trindade Entrega, /painel/entrega) — são dois recursos
// independentes; a loja pode usar um, outro, os dois ou nenhum. Visual
// alinhado ao padrão de /painel/entrega (mesmo topbar, tabs e cards) —
// pedido do Ricardo, set/2026: a página estava fora do padrão do resto do
// painel.
export default function MotoboysPage() {
  const { company, loading: shellLoading } = usePainelShell()
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'relatorio' | 'cadastro'>('relatorio')

  const [motoboys, setMotoboys] = useState<LojaMotoboy[]>([])
  const [entregas, setEntregas] = useState<PedidoEntrega[]>([])

  const [nome, setNome] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const [filtro, setFiltro] = useState<Filtro>('hoje')
  const [diaPersonalizado, setDiaPersonalizado] = useState<Date | null>(null)
  const [calAberto, setCalAberto] = useState(false)
  const [calMes, setCalMes] = useState(new Date())

  useEffect(() => {
    if (shellLoading) return
    if (!company || !company.loja_digital_enabled) { window.location.href = '/painel/compartilhar'; return }
    carregar(company.id)
    setLoading(false)
  }, [shellLoading, company?.id])

  async function carregar(companyId: string) {
    const { data: mb } = await supabase.from('loja_motoboys').select('*').eq('company_id', companyId).order('created_at')
    setMotoboys((mb || []) as LojaMotoboy[])
    // Últimos 90 dias já cobre "esse mês" e "personalizado" dentro de um
    // mês pra trás — sem precisar buscar de novo a cada troca de filtro.
    const desde = diasAtras(90).toISOString()
    const { data: ped } = await supabase.from('loja_pedidos').select('motoboy_id, delivery_fee, created_at')
      .eq('company_id', companyId).not('motoboy_id', 'is', null).gte('created_at', desde)
    setEntregas((ped || []) as PedidoEntrega[])
  }

  async function addMotoboy() {
    setErro('')
    if (!nome.trim() || !whatsapp.trim()) { setErro('Preenche nome e WhatsApp.'); return }
    if (!company) return
    setSalvando(true)
    const { error } = await supabase.from('loja_motoboys').insert({ company_id: company.id, nome: nome.trim(), whatsapp: whatsapp.trim() })
    setSalvando(false)
    if (error) { setErro('Não deu pra cadastrar — tenta de novo.'); return }
    setNome(''); setWhatsapp('')
    carregar(company.id)
  }
  async function toggleAtivo(m: LojaMotoboy) {
    await supabase.from('loja_motoboys').update({ ativo: !m.ativo }).eq('id', m.id)
    if (company) carregar(company.id)
  }
  async function removerMotoboy(m: LojaMotoboy) {
    if (!confirm(`Excluir ${m.nome}? Não dá pra desfazer.`)) return
    await supabase.from('loja_motoboys').delete().eq('id', m.id)
    if (company) carregar(company.id)
  }

  function noPeriodo(d: Date): boolean {
    const now = new Date()
    if (diaPersonalizado) return sameDay(d, diaPersonalizado)
    if (filtro === 'hoje') return sameDay(d, now)
    if (filtro === 'ontem') return sameDay(d, diasAtras(1))
    if (filtro === '7d') return d >= diasAtras(7)
    if (filtro === 'mes') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    return true
  }
  function escolherFiltro(f: Filtro) { setFiltro(f); setDiaPersonalizado(null); setCalAberto(false) }
  function escolherDia(ano: number, mes: number, dia: number) { setDiaPersonalizado(new Date(ano, mes, dia)); setCalAberto(false) }

  const filtradas = entregas.filter(e => noPeriodo(new Date(e.created_at)))
  const porMotoboy = new Map<string, { count: number; total: number }>()
  filtradas.forEach(e => {
    const cur = porMotoboy.get(e.motoboy_id) || { count: 0, total: 0 }
    cur.count++; cur.total += Number(e.delivery_fee) || 0
    porMotoboy.set(e.motoboy_id, cur)
  })
  const totalCount = filtradas.length
  const totalValor = filtradas.reduce((s, e) => s + (Number(e.delivery_fee) || 0), 0)

  const periodoLabel = diaPersonalizado
    ? diaPersonalizado.toLocaleDateString('pt-BR')
    : { hoje: 'hoje', ontem: 'ontem', '7d': 'últimos 7 dias', mes: 'esse mês' }[filtro]

  if (loading) return null

  return (
    <div className="mb-wrap">
      <style>{`
        /* Mesmo padrão visual de /painel/entrega — topbar com título Anton +
           tabs em pílula, cards brancos com kicker em caixa alta. */
        *{box-sizing:border-box;}
        .mb-wrap{ width:100%;max-width:820px;font-family:'Archivo',sans-serif;font-size:13px;color:var(--ink);padding:16px 14px 40px; }
        @media(min-width:1024px){ .mb-wrap{ padding:24px 32px 40px; } }
        .mb-topbar{ display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:10px; }
        .mb-title{ font-family:'Anton',sans-serif;font-size:20px;letter-spacing:.5px;margin:0;flex:none; }
        .mb-tabs{ display:flex;gap:6px;background:#F0EDE8;border-radius:10px;padding:3px;flex:none; }
        .mb-tab{ border:none;background:none;padding:7px 13px;border-radius:8px;font-size:12px;font-weight:700;color:#6E6656;cursor:pointer;font-family:inherit; }
        .mb-tab.on{ background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.12); }
        .mb-head-sub{ font-size:12px;color:#6E6656;margin:0 0 16px;line-height:1.5; }
        .mb-card{ background:#fff;border:1px solid #EDE8E0;border-radius:14px;padding:16px 18px;margin-bottom:14px; }
        .mb-kicker{ font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#A79E8B;margin-bottom:12px; }
        .mb-filters{ display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px; align-items:center; position:relative; }
        .mb-chip{ padding:7px 13px; border-radius:20px; border:1.5px solid #EDE8E0; background:#fff; font-size:12px; font-weight:700; cursor:pointer; color:#111; font-family:inherit; }
        .mb-chip.on{ background:#111; color:var(--sign, #FFC531); border-color:#111; }
        .mb-cal{ position:absolute; top:calc(100% + 8px); left:0; background:#fff; border:1px solid #EDE8E0; border-radius:12px; padding:14px; box-shadow:0 12px 30px rgba(0,0,0,.18); z-index:20; width:260px; }
        .mb-cal-hdr{ display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; font-size:13px; font-weight:800; text-transform:uppercase; }
        .mb-cal-hdr button{ background:none; border:none; font-size:15px; cursor:pointer; }
        .mb-cal-grid{ display:grid; grid-template-columns:repeat(7,1fr); gap:3px; }
        .mb-cal-dow{ font-size:9.5px; color:#A79E8B; text-align:center; font-weight:700; padding-bottom:4px; }
        .mb-cal-day{ aspect-ratio:1; display:flex; align-items:center; justify-content:center; font-size:12px; border-radius:7px; cursor:pointer; border:none; background:none; color:#111; font-family:inherit; }
        .mb-cal-day:hover{ background:#F5F6F2; }
        .mb-cal-day.sel{ background:var(--sign, #FFC531); font-weight:800; }
        .mb-cal-day.mut{ color:#A79E8B; opacity:.4; }
        .mb-rep-period{ font-size:12px; color:#6E6656; margin-bottom:10px; }
        table.mb-rep{ width:100%; border-collapse:collapse; font-size:13px; }
        table.mb-rep th{ text-align:left; font-size:10.5px; text-transform:uppercase; letter-spacing:.05em; color:#A79E8B; padding:8px 10px; border-bottom:2px solid #EDE8E0; }
        table.mb-rep td{ padding:11px 10px; border-bottom:1px solid #EDE8E0; }
        table.mb-rep tr:last-child td{ border-bottom:none; }
        .mb-num{ font-variant-numeric:tabular-nums; }
        .mb-total-row td{ font-weight:800; background:#F5F6F2; }
        .mb-empty{ padding:26px; text-align:center; color:#A79E8B; font-size:12.5px; }
        .mb-row{ display:flex; align-items:center; gap:12px; padding:11px 0; border-bottom:1px solid #EDE8E0; }
        .mb-row:last-child{ border-bottom:none; }
        .mb-avatar{ width:38px; height:38px; border-radius:50%; background:#F5F6F2; display:flex; align-items:center; justify-content:center; font-size:17px; flex:0 0 auto; }
        .mb-body{ flex:1; min-width:0; }
        .mb-name{ font-size:13.5px; font-weight:700; color:#111; }
        .mb-sub{ font-size:11.5px; color:#A79E8B; margin-top:1px; }
        .mb-actions{ display:flex; gap:6px; flex:0 0 auto; }
        .mb-btn{ font-family:inherit;font-size:12.5px;font-weight:750;border-radius:9px;border:1.5px solid #EDE8E0;background:#fff;color:#111;cursor:pointer;padding:9px 15px; }
        .mb-btn-gold{ background:var(--sign);color:var(--ink);border:none; }
        .mb-btn-gold:disabled{ opacity:.5;cursor:not-allowed; }
        .mb-btn.ghost-red{ border-color:#F3D9D6; color:#D6392B; }
        .mb-btn.sm{ padding:5px 10px; font-size:11px; }
        .mb-btn.full{ width:100%; }
        .mb-form-grid{ display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:4px; }
        .mb-form-grid label{ font-size:11px; font-weight:700; color:#A79E8B; display:block; margin-bottom:4px; text-transform:uppercase; letter-spacing:.03em; }
        .mb-form-grid input{ width:100%; border:1.5px solid #EDE8E0; border-radius:8px; padding:9px 11px; font-size:13px; font-family:inherit; box-sizing:border-box; }
        .mb-erro{ color:#C43D3D; font-size:11.5px; margin-top:10px; }
        @media(max-width:480px){ .mb-form-grid{ grid-template-columns:1fr; } }
      `}</style>

      <div className="mb-topbar">
        <h1 className="mb-title">🏍️ Meus motoboys</h1>
        <div className="mb-tabs">
          <button className={`mb-tab ${tab === 'relatorio' ? 'on' : ''}`} onClick={() => setTab('relatorio')}>📊 Relatórios</button>
          <button className={`mb-tab ${tab === 'cadastro' ? 'on' : ''}`} onClick={() => setTab('cadastro')}>🏍️ Cadastro</button>
        </div>
      </div>
      <p className="mb-head-sub">Motoboy próprio da loja — sem valor fixo por entrega, a taxa já vem do pedido. Não tem nada a ver com o motoboy da plataforma (Trindade Entrega, em "Entrega e retirada"); são dois recursos independentes.</p>

      {tab === 'relatorio' && (
        <section>
          <div className="mb-filters">
            <div className={`mb-chip ${!diaPersonalizado && filtro === 'hoje' ? 'on' : ''}`} onClick={() => escolherFiltro('hoje')}>Hoje</div>
            <div className={`mb-chip ${!diaPersonalizado && filtro === 'ontem' ? 'on' : ''}`} onClick={() => escolherFiltro('ontem')}>Ontem</div>
            <div className={`mb-chip ${!diaPersonalizado && filtro === '7d' ? 'on' : ''}`} onClick={() => escolherFiltro('7d')}>Últimos 7 dias</div>
            <div className={`mb-chip ${!diaPersonalizado && filtro === 'mes' ? 'on' : ''}`} onClick={() => escolherFiltro('mes')}>Esse mês</div>
            <div className={`mb-chip ${diaPersonalizado ? 'on' : ''}`} onClick={() => { setCalMes(diaPersonalizado || new Date()); setCalAberto(v => !v) }}>📅 Personalizado</div>
            {calAberto && (
              <div className="mb-cal">
                <div className="mb-cal-hdr">
                  <button onClick={() => setCalMes(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>‹</button>
                  <span>{calMes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span>
                  <button onClick={() => setCalMes(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>›</button>
                </div>
                <div className="mb-cal-grid">
                  {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map(d => <div key={d} className="mb-cal-dow">{d}</div>)}
                  {(() => {
                    const ano = calMes.getFullYear(), mes = calMes.getMonth()
                    const offset = (new Date(ano, mes, 1).getDay() + 6) % 7
                    const diasNoMes = new Date(ano, mes + 1, 0).getDate()
                    const hoje = new Date()
                    const cels = []
                    for (let i = 0; i < offset; i++) cels.push(<div key={'b' + i} />)
                    for (let d = 1; d <= diasNoMes; d++) {
                      const data = new Date(ano, mes, d)
                      const sel = diaPersonalizado && sameDay(data, diaPersonalizado)
                      const futuro = data > hoje
                      cels.push(
                        <button key={d} className={`mb-cal-day ${sel ? 'sel' : ''} ${futuro ? 'mut' : ''}`} disabled={futuro} onClick={() => escolherDia(ano, mes, d)}>{d}</button>
                      )
                    }
                    return cels
                  })()}
                </div>
              </div>
            )}
          </div>

          <div className="mb-card">
            <div className="mb-rep-period">Mostrando: {periodoLabel}</div>
            <table className="mb-rep">
              <thead><tr><th>Motoboy</th><th>Nº entregas</th><th>Total a receber</th></tr></thead>
              <tbody>
                {porMotoboy.size === 0 ? (
                  <tr><td colSpan={3} className="mb-empty">Nenhuma entrega nesse período.</td></tr>
                ) : (
                  <>
                    {[...porMotoboy.entries()].map(([mbId, d]) => (
                      <tr key={mbId}>
                        <td>{motoboys.find(m => m.id === mbId)?.nome || 'Motoboy removido'}</td>
                        <td className="mb-num">{d.count}</td>
                        <td className="mb-num">{fmt(d.total)}</td>
                      </tr>
                    ))}
                    <tr className="mb-total-row">
                      <td>Total</td><td className="mb-num">{totalCount}</td><td className="mb-num">{fmt(totalValor)}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'cadastro' && (
        <section>
          <div className="mb-card">
            <div className="mb-kicker">Cadastrados ({motoboys.length})</div>
            {motoboys.length === 0 ? (
              <div className="mb-empty">Nenhum motoboy cadastrado ainda — adiciona o primeiro abaixo.</div>
            ) : motoboys.map(m => (
              <div className="mb-row" key={m.id}>
                <div className="mb-avatar">🏍️</div>
                <div className="mb-body">
                  <div className="mb-name">{m.nome} {!m.ativo && <span style={{ color: '#A79E8B', fontWeight: 600, fontSize: 11 }}>(pausado)</span>}</div>
                  <div className="mb-sub">{m.whatsapp}</div>
                </div>
                <div className="mb-actions">
                  <button className="mb-btn sm" onClick={() => toggleAtivo(m)}>{m.ativo ? '⏸ Pausar' : '▶ Ativar'}</button>
                  <button className="mb-btn sm ghost-red" onClick={() => removerMotoboy(m)}>🗑</button>
                </div>
              </div>
            ))}
          </div>

          <div className="mb-card">
            <div className="mb-kicker">+ Novo motoboy</div>
            <div className="mb-form-grid">
              <div><label>Nome</label><input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Carlinhos" /></div>
              <div><label>WhatsApp</label><input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="21 99999-9999" /></div>
            </div>
            {erro && <div className="mb-erro">{erro}</div>}
            <button className="mb-btn mb-btn-gold full" style={{ marginTop: 14 }} disabled={salvando} onClick={addMotoboy}>{salvando ? 'Cadastrando...' : '+ Cadastrar motoboy'}</button>
          </div>
        </section>
      )}
    </div>
  )
}
