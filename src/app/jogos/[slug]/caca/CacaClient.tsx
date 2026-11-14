'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// Caça-Palavras (tela). O servidor monta a grade e confere cada seleção (/api/jogos/caca); aqui só se desenha e se arrasta o dedo.
// Fluxo: Começar → grade (2 por nível, tempo zera) → nível concluído (ir para o próximo ou parar) → fim.
// Dois modos: página de jogos (`loja`, só ranking) e QR da mesa (`mesa`, o % garantido vira cashback quando a conta é paga).

type Pal = { id: number; cor: number; achada: boolean; texto?: string; dica?: string; tam?: number; cells?: [number, number][] }
type Rod = {
  id: string; estado: 'jogando' | 'entre_niveis' | 'encerrada'; fim: string | null; nivel: number; nomeNivel: string; niveis: number; parte: number; partes: number
  pontos: number; pontosNivel: number; melhorNivel: number; tamanho: number; letras: string[]; lista: 'full' | 'dica' | 'oculta'
  total: number; restante: number; espera: number; ajudas: { tempo: number; emb: number; troca: number }; palavras: Pal[]
  marco: number; premio: boolean; bloqueado: boolean
}
type NivelRes = { nivel: number; nome: string; pontosNivel: number; tempoUsado: number | null; estrelas: number; ultimo: boolean; marco: number }
type Meta = { loja: string; slug: string; premio: boolean; bloqueado: boolean; mesaNumero: string | number | null; bonus: number[] }
const PORTAO = 3     // até o nível 3 é fase segura; depois, tempo esgotado perde o bônus (mesmo valor do servidor)
const BONUS_PADRAO = [2, 3, 5, 8, 10]   // só até o servidor responder; a loja configura os valores de verdade
type Tela = 'carregando' | 'intro' | 'jogo' | 'parte' | 'nivel' | 'fim'

