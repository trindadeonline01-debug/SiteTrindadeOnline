'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// Página da mesa (QR do cliente). O celular só PEDE: o servidor confere mesa,
// conta, produto, opções e preço, e o garçom confirma antes de ir pra cozinha.
// docs/DESENHO_MESAS_JOGOS.md §5.

type Opcao = { id: string; name: string; price: number }
type Grupo = { id: string; name: string; required: boolean; min: number; max: number; options: Opcao[] }
type Prod = { id: string; name: string; description: string | null; photo: string | null; categoriaId: string | null; preco: number; precoCheio: number | null; porPeso: boolean; grupos: Grupo[] }
type Info = { empresa: { nome: string; logo?: string }; mesa: { numero: number }; contaAberta: boolean; sessao: string | null; podePedir: boolean; cashback: { ativo: boolean; percentual: number }; categorias: { id: string; name: string }[]; produtos: Prod[] }
type Linha = { key: string; prod: Prod; qty: number; opcoes: Opcao[]; unit: number }
type Carteira = { verificado: boolean; saldo: number; telefone: string | null }
type Ident = { nome: string; telefone: string; token: string }
type Envio = { chamadoId: string; status: 'aberto' | 'atendido' | 'cancelado'; motivo: string | null }

const fmt = (n: number) => 'R$ ' + n.toFixed(2).replace('.', ',')
const PEND = (t: string) => `mesa_pend_${t}`
const IDENT_KEY = 'trindade_ident'

