'use client'
import ConfirmModal from './ConfirmModal'
import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'

// Calculadora inteligente das mesas (nov/2026). Duas formas de abrir:
//  - na tela de mesas: sem comanda, calculadora comum (o visor alimenta "dividir igual");
//  - dentro da comanda: já vem com consumo, serviço, total, falta e pago, divide
//    a conta igual ou por consumo de cada pessoa e cobra cada uma ali mesmo
//    (popup com nome + forma de pagamento → onPagar registra na comanda).
// A divisão fica guardada fora daqui (Divisao, no ComandaView) até a mesa fechar:
// fechar e abrir a calculadora não perde quem já pagou. Depois do 1º pagamento
// os valores ficam congelados, pra conta não mudar debaixo de quem já pagou.
export type CalcItem = { id: string; nome: string; qtd: string; total: number }
export type CalcComanda = {
  titulo: string
  consumo: number; total: number; falta: number; pago: number
  taxaPct: number; taxaAtiva: boolean
  itens: CalcItem[]
}
export type CalcPagto = { id: string; valor: number; forma: string; pessoa: string | null }
export type FormaPg = 'dinheiro' | 'cartao' | 'pix'
type Base = 'total' | 'falta' | 'consumo' | 'visor'
// Divisão congelada: quanto cada pessoa deve (alvo) e os ids dos pagamentos dela.
export type Congelada = { alvo: number[]; ids: string[][] }
export type Divisao = {
  base: Base; n: number; nomes: string[]; pc: number; atrib: Record<string, number[]>
  igual: Congelada | null; consumo: Congelada | null
}
export const DIVISAO0: Divisao = { base: 'total', n: 2, nomes: [], pc: 2, atrib: {}, igual: null, consumo: null }
type Props = {
  comanda?: CalcComanda | null; onClose: () => void
  pagtos?: CalcPagto[]
  divisao?: Divisao; setDivisao?: Dispatch<SetStateAction<Divisao>>
  // Registra o pagamento na comanda; devolve o id do pagamento ou null se deu erro.
  onPagar?: (valor: number, pessoa: string, forma: FormaPg) => Promise<string | null>
  erro?: string
}
const FORMAS_CALC: { key: FormaPg; label: string }[] = [{ key: 'dinheiro', label: 'Dinheiro' }, { key: 'cartao', label: 'Cartão' }, { key: 'pix', label: 'Pix' }]
const NOME_FORMA: Record<string, string> = { dinheiro: 'Dinheiro', cartao: 'Cartão', pix: 'Pix' }

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const brl = (n: number) => 'R$ ' + (Number.isFinite(n) ? n : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const nbr = (n: number) => (Number.isFinite(n) ? n : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const parse = (s: string) => { const v = parseFloat(s.replace(',', '.')); return Number.isFinite(v) ? v : 0 }
const toStr = (v: number) => String(Math.round(v * 1e6) / 1e6).replace('.', ',')
function splitEq(T: number, n: number): number[] {
  if (n < 1) return []
  const base = Math.floor(T * 100 / n) / 100
  return Array.from({ length: n }, (_, i) => i < n - 1 ? base : r2(T - base * (n - 1)))
}

const SEM_ITENS: CalcItem[] = []
type Op = '+' | '−' | '×' | '÷'
type Calc = { acc: number | null; op: Op | null; cur: string; expr: string; fresh: boolean; afterOp: boolean }
const CALC0: Calc = { acc: null, op: null, cur: '0', expr: '', fresh: true, afterOp: false }
function aplicar(a: number, op: Op, b: number): number {
  if (op === '+') return a + b
  if (op === '−') return a - b
  if (op === '×') return a * b
  return b === 0 ? 0 : a / b
}

type Tab = 'calc' | 'igual' | 'consumo'

const SEM_PAGTOS: CalcPagto[] = []

export default function MesaCalculadora({ comanda, onClose, pagtos = SEM_PAGTOS, divisao, setDivisao, onPagar, erro }: Props) {
  const [calc, setCalc] = useState<Calc>(CALC0)
  const [tab, setTab] = useState<Tab>('calc')
  // Dentro da comanda a divisão mora no ComandaView (sobrevive a fechar a calculadora);
  // na calculadora livre fica aqui mesmo.
  const [divLocal, setDivLocal] = useState<Divisao>({ ...DIVISAO0, base: comanda ? 'total' : 'visor' })
  const div = comanda && divisao ? divisao : divLocal
  const setDiv = comanda && setDivisao ? setDivisao : setDivLocal
  const upd = (p: Partial<Divisao>) => setDiv(d => ({ ...d, ...p }))
  const { base, nomes, atrib } = div
  const [cob, setCob] = useState<null | { modo: 'igual' | 'consumo' | 'livre'; i: number; valor: number; nome: string; forma: FormaPg }>(null)
  const [enviando, setEnviando] = useState(false)
  const [falhou, setFalhou] = useState(false)
  const [ultimaForma, setUltimaForma] = useState<FormaPg>('dinheiro')

  const pagoDeIds = (ids: string[] = []) => r2(ids.reduce((t, id) => t + Number(pagtos.find(x => x.id === id)?.valor || 0), 0))
  // A divisão só vale congelada enquanto algum pagamento dela ainda existe na comanda
  // (se o garçom remover todos, volta a ser calculada ao vivo).
  const ativa = (c: Congelada | null) => (c && c.ids.some(a => a.some(id => pagtos.some(x => x.id === id)))) ? c : null
  const igualTrava = ativa(div.igual)
  const consumoTrava = ativa(div.consumo)
  const n = igualTrava ? igualTrava.alvo.length : div.n
  const pc = consumoTrava ? consumoTrava.alvo.length : div.pc

  // ---------- teclado ----------
  function digit(d: string) {
    setCalc(s => {
      const novo = s.acc === null && !s.op && s.fresh && s.expr.endsWith('=') ? { ...s, expr: '' } : s
      if (novo.fresh) return { ...novo, cur: d, fresh: false, afterOp: false }
      if (novo.cur.replace(',', '').length >= 12) return novo
      return { ...novo, cur: novo.cur === '0' ? d : novo.cur + d, afterOp: false }
    })
  }
  function virgula() {
    setCalc(s => {
      if (s.fresh) return { ...s, cur: '0,', fresh: false, afterOp: false, expr: s.expr.endsWith('=') ? '' : s.expr }
      return s.cur.includes(',') ? s : { ...s, cur: s.cur + ',' }
    })
  }
  function apagar() { setCalc(s => (s.fresh ? s : { ...s, cur: s.cur.length > 1 ? s.cur.slice(0, -1) : '0' })) }
  function operador(o: Op) {
    setCalc(s => {
      if (s.afterOp && s.op) return { ...s, op: o, expr: `${nbr(s.acc ?? 0)} ${o}` }
      const v = parse(s.cur)
      const acc = s.acc !== null && s.op ? aplicar(s.acc, s.op, v) : v
      return { acc: Math.round(acc * 1e6) / 1e6, op: o, cur: toStr(acc), expr: `${nbr(acc)} ${o}`, fresh: true, afterOp: true }
    })
  }
  function igual() {
    setCalc(s => {
      if (s.acc === null || !s.op) return s
      const v = parse(s.cur)
      const res = aplicar(s.acc, s.op, v)
      return { acc: null, op: null, cur: toStr(res), expr: `${nbr(s.acc)} ${s.op} ${nbr(v)} =`, fresh: true, afterOp: false }
    })
  }
  function percent() {
    setCalc(s => {
      const v = parse(s.cur)
      const res = s.acc !== null && (s.op === '+' || s.op === '−') ? s.acc * v / 100 : v / 100
      return { ...s, cur: toStr(res), fresh: false, afterOp: false }
    })
  }
  function carregar(v: number) {
    setCalc(s => ({ ...s, cur: toStr(r2(v)), fresh: true, afterOp: false, expr: s.acc === null ? '' : s.expr }))
  }
  const [confZerar, setConfZerar] = useState(false)
  function zerarAgora() {
    setConfZerar(false)
    setCalc(CALC0); setDiv({ ...DIVISAO0, base: comanda ? 'total' : 'visor' })
  }
  function zerarTudo() {
    if (igualTrava || consumoTrava) { setConfZerar(true); return }
    zerarAgora()
  }

  const visor = r2(parse(calc.cur))
  const visorTxt = calc.fresh ? nbr(visor) : calc.cur

  // ---------- dividir igual ----------
  const baseVal = base === 'total' ? comanda?.total ?? 0 : base === 'falta' ? comanda?.falta ?? 0 : base === 'consumo' ? comanda?.consumo ?? 0 : visor
  const partesLive = useMemo(() => splitEq(r2(baseVal), div.n), [baseVal, div.n])
  const partes = igualTrava ? igualTrava.alvo : partesLive

  // ---------- por consumo ----------
  const itens = comanda?.itens ?? SEM_ITENS
  const livePc = div.pc
  const consumo = useMemo(() => {
    const sub = Array.from({ length: livePc }, () => 0)
    let semPessoa = 0
    for (const it of itens) {
      const sel = (atrib[it.id] || []).filter(p => p < livePc)
      if (sel.length === 0) { semPessoa = r2(semPessoa + it.total); continue }
      splitEq(it.total, sel.length).forEach((v, k) => { sub[sel[k]] = r2(sub[sel[k]] + v) })
    }
    const fator = comanda && comanda.consumo > 0 ? comanda.total / comanda.consumo : 1   // serviço e desconto, proporcional
    const tot = sub.map(v => r2(v * fator))
    if (comanda && semPessoa === 0 && itens.length > 0) {
      const dif = r2(comanda.total - tot.reduce((t, v) => t + v, 0))
      let ult = -1
      sub.forEach((v, i) => { if (v > 0) ult = i })
      if (ult >= 0 && dif !== 0) tot[ult] = r2(tot[ult] + dif)
    }
    const soma = r2(tot.reduce((t, v) => t + v, 0))
    return { sub, tot, semPessoa, confere: !!comanda && semPessoa === 0 && itens.length > 0 && Math.abs(soma - comanda.total) < 0.005, soma }
  }, [itens, atrib, livePc, comanda])
  const totConsumo = consumoTrava ? consumoTrava.alvo : consumo.tot

  function alternar(itemId: string, p: number) {
    if (consumoTrava) return
    setDiv(d => {
      const cur = d.atrib[itemId] || []
      return { ...d, atrib: { ...d.atrib, [itemId]: cur.includes(p) ? cur.filter(x => x !== p) : [...cur, p].sort((x, y) => x - y) } }
    })
  }

  // ---------- cobrança (popup nome + forma → registra na comanda) ----------
  const faltaCom = comanda ? comanda.falta : Infinity
  const podeCobrar = !!onPagar && faltaCom > 0.005
  function slot(modo: 'igual' | 'consumo', i: number) {
    const t = modo === 'igual' ? igualTrava : consumoTrava
    const alvo = modo === 'igual' ? (partes[i] ?? 0) : (totConsumo[i] ?? 0)
    const ids = t?.ids[i] || []
    const pago = pagoDeIds(ids)
    const resta = Math.max(0, r2(alvo - pago))
    const primeiro = ids.map(id => pagtos.find(x => x.id === id)).find(Boolean)
    return { alvo, pago, resta, paga: pago > 0 && resta <= 0.005, forma: primeiro?.forma, quem: nomes[i]?.trim() || primeiro?.pessoa || '' }
  }
  function abrirCobranca(modo: 'igual' | 'consumo' | 'livre', i: number, valor: number, nome: string) {
    if (!podeCobrar || !(valor > 0)) return
    setFalhou(false)
    setCob({ modo, i, valor: r2(Math.min(valor, faltaCom)), nome, forma: ultimaForma })
  }
  async function confirmarCobranca() {
    if (!cob || !onPagar || enviando) return
    setEnviando(true); setFalhou(false)
    const nome = cob.nome.trim()
    const id = await onPagar(cob.valor, nome, cob.forma)
    setEnviando(false)
    if (!id) { setFalhou(true); return }
    setUltimaForma(cob.forma)
    const { modo, i } = cob
    if (modo !== 'livre') {
      setDiv(d => {
        const atual = modo === 'igual' ? d.igual : d.consumo
        const viva = ativa(atual)
        const alvo = viva ? viva.alvo : (modo === 'igual' ? partesLive : consumo.tot)
        const ids = viva ? viva.ids.map(a => [...a]) : alvo.map(() => [] as string[])
        ids[i] = [...(ids[i] || []), id]
        const nomes2 = [...d.nomes]
        if (nome) nomes2[i] = nome
        const novo: Congelada = { alvo, ids }
        return modo === 'igual' ? { ...d, nomes: nomes2, igual: novo } : { ...d, nomes: nomes2, consumo: novo }
      })
    }
    setCob(null)
  }

  const rightTab: 'igual' | 'consumo' = tab === 'consumo' ? 'consumo' : 'igual'
  const basesOpt: [Base, string, number][] = comanda
    ? [['total', 'Total com serviço', comanda.total], ['falta', 'Falta pagar', comanda.falta], ['consumo', 'Só o consumo', comanda.consumo], ['visor', 'Valor do visor', visor]] 
    : [['visor', 'Valor do visor', visor]]

  const K = (label: string, onClick: () => void, cls = '', aria?: string, span = 1) => (
    <button key={label} className={`cc-k ${cls}`} style={span > 1 ? { gridColumn: `span ${span}` } : undefined} aria-label={aria} onClick={onClick}>{label}</button>
  )

  return (
    <div className="cc-ov" onClick={onClose}>
      <style>{CSS}</style>
      <div className="cc" data-tab={tab} onClick={e => e.stopPropagation()} role="dialog" aria-label="Calculadora">
        <div className="cc-head">
          <span className="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#151210" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" /><rect x="8" y="6" width="8" height="3" /><path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01" /></svg></span>
          <div className="t"><b>Calculadora</b><small>{comanda ? `${comanda.titulo} · valores já carregados` : 'Calculadora livre'}</small></div>
          <button className="x" aria-label="Fechar" onClick={onClose}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4f4c47" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        </div>

        <div className="cc-seg3">
          {([['calc', 'Calculadora'], ['igual', 'Dividir'], ['consumo', 'Consumo']] as [Tab, string][]).filter(([k]) => comanda || k !== 'consumo').map(([k, l]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>

        <div className="cc-body">
          <div className="cc-left">
            {comanda && (
              <>
                <span className="lbl">Valores da comanda</span>
                <div className="cc-chips">
                  {([['Consumo', comanda.consumo], ['Com serviço', comanda.total], ['Falta', comanda.falta], ['Pago', comanda.pago]] as [string, number][]).map(([l, v]) => (
                    <button key={l} onClick={() => carregar(v)}><em>{l}</em><b>{nbr(v)}</b></button>
                  ))}
                </div>
              </>
            )}
            <div className="cc-disp"><span className="ex">{calc.expr || ' '}</span><span className="rs">{visorTxt}</span></div>
            <div className="cc-pad">
              {K('Zerar', zerarTudo, 'zero')}{K('⌫', apagar, 'op', 'Apagar')}{K('%', percent, 'op')}{K('÷', () => operador('÷'), 'op', 'Dividir')}
              {K('7', () => digit('7'))}{K('8', () => digit('8'))}{K('9', () => digit('9'))}{K('×', () => operador('×'), 'op', 'Multiplicar')}
              {K('4', () => digit('4'))}{K('5', () => digit('5'))}{K('6', () => digit('6'))}{K('−', () => operador('−'), 'op', 'Subtrair')}
              {K('1', () => digit('1'))}{K('2', () => digit('2'))}{K('3', () => digit('3'))}{K('+', () => operador('+'), 'op', 'Somar')}
              {K('0', () => digit('0'), '', undefined, 2)}{K(',', virgula, '', 'Vírgula')}{K('=', igual, 'eq', 'Igual')}
            </div>
          </div>

          <div className="cc-right">
            {comanda && (
              <div className="cc-seg2">
                <button className={rightTab === 'igual' ? 'on' : ''} onClick={() => setTab('igual')}>Dividir igual</button>
                <button className={rightTab === 'consumo' ? 'on' : ''} onClick={() => setTab('consumo')}>Por consumo</button>
              </div>
            )}

            {rightTab === 'igual' && (
              <div className="cc-pane">
                <span className="lbl">Dividir qual valor</span>
                <div className="cc-bases">
                  {basesOpt.map(([k, l, v]) => (
                    <button key={k} className={base === k ? 'on' : ''} disabled={!!igualTrava} onClick={() => upd({ base: k })}><em>{l}</em><b>{nbr(igualTrava ? igualTrava.alvo.reduce((t, x) => t + x, 0) : v)}</b></button>
                  ))}
                </div>
                {igualTrava && (
                  <div className="cc-lock"><span>Divisão em andamento. Quem já pagou fica em verde e os valores não mudam.</span><button onClick={() => upd({ igual: null })}>Refazer divisão</button></div>
                )}
                <div className="cc-row">
                  <span className="lbl" style={{ flex: 1 }}>Pessoas</span>
                  <div className="cc-step">
                    <button aria-label="Menos uma pessoa" disabled={!!igualTrava} onClick={() => upd({ n: Math.max(1, div.n - 1) })}>−</button>
                    <b>{n}</b>
                    <button aria-label="Mais uma pessoa" disabled={!!igualTrava} onClick={() => upd({ n: Math.min(30, div.n + 1) })}>+</button>
                  </div>
                </div>
                <div className="cc-each"><span>Cada pessoa</span><b>{brl(partes[0] ?? 0)}</b></div>
                <div className="cc-people">
                  {partes.map((v, i) => {
                    const sl = slot('igual', i)
                    return (
                      <div key={i} className={`cc-p ${sl.paga ? 'paga' : ''}`}>
                        <input aria-label={`Nome da pessoa ${i + 1}`} placeholder={`Pessoa ${i + 1}`} value={nomes[i] || ''} readOnly={sl.paga}
                          onChange={e => setDiv(d => { const c = [...d.nomes]; c[i] = e.target.value; return { ...d, nomes: c } })} />
                        <b>{brl(sl.paga ? sl.pago : sl.pago > 0 ? sl.resta : v)}</b>
                        {sl.paga
                          ? <span className="ok">✓ Pago{sl.forma ? ` · ${NOME_FORMA[sl.forma] || sl.forma}` : ''}</span>
                          : podeCobrar && <button className="cb" disabled={!(sl.resta > 0)} onClick={() => abrirCobranca('igual', i, sl.resta, (nomes[i] || '').trim() || sl.quem)}>{sl.pago > 0 ? 'Cobrar o resto' : 'Cobrar'}</button>}
                      </div>
                    )
                  })}
                </div>
                <small className="hint">Os centavos que sobram vão para a última pessoa. A soma sempre fecha com o valor escolhido.</small>
              </div>
            )}

            {rightTab === 'consumo' && comanda && (
              <div className="cc-pane">
                <div className="cc-row">
                  <span className="lbl" style={{ flex: 1 }}>Toque na pessoa que consumiu</span>
                  <button className="cc-mini" disabled={!!consumoTrava} onClick={() => upd({ pc: Math.min(12, div.pc + 1) })}>+ pessoa</button>
                  {pc > 2 && <button className="cc-mini" disabled={!!consumoTrava} onClick={() => upd({ pc: Math.max(2, div.pc - 1) })}>− pessoa</button>}
                </div>
                {consumoTrava && (
                  <div className="cc-lock"><span>Divisão em andamento. Quem já pagou fica em verde e os itens ficam travados.</span><button onClick={() => upd({ consumo: null })}>Refazer divisão</button></div>
                )}
                {itens.length === 0 && <div className="hint">A comanda ainda não tem itens.</div>}
                <div className="cc-itens">
                  {itens.map(it => {
                    const sel = (atrib[it.id] || []).filter(p => p < pc)
                    return (
                      <div key={it.id} className="cc-it">
                        <div className="nm"><span>{it.qtd ? `${it.qtd} ` : ''}{it.nome}</span><small>{brl(it.total)}{sel.length > 1 ? ' · dividido' : ''}</small></div>
                        <div className="ps">
                          {Array.from({ length: pc }, (_, p) => (
                            <button key={p} aria-label={`Pessoa ${p + 1}`} aria-pressed={sel.includes(p)} disabled={!!consumoTrava} className={sel.includes(p) ? 'on' : ''} onClick={() => alternar(it.id, p)}>P{p + 1}</button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="cc-tiles" style={{ gridTemplateColumns: `repeat(${Math.min(pc, 4)},minmax(0,1fr))` }}>
                  {totConsumo.map((v, i) => {
                    const sl = slot('consumo', i)
                    return (
                      <div key={i} className={`t ${sl.paga ? 'paga' : ''}`}>
                        <em>{(nomes[i]?.trim() || `PESSOA ${i + 1}`).toUpperCase()}</em>
                        <b>{nbr(sl.paga ? sl.pago : sl.pago > 0 ? sl.resta : v)}</b>
                        <small>{consumoTrava ? (sl.paga ? `✓ Pago${sl.forma ? ` · ${NOME_FORMA[sl.forma] || sl.forma}` : ''}` : sl.pago > 0 ? 'falta pagar' : 'a pagar') : `consumo ${nbr(consumo.sub[i])}`}</small>
                        {!sl.paga && podeCobrar && <button disabled={!(sl.resta > 0)} onClick={() => abrirCobranca('consumo', i, sl.resta, nomes[i]?.trim() || sl.quem)}>{sl.pago > 0 ? 'Cobrar o resto' : 'Cobrar'}</button>}
                      </div>
                    )
                  })}
                </div>
                {consumo.semPessoa > 0
                  ? <div className="cc-chk warn"><span>Faltam atribuir itens</span><b>{brl(consumo.semPessoa)}</b></div>
                  : consumo.confere
                    ? <div className="cc-chk"><span>✓ Confere com a conta{comanda.taxaAtiva ? ` (com serviço ${comanda.taxaPct}%)` : ''}</span><b>{brl(comanda.total)}</b></div>
                    : null}
              </div>
            )}
          </div>
        </div>

        <div className="cc-foot">
          <button className="zr" onClick={zerarTudo}>Zerar tudo</button>
          <span className="tx">Zerar limpa o visor, a divisão e as pessoas, e a calculadora fica livre, como uma comum.</span>
          {podeCobrar && <button className="us" disabled={!(visor > 0)} onClick={() => abrirCobranca('livre', -1, visor, '')}>Cobrar {brl(visor)}</button>}
        </div>

        {confZerar && (
          <ConfirmModal perigo titulo="Zerar tudo?" mensagem="Isso apaga a divisão e as marcas de quem já pagou aqui. Os pagamentos continuam registrados na comanda."
            confirmar="Zerar tudo" onConfirm={zerarAgora} onCancel={() => setConfZerar(false)} />
        )}
        {cob && (
          <div className="cc-pop-ov" onClick={() => { if (!enviando) setCob(null) }}>
            <div className="cc-pop" role="dialog" aria-label="Registrar pagamento" onClick={e => e.stopPropagation()}>
              <span className="lbl">Registrar pagamento</span>
              <div className="v">{brl(cob.valor)}</div>
              <label className="nm"><span>Quem está pagando</span>
                <input autoFocus placeholder="Nome (opcional)" value={cob.nome} onChange={e => setCob(c => c && { ...c, nome: e.target.value })} />
              </label>
              <span className="lbl">Forma de pagamento</span>
              <div className="fm">
                {FORMAS_CALC.map(f => <button key={f.key} className={cob.forma === f.key ? 'on' : ''} onClick={() => setCob(c => c && { ...c, forma: f.key })}>{f.label}</button>)}
              </div>
              {falhou && erro && <div className="er">{erro}</div>}
              <div className="ac">
                <button className="cn" disabled={enviando} onClick={() => setCob(null)}>Cancelar</button>
                <button className="ok" disabled={enviando} onClick={confirmarCobranca}>{enviando ? 'Registrando…' : 'Confirmar pagamento'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const CSS = `
.cc-ov{position:fixed;inset:0;z-index:95;background:rgba(21,18,16,.6);display:flex;align-items:center;justify-content:center;padding:16px;font-family:'Archivo',system-ui,sans-serif;color:#151210}
.cc,.cc *{box-sizing:border-box}
.cc button{font-family:inherit;cursor:pointer}
.cc{position:relative;width:min(1100px,100%);height:min(740px,100%);background:#fff;border-radius:14px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.35)}
.cc-head{flex:none;display:flex;align-items:center;gap:14px;padding:14px 20px;border-bottom:1px solid #DCDDD6}
.cc-head .ic{width:38px;height:38px;border-radius:8px;background:#FFC531;display:flex;align-items:center;justify-content:center;flex:none}
.cc-head .t{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}.cc-head .t b{font-family:'Anton',sans-serif;font-weight:400;font-size:24px;text-transform:uppercase;line-height:1}.cc-head .t small{font-size:12.5px;color:#4f4c47}
.cc-head .x{width:44px;height:44px;border:1px solid #DCDDD6;border-radius:8px;background:#fff;display:flex;align-items:center;justify-content:center;flex:none}
.cc-seg3{display:none}
.cc-body{flex:1;min-height:0;display:flex}
.cc-left{width:400px;flex:none;padding:18px 20px;display:flex;flex-direction:column;gap:12px;border-right:1px solid #DCDDD6;overflow-y:auto}
.cc-right{flex:1;min-width:0;padding:18px 22px;display:flex;flex-direction:column;gap:14px;overflow-y:auto}
.lbl{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#4f4c47;font-weight:700}
.cc-chips{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
.cc-chips button,.cc-bases button{border:1px solid #b9bab2;background:#fff;border-radius:6px;color:#151210;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;min-width:0;padding:4px}
.cc-chips button{height:46px}.cc-chips em,.cc-bases em{font-style:normal;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#4f4c47;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cc-chips b{font-size:13px;font-variant-numeric:tabular-nums}
.cc-disp{background:#FFF6D6;border:1px solid #EBD27C;border-radius:10px;padding:10px 16px;min-height:104px;display:flex;flex-direction:column;justify-content:center;align-items:flex-end;gap:2px;overflow:hidden}
.cc-disp .ex{font-size:14px;color:#5C3F00;font-variant-numeric:tabular-nums;white-space:pre}.cc-disp .rs{font-family:'Anton',sans-serif;font-size:44px;line-height:1.05;font-variant-numeric:tabular-nums;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.cc-pad{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.cc-k{height:56px;border:1px solid #b9bab2;border-radius:8px;background:#fff;color:#151210;font-weight:600;font-size:20px;font-variant-numeric:tabular-nums}
.cc-k.op{background:#F1EFE6;border-color:#D7D3C4}.cc-k.zero{color:#B3261A;border-color:#E7B9B3;font-size:15px;font-weight:700}.cc-k.eq{background:#FFC531;border-color:#151210;font-weight:700}
.cc-seg2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
.cc-seg2 button,.cc-seg3 button{height:44px;border:1px solid #b9bab2;border-radius:6px;background:#fff;color:#151210;font-weight:600;font-size:14px}
.cc-seg2 button.on,.cc-seg3 button.on{background:#FFC531;border:2px solid #151210;font-weight:700}
.cc-pane{display:flex;flex-direction:column;gap:12px}
.cc-bases{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:6px}
.cc-bases button{min-height:52px;align-items:flex-start;text-align:left;padding:6px 8px}.cc-bases b{font-size:15px;font-variant-numeric:tabular-nums}.cc-bases button.on{background:#FFF6D6;border:2px solid #151210}
.cc-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.cc-step{display:flex;align-items:center;border:1px solid #b9bab2;border-radius:8px;overflow:hidden;background:#fff}
.cc-step button{width:48px;height:44px;border:0;background:#F1EFE6;font-size:22px;font-weight:700}.cc-step b{width:56px;text-align:center;font-family:'Anton',sans-serif;font-weight:400;font-size:26px}
.cc-each{background:#FFF6D6;border:1px solid #EBD27C;border-radius:10px;padding:10px 16px;display:flex;justify-content:space-between;align-items:center}
.cc-each span{font-weight:700;font-size:12.5px;letter-spacing:.08em;text-transform:uppercase;color:#5C3F00}.cc-each b{font-family:'Anton',sans-serif;font-weight:400;font-size:34px;line-height:1;font-variant-numeric:tabular-nums}
.cc-people{display:flex;flex-direction:column;gap:6px}
.cc-p{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:10px;background:#F5F6F2;border-radius:8px;padding:6px 6px 6px 12px;min-height:50px}
.cc-p input{border:0;background:transparent;font-size:14px;font-weight:600;min-width:0;width:100%;outline:0;color:#151210}.cc-p b{font-size:16px;font-variant-numeric:tabular-nums}
.cc-p.paga{background:#DDF1E7}.cc-p.paga input{color:#0B5B38}.cc-p .ok{height:36px;display:flex;align-items:center;padding:0 12px;border-radius:6px;background:#0B7347;color:#fff;font-weight:700;font-size:12.5px;white-space:nowrap}
.cc-tiles .t.paga{background:#DDF1E7}.cc-tiles .t.paga small{color:#0B5B38;font-weight:700}
.cc-lock{display:flex;align-items:center;gap:10px;background:#FFF3C9;border-radius:8px;padding:8px 12px;font-size:12.5px;color:#5C3F00;line-height:1.35}.cc-lock span{flex:1}
.cc-lock button{height:34px;padding:0 12px;border:1px solid #5C3F00;border-radius:6px;background:#fff;color:#5C3F00;font-weight:700;font-size:12.5px;white-space:nowrap}
.cc-bases button:disabled,.cc-step button:disabled,.cc-mini:disabled,.cc-it .ps button:disabled{opacity:.55;cursor:not-allowed}
.cc-pop-ov{position:absolute;inset:0;z-index:5;background:rgba(21,18,16,.55);display:flex;align-items:center;justify-content:center;padding:16px}
.cc-pop{width:min(420px,100%);background:#fff;border-radius:12px;padding:20px;display:flex;flex-direction:column;gap:12px;box-shadow:0 12px 40px rgba(0,0,0,.35)}
.cc-pop .v{font-family:'Anton',sans-serif;font-size:42px;line-height:1;font-variant-numeric:tabular-nums}
.cc-pop .nm{display:flex;flex-direction:column;gap:5px}.cc-pop .nm span{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#4f4c47;font-weight:700}
.cc-pop .nm input{height:48px;border:1px solid #b9bab2;border-radius:8px;padding:0 12px;font-size:16px;font-family:inherit;color:#151210;min-width:0}
.cc-pop .fm{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.cc-pop .fm button{height:48px;border:1px solid #b9bab2;border-radius:6px;background:#fff;font-weight:600;font-size:14.5px;color:#151210}.cc-pop .fm button.on{background:#FFC531;border:2px solid #151210;font-weight:700}
.cc-pop .er{background:#FBE6E3;color:#B3261A;border-radius:8px;padding:8px 12px;font-size:13px;font-weight:600}
.cc-pop .ac{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.6fr);gap:8px;margin-top:4px}
.cc-pop .ac button{height:52px;border-radius:10px;font-weight:700;font-size:15px}.cc-pop .ac .cn{border:1px solid #b9bab2;background:#fff;color:#151210}.cc-pop .ac .ok{border:0;background:#0B7347;color:#fff}.cc-pop .ac button:disabled{opacity:.55;cursor:not-allowed}
.cc-p .cb,.cc-tiles .t button{height:36px;padding:0 12px;border:1px solid #2A4E7A;border-radius:6px;background:#fff;color:#2A4E7A;font-weight:700;font-size:12.5px}
.cc .hint{font-size:12.5px;color:#4f4c47;line-height:1.4}
.cc-mini{height:34px;padding:0 10px;border:1px solid #b9bab2;border-radius:6px;background:#fff;font-weight:600;font-size:12.5px;color:#151210}
.cc-itens{display:flex;flex-direction:column}
.cc-it{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;padding:8px 0;border-top:1px solid #ECEDE8}
.cc-it .nm{min-width:0;display:flex;flex-direction:column;gap:1px}.cc-it .nm span{font-weight:600;font-size:14px}.cc-it .nm small{font-size:12.5px;color:#4f4c47;font-variant-numeric:tabular-nums}
.cc-it .ps{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;max-width:260px}
.cc-it .ps button{width:36px;height:36px;border:1px solid #b9bab2;border-radius:6px;background:#fff;font-weight:600;font-size:12.5px;color:#4f4c47}.cc-it .ps button.on{background:#FFC531;border:2px solid #151210;color:#151210;font-weight:700}
.cc-tiles{display:grid;gap:6px}
.cc-tiles .t{background:#F5F6F2;border-radius:8px;padding:8px 10px;display:flex;flex-direction:column;gap:2px;min-width:0}
.cc-tiles .t em{font-style:normal;font-size:11px;font-weight:700;color:#4f4c47}.cc-tiles .t b{font-size:17px;font-variant-numeric:tabular-nums}.cc-tiles .t small{font-size:11.5px;color:#4f4c47;font-variant-numeric:tabular-nums}
.cc-tiles .t button{margin-top:4px;height:32px}.cc-tiles .t button:disabled,.cc-p .cb:disabled{opacity:.4;cursor:not-allowed}
.cc-chk{display:flex;justify-content:space-between;align-items:center;gap:10px;background:#DDF1E7;border-radius:8px;padding:10px 14px;color:#0B5B38;font-weight:700;font-size:13.5px}
.cc-chk.warn{background:#FFF3C9;color:#5C3F00}
.cc-foot{flex:none;display:flex;align-items:center;gap:10px;padding:14px 20px;border-top:1px solid #DCDDD6;background:#F5F6F2}
.cc-foot .zr{height:50px;padding:0 18px;border:1px solid #E7B9B3;border-radius:10px;background:#fff;color:#B3261A;font-weight:700;font-size:14.5px}
.cc-foot .tx{flex:1;font-size:12.5px;color:#4f4c47;line-height:1.35}
.cc-foot .us{height:50px;padding:0 22px;border:0;border-radius:10px;background:#2A4E7A;color:#fff;font-weight:700;font-size:15px}.cc-foot .us:disabled{opacity:.45;cursor:not-allowed}
@media(max-width:1000px){
  .cc{width:min(780px,100%)}
  .cc-body{flex-direction:column;overflow-y:auto}
  .cc-left{width:auto;border-right:0;border-bottom:1px solid #DCDDD6;overflow:visible;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px 16px}
  .cc-left .lbl,.cc-left .cc-chips{grid-column:1}.cc-left .cc-disp{grid-column:1}.cc-left .cc-pad{grid-column:2;grid-row:1 / span 3}
  .cc-right{overflow:visible}
}
@media(max-width:699px){
  .cc-ov{padding:0}.cc{width:100%;height:100%;border-radius:0}
  .cc-head{background:#151210;color:#fff;padding:12px 14px}.cc-head .t small{color:#D6D0C6}.cc-head .x{border-color:#4a423a;background:transparent}.cc-head .x svg{stroke:#fff}
  .cc-seg3{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:6px;padding:12px 14px 0}
  .cc-seg2{display:none}
  .cc-left{display:flex;padding:12px 14px;border-bottom:0}.cc-right{padding:12px 14px}
  .cc[data-tab=calc] .cc-right{display:none}.cc:not([data-tab=calc]) .cc-left{display:none}
  .cc:not([data-tab=calc]) .cc-foot .us{display:none}
  .cc-foot{padding:12px 14px calc(18px + env(safe-area-inset-bottom));background:#fff}.cc-foot .tx{display:none}.cc-foot .us{flex:1}.cc-foot .zr{height:52px}
  .cc-it .ps{max-width:none}
}
`