const CORES = ['#7FD6C2', '#6FC6F0', '#F2A7C3', '#A9C8FF', '#C6A8FF', '#FFB38A', '#B5E48C', '#E6B8A2', '#F7C6FF']
const NIVEIS_INFO = [
  { n: 1, nome: 'Grumete', g: '9×9', pal: 6, dir: '→ ↓ ↘ ↗', extra: 'lista visível' },
  { n: 2, nome: 'Marujo', g: '10×10', pal: 7, dir: '→ ← ↓ ↑ ↘ ↗', extra: 'lista visível' },
  { n: 3, nome: 'Pescador', g: '11×11', pal: 8, dir: '8 direções', extra: 'falsos começos' },
  { n: 4, nome: 'Mestre', g: '12×12', pal: 9, dir: '8 direções', extra: 'só a 1ª letra' },
  { n: 5, nome: 'Capitão', g: '13×13', pal: 10, dir: '8 direções', extra: 'lista escondida' },
]
const AJUDAS: { k: 'tempo' | 'emb' | 'troca'; nome: string; sub: string }[] = [
  { k: 'tempo', nome: 'Mais tempo', sub: '+30 s' },
  { k: 'emb', nome: 'Embaralhar', sub: 'mantém as achadas' },
  { k: 'troca', nome: 'Trocar palavras', sub: 'mantém as achadas' },
]
const ICONES: Record<string, React.ReactNode> = {
  tempo: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 9v4l2.5 2M9 2.5h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>,
  emb: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h3.5c5 0 6 10 11 10H21M3 17h3.5c1.6 0 2.8-.7 3.8-1.8M13.7 8.8C14.8 7.7 16 7 17.5 7H21M18.5 4l2.5 3-2.5 3M18.5 14l2.5 3-2.5 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  troca: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h13l-3-3M20 16H7l3 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
}
const fmtT = (s: number) => { const t = Math.ceil(s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` }
const fmt = (n: number) => n.toLocaleString('pt-BR')

function Estrelas({ n }: { n: number }) {
  return (
    <div className="cc-stars" aria-label={`${n} de 3 estrelas`}>
      {[0, 1, 2].map(i => (
        <svg key={i} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" fill={i < n ? '#FFC531' : 'rgba(255,255,255,.14)'} stroke={i < n ? '#B97F06' : 'rgba(255,255,255,.25)'} strokeWidth="1.2" strokeLinejoin="round" /></svg>
      ))}
    </div>
  )
}

export default function CacaClient({ modo, chave }: { modo: 'loja' | 'mesa'; chave: string }) {
  const tokenApi = modo === 'loja' ? `loja:${chave}` : chave          // QR da mesa ou loja:<slug>
  const LS = `quizjt:${tokenApi}`
  const [tela, setTela] = useState<Tela>('carregando')
  const [meta, setMeta] = useState<Meta>({ loja: '', slug: modo === 'loja' ? chave : '', premio: false, bloqueado: false, mesaNumero: null, bonus: BONUS_PADRAO })
  const [rod, setRod] = useState<Rod | null>(null)
  const [melhor, setMelhor] = useState<{ pontos: number; nivel: number }>({ pontos: 0, nivel: 0 })
  const [rest, setRest] = useState(0)
  const [sel, setSel] = useState<[number, number][]>([])
  const [ruim, setRuim] = useState<[number, number][]>([])
  const [res, setRes] = useState<NivelRes | null>(null)
  const [parteInfo, setParteInfo] = useState<{ parte: number; pontos: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [aviso, setAviso] = useState('')
  const [erroMsg, setErroMsg] = useState('')
  const tRef = useRef({ t0: 0, restante: 0, espera: 0 })
  const pendRef = useRef<Rod | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const inicioRef = useRef<[number, number] | null>(null)
  const travado = useRef(false)

  const jt = useCallback(() => { try { return localStorage.getItem(LS) || '' } catch { return '' } }, [LS])
  const irIdentificar = useCallback(() => {
    window.location.assign(modo === 'loja' ? `/jogos/${chave}?identificar=1` : `/mesa/${chave}?identificar=jogar&voltar=${encodeURIComponent(window.location.pathname)}`)
  }, [modo, chave])
  const api = useCallback(async (acao: string, extra: Record<string, unknown> = {}) => {
    const r = await fetch('/api/jogos/caca', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao, token: tokenApi, jt: jt(), ...extra }) })
    const d = await r.json().catch(() => ({}))
    if (r.status === 401) { try { localStorage.removeItem(LS) } catch {} irIdentificar() }
    return { ok: r.ok, status: r.status, d }
  }, [tokenApi, jt, LS, irIdentificar])

  // guarda o relógio do servidor junto com a rodada: o tempo corre a partir de agora, depois da espera da transição
  const aplicar = useCallback((r: Rod) => {
    tRef.current = { t0: performance.now(), restante: r.restante, espera: r.espera }
    setRod(r); setRest(r.restante)
  }, [])
  const mostrarAviso = useCallback((t: string) => { setAviso(t); setTimeout(() => setAviso(''), 2200) }, [])

  // ---------- carga inicial ----------
  useEffect(() => {
    let vivo = true
    if (!jt()) { irIdentificar(); return }
    api('estado').then(r => {
      if (!vivo) return
      if (!r.ok) { setErroMsg(r.d?.error || 'Não consegui abrir o jogo agora.'); setTela('intro'); return }
      setMelhor(r.d.melhor || { pontos: 0, nivel: 0 })
      if (r.d.ctx) setMeta({ loja: r.d.ctx.loja, slug: r.d.ctx.slug, premio: !!r.d.ctx.premio, bloqueado: !!r.d.ctx.bloqueado, mesaNumero: r.d.ctx.mesaNumero ?? null, bonus: Array.isArray(r.d.ctx.bonus) ? r.d.ctx.bonus : BONUS_PADRAO })
      if (r.d.rodada) { setRod(r.d.rodada as Rod) }
      setTela('intro')
    }).catch(() => { if (vivo) { setErroMsg('Sem conexão. Tente de novo.'); setTela('intro') } })
    return () => { vivo = false }
  }, [jt, api, irIdentificar])

  // ---------- relógio ----------
  const fimPorTempo = useCallback(async () => {
    if (travado.current) return
    travado.current = true
    let encerrou = false
    for (let i = 0; i < 6 && !encerrou; i++) {
      const r = await api('estado')
      if (r.ok && !r.d.rodada) { encerrou = true; if (r.d.ultima) setRod(r.d.ultima as Rod); break }   // o servidor diz o resultado final (inclusive se o bônus se perdeu)
      if (r.ok && r.d.rodada && r.d.rodada.estado === 'jogando' && r.d.rodada.restante > 0.6) { aplicar(r.d.rodada); travado.current = false; return }
      await new Promise(res2 => setTimeout(res2, 700))
    }
    travado.current = false
    if (!encerrou) {                         // o servidor ainda não encerrou: encerra e devolve o resultado
      const r2 = await api('parar')
      if (r2.ok) { setRod(r2.d.rodada); setMelhor(m => ({ pontos: Math.max(m.pontos, r2.d.rodada.pontos), nivel: Math.max(m.nivel, r2.d.rodada.melhorNivel) })) }
    }
    setRod(prev => prev ? { ...prev, fim: 'tempo', estado: 'encerrada' } : prev)
    setTela('fim')
  }, [api, aplicar])
  useEffect(() => {
    if (tela !== 'jogo' || !rod || rod.estado !== 'jogando') return
    const id = setInterval(() => {
      if (travado.current) return
      const { t0, restante, espera } = tRef.current
      const dec = Math.max(0, (performance.now() - t0) / 1000 - espera)
      const v = Math.max(0, restante - dec)
      setRest(v)
      if (v <= 0) void fimPorTempo()
    }, 250)
    return () => clearInterval(id)
  }, [tela, rod, fimPorTempo])

  // ---------- começar / continuar ----------
  async function comecar() {
    setBusy(true); setErroMsg('')
    const r = await api('iniciar')
    setBusy(false)
    if (!r.ok) { setErroMsg(r.d?.error || 'Não consegui começar agora.'); return }
    aplicar(r.d.rodada); setRes(null); setTela('jogo')
  }
  function retomar() {
    if (!rod) return
    if (rod.estado === 'entre_niveis') {
      setRes({ nivel: rod.nivel, nome: rod.nomeNivel, pontosNivel: rod.pontosNivel, tempoUsado: null, estrelas: 0, ultimo: false, marco: rod.marco }); setTela('nivel')
    } else { aplicar(rod); setTela('jogo') }
  }
  async function proximoNivel() {
    setBusy(true)
    const r = await api('continuar')
    setBusy(false)
    if (!r.ok) { setErroMsg(r.d?.error || 'Tente de novo.'); return }
    aplicar(r.d.rodada); setRes(null); setTela('jogo')
  }
  async function parar() {
    setBusy(true)
    const r = await api('parar')
    setBusy(false)
    if (r.ok) { setRod(r.d.rodada); setMelhor(m => ({ pontos: Math.max(m.pontos, r.d.rodada.pontos), nivel: Math.max(m.nivel, r.d.rodada.melhorNivel) })) }
    setTela('fim')
  }

  // ---------- arrastar o dedo sobre as letras ----------
  const celula = useCallback((e: React.PointerEvent): [number, number] | null => {
    const g = gridRef.current; if (!g || !rod) return null
    const rc = g.getBoundingClientRect(), N = rod.tamanho, s = rc.width / N
    const c = Math.min(N - 1, Math.max(0, Math.floor((e.clientX - rc.left) / s)))
    const r = Math.min(N - 1, Math.max(0, Math.floor((e.clientY - rc.top) / s)))
    return [r, c]
  }, [rod])
  const linha = useCallback((a: [number, number], b: [number, number]): [number, number][] => {
    if (!rod) return [a]
    const N = rod.tamanho, dr = b[0] - a[0], dc = b[1] - a[1]
    if (!dr && !dc) return [a]
    const idx = Math.round(Math.atan2(dr, dc) / (Math.PI / 4))
    const vet = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]][((idx % 8) + 8) % 8]
    const proj = Math.round((dr * vet[0] + dc * vet[1]) / (vet[0] * vet[0] + vet[1] * vet[1]))
    const out: [number, number][] = []
    for (let i = 0; i <= proj; i++) {
      const r = a[0] + vet[0] * i, c = a[1] + vet[1] * i
      if (r < 0 || r >= N || c < 0 || c >= N) break
      out.push([r, c])
    }
    return out.length ? out : [a]
  }, [rod])

  function aoPressionar(e: React.PointerEvent) {
    if (busy || travado.current || !rod || rod.estado !== 'jogando') return
    const c = celula(e); if (!c) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    inicioRef.current = c; setSel([c]); e.preventDefault()
  }
  function aoMover(e: React.PointerEvent) {
    const a = inicioRef.current; if (!a) return
    const c = celula(e); if (c) setSel(linha(a, c))
  }
  async function aoSoltar() {
    const cells = sel; inicioRef.current = null; setSel([])
    if (cells.length < 2 || !rod || busy) return
    setBusy(true)
    const r = await api('selecionar', { cells })
    setBusy(false)
    if (!r.ok) { if (r.status !== 401) mostrarAviso(r.d?.error || 'Não deu certo. Tente de novo.'); return }
    if (r.d.fim === 'tempo') { setRod(r.d.rodada); setTela('fim'); return }
    if (!r.d.acerto) { setRuim(cells); setTimeout(() => setRuim([]), 280); return }
    const pal = r.d.palavra as { id: number; texto: string; cells: [number, number][]; cor: number }
    const nova = r.d.rodada as Rod
    if (r.d.parteConcluida || r.d.nivelConcluido) {
      // mostra a última palavra marcada por um instante e só então troca de tela
      setRod(prev => prev ? { ...prev, palavras: prev.palavras.map(p => p.id === pal.id ? { ...p, achada: true, texto: pal.texto, cells: pal.cells, cor: pal.cor } : p) } : prev)
      travado.current = true
      setTimeout(() => {
        travado.current = false
        if (r.d.parteConcluida) {
          setParteInfo(r.d.parteConcluida); pendRef.current = nova; setTela('parte')
          setTimeout(() => { if (pendRef.current === nova) { aplicar(nova); pendRef.current = null; setTela('jogo') } }, 1800)
        } else {
          const n = r.d.nivelConcluido as NivelRes
          setRod(nova); setRes(n); setMelhor(m => ({ pontos: Math.max(m.pontos, nova.pontos), nivel: Math.max(m.nivel, nova.melhorNivel) }))
          setTela(n.ultimo ? 'fim' : 'nivel')
        }
      }, 450)
      return
    }
    setRod(nova)
  }
  function seguirParte() { if (pendRef.current) { aplicar(pendRef.current); pendRef.current = null; setTela('jogo') } }

  async function usarAjuda(k: 'tempo' | 'emb' | 'troca') {
    if (busy || !rod || rod.estado !== 'jogando' || !(rod.ajudas[k] > 0)) return
    setBusy(true)
    const r = await api('ajuda', { tipo: k })
    setBusy(false)
    if (!r.ok) { if (r.status !== 401) mostrarAviso(r.d?.error || 'Não deu certo agora.'); return }
    aplicar(r.d.rodada)
    mostrarAviso(k === 'tempo' ? '+30 segundos' : k === 'emb' ? 'Grade embaralhada. As que você achou ficaram.' : 'Palavras trocadas. As que você achou ficaram.')
  }

  const corCel = useMemo(() => {
    const m = new Map<string, string>()
    rod?.palavras.forEach(p => p.cells?.forEach(([r, c]) => m.set(`${r},${c}`, CORES[p.cor % CORES.length])))
    return m
  }, [rod])
  const selSet = useMemo(() => new Set(sel.map(([r, c]) => `${r},${c}`)), [sel])
  const ruimSet = useMemo(() => new Set(ruim.map(([r, c]) => `${r},${c}`)), [ruim])

  const voltarUrl = modo === 'loja' ? `/jogos/${chave}` : `/mesa/${chave}`
  const rankUrl = `/jogos/${meta.slug || chave}/ranking`
  const cash = meta.premio && !meta.bloqueado          // este jogo vale cashback para este jogador agora?
  const topo = (
    <header className="cc-bar">
      <a href={voltarUrl}>{modo === 'loja' ? '‹ Jogos' : '‹ Mesa'}</a>
      <div className="cc-brand">{meta.loja || ' '}</div>
      <a className="cc-rk" href={rankUrl}>Ranking</a>
    </header>
  )

  return (
    <main className="cc">
      <div className="cc-wrap">
        {topo}
        <div className="cc-body">
          {tela === 'carregando' && <div className="cc-box">Carregando…</div>}

          {tela === 'intro' && (
            <>
              <div><h1 className="cc-t">Caça-Palavras</h1><p className="cc-sub">Ache as palavras escondidas antes de o tempo acabar. Arraste o dedo sobre as letras em linha reta, em qualquer direção. {cash ? 'Cada nível garante cashback, que vira valor quando você pagar a conta de hoje.' : meta.premio && meta.bloqueado ? 'Você já ganhou um prêmio nos últimos 7 dias: esta rodada vale só para o ranking.' : modo === 'mesa' ? 'Nesta mesa o jogo vale para o ranking da loja.' : 'Aqui o jogo vale só para o ranking da loja. Para ganhar cashback, jogue pelo QR da sua mesa.'}</p></div>
              <div className="cc-rota">
                {NIVEIS_INFO.map(n => (
                  <div key={n.n}>
                    {cash && n.n === PORTAO + 1 && <div className="cc-portao">Portão: a partir daqui, tempo esgotado perde o bônus</div>}
                    <div className="cc-nv"><div className="cc-n">{n.n}</div><div><b>{n.nome}</b><small>{n.g} · {n.pal} palavras · 2 grades<br />{n.dir} · {n.extra}</small></div>{cash && <span className="cc-pill">{meta.bonus[n.n - 1]}%</span>}</div>
                  </div>
                ))}
              </div>
              {melhor.pontos > 0 && <div className="cc-box">Seu melhor: <b>{fmt(melhor.pontos)} pontos</b>{melhor.nivel > 0 ? ` · até o nível ${melhor.nivel}` : ''}</div>}
              {erroMsg && <div className="cc-warn">{erroMsg}</div>}
              <div className="cc-foot">
                {rod && rod.estado !== 'encerrada' && <button className="cc-cta" type="button" onClick={retomar}>Continuar rodada (nível {rod.nivel})</button>}
                <button className={rod && rod.estado !== 'encerrada' ? 'cc-cta alt' : 'cc-cta'} type="button" disabled={busy} onClick={comecar}>{busy ? '…' : rod && rod.estado !== 'encerrada' ? 'Nova rodada' : 'Começar'}</button>
              </div>
            </>
          )}

          {tela === 'jogo' && rod && (
            <>
              <div className="cc-gtop"><div className="cc-lv">Nível {rod.nivel}<small>{rod.nomeNivel} · grade {rod.parte} de {rod.partes}{cash && rod.marco > 0 ? ` · garantido ${rod.marco}%` : ''}</small></div><div className={`cc-tm${rest < 15 ? ' low' : ''}`}>{fmtT(rest)}</div></div>
              <div className={`cc-tbar${rest < 15 ? ' low' : ''}`}><i style={{ width: `${Math.min(100, (rest / rod.total) * 100)}%` }} /></div>
              <div className="cc-gridwrap">
                <div ref={gridRef} className="cc-grid" style={{ ['--n' as string]: rod.tamanho } as React.CSSProperties}
                  onPointerDown={aoPressionar} onPointerMove={aoMover} onPointerUp={aoSoltar} onPointerCancel={() => { inicioRef.current = null; setSel([]) }}>
                  {rod.letras.map((linhaStr, r) => linhaStr.split('').map((ch, c) => {
                    const k = `${r},${c}`, cor = corCel.get(k)
                    const cls = `cc-c${selSet.has(k) ? ' sel' : ''}${cor ? ' f' : ''}${ruimSet.has(k) ? ' bad' : ''}`
                    return <div key={k} className={cls} style={cor ? { ['--fc' as string]: cor } as React.CSSProperties : undefined}><span>{ch}</span></div>
                  }))}
                </div>
              </div>
              <div className="cc-words">
                {rod.palavras.map(p => p.achada
                  ? <span key={p.id} className="cc-chip found" style={{ ['--fc' as string]: CORES[p.cor % CORES.length] } as React.CSSProperties}>{p.texto}</span>
                  : rod.lista === 'full' ? <span key={p.id} className="cc-chip">{p.texto}</span>
                  : rod.lista === 'dica' ? <span key={p.id} className="cc-chip blank">{p.dica} {Array((p.tam || 1) - 1).fill('_').join(' ')}</span>
                  : <span key={p.id} className="cc-chip blank">? ? ?</span>)}
              </div>
              <div className="cc-pw">
                {AJUDAS.map(a => {
                  const ok = rod.ajudas[a.k] > 0
                  return <button key={a.k} type="button" className={`cc-pwb${ok ? '' : ' used'}`} disabled={!ok || busy} onClick={() => usarAjuda(a.k)}>{ICONES[a.k]}<b>{a.nome}</b><small>{ok ? a.sub : 'já usou'}</small></button>
                })}
              </div>
              <p className="cc-hint">{rod.lista === 'full' ? 'Animais, objetos, filmes, comidas, lugares… ' : rod.lista === 'dica' ? 'Só a primeira letra de cada palavra. ' : `Lista escondida: descubra as ${rod.palavras.length} palavras. `}Arraste o dedo sobre as letras.</p>
            </>
          )}

          {tela === 'parte' && parteInfo && (
            <div className="cc-res center">
              <span className="cc-kick">Grade {parteInfo.parte} concluída</span>
              <h1 className="cc-t">+{parteInfo.pontos} pontos</h1>
              <p className="cc-sub">Tempo zerado. A próxima grade já vem com palavras novas.</p>
              <button className="cc-cta" type="button" onClick={seguirParte}>Continuar</button>
            </div>
          )}

          {tela === 'nivel' && res && rod && (() => {
            const prox = meta.bonus[res.nivel]            // bônus do próximo nível
            const decide = cash && res.nivel >= PORTAO
            return (
              <div className="cc-res">
                <div><span className="cc-kick">Nível {res.nivel} concluído</span><h1 className="cc-t" style={{ marginTop: 6 }}>{res.nome}</h1></div>
                {res.estrelas > 0 && <Estrelas n={res.estrelas} />}
                <div className="cc-box">
                  {res.tempoUsado !== null && <div className="cc-row"><span>Tempo usado nas 2 grades</span><b>{fmtT(res.tempoUsado)}</b></div>}
                  <div className="cc-row"><span>Pontos do nível</span><b>+{fmt(res.pontosNivel)}</b></div>
                  <div className="cc-row"><span>Pontos na rodada</span><b>{fmt(rod.pontos)}</b></div>
                </div>
                {cash && <div className="cc-box gold"><span className="cc-kick">Garantido até agora</span><div className="cc-big">{res.marco}%<small>de cashback</small></div><p className="cc-sub">Vira valor quando você pagar a conta de hoje, na próxima compra.</p></div>}
                {decide && (
                  <div className="cc-dec">
                    <div className="cc-dc"><span className="k">Se parar agora</span><span className="v">{res.marco}%</span><p>Garantido. Seus {fmt(rod.pontos)} pontos entram no ranking.</p></div>
                    <div className="cc-dc rk"><span className="k">Se continuar</span><span className="v">{prox}%</span><p>Nível {res.nivel + 1} vale {prox}%. Se o tempo acabar em qualquer grade, você perde o cashback.</p></div>
                  </div>
                )}
                {erroMsg && <div className="cc-warn">{erroMsg}</div>}
                <div className="cc-foot">
                  {decide ? (
                    <>
                      <button className="cc-cta" type="button" disabled={busy} onClick={parar}>{busy ? '…' : `Parar e garantir ${res.marco}%`}</button>
                      <button className="cc-cta risk" type="button" disabled={busy} onClick={proximoNivel}>Arriscar por {prox}%</button>
                    </>
                  ) : (
                    <>
                      <button className="cc-cta" type="button" disabled={busy} onClick={proximoNivel}>{busy ? '…' : `Ir para o nível ${res.nivel + 1}`}</button>
                      <button className="cc-cta alt" type="button" disabled={busy} onClick={parar}>Parar por aqui</button>
                    </>
                  )}
                </div>
              </div>
            )
          })()}

          {tela === 'fim' && rod && (
            <div className="cc-res">
              <div>
                <span className="cc-kick" style={rod.fim === 'tempo' ? { color: '#FFB4A8' } : undefined}>{rod.fim === 'tempo' ? 'Tempo esgotado' : rod.fim === 'completa' ? 'Rodada completa' : 'Rodada encerrada'}</span>
                <h1 className="cc-t" style={{ marginTop: 6 }}>{rod.fim === 'completa' ? 'Capitão do caça-palavras!' : rod.fim === 'tempo' ? `Nível ${rod.nivel} não concluído` : 'Boa pescaria!'}</h1>
              </div>
              {cash && (
                <div className="cc-box gold"><span className="cc-kick">Seu bônus</span><div className="cc-big" style={{ color: rod.marco > 0 ? undefined : '#FFB4A8' }}>{rod.marco}%<small>de cashback</small></div>
                  <p className="cc-sub">{rod.marco > 0 ? 'Vira valor quando você pagar a conta de hoje. Vale para a sua próxima compra aqui.' : rod.fim === 'tempo' && rod.nivel > PORTAO ? 'Neste nível o tempo esgotado perde o bônus. Seus pontos continuam no ranking.' : `Você ainda não garantiu bônus. Conclua o nível 1 para garantir ${meta.bonus[0]}%.`}</p></div>
              )}
              <div className={`cc-box${cash ? '' : ' gold'}`}><span className="cc-kick">Pontos na rodada</span><div className={cash ? 'cc-row' : 'cc-big'} style={cash ? { borderBottom: 0 } : undefined}>{cash ? <b>{fmt(rod.pontos)} pontos</b> : <>{fmt(rod.pontos)}<small>pontos</small></>}</div><p className="cc-sub">{rod.melhorNivel > 0 ? `Você concluiu até o nível ${rod.melhorNivel}.` : 'Conclua o nível 1 para subir no ranking.'}</p></div>
              {erroMsg && <div className="cc-warn">{erroMsg}</div>}
              <div className="cc-foot">
                <a className="cc-cta" href={rankUrl}>Ver ranking</a>
                <button className="cc-cta alt" type="button" disabled={busy} onClick={comecar}>{busy ? '…' : 'Jogar de novo'}</button>
              </div>
            </div>
          )}
        </div>
        {aviso && <div className="cc-toast" role="status">{aviso}</div>}
      </div>
      <style>{CSS}</style>
    </main>
  )
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@400;500;600;700&display=swap');
.cc{--sea-1:#0E4D64;--sea-2:#082B38;--sea-3:#051D27;--ink:#F2F7F8;--mut:#8FB5BE;--line:rgba(255,255,255,.12);--card:rgba(255,255,255,.06);--gold:#FFC531;--gold-hi:#FFE79A;--gold-lo:#B97F06;--bad:#FF8A7A;
  --display:'Anton',Impact,'Arial Narrow',sans-serif;--body:'Archivo',system-ui,-apple-system,'Segoe UI',sans-serif;
  position:fixed;inset:0;color-scheme:dark;background:radial-gradient(120% 60% at 50% 0%,var(--sea-1) 0%,var(--sea-2) 55%,var(--sea-3) 100%);color:var(--ink);font-family:var(--body);display:flex;justify-content:center}
.cc *{box-sizing:border-box}
.cc-wrap{position:relative;width:100%;max-width:480px;height:100%;display:flex;flex-direction:column}
.cc-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:max(14px,env(safe-area-inset-top,0px)) 16px 12px;border-bottom:1px solid var(--line);flex:none}
.cc-bar a{font:600 14px var(--body);color:var(--ink);text-decoration:none;min-height:36px;display:inline-flex;align-items:center;width:72px}
.cc-bar a.cc-rk{justify-content:flex-end;color:var(--gold)}
.cc-brand{font-family:var(--display);font-size:18px;text-transform:uppercase;text-align:center;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cc-body{flex:1;min-height:0;overflow-y:auto;scrollbar-width:none;padding:16px 16px max(16px,env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:14px}
.cc-body::-webkit-scrollbar{display:none}
.cc a:focus-visible,.cc button:focus-visible{outline:3px solid #fff;outline-offset:2px}
.cc-t{margin:0;font-family:var(--display);font-weight:400;font-size:40px;line-height:1;text-transform:uppercase;text-wrap:balance}
.cc-sub{margin:6px 0 0;font-size:13px;color:var(--mut);line-height:1.45}
.cc-rota{position:relative;display:grid;gap:8px}
.cc-rota::before{content:"";position:absolute;left:23px;top:24px;bottom:24px;width:2px;background:var(--line)}
.cc-nv{position:relative;display:grid;grid-template-columns:48px 1fr;gap:12px;align-items:center}
.cc-n{position:relative;z-index:1;width:48px;height:48px;border-radius:50%;display:grid;place-items:center;font-family:var(--display);font-size:22px;background:#0A3342;border:2px solid rgba(255,255,255,.2)}
.cc-nv b{display:block;font-size:15px}
.cc-nv small{display:block;font-size:12px;color:var(--mut);margin-top:2px;line-height:1.4}
.cc-foot{margin-top:auto;display:grid;gap:10px}
.cc-cta{display:grid;place-items:center;text-decoration:none;font-family:var(--display);font-size:22px;letter-spacing:.04em;text-transform:uppercase;min-height:54px;border:0;border-radius:14px;color:#2B1B00;cursor:pointer;background:linear-gradient(180deg,#FFE27A,#FFC531 55%,#F0A800);box-shadow:0 8px 22px rgba(255,197,49,.28);width:100%}
.cc-cta.alt{background:transparent;color:var(--ink);border:1px solid rgba(255,255,255,.28);box-shadow:none;font-size:18px;min-height:48px}
.cc-cta:disabled{opacity:.6}
.cc-box{border-radius:16px;background:var(--card);border:1px solid var(--line);padding:14px 16px;font-size:14px}
.cc-box.gold{background:rgba(255,197,49,.12);border-color:rgba(255,197,49,.5)}
.cc-pill{font:700 12px var(--body);padding:6px 10px;border-radius:99px;background:rgba(255,197,49,.16);color:var(--gold);white-space:nowrap}
.cc-nv{grid-template-columns:48px 1fr auto}
.cc-portao{margin:4px 0 4px 60px;font-size:11.5px;color:#FFB4A8;line-height:1.35}
.cc-dec{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.cc-dc{border-radius:14px;padding:12px;border:1px solid var(--line);background:var(--card);display:grid;gap:4px;align-content:start}
.cc-dc .k{font:700 11px var(--body);letter-spacing:.1em;text-transform:uppercase;color:var(--mut)}
.cc-dc .v{font-family:var(--display);font-size:34px;line-height:1;color:var(--gold)}
.cc-dc.rk{border-color:rgba(255,138,122,.6)}
.cc-dc.rk .v{color:#FFB4A8}
.cc-dc p{margin:0;font-size:12px;line-height:1.35;color:var(--mut)}
.cc-cta.risk{background:transparent;color:#FFB4A8;border:1px solid rgba(255,138,122,.7);box-shadow:none;font-size:18px;min-height:48px}
.cc-warn{background:#FDECEA;color:#9B2318;border-radius:10px;padding:10px 12px;font-size:13px;font-weight:600}
.cc-gtop{display:flex;align-items:center;justify-content:space-between;gap:10px}
.cc-lv{font-family:var(--display);font-size:22px;text-transform:uppercase;letter-spacing:.02em}
.cc-lv small{font-family:var(--body);font-size:12px;color:var(--mut);margin-left:6px;text-transform:none;letter-spacing:0}
.cc-tm{font-family:var(--display);font-size:28px;font-variant-numeric:tabular-nums;color:var(--gold)}
.cc-tm.low{color:var(--bad)}
.cc-tbar{height:6px;border-radius:99px;background:rgba(255,255,255,.12);overflow:hidden;margin-top:-4px;flex:none}
.cc-tbar i{display:block;height:100%;background:linear-gradient(90deg,var(--gold-lo),var(--gold-hi));border-radius:99px}
.cc-tbar.low i{background:linear-gradient(90deg,#B3382A,var(--bad))}
.cc-gridwrap{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:6px;width:100%;max-width:392px;margin:0 auto;flex:none}
.cc-grid{display:grid;grid-template-columns:repeat(var(--n),1fr);aspect-ratio:1;width:100%;touch-action:none;user-select:none;-webkit-user-select:none;container-type:inline-size;cursor:crosshair}
.cc-c{position:relative;display:grid;place-items:center;font-weight:700;font-size:calc(100cqw / var(--n) * .5);color:var(--ink);line-height:1}
.cc-c::before{content:"";position:absolute;inset:7%;border-radius:26%;background:transparent;transition:background .1s}
.cc-c span{position:relative}
.cc-c.sel::before{background:var(--gold)}
.cc-c.sel{color:#1B1300}
.cc-c.f::before{background:var(--fc)}
.cc-c.f{color:#06222d}
.cc-c.bad::before{background:var(--bad)}
.cc-c.bad{color:#2A0A05}
@media (prefers-reduced-motion:no-preference){.cc-c.bad{animation:cctr .25s}@keyframes cctr{25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}}
.cc-words{display:flex;flex-wrap:wrap;gap:7px;justify-content:center}
.cc-chip{font:600 13px var(--body);padding:6px 11px;border-radius:99px;border:1px solid var(--line);background:var(--card);letter-spacing:.02em}
.cc-chip.blank{letter-spacing:.14em;color:var(--mut)}
.cc-chip.found{background:var(--fc);color:#06222d;border-color:transparent;text-decoration:line-through;text-decoration-thickness:2px}
.cc-pw{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.cc-pwb{display:grid;justify-items:center;align-content:center;gap:2px;min-height:64px;padding:8px 4px;border-radius:12px;border:1px solid rgba(255,197,49,.45);background:rgba(255,197,49,.1);color:var(--ink);font-family:var(--body);cursor:pointer}
.cc-pwb svg{width:20px;height:20px;color:var(--gold)}
.cc-pwb b{font-size:12.5px;line-height:1.1}
.cc-pwb small{font-size:10.5px;color:var(--mut);line-height:1.1;text-align:center}
.cc-pwb.used{opacity:.4;cursor:default;border-color:var(--line);background:var(--card)}
.cc-hint{margin:0;text-align:center;font-size:12px;color:var(--mut);line-height:1.4}
.cc-res{display:grid;gap:14px;flex:1;align-content:start}
.cc-res.center{margin:auto 0;text-align:center;justify-items:center;flex:none}
.cc-kick{font:700 12px var(--body);letter-spacing:.14em;text-transform:uppercase;color:var(--gold)}
.cc-stars{display:flex;gap:6px}
.cc-stars svg{width:34px;height:34px}
.cc-big{font-family:var(--display);font-size:56px;line-height:1;color:var(--gold)}
.cc-big small{font-family:var(--body);font-size:14px;color:var(--mut);margin-left:6px}
.cc-row{display:flex;justify-content:space-between;gap:10px;font-size:14px;padding:6px 0;border-bottom:1px solid var(--line)}
.cc-row:last-child{border-bottom:0}
.cc-toast{position:absolute;left:16px;right:16px;bottom:max(18px,env(safe-area-inset-bottom,0px));padding:12px 14px;border-radius:12px;background:#0A3342;border:1px solid rgba(255,197,49,.5);font-size:13px;text-align:center;z-index:5}
`