export default function MesaClient({ token }: { token: string }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [falha, setFalha] = useState('')
  const [cat, setCat] = useState<string>('todas')
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [opc, setOpc] = useState<{ p: Prod; sel: string[][] } | null>(null)
  const [carrinho, setCarrinho] = useState(false)
  const [obs, setObs] = useState('')
  // Pedido enviado antes de recarregar a página continua sendo acompanhado.
  const [envio, setEnvio] = useState<Envio | null>(() => {
    try {
      const salvo = typeof window !== 'undefined' ? localStorage.getItem(PEND(token)) : null
      return salvo ? { chamadoId: salvo, status: 'aberto', motivo: null } : null
    } catch { return null }
  })
  const [busy, setBusy] = useState(false)
  const [quizOn, setQuizOn] = useState(false)
  const [aviso, setAviso] = useState('')
  const [chamou, setChamou] = useState<'garcom' | 'conta' | null>(null)
  const [busca, setBusca] = useState('')
  const [rolou, setRolou] = useState(false)
  const [logoOk, setLogoOk] = useState(true)
  // Foto do que foi enviado (as linhas são limpas quando o garçom confirma).
  const [enviado, setEnviado] = useState<{ linhas: Linha[]; total: number; hora: string } | null>(null)
  // Identificação única (nome + WhatsApp confirmado por código), guardada neste aparelho.
  const [ident, setIdent] = useState<Ident | null>(null)
  const [identPara, setIdentPara] = useState<null | 'jogar' | 'cashback' | 'pedir'>(null)
  const [cart, setCart] = useState<Carteira | null>(null)
  const [menuAberto, setMenuAberto] = useState(false)
  const depoisIdent = useRef<null | (() => void)>(null)
  const identRef = useRef<Ident | null>(null) // sempre o valor mais novo (o que roda depois da identificação não pode ver o estado velho)
  const sessaoRef = useRef<string | null>(null)
  const seq = useRef(0)

  const call = useCallback(async (acao: string, extra: Record<string, unknown> = {}) => {
    const res = await fetch('/api/mesa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, acao, sessao: sessaoRef.current, ...extra }) })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, data }
  }, [token])

  const carregar = useCallback(async () => {
    const r = await call('info')
    if (!r.ok) { setFalha(r.data?.error || 'Não consegui abrir a mesa. Chame o garçom.'); return }
    sessaoRef.current = r.data.sessao
    setInfo(r.data as Info)
  }, [call])

  useEffect(() => {
    let vivo = true
    call('info').then(r => {
      if (!vivo) return
      if (!r.ok) { setFalha(r.data?.error || 'Não consegui abrir a mesa. Chame o garçom.'); return }
      sessaoRef.current = r.data.sessao
      setInfo(r.data as Info)
      // Quiz ligado nesta loja? Mostra o botão "Jogar".
      fetch('/api/mesa/quiz', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, acao: 'estado' }) })
        .then(q => q.json()).then(q => { if (vivo) setQuizOn(!!q.ativo) }).catch(() => {})
      // Cliente que já se identificou neste aparelho: confere o cadastro e já mostra o cashback dele.
      let salvo: Ident | null = null
      try { salvo = JSON.parse(localStorage.getItem(IDENT_KEY) || 'null') } catch {}
      if (salvo?.token) {
        const id = salvo
        call('carteira', { ident: id.token }).then(c => {
          if (!vivo) return
          if (c.ok) { identRef.current = id; setIdent(id); setCart({ verificado: true, saldo: Number(c.data.saldo) || 0, telefone: id.telefone }) }
          else if (c.status === 401) { try { localStorage.removeItem(IDENT_KEY) } catch {} }
        })
      }
      // Veio do quiz sem estar identificado: abre a identificação para jogar.
      if (new URLSearchParams(window.location.search).get('identificar') === 'jogar') setIdentPara('jogar')
    })
    return () => { vivo = false }
  }, [call, token])

  // Barra compacta fixa aparece depois que o topo grande sai da tela.
  useEffect(() => {
    const onScroll = () => setRolou(window.scrollY > 150)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Acompanha a resposta do garçom (a cada 4s enquanto espera).
  const esperando = envio?.status === 'aberto'
  const chamadoId = envio?.chamadoId
  useEffect(() => {
    if (!esperando || !chamadoId) return
    const t = setInterval(async () => {
      const r = await call('status', { chamadoId })
      if (!r.ok) { if (r.status === 404) { setEnvio(null); try { localStorage.removeItem(PEND(token)) } catch {} } return }
      if (r.data.status !== 'aberto') {
        setEnvio({ chamadoId, status: r.data.status, motivo: r.data.motivo || null })
        try { localStorage.removeItem(PEND(token)) } catch {}
        if (r.data.status === 'atendido') { setLinhas([]); setObs(''); void carregar() }
      }
    }, 4000)
    return () => clearInterval(t)
  }, [esperando, chamadoId, call, token, carregar])

  const total = useMemo(() => linhas.reduce((s, l) => s + l.unit * l.qty, 0), [linhas])
  const qtdTotal = linhas.reduce((s, l) => s + l.qty, 0)
  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return (info?.produtos || []).filter(p => (cat === 'todas' || p.categoriaId === cat) && (!t || p.name.toLowerCase().includes(t) || (p.description || '').toLowerCase().includes(t)))
  }, [info, cat, busca])
  // Cardápio agrupado por categoria (na ordem do cardápio); sem categoria vai pro fim.
  const secoes = useMemo(() => {
    const out: { id: string; nome: string | null; itens: Prod[] }[] = []
    for (const c of info?.categorias || []) {
      const itens = visiveis.filter(p => p.categoriaId === c.id)
      if (itens.length) out.push({ id: c.id, nome: c.name, itens })
    }
    const sem = visiveis.filter(p => !p.categoriaId || !(info?.categorias || []).some(c => c.id === p.categoriaId))
    if (sem.length) out.push({ id: 'sem', nome: out.length ? 'Outros' : null, itens: sem })
    return out
  }, [info, visiveis])
  const qtdDoProduto = (id: string) => linhas.filter(l => l.prod.id === id).reduce((s, l) => s + l.qty, 0)
  const catsComItem = useMemo(() => (info?.categorias || []).filter(c => info?.produtos.some(p => p.categoriaId === c.id)), [info])

  // Identificação concluída (código confirmado): guarda neste aparelho e segue o que o cliente queria fazer.
  function identificado(i: Ident, saldo: number, fechar = true) {
    identRef.current = i; setIdent(i); setCart({ verificado: true, saldo, telefone: i.telefone })
    try { localStorage.setItem(IDENT_KEY, JSON.stringify(i)) } catch {}
    if (!fechar) return
    setIdentPara(null)
    const seguir = depoisIdent.current; depoisIdent.current = null
    if (seguir) setTimeout(seguir, 0)
  }
  // Pede identificação (ou segue direto se o cliente já tem cadastro neste aparelho).
  function exigirIdent(para: 'jogar' | 'cashback' | 'pedir', seguir: () => void) {
    if (identRef.current && para !== 'jogar') { seguir(); return }
    depoisIdent.current = seguir
    setIdentPara(para)
  }
  async function irJogar(i: Ident) {
    // Cadastra o jogador no quiz (o servidor confere o nome e o WhatsApp pelo token) e abre o jogo.
    const res = await fetch('/api/mesa/quiz', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, acao: 'cadastro_ident', ident: i.token, idade: true, aceite: true }) })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) return d?.error || 'Não consegui abrir o quiz agora.'
    try { localStorage.setItem('quizjt:' + token, d.jt) } catch {}
    window.location.href = `/mesa/${token}/quiz`
    return null
  }

  function addLinha(p: Prod, opcoes: Opcao[]) {
    const unit = Math.round((p.preco + opcoes.reduce((s, o) => s + o.price, 0)) * 100) / 100
    const key = p.id + '|' + opcoes.map(o => o.id).sort().join(',')
    setLinhas(prev => {
      const ex = prev.find(l => l.key === key)
      if (ex) return prev.map(l => l.key === key ? { ...l, qty: Math.min(20, l.qty + 1) } : l)
      seq.current += 1
      return [...prev, { key, prod: p, qty: 1, opcoes, unit }]
    })
    setAviso('')
  }
  function tocar(p: Prod) {
    if (p.grupos.length > 0) { setOpc({ p, sel: p.grupos.map(() => []) }); return }
    addLinha(p, [])
  }
  const opcOk = opc ? opc.p.grupos.every((g, gi) => opc.sel[gi].length >= (g.required ? Math.max(1, g.min) : g.min)) : false
  function confirmarOpc() {
    if (!opc) return
    const escolhidas = opc.p.grupos.flatMap((g, gi) => g.options.filter(o => opc.sel[gi].includes(o.id)))
    addLinha(opc.p, escolhidas); setOpc(null)
  }
  function mudarQtd(key: string, d: number) {
    setLinhas(prev => prev.flatMap(l => l.key !== key ? [l] : (l.qty + d <= 0 ? [] : [{ ...l, qty: Math.min(20, l.qty + d) }])))
  }

  async function chamar(tipo: 'garcom' | 'conta', mensagem?: string) {
    setBusy(true)
    const r = await call('chamar', { tipo, mensagem })
    setBusy(false)
    if (r.status === 409) { await carregar(); setAviso('A conta da mesa mudou. Atualizei a página.'); return }
    if (!r.ok) { setAviso(r.data?.error || 'Não consegui avisar. Levante a mão para o garçom.'); return }
    setChamou(tipo); setAviso('')
    setTimeout(() => setChamou(null), 6000)
  }

  async function enviar() {
    if (linhas.length === 0 || busy) return
    const ident = identRef.current
    if (!ident) { exigirIdent('pedir', () => { void enviar() }); return }
    setBusy(true); setAviso('')
    const r = await call('pedir', {
      itens: linhas.map(l => ({ produtoId: l.prod.id, qty: l.qty, opcoes: l.opcoes.map(o => o.id) })),
      obs: obs.trim() || undefined, ident: ident.token,
    })
    setBusy(false)
    if (r.status === 401) { try { localStorage.removeItem(IDENT_KEY) } catch {} identRef.current = null; setIdent(null); setCart(null); exigirIdent('pedir', () => { void enviar() }); return }
    if (r.status === 409) { await carregar(); setAviso(r.data?.error || 'A conta mudou. Confira o pedido e envie de novo.'); return }
    if (!r.ok) { setAviso(r.data?.error || 'Não consegui enviar. Chame o garçom.'); return }
    try { localStorage.setItem(PEND(token), r.data.chamadoId) } catch {}
    setEnviado({ linhas, total, hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) })
    setEnvio({ chamadoId: r.data.chamadoId, status: 'aberto', motivo: null })
    setCarrinho(false)
  }

  if (falha) return <Tela><div className="mz-box"><h1>Ops</h1><p>{falha}</p></div></Tela>
  if (!info) return <Tela><div className="mz-box"><p>Abrindo a mesa…</p></div></Tela>

  const cashPct = String(info.cashback.percentual).replace('.', ',')
  const inicial = (info.empresa.nome || '?').trim().charAt(0).toUpperCase()
  const miniBar = (visivel: boolean) => (
    <div className={`mz-mini ${visivel ? 'on' : ''}`} aria-hidden={!visivel}>
      <div className="mz-num sm">{info.mesa.numero}</div>
      <div className="mz-hn"><small>{info.empresa.nome}</small><b>Mesa {info.mesa.numero}</b></div>
      <button className="mz-rb y" disabled={busy} onClick={() => chamar('garcom')} aria-label="Chamar garçom" tabIndex={visivel ? 0 : -1}>
        {chamou === 'garcom' ? <span>✓</span> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z" /><path d="M10 21h4" /></svg>}
      </button>
      {info.contaAberta && (
        <button className="mz-rb o" disabled={busy} onClick={() => chamar('conta')} aria-label="Pedir a conta" tabIndex={visivel ? 0 : -1}>
          {chamou === 'conta' ? <span>✓</span> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></svg>}
        </button>
      )}
    </div>
  )

  // Tela de acompanhamento do pedido enviado.
  if (envio) {
    const feito = envio.status === 'atendido'
    return (
      <Tela>
        {miniBar(true)}
        <div className="mz-st">
          {envio.status === 'cancelado' ? (
            <div className="mz-okh"><div className="mz-no" aria-hidden="true">!</div><h2>O garçom não pôde aceitar</h2><p>{envio.motivo || 'Chame o garçom para ajudar com o pedido.'}</p></div>
          ) : (
            <div className="mz-okh">
              {feito ? <div className="mz-ok" aria-hidden="true">✓</div> : <div className="mz-pulse" aria-hidden="true" />}
              <h2>{feito ? 'Pedido confirmado' : 'Pedido enviado'}</h2>
              <p>{feito ? 'Já está indo para a cozinha. Você pode pedir mais a qualquer momento.' : 'Estamos avisando o garçom. Assim que ele confirmar, o pedido vai para a cozinha.'}</p>
            </div>
          )}
          {envio.status !== 'cancelado' && (
            <div className="mz-tl">
              <div className="s d"><i /><div><b>Enviado ao garçom</b>{enviado && <span>{enviado.hora}</span>}</div></div>
              <div className={`s ${feito ? 'd' : 'n'}`}><i /><div><b>Garçom confirmou</b></div></div>
              <div className={`s ${feito ? 'n' : 'w'}`}><i /><div><b>Na cozinha</b>{feito && <span>Seu pedido está sendo preparado</span>}</div></div>
            </div>
          )}
          {enviado && enviado.linhas.length > 0 && (
            <div className="mz-sum">
              {enviado.linhas.map(l => <div className="r" key={l.key}><span>{l.qty}× {l.prod.name}</span><span>{fmt(l.unit * l.qty)}</span></div>)}
              <div className="r tot"><span>Total do pedido</span><span>{fmt(enviado.total)}</span></div>
            </div>
          )}
          <div className="mz-stack">
            {envio.status !== 'aberto' && <button className="mz-pb" onClick={() => { setEnvio(null); setEnviado(null) }}>{feito ? 'Pedir mais' : 'Voltar ao cardápio'}</button>}
            {info.contaAberta && <button className="mz-pb g" disabled={busy} onClick={() => chamar('conta')}>{chamou === 'conta' ? '✓ Conta pedida' : 'Pedir a conta'}</button>}
          </div>
          {aviso && <div className="mz-aviso" role="status">{aviso}</div>}
        </div>
      </Tela>
    )
  }

  const quizBtn = () => exigirIdent('jogar', () => {})
  return (
    <Tela>
      {miniBar(rolou)}

      <header className="mz-hero">
        <div className="mz-hrow">
          <div className="mz-logo">
            {info.empresa.logo && logoOk
              ? <img src={info.empresa.logo} alt="" onError={() => setLogoOk(false)} />
              : <span>{inicial}</span>}
          </div>
          <div className="mz-hn"><small>Bem-vindo ao</small><b>{info.empresa.nome}</b></div>
          <div className="mz-num">{info.mesa.numero}</div>
        </div>
        <h1>Peça daqui, <em>sem fila.</em></h1>
        <p>Você está na mesa {info.mesa.numero}. {info.podePedir ? 'O garçom confirma o pedido antes de ir para a cozinha.' : 'Os pedidos desta mesa são feitos com o garçom.'}</p>
      </header>

      {(quizOn || info.cashback.ativo) && (
        <div className={`mz-promo ${quizOn && info.cashback.ativo ? '' : 'solo'}`}>
          {quizOn && (
            <button type="button" className="mz-pcard pq" onClick={quizBtn}>
              <span className="ico"><svg viewBox="0 0 24 24" fill="none" stroke="#151210" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" /></svg></span>
              <b>Quiz Pesca Premiada</b>
              <p>Suba no ranking da casa.</p>
              <span className="bt">Jogar</span>
            </button>
          )}
          {info.cashback.ativo && (
            <div className="mz-pcard pc5">
              {cart?.verificado ? (
                <>
                  <div className="top5"><span className="up">Seu saldo</span></div>
                  <div className="saldo">{fmt(cart.saldo)}</div>
                  <p className="rt2">Ganhe até {cashPct}% de volta ao pagar a conta.</p>
                  <span className="bt ok">✓ Cashback ativo</span>
                </>
              ) : (
                <>
                  <div className="top5"><span className="up">Até</span><span className="big">{cashPct}<small>%</small></span></div>
                  <p className="rt2">de cashback na sua próxima compra</p>
                  <button className="bt" onClick={() => exigirIdent('cashback', () => {})}>Ativar</button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div className={`mz-acts ${info.contaAberta ? 'two' : 'one'}`}>
        <button className="mz-act pri" disabled={busy} onClick={() => chamar('garcom')}>
          <span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z" /><path d="M10 21h4" /></svg></span>
          {chamou === 'garcom' ? '✓ Garçom avisado' : 'Chamar garçom'}
        </button>
        {info.contaAberta && (
          <button className="mz-act" disabled={busy} onClick={() => chamar('conta')}>
            <span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></svg></span>
            {chamou === 'conta' ? '✓ Conta pedida' : 'Pedir a conta'}
          </button>
        )}
      </div>
      {aviso && !carrinho && !menuAberto && <div className="mz-aviso" role="status">{aviso}</div>}

      {info.podePedir ? (
        <>
          <button type="button" className={`mz-vercard ${menuAberto ? 'on' : ''}`} onClick={() => setMenuAberto(v => !v)} aria-expanded={menuAberto}>
            <span>{menuAberto ? 'Ocultar cardápio' : 'Ver cardápio'}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {menuAberto && (
            <div className="mz-menu">
              <div className="mz-sbar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar no cardápio" aria-label="Buscar no cardápio" />
              </div>
              {catsComItem.length > 1 && (
                <nav className={`mz-cats ${rolou ? 'under' : ''}`} aria-label="Categorias">
                  <button className={cat === 'todas' ? 'on' : ''} onClick={() => setCat('todas')}>Tudo</button>
                  {catsComItem.map(c => <button key={c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>{c.name}</button>)}
                </nav>
              )}
              {aviso && !carrinho && <div className="mz-aviso" role="status">{aviso}</div>}
              {secoes.map(sec => (
                <section key={sec.id} className="mz-sec">
                  {sec.nome && <div className="mz-h"><b>{sec.nome}</b><small>{sec.itens.length} {sec.itens.length === 1 ? 'item' : 'itens'}</small></div>}
                  <ul className="mz-lista">
                    {sec.itens.map(p => {
                      const q = qtdDoProduto(p.id)
                      const simples = p.grupos.length === 0
                      const keySimples = p.id + '|'
                      return (
                        <li key={p.id} className="mz-item">
                          {p.photo && <img src={p.photo} alt="" loading="lazy" />}
                          <div className="mz-info">
                            <b>{p.name}</b>
                            {p.description && <small>{p.description}</small>}
                            <span className="mz-preco">{p.porPeso ? `${fmt(p.preco)}` : fmt(p.preco)}{p.porPeso && <em> / kg</em>}{p.precoCheio && !p.porPeso && <s>{fmt(p.precoCheio)}</s>}</span>
                          </div>
                          {p.porPeso
                            ? <button className="mz-peso" disabled={busy} onClick={() => chamar('garcom', `Quer pedir "${p.name}" (por peso)`)}>Por peso<br />chamar garçom</button>
                            : simples && q > 0
                              ? <div className="mz-step"><button aria-label={`Tirar ${p.name}`} onClick={() => mudarQtd(keySimples, -1)}>−</button><b>{q}</b><button aria-label={`Adicionar ${p.name}`} onClick={() => tocar(p)}>+</button></div>
                              : <button className="mz-add" aria-label={`Adicionar ${p.name}`} onClick={() => tocar(p)}>{q > 0 ? <span className="n">{q}</span> : '+'}</button>}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
              {visiveis.length === 0 && <p className="mz-vazio">Nada por aqui ainda.</p>}
            </div>
          )}
        </>
      ) : (
        <div className="mz-box"><p>Hoje os pedidos desta mesa são feitos com o garçom. Use “Chamar garçom”.</p></div>
      )}

      {qtdTotal > 0 && !carrinho && (
        <button className="mz-barra" onClick={() => setCarrinho(true)}>
          <span className="l"><i>{qtdTotal}</i>Ver pedido</span><span className="p">{fmt(total)}</span>
        </button>
      )}


      {opc && (
        <Sheet titulo={opc.p.name} onClose={() => setOpc(null)}>
          {opc.p.grupos.map((g, gi) => (
            <fieldset key={g.id} className="mz-grp">
              <legend>{g.name}{g.required ? ' *' : ''}<small>{g.max > 1 ? ` até ${g.max}` : ' escolha 1'}</small></legend>
              {g.options.map(o => {
                const on = opc.sel[gi].includes(o.id)
                return (
                  <button key={o.id} type="button" className={`mz-op ${on ? 'on' : ''}`} onClick={() => setOpc(s => {
                    if (!s) return s
                    const cur = s.sel[gi]; let nx: string[]
                    if (on) nx = cur.filter(x => x !== o.id)
                    else if (g.max <= 1) nx = [o.id]
                    else nx = cur.length >= g.max ? cur : [...cur, o.id]
                    return { ...s, sel: s.sel.map((a, i) => i === gi ? nx : a) }
                  })}><span>{o.name}</span>{o.price > 0 && <em>+ {fmt(o.price)}</em>}</button>
                )
              })}
            </fieldset>
          ))}
          <button className="mz-btn full" disabled={!opcOk} onClick={confirmarOpc}>Adicionar ao pedido</button>
        </Sheet>
      )}

      {carrinho && (
        <Sheet titulo="Seu pedido" onClose={() => setCarrinho(false)}>
          <ul className="mz-cart">
            {linhas.map(l => (
              <li key={l.key}>
                <div><b>{l.prod.name}</b>{l.opcoes.length > 0 && <small>{l.opcoes.map(o => o.name).join(', ')}</small>}</div>
                <div className="mz-qtd">
                  <button aria-label="Menos" onClick={() => mudarQtd(l.key, -1)}>−</button><span>{l.qty}</span><button aria-label="Mais" onClick={() => mudarQtd(l.key, 1)}>+</button>
                </div>
                <b className="mz-val">{fmt(l.unit * l.qty)}</b>
              </li>
            ))}
          </ul>
          <label className="mz-lbl">Alguma observação?
            <textarea value={obs} maxLength={300} onChange={e => setObs(e.target.value)} placeholder="Ex.: sem cebola" rows={2} />
          </label>
          <p className="mz-nota">O garçom confirma o pedido antes de ir para a cozinha. {info.contaAberta ? '' : 'Sua conta será aberta por ele.'}</p>
          {aviso && <div className="mz-aviso" role="alert">{aviso}</div>}
          <div className="mz-tot"><span>Total do pedido</span><b>{fmt(total)}</b></div>
          <button className="mz-btn full" disabled={busy || linhas.length === 0} onClick={enviar}>{busy ? 'Enviando…' : 'Enviar para o garçom'}</button>
          <small className="mz-nota">Taxa de serviço, se houver, entra só na conta final.</small>
        </Sheet>
      )}

      {identPara && (
        <IdentModal
          para={identPara}
          atual={ident}
          call={call}
          onClose={() => { setIdentPara(null); depoisIdent.current = null }}
          onFeito={identificado}
          onJogar={irJogar}
        />
      )}
    </Tela>
  )
}

type CallFn = (acao: string, extra?: Record<string, unknown>) => Promise<{ ok: boolean; status: number; data: Record<string, unknown> }>

// Identificação única: nome + WhatsApp + código de 6 números. Pede para jogar, ativar o
// cashback e enviar pedido; quem já se identificou neste aparelho não digita de novo.
function IdentModal({ para, atual, call, onClose, onFeito, onJogar }: {
  para: 'jogar' | 'cashback' | 'pedir'; atual: Ident | null; call: CallFn; onClose: () => void
  onFeito: (i: Ident, saldo: number, fechar?: boolean) => void; onJogar: (i: Ident) => Promise<string | null>
}) {
  const [nome, setNome] = useState(atual?.nome || '')
  const [tel, setTel] = useState('')
  const [cod, setCod] = useState('')
  const [etapa, setEtapa] = useState<'dados' | 'codigo'>('dados')
  const [idade, setIdade] = useState(false)
  const [rank, setRank] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const jogar = para === 'jogar'
  const jaIdentificado = !!atual && jogar // só falta confirmar 18+ e ranking
  const titulos = { jogar: 'Antes de jogar', cashback: 'Ativar cashback', pedir: 'Antes de pedir' }
  const textos = {
    jogar: 'Informe seu nome e WhatsApp. No ranking aparece só seu primeiro nome com a inicial do sobrenome.',
    cashback: 'Informe seu nome e WhatsApp para guardar o cashback e usar na sua próxima compra nesta casa.',
    pedir: 'Informe seu nome e WhatsApp para o garçom saber quem está pedindo. É só desta vez.',
  }
  const AVISO_JOGAR = 'Para jogar, confirme que tem 18 anos ou mais e aceite aparecer no ranking.'

  async function jogarAgora(i: Ident) {
    if (!idade || !rank) { setMsg(AVISO_JOGAR); return }
    setBusy(true); setMsg('')
    const erro = await onJogar(i)
    setBusy(false)
    if (erro) setMsg(erro)
  }
  async function enviarCodigo() {
    if (nome.trim().length < 2) { setMsg('Digite seu nome.'); return }
    if (tel.replace(/\D/g, '').length < 10) { setMsg('Digite seu WhatsApp com DDD.'); return }
    if (jogar && (!idade || !rank)) { setMsg(AVISO_JOGAR); return }
    setBusy(true); setMsg('')
    const r = await call('ident_enviar', { nome, telefone: tel })
    setBusy(false)
    if (!r.ok) { setMsg(String(r.data?.error || 'Não consegui enviar o código.')); return }
    setEtapa('codigo'); setCod(''); setMsg('Enviamos um código de 6 números para o seu WhatsApp.')
  }
  async function confirmar() {
    setBusy(true); setMsg('')
    const r = await call('ident_verificar', { nome, telefone: tel, codigo: cod })
    if (!r.ok) { setBusy(false); setMsg(String(r.data?.error || 'Código incorreto.')); return }
    const i: Ident = { nome: String(r.data.nome), telefone: String(r.data.telefone), token: String(r.data.token) }
    onFeito(i, Number(r.data.saldo) || 0, !jogar)
    if (jogar) await jogarAgora(i)
    setBusy(false)
  }

  return (
    <Sheet titulo="" onClose={onClose}>
      <div className="mz-cs">
        <h3>{titulos[para]}</h3>
        {jaIdentificado ? (
          <>
            <p className="s">Jogando como <b>{atual!.nome}</b>. Confirme para entrar no jogo.</p>
            <label className="mz-chk"><input type="checkbox" checked={idade} onChange={e => setIdade(e.target.checked)} /> Tenho 18 anos ou mais</label>
            <label className="mz-chk"><input type="checkbox" checked={rank} onChange={e => setRank(e.target.checked)} /> Aceito aparecer no ranking com meu nome e a inicial do sobrenome</label>
            {msg && <div className="mz-aviso" role="alert">{msg}</div>}
            <button className="mz-pb" disabled={busy} onClick={() => jogarAgora(atual!)}>{busy ? 'Abrindo…' : 'Jogar'}</button>
          </>
        ) : etapa === 'dados' ? (
          <>
            <p className="s">{textos[para]}</p>
            <label>Seu nome</label>
            <input autoComplete="name" maxLength={40} placeholder="Ex.: Maria da Silva" value={nome} onChange={e => setNome(e.target.value)} aria-label="Seu nome" />
            <label>Seu WhatsApp</label>
            <input inputMode="tel" autoComplete="tel" placeholder="(21) 99999-9999" value={tel} onChange={e => setTel(e.target.value)} aria-label="Seu WhatsApp" />
            {jogar && (
              <>
                <label className="mz-chk"><input type="checkbox" checked={idade} onChange={e => setIdade(e.target.checked)} /> Tenho 18 anos ou mais</label>
                <label className="mz-chk"><input type="checkbox" checked={rank} onChange={e => setRank(e.target.checked)} /> Aceito aparecer no ranking com meu nome e a inicial do sobrenome</label>
              </>
            )}
            {msg && <div className="mz-aviso" role="alert">{msg}</div>}
            <button className="mz-pb" disabled={busy} onClick={enviarCodigo}>{busy ? 'Enviando…' : 'Receber código'}</button>
            <p className="nt">Você recebe um código de 6 números no WhatsApp para confirmar que o número é seu.</p>
          </>
        ) : (
          <>
            <p className="s">Digite o código de 6 números que chegou no seu WhatsApp.</p>
            <label>Código</label>
            <input inputMode="numeric" maxLength={6} placeholder="000000" value={cod} onChange={e => setCod(e.target.value.replace(/\D/g, ''))} aria-label="Código de 6 números" />
            {msg && <div className="mz-aviso" role="status">{msg}</div>}
            <button className="mz-pb" disabled={busy || cod.length < 6} onClick={confirmar}>{busy ? 'Conferindo…' : 'Confirmar'}</button>
            <button className="mz-link" onClick={() => { setEtapa('dados'); setMsg('') }}>Trocar número</button>
          </>
        )}
        <button className="mz-link" onClick={onClose}>Agora não</button>
      </div>
    </Sheet>
  )
}

function Sheet({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="mz-ov sheet" onClick={onClose}>
      <div className="mz-sheet" role="dialog" aria-modal="true" aria-label={titulo} onClick={e => e.stopPropagation()}>
        <div className="mz-sh"><h2>{titulo}</h2><button onClick={onClose} aria-label="Fechar">✕</button></div>
        <div className="mz-sb">{children}</div>
      </div>
    </div>
  )
}

function Tela({ children }: { children: React.ReactNode }) {
  return <div className="mz"><style>{CSS}</style>{children}</div>
}

const CSS = `
:root{--mz-ink:#151210;--mz-paper:#fff;--mz-bg:#F1F2EE;--mz-sign:#FFC531;--mz-line:#DCDDD6;--mz-muted:#6F6C67;--mz-open:#0F8A57;--mz-alert:#D6392B;--mz-soft:#FFF6D9}
.mz{color-scheme:light;min-height:100vh;min-height:100dvh;background:var(--mz-bg);color:var(--mz-ink);font-family:Archivo,system-ui,sans-serif;padding-bottom:96px}
.mz *{box-sizing:border-box}.mz button{font-family:inherit;cursor:pointer}
.mz-btn{height:46px;padding:0 18px;border-radius:10px;border:2px solid var(--mz-ink);background:var(--mz-sign);color:#151210;font-weight:700;font-size:15px}
.mz-btn:disabled{opacity:.5;cursor:not-allowed}
.mz-link{align-self:flex-start;background:transparent;border:0;color:var(--mz-ink);text-decoration:underline;font-size:13px;padding:4px 0}
.mz-box{margin:24px 16px;background:var(--mz-paper);border:1px solid var(--mz-line);border-radius:12px;padding:20px}.mz-box h1{margin:0 0 6px;font-family:Anton,sans-serif;font-weight:400;font-size:28px;text-transform:uppercase}.mz-box p{margin:0;line-height:1.5}
.mz-aviso{margin:8px 16px 0;background:var(--mz-soft);border:1px solid var(--mz-sign);border-radius:8px;padding:10px 12px;font-size:14px;font-weight:600}
.mz-sheet .mz-aviso{margin:10px 0 0}
.mz-ov{position:fixed;inset:0;z-index:20;background:rgba(21,18,16,.65);display:flex;align-items:center;justify-content:center;padding:16px}
.mz-ov.sheet{align-items:flex-end;padding:0}
.mz-sheet{width:100%;max-height:90dvh;display:flex;flex-direction:column;background:var(--mz-paper);border-radius:16px 16px 0 0}
.mz-sh{display:flex;align-items:center;justify-content:space-between;padding:16px 18px 10px}.mz-sh h2{margin:0;font-family:Anton,sans-serif;font-weight:400;font-size:24px;text-transform:uppercase;line-height:1.1}
.mz-sh button{width:40px;height:40px;border:0;background:transparent;color:var(--mz-ink);font-size:18px}
.mz-sb{overflow-y:auto;padding:0 18px 22px}
.mz-grp{border:0;padding:0;margin:0 0 14px;min-width:0}.mz-grp legend{font-weight:700;font-size:14.5px;margin-bottom:8px;padding:0}.mz-grp legend small{color:var(--mz-muted);font-weight:500}
.mz-op{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:48px;margin-bottom:6px;padding:0 14px;border-radius:10px;border:1.5px solid var(--mz-line);background:var(--mz-paper);color:var(--mz-ink);font-size:15px;text-align:left}
.mz-op.on{background:var(--mz-sign);color:#151210;border:2px solid #151210;font-weight:700}.mz-op em{font-style:normal;font-size:13px;font-variant-numeric:tabular-nums}
.mz-cart{list-style:none;margin:0 0 10px;padding:0;display:flex;flex-direction:column}
.mz-cart li{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--mz-line)}
.mz-cart small{display:block;color:var(--mz-muted);font-size:12.5px;margin-top:2px}
.mz-qtd{display:flex;align-items:center;gap:2px}.mz-qtd button{width:38px;height:38px;border-radius:8px;border:1.5px solid var(--mz-line);background:var(--mz-paper);color:var(--mz-ink);font-size:20px}.mz-qtd span{min-width:28px;text-align:center;font-weight:700}
.mz-val{min-width:74px;text-align:right;font-variant-numeric:tabular-nums}
.mz-lbl{display:flex;flex-direction:column;gap:6px;font-weight:600;font-size:14px;margin-top:12px}.mz-lbl small{color:var(--mz-muted);font-weight:500}
.mz-lbl textarea,.mz-lbl input{width:100%;border:1.5px solid var(--mz-line);border-radius:10px;background:var(--mz-paper);color:var(--mz-ink);font:inherit;font-weight:400;padding:11px 12px;font-size:16px}
.mz-nota{color:var(--mz-muted);font-size:12.5px;line-height:1.45;margin:12px 0 0;display:block}
.mz-tot{display:flex;justify-content:space-between;align-items:baseline;margin-top:14px;font-weight:600}.mz-tot b{font-family:Anton,sans-serif;font-weight:400;font-size:30px;font-variant-numeric:tabular-nums}
.mz-card{width:100%;max-width:380px;background:var(--mz-paper);border-radius:16px;padding:28px 22px;text-align:center}
.mz-card h2{margin:12px 0 6px;font-family:Anton,sans-serif;font-weight:400;font-size:26px;text-transform:uppercase}.mz-card p{margin:0;color:var(--mz-muted);line-height:1.5}
.mz-pulse{width:46px;height:46px;border-radius:50%;margin:0 auto;background:var(--mz-sign);animation:mzp 1.4s ease-in-out infinite}
.mz-ok,.mz-no{width:52px;height:52px;border-radius:50%;margin:0 auto;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:#fff}.mz-ok{background:var(--mz-open)}.mz-no{background:var(--mz-alert)}
@keyframes mzp{0%,100%{transform:scale(.85);opacity:.7}50%{transform:scale(1.1);opacity:1}}
@media (prefers-reduced-motion:reduce){.mz-pulse{animation:none}}
@media (min-width:720px){.mz{max-width:640px;margin:0 auto}.mz-ov.sheet{align-items:center;padding:16px}.mz-sheet{max-width:520px;border-radius:16px}}

.mz{background:var(--mz-bg)}
.mz-btn.full{width:100%;margin-top:12px;height:52px;font-size:16px;border-radius:14px;border:0;background:var(--mz-sign);color:#151210}
/* barra compacta (fixa, aparece depois do topo grande) */
.mz-mini{position:fixed;top:0;left:0;right:0;z-index:15;max-width:640px;margin:0 auto;background:#151210;color:#fff;display:flex;align-items:center;gap:12px;padding:10px 16px;transform:translateY(-110%);transition:transform .22s ease;box-shadow:0 10px 24px -14px rgba(0,0,0,.6)}
.mz-mini.on{transform:none}
.mz-mini::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1px;background:linear-gradient(90deg,transparent,#FFC531 30%,#FFC531 70%,transparent);opacity:.5}
.mz-st .mz-mini,.mz-mini.on{position:fixed}
.mz-num{width:50px;height:50px;border-radius:50%;border:1.5px solid #FFC531;color:#FFC531;display:grid;place-items:center;font-family:Anton,sans-serif;font-size:25px;line-height:1;flex:none;padding-top:2px;background:rgba(255,197,49,.08)}
.mz-num.sm{width:38px;height:38px;font-size:19px}
.mz-hn{flex:1;min-width:0}
.mz-hn small{display:block;font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:#A9A397;font-weight:600}
.mz-hn b{display:block;font-size:17px;font-weight:700;letter-spacing:.2px;line-height:1.2;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mz-mini .mz-hn small{font-size:9.5px}.mz-mini .mz-hn b{font-size:14.5px;margin:0}
.mz-rb{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;flex:none;border:0;padding:0}
.mz-rb svg{width:18px;height:18px}
.mz-rb.y{background:#FFC531;color:#151210;font-weight:800}
.mz-rb.o{background:transparent;border:1px solid #4A443C;color:#fff}
/* topo */
.mz-hero{background:linear-gradient(180deg,#1B1815 0%,#151210 100%);color:#fff;padding:20px 20px 52px;position:relative}
.mz-hero::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1px;background:linear-gradient(90deg,transparent,#FFC531 30%,#FFC531 70%,transparent);opacity:.6}
.mz-hrow{display:flex;align-items:center;gap:12px}
.mz-logo{width:44px;height:44px;border-radius:50%;background:#fff;overflow:hidden;flex:none;box-shadow:0 0 0 1.5px rgba(255,197,49,.9);display:grid;place-items:center;color:#151210;font-family:Anton,sans-serif;font-size:20px}
.mz-logo img{width:86%;height:86%;object-fit:contain}
.mz-hero h1{margin:20px 0 0;font-family:inherit;font-size:23px;font-weight:700;line-height:1.2;letter-spacing:-.1px;text-transform:none}
.mz-hero h1 em{font-style:normal;color:#FFC531}
.mz-hero p{margin:6px 0 0;font-size:13px;color:#A9A397;line-height:1.45}
/* ações */
.mz-acts{margin:-28px 16px 0;position:relative;z-index:2;background:var(--mz-paper);border-radius:16px;display:grid;box-shadow:0 1px 2px rgba(21,18,16,.06),0 14px 28px -16px rgba(21,18,16,.35)}
.mz-acts.two{grid-template-columns:1fr 1fr}.mz-acts.one{grid-template-columns:1fr}
.mz-act{border:0;background:transparent;color:var(--mz-ink);padding:14px 8px;display:flex;align-items:center;justify-content:center;gap:10px;font-size:13px;font-weight:600;min-height:60px}
.mz-act+.mz-act{border-left:1px solid var(--mz-line)}
.mz-act:disabled{opacity:.6}
.mz-act .ic{width:34px;height:34px;border-radius:50%;background:var(--mz-bg);display:grid;place-items:center}
.mz-act .ic svg{width:18px;height:18px}
.mz-act.pri .ic{background:#FFC531;color:#151210}
/* quiz + cashback */
.mz-promo{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 16px 0}.mz-promo.solo{grid-template-columns:1fr}
.mz-pcard{border-radius:16px;padding:12px;display:flex;flex-direction:column;position:relative;overflow:hidden;text-decoration:none}
.mz-pcard .bt{height:32px;border-radius:10px;display:grid;place-items:center;font:700 12.5px Archivo,sans-serif;margin-top:auto;border:0;width:100%}
.mz-pcard.pq{background:linear-gradient(165deg,#0F3A4A 0%,#082B38 70%);color:#fff;box-shadow:0 14px 26px -16px rgba(8,43,56,.9)}
.mz-pcard.pq .ico{width:30px;height:30px;border-radius:50%;background:#FFC531;display:grid;place-items:center;margin:0 0 8px}
.mz-pcard.pq .ico svg{width:16px;height:16px}
.mz-pcard.pq b{display:block;font-size:14px;font-weight:700;line-height:1.2}
.mz-pcard.pq p{margin:3px 0 10px;font-size:11.5px;line-height:1.4;color:#A9C6CD}
.mz-pcard.pq .bt{background:#FFC531;color:#151210}
.mz-pcard.pc5{background:linear-gradient(165deg,#FFD35C 0%,#FFC531 70%);color:#151210;box-shadow:0 14px 26px -16px rgba(168,114,0,.9)}
.mz-pcard .top5{display:flex;align-items:flex-end;gap:5px;line-height:1;min-height:38px}
.mz-pcard .top5 .up{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#5C4607;padding-bottom:4px}
.mz-pcard .big{font-family:Anton,sans-serif;font-size:38px;line-height:.95}.mz-pcard .big small{font-size:20px}
.mz-pcard .saldo{font-family:Anton,sans-serif;font-size:30px;line-height:1;margin-top:2px}
.mz-pcard .rt2{margin:6px 0 10px;font-size:12px;line-height:1.35;font-weight:600;color:#3D2F04}
.mz-pcard.pc5 .bt{background:#151210;color:#fff}
.mz-pcard.pc5 .bt.ok{background:rgba(21,18,16,.12);color:#151210}
/* busca + abas */
.mz-sbar{margin:14px 16px 0;height:44px;border-radius:12px;background:var(--mz-paper);border:1px solid var(--mz-line);display:flex;align-items:center;gap:10px;padding:0 14px;color:var(--mz-muted)}
.mz-sbar svg{width:17px;height:17px;flex:none}
.mz-sbar input{flex:1;min-width:0;border:0;background:transparent;color:var(--mz-ink);font:inherit;font-size:14px;outline:none}
.mz-cats{display:flex;gap:8px;overflow-x:auto;padding:12px 16px;scrollbar-width:none;position:sticky;top:0;z-index:6;background:var(--mz-bg)}
.mz-cats.under{top:62px}
.mz-cats button{flex:none;height:34px;padding:0 15px;border-radius:17px;border:1px solid var(--mz-line);background:var(--mz-paper);color:var(--mz-ink);font-weight:600;font-size:13px}
.mz-cats button.on{background:#151210;color:#fff;border-color:#151210}
/* lista */
.mz-sec{padding:6px 16px 0}
.mz-h{display:flex;align-items:baseline;justify-content:space-between;margin:12px 0 12px}
.mz-h b{font-size:15px;font-weight:700}.mz-h small{font-size:12px;color:var(--mz-muted)}
.mz-lista{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.mz-item{display:flex;gap:14px;align-items:center;background:var(--mz-paper);border-radius:16px;padding:12px;box-shadow:0 1px 2px rgba(21,18,16,.05),0 8px 18px -14px rgba(21,18,16,.3)}
.mz-item img{width:80px;height:80px;object-fit:cover;border-radius:12px;flex:none;background:var(--mz-line)}
.mz-info{flex:1;min-width:0}
.mz-info b{display:block;font-size:14.5px;font-weight:600;line-height:1.3}
.mz-info small{display:-webkit-box;font-size:12px;color:var(--mz-muted);line-height:1.4;margin-top:3px;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.mz-preco{display:block;margin-top:7px;font-size:14px;font-weight:700;font-variant-numeric:tabular-nums}
.mz-preco s{font-weight:400;color:var(--mz-muted);font-size:12px;margin-left:6px}.mz-preco em{font-style:normal;font-weight:400;color:var(--mz-muted);font-size:12px}
.mz-add{flex:none;width:38px;height:38px;border-radius:50%;background:#FFC531;color:#151210;border:0;display:grid;place-items:center;font-size:22px;font-weight:600;line-height:1;box-shadow:0 4px 10px -4px rgba(21,18,16,.45)}
.mz-add .n{font-size:14px;font-weight:800}
.mz-step{flex:none;display:flex;align-items:center;height:38px;border-radius:19px;background:var(--mz-bg);border:1px solid var(--mz-line)}
.mz-step button{width:34px;height:100%;border:0;background:transparent;color:var(--mz-ink);font-size:18px;line-height:1}
.mz-step b{min-width:20px;text-align:center;font-size:14px;font-weight:700}
.mz-peso{flex:none;height:36px;padding:0 12px;border-radius:18px;border:1px solid #CFCBC2;background:transparent;color:var(--mz-ink);font:600 11.5px Archivo,sans-serif;text-align:center;line-height:1.1}
.mz-vazio{text-align:center;color:var(--mz-muted);padding:30px 0}
.mz-barra{position:fixed;left:16px;right:16px;max-width:608px;margin:0 auto;bottom:16px;z-index:6;height:54px;border-radius:16px;background:#151210;color:#fff;border:0;display:flex;align-items:center;justify-content:space-between;padding:0 8px 0 18px;font-size:14.5px;font-weight:600;box-shadow:0 16px 28px -12px rgba(21,18,16,.65)}
.mz-barra .l{display:flex;align-items:center;gap:10px}
.mz-barra i{font-style:normal;display:inline-grid;place-items:center;min-width:24px;height:24px;border-radius:12px;background:#FFC531;color:#151210;font-size:12.5px;font-weight:800}
.mz-barra .p{height:38px;padding:0 16px;border-radius:12px;background:#FFC531;color:#151210;font-weight:800;display:grid;place-items:center;font-variant-numeric:tabular-nums}
/* tela de acompanhamento */
.mz-st{padding:84px 20px 40px}
.mz-okh{text-align:center}
.mz-okh h2{margin:18px 0 4px;font-family:inherit;font-size:22px;font-weight:700;text-transform:none}
.mz-okh p{margin:0;color:var(--mz-muted);font-size:13.5px;line-height:1.45}
.mz-ok{box-shadow:0 0 0 8px rgba(15,138,87,.12)}
.mz-tl{margin:22px 0 0;background:var(--mz-paper);border-radius:16px;padding:16px 16px 14px;box-shadow:0 1px 2px rgba(21,18,16,.05),0 8px 18px -14px rgba(21,18,16,.3)}
.mz-tl .s{display:flex;gap:14px;position:relative;padding-bottom:16px}.mz-tl .s:last-child{padding-bottom:0}
.mz-tl .s:not(:last-child)::before{content:"";position:absolute;left:7px;top:19px;bottom:1px;width:2px;background:var(--mz-line)}
.mz-tl .s.d:not(:last-child)::before{background:#0F8A57}
.mz-tl i{width:16px;height:16px;border-radius:50%;flex:none;margin-top:2px;border:2px solid #D6D2C8;background:var(--mz-paper)}
.mz-tl .d i{background:#0F8A57;border-color:#0F8A57}
.mz-tl .n i{border-color:var(--mz-ink);box-shadow:0 0 0 4px rgba(120,116,106,.18)}
.mz-tl b{display:block;font-size:14px;font-weight:600}.mz-tl span{font-size:12.5px;color:var(--mz-muted)}
.mz-tl .w b{color:var(--mz-muted);font-weight:500}
.mz-sum{margin-top:12px;background:var(--mz-paper);border-radius:16px;padding:12px 16px;font-size:13.5px;box-shadow:0 1px 2px rgba(21,18,16,.05),0 8px 18px -14px rgba(21,18,16,.3)}
.mz-sum .r{display:flex;justify-content:space-between;gap:12px;padding:5px 0}
.mz-sum .tot{border-top:1px solid var(--mz-line);margin-top:6px;padding-top:11px;font-weight:700;font-size:15px}
.mz-stack{margin-top:18px;display:flex;flex-direction:column;gap:8px}
.mz-pb{height:50px;border-radius:14px;background:#FFC531;color:#151210;border:0;font:700 15px Archivo,sans-serif;width:100%}
.mz-pb.g{background:var(--mz-paper);color:var(--mz-ink);border:1px solid var(--mz-line);height:46px;font-weight:600;font-size:14.5px}
.mz-pb:disabled{opacity:.5}
/* folha do cashback */
.mz-cs{display:flex;flex-direction:column;padding-bottom:6px}
.mz-cs .ico5{width:54px;height:54px;border-radius:50%;background:#FFC531;color:#151210;display:grid;place-items:center;font-family:Anton,sans-serif;font-size:21px;padding-top:2px}
.mz-cs h3{margin:14px 0 4px;font-family:inherit;font-size:21px;font-weight:700}
.mz-cs .s{margin:0;color:var(--mz-muted);font-size:13.5px;line-height:1.5}
.mz-cs label{margin-top:16px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--mz-muted)}
.mz-cs input{margin:8px 0 14px;height:50px;border-radius:12px;border:1.5px solid var(--mz-ink);background:var(--mz-paper);color:var(--mz-ink);font:inherit;font-size:16px;padding:0 14px}
.mz-cs .nt{margin:12px 0 0;font-size:12px;line-height:1.5;color:var(--mz-muted);text-align:center}
.mz-cs .mz-link{align-self:center;margin-top:8px}
.mz-sh h2:empty{display:none}
@media (min-width:720px){.mz-mini{left:50%;transform:translate(-50%,-110%)}.mz-mini.on{transform:translate(-50%,0)}}

.mz-hero h1,.mz-hero p{text-align:center}
.mz-hero p{margin-left:auto;margin-right:auto;max-width:300px}
.mz-promo{margin-top:-28px;position:relative;z-index:2}
.mz-acts{margin-top:12px}
.mz-vercard{display:flex;align-items:center;justify-content:center;gap:10px;width:calc(100% - 32px);margin:12px 16px 0;height:52px;border-radius:14px;border:0;background:#151210;color:#fff;font:700 15px Archivo,sans-serif;box-shadow:0 14px 26px -16px rgba(21,18,16,.7)}
.mz-vercard svg{width:18px;height:18px;transition:transform .2s ease}
.mz-vercard.on svg{transform:rotate(180deg)}
.mz-menu{padding-bottom:8px}
button.mz-pcard{border:0;text-align:left;font:inherit;cursor:pointer;width:100%}
.mz-chk{display:flex;gap:10px;align-items:flex-start;margin:12px 0 0 !important;font-size:13px !important;line-height:1.4;color:var(--mz-ink) !important;text-transform:none !important;letter-spacing:0 !important;font-weight:500 !important}
.mz-chk input{width:20px;height:20px;margin:1px 0 0 !important;padding:0;border:0;flex:none;accent-color:#151210}
`
