'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

// Quiz em grupo na mesa: criar grupo (nome + código de 4 letras), entrar por código ou pela lista de
// grupos abertos na mesa, e disputar 15 perguntas iguais para todos. Sem cashback: só ranking.
// O servidor manda no relógio e na correção (api/mesa/quiz-grupo); esta tela só mostra o que ele devolve.

type TemaQ = { id: string; nome: string; icone: string }
type Aberta = { id: string; nome: string; codigo: string; tema?: string | null; jogadores: number; cheia: boolean }
type Inicio = { temas?: TemaQ[]; apelido: string; mesa: number | string; loja: string; slug: string; minha: { id: string; estado: string } | null; abertas: Aberta[] }
type PlacarLinha = { pos: number; apelido: string; pontos: number; ganhou?: number; acertou?: boolean | null; eu: boolean; acertos?: number }
type Estado = {
  fase: 'espera' | 'contagem' | 'pergunta' | 'revelacao' | 'fim' | 'aguardando_fim' | 'cancelada'
  sala: { id: string; nome: string; codigo: string; estado: string; tema?: string | null }
  souAnfitriao: boolean; slug: string
  jogadores?: { id: string; apelido: string; anfitriao: boolean }[] | number
  minimo?: number; maximo?: number
  restanteMs?: number; ordem?: number; total?: number; nivel?: number; categoria?: string
  enunciado?: string; opcoes?: string[]; euRespondi?: boolean; respondidos?: number; jogadoresTotal?: number
  certaPos?: number; curiosidade?: string | null; minha?: { pos: number; acertou: boolean; pontos: number } | null
  placar?: PlacarLinha[]; grupo?: { nome: string; media: number; jogadores: number }
}
type Rank = { individual: { pos: number; apelido: string; pontos: number; eu: boolean }[]; grupos: { pos: number; nome: string; media: number; jogadores: number }[] }

// Quem ainda não se identificou vai para a identificação da mesa e volta para esta mesma página (com o convite).
const identUrl = (token: string) => `/mesa/${token}?identificar=jogar&voltar=${encodeURIComponent(window.location.pathname + window.location.search)}`

const NIVEIS = ['Muito fácil', 'Fácil', 'Intermediário', 'Difícil', 'Impossível']
const LETRAS = ['A', 'B', 'C', 'D']

export default function GrupoClient({ token }: { token: string }) {
  const LS = 'quizjt:' + token
  const [jt, setJt] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)
  const [inicio, setInicio] = useState<Inicio | null>(null)
  const [salaId, setSalaId] = useState<string | null>(null)
  const [est, setEst] = useState<Estado | null>(null)
  const [recebidoEm, setRecebidoEm] = useState(0)
  const [agora, setAgora] = useState(0)
  const [nome, setNome] = useState('')
  const [tema, setTema] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [escolhida, setEscolhida] = useState<{ ordem: number; pos: number; acertou?: boolean; pontos?: number } | null>(null)
  const [rank, setRank] = useState<Rank | null>(null)
  const [qr, setQr] = useState('')
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const jtRef = useRef<string | null>(null)

  const chamar = useCallback(async (acao: string, extra: Record<string, unknown> = {}) => {
    const r = await fetch('/api/mesa/quiz-grupo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, jt: jtRef.current, acao, ...extra }) })
    const d = await r.json().catch(() => ({}))
    if (r.status === 401) { try { localStorage.removeItem(LS) } catch {} window.location.assign(identUrl(token)); return { ok: false as const, status: 401, d } }
    return { ok: r.ok, status: r.status, d }
  }, [token, LS])

  // Identificação: a mesma do quiz solo (guardada neste aparelho).
  useEffect(() => {
    Promise.resolve().then(() => {
      let v: string | null = null
      try { v = localStorage.getItem(LS) } catch {}
      if (!v) { window.location.assign(identUrl(token)); return }
      jtRef.current = v; setJt(v)
    })
  }, [LS, token])

  const carregarInicio = useCallback(async () => {
    const r = await chamar('inicio')
    if (!r.ok) { if (r.status !== 401) setMsg(r.d?.error || 'Não consegui abrir o quiz em grupo.'); setPronto(true); return }
    if (r.d.ativo === false) { setMsg('O quiz não está ligado nesta loja agora.'); setPronto(true); return }
    setInicio(r.d as Inicio)
    if (r.d.minha) setSalaId(r.d.minha.id)
    setPronto(true)
  }, [chamar])

  useEffect(() => { if (jt) Promise.resolve().then(carregarInicio) }, [jt, carregarInicio])

  // Convite por QR: ?sala=<id> entra direto na sala, sem digitar código.
  const convite = useRef<string | null>(null)
  useEffect(() => {
    if (!inicio || convite.current !== null) return
    const id = new URLSearchParams(window.location.search).get('sala')
    convite.current = id || ''
    if (!id) return
    window.history.replaceState(null, '', window.location.pathname)
    if (inicio.minha) return
    Promise.resolve().then(async () => {
      setBusy(true)
      const r = await chamar('entrar', { salaId: id })
      setBusy(false)
      if (!r.ok) { setMsg(r.d?.error || 'Não consegui entrar no grupo.'); return }
      setEst(null); setSalaId(r.d.salaId)
    })
  }, [inicio, chamar])

  // QR da sala: quem escaneia entra direto neste grupo.
  const esperando = est?.fase === 'espera' && !!salaId
  useEffect(() => {
    if (!esperando || !salaId) return
    let vivo = true
    const link = `${window.location.origin}/mesa/${token}/grupo?sala=${salaId}`
    QRCode.toDataURL(link, { width: 480, margin: 1, color: { dark: '#0A2A33', light: '#FFFFFF' } }).then(u => { if (vivo) setQr(u) }).catch(() => {})
    return () => { vivo = false }
  }, [esperando, salaId, token])

  // Consulta o estado da sala: a cada 2 s e de novo na virada de fase (a contagem é feita aqui no celular).
  useEffect(() => {
    if (!salaId) return
    let vivo = true
    const rodar = async () => {
      const r = await chamar('estado', { salaId })
      if (!vivo) return
      let prox = 2000
      if (r.ok) {
        const e = r.d as Estado
        setEst(e); setRecebidoEm(Date.now())
        if (e.fase === 'cancelada') { setSalaId(null); setMsg('Esse grupo foi encerrado.'); return }
        if (e.fase === 'fim' || e.fase === 'aguardando_fim') prox = e.fase === 'fim' ? 0 : 1000
        if (e.restanteMs != null && e.fase !== 'espera') prox = Math.max(250, Math.min(2000, e.restanteMs + 200))
      } else if (r.status === 404 || r.status === 403) { setSalaId(null); setEst(null); return }
      if (prox > 0) pollRef.current = setTimeout(rodar, prox)
    }
    void rodar()
    return () => { vivo = false; if (pollRef.current) clearTimeout(pollRef.current) }
  }, [salaId, chamar])

  // Relógio da tela (só enquanto há contagem).
  useEffect(() => {
    if (!est || est.restanteMs == null || est.fase === 'espera' || est.fase === 'fim') return
    const id = setInterval(() => setAgora(Date.now()), 200)
    return () => clearInterval(id)
  }, [est])

  // No fim, busca o ranking.
  const fim = est?.fase === 'fim'
  useEffect(() => {
    if (!fim) return
    let vivo = true
    chamar('ranking', { aba: 'sem' }).then(r => { if (vivo && r.ok) setRank(r.d as Rank) })
    return () => { vivo = false }
  }, [fim, chamar])

  const restante = est?.restanteMs != null ? Math.max(0, est.restanteMs - ((agora || recebidoEm) - recebidoEm)) : 0

  async function criar() {
    setBusy(true); setMsg('')
    const r = await chamar('criar', { nome, tema: tema || null })
    setBusy(false)
    if (!r.ok) { setMsg(r.d?.error || 'Não consegui criar o grupo.'); return }
    setEst(null); setSalaId(r.d.salaId)
  }
  async function entrar(extra: Record<string, unknown>) {
    setBusy(true); setMsg('')
    const r = await chamar('entrar', extra)
    setBusy(false)
    if (!r.ok) { setMsg(r.d?.error || 'Não consegui entrar no grupo.'); return }
    setEst(null); setSalaId(r.d.salaId)
  }
  async function sair() {
    if (!salaId) return
    await chamar('sair', { salaId })
    setSalaId(null); setEst(null); setEscolhida(null); setRank(null); void carregarInicio()
  }
  async function iniciar() {
    if (!salaId) return
    setBusy(true); setMsg('')
    const r = await chamar('iniciar', { salaId })
    setBusy(false)
    if (!r.ok) setMsg(r.d?.error || 'Não consegui começar.')
  }
  async function responder(pos: number) {
    if (!salaId || !est || est.fase !== 'pergunta' || !est.ordem) return
    const ordem = est.ordem
    if (escolhida?.ordem === ordem) return
    setEscolhida({ ordem, pos })
    const r = await chamar('responder', { salaId, ordem, pos })
    if (r.ok) setEscolhida({ ordem, pos, acertou: r.d.acertou, pontos: r.d.pontos })
    else setMsg(r.d?.error || '')
  }
  function novaPartida() { setSalaId(null); setEst(null); setEscolhida(null); setRank(null); setMsg(''); void carregarInicio() }

  const minhaEscolha = est?.ordem && escolhida?.ordem === est.ordem ? escolhida : null
  const jogadoresLista = Array.isArray(est?.jogadores) ? est!.jogadores as { id: string; apelido: string; anfitriao: boolean }[] : []

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@400;500;600;700&display=swap" />
      <style>{CSS}</style>
      <div className="gq">
        <div className="gq-in">
          <header className="gq-bar">
            <button type="button" className="gq-back" onClick={() => { if (salaId && est?.fase !== 'fim') { void sair() } else window.location.assign(`/mesa/${token}/quiz`) }}>‹ {salaId && est?.fase !== 'fim' ? 'Sair do grupo' : 'Quiz'}</button>
            <b>{(inicio?.loja || 'Quiz em grupo').trim()}</b>
            <span>{inicio ? `Mesa ${inicio.mesa}` : ''}</span>
          </header>

          {!pronto && <p className="gq-mut">Carregando…</p>}
          {pronto && msg && !salaId && !inicio && <div className="gq-card"><p>{msg}</p></div>}

          {/* ---------- início: criar ou entrar ---------- */}
          {pronto && inicio && !salaId && (
            <div className="gq-stack">
              <div className="gq-hero"><span className="gq-kick">Quiz em grupo</span><h1>Quem sabe mais?</h1><p>15 perguntas iguais para todos. Vale ranking e a honra da mesa — aqui não tem cashback.</p></div>

              <div className="gq-card">
                <h2>Criar um grupo</h2>
                <div className="gq-temabox"><span>Tema da partida</span>
                  <div className="gq-chips">
                    <button type="button" className={'gq-chip' + (!tema ? ' on' : '')} onClick={() => setTema('')}>🎲 Misturado</button>
                    {(inicio.temas || []).map(t => <button type="button" key={t.id} className={'gq-chip' + (tema === t.id ? ' on' : '')} onClick={() => setTema(t.id)}>{t.icone} {t.nome}</button>)}
                  </div>
                </div>
                <label>Nome do grupo<input value={nome} onChange={e => setNome(e.target.value)} maxLength={24} placeholder="Ex.: Os Pescadores" /></label>
                <button type="button" className="gq-btn" disabled={busy || nome.trim().length < 2} onClick={criar}>{busy ? 'Criando…' : 'Criar e gerar código'}</button>
              </div>

              <div className="gq-card">
                <h2>Entrar em um grupo</h2>
                {inicio.abertas.length > 0 ? (
                  <div className="gq-abertas">
                    {inicio.abertas.map(a => (
                      <button type="button" key={a.id} className="gq-aberta" disabled={busy || a.cheia} onClick={() => entrar({ salaId: a.id })}>
                        <b>{a.nome}{a.tema ? ` · ${(inicio.temas || []).find(t => t.id === a.tema)?.nome || ''}` : ''}</b><span>{a.cheia ? 'cheio' : `${a.jogadores} ${a.jogadores === 1 ? 'jogador' : 'jogadores'} · entrar`}</span>
                      </button>
                    ))}
                  </div>
                ) : <p>Nenhum grupo aberto nesta mesa agora. Peça para quem criou o grupo mostrar o QR e escaneie com a câmera do celular.</p>}
              </div>
              {msg && <div className="gq-warn">{msg}</div>}
              <p className="gq-mut" style={{ textAlign: 'center' }}>Jogando como <b>{inicio.apelido}</b></p>
            </div>
          )}

          {/* ---------- sala de espera ---------- */}
          {salaId && est?.fase === 'espera' && (
            <div className="gq-stack">
              <div className="gq-hero"><span className="gq-kick">Grupo{est.sala.tema ? ` · ${(inicio?.temas || []).find(t => t.id === est.sala.tema)?.nome || ''}` : ' · tema misturado'}</span><h1>{est.sala.nome}</h1></div>
              <div className="gq-qr">
                <b>Chame os amigos</b>
                <span>Peça para escanearem este QR com a câmera do celular. Eles entram direto no grupo.</span>
                {qr ? /* eslint-disable-next-line @next/next/no-img-element -- QR gerado no navegador (data URL) */ <img src={qr} alt={`QR code para entrar no grupo ${est.sala.nome}`} width={220} height={220} /> : <div className="gq-qr-ph" />}
              </div>
              <div className="gq-card">
                <h2>Jogadores ({jogadoresLista.length}/{est.maximo})</h2>
                <ul className="gq-lista">
                  {jogadoresLista.map(j => <li key={j.id}><span>{j.apelido}</span>{j.anfitriao && <em>anfitrião</em>}</li>)}
                </ul>
              </div>
              {est.souAnfitriao
                ? <button type="button" className="gq-btn" disabled={busy || jogadoresLista.length < (est.minimo || 2)} onClick={iniciar}>{busy ? 'Começando…' : jogadoresLista.length < (est.minimo || 2) ? `Espere pelo menos ${est.minimo} jogadores` : 'Começar a partida'}</button>
                : <p className="gq-mut" style={{ textAlign: 'center' }}>Aguardando o anfitrião começar…</p>}
              {msg && <div className="gq-warn">{msg}</div>}
            </div>
          )}

          {/* ---------- contagem ---------- */}
          {salaId && est?.fase === 'contagem' && (
            <div className="gq-center"><span className="gq-kick">Prepare-se</span><div className="gq-big">{Math.max(1, Math.ceil(restante / 1000))}</div><p>{est.sala.nome} · {est.jogadores as number} jogadores</p></div>
          )}

          {/* ---------- pergunta ---------- */}
          {salaId && est?.fase === 'pergunta' && (
            <div className="gq-stack">
              <div className="gq-hud"><span>Pergunta <b>{est.ordem}</b>/{est.total}</span><span className="gq-nv">{NIVEIS[(est.nivel || 1) - 1]}</span><span className="gq-tm">{Math.ceil(restante / 1000)}s</span></div>
              <div className="gq-barra"><i style={{ width: `${Math.max(0, Math.min(100, (restante / 10000) * 100))}%` }} /></div>
              <div className="gq-q"><small>{est.categoria}</small>{est.enunciado}</div>
              <div className="gq-ops">
                {est.opcoes?.map((o, i) => (
                  <button type="button" key={i} className={'gq-op' + (minhaEscolha?.pos === i ? ' pick' : '')} disabled={!!minhaEscolha} onClick={() => responder(i)}><i>{LETRAS[i]}</i>{o}</button>
                ))}
              </div>
              <p className="gq-mut" style={{ textAlign: 'center' }}>{minhaEscolha ? 'Resposta enviada! Aguarde a revelação…' : 'Responda rápido: quanto antes, mais pontos.'} · {est.respondidos}/{est.jogadoresTotal} responderam</p>
            </div>
          )}

          {/* ---------- revelação ---------- */}
          {salaId && est?.fase === 'revelacao' && (
            <div className="gq-stack">
              <div className="gq-hud"><span>Pergunta <b>{est.ordem}</b>/{est.total}</span><span /><span className="gq-tm">{Math.ceil(restante / 1000)}s</span></div>
              <div className="gq-q">{est.enunciado}</div>
              <div className="gq-ops">
                {est.opcoes?.map((o, i) => {
                  const certa = i === est.certaPos
                  const errei = est.minha?.pos === i && !certa
                  return <div key={i} className={'gq-op rev' + (certa ? ' right' : errei ? ' wrong' : ' dim')}><i>{LETRAS[i]}</i>{o}</div>
                })}
              </div>
              <div className={'gq-res ' + (est.minha?.acertou ? 'ok' : 'bad')}>
                {est.minha ? (est.minha.acertou ? `Acertou! +${est.minha.pontos} pontos` : 'Errou — 0 pontos') : 'Tempo esgotado — 0 pontos'}
              </div>
              {est.curiosidade && <p className="gq-cur">💡 {est.curiosidade}</p>}
              <div className="gq-card"><h2>Placar</h2><Placar linhas={est.placar || []} mostrarGanho /></div>
            </div>
          )}

          {salaId && est?.fase === 'aguardando_fim' && <div className="gq-center"><p>Contando os pontos…</p></div>}

          {/* ---------- fim ---------- */}
          {salaId && est?.fase === 'fim' && (
            <div className="gq-stack">
              <div className="gq-hero"><span className="gq-kick">Fim da partida</span><h1>🏆 {est.placar?.[0]?.apelido}</h1><p>é o campeão do grupo <b>{est.grupo?.nome}</b></p></div>
              <div className="gq-card"><h2>Placar final</h2><Placar linhas={est.placar || []} /></div>
              <div className="gq-card"><h2>Seu grupo</h2><p>Média de <b>{est.grupo?.media}</b> pontos por jogador, com {est.grupo?.jogadores} jogadores. Entra no ranking de grupos da semana.</p></div>
              {rank && (
                <div className="gq-card">
                  <h2>Ranking de grupos · semana</h2>
                  {rank.grupos.length === 0 ? <p className="gq-mut">Ainda não há grupos no ranking.</p> : (
                    <ul className="gq-lista">{rank.grupos.slice(0, 5).map(g => <li key={g.pos} className={g.nome === est.grupo?.nome ? 'eu' : ''}><span>{g.pos}º {g.nome}</span><em>{g.media} pts</em></li>)}</ul>
                  )}
                </div>
              )}
              <button type="button" className="gq-btn" onClick={novaPartida}>Jogar de novo</button>
              <a className="gq-btn alt" style={{ textAlign: 'center', textDecoration: 'none', display: 'grid', placeItems: 'center' }} href={`/jogos/${est.slug}`}>Ver todos os rankings</a>
              <a className="gq-alt" style={{ textAlign: 'center' }} href={`/mesa/${token}`}>Voltar à mesa</a>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function Placar({ linhas, mostrarGanho }: { linhas: PlacarLinha[]; mostrarGanho?: boolean }) {
  return (
    <ul className="gq-lista">
      {linhas.map(l => (
        <li key={l.pos + l.apelido} className={l.eu ? 'eu' : ''}>
          <span>{l.pos}º {l.apelido}{l.eu ? ' (você)' : ''}</span>
          <em>{l.pontos} pts{mostrarGanho && l.ganhou ? <small> +{l.ganhou}</small> : null}</em>
        </li>
      ))}
    </ul>
  )
}

const CSS = `
body{background:#082B38}
.gq{position:fixed;inset:0;overflow:auto;background:radial-gradient(120% 70% at 50% 0%,#0E4D64 0%,#082B38 70%);color:#fff;font-family:'Archivo',system-ui,-apple-system,'Segoe UI',sans-serif}
.gq-in{max-width:520px;margin:0 auto;padding:0 16px 28px;display:grid;gap:12px;align-content:start}
.gq-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:max(10px,env(safe-area-inset-top)) 0 8px;border-bottom:1px solid rgba(255,255,255,.14)}
.gq-bar b{font-family:'Anton',Impact,sans-serif;font-weight:400;font-size:17px;letter-spacing:.01em;text-transform:uppercase;text-align:center;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gq-bar span{font-size:12px;color:#BFD9DE;font-weight:600}
.gq-back{font:600 14px 'Archivo',system-ui,sans-serif;background:transparent;border:0;color:#fff;cursor:pointer;min-height:44px;padding:0;white-space:nowrap}
.gq-stack{display:grid;gap:12px}
.gq-hero{text-align:center;display:grid;gap:6px;padding-top:8px}
.gq-kick{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#FFC531;font-weight:700}
.gq-hero h1{margin:0;font-family:'Anton',Impact,sans-serif;font-weight:400;font-size:34px;line-height:1.05;text-wrap:balance}
.gq-hero p{margin:0;font-size:14px;color:#CFE3E6;line-height:1.4}
.gq-card{background:#fff;color:#151210;border-radius:14px;padding:16px;display:grid;gap:10px}
.gq-card h2{margin:0;font-family:'Anton',Impact,sans-serif;font-weight:400;font-size:22px}
.gq-card p{margin:0;font-size:14px;line-height:1.4}
.gq-card label{display:grid;gap:5px;font-size:12.5px;font-weight:700;color:#4a4742}
.gq-card input{font:500 16px 'Archivo',system-ui,sans-serif;min-height:48px;border:1.5px solid #DEDBD2;border-radius:10px;padding:0 12px;background:#FAFAF8;color:#151210}
.gq-card input:focus-visible{outline:3px solid #FFC531;outline-offset:1px}
.gq-cod{font-size:26px!important;letter-spacing:.4em;text-align:center;text-transform:uppercase}
.gq-btn{font:700 16px 'Archivo',system-ui,sans-serif;min-height:50px;border:0;border-radius:10px;background:#FFC531;color:#151210;cursor:pointer;width:100%;padding:0 16px}
.gq-btn.alt{background:transparent;border:2px solid currentColor;color:inherit}
.gq-card .gq-btn.alt{color:#151210}
.gq-btn:disabled{opacity:.5;cursor:default}
.gq-btn:focus-visible,.gq-op:focus-visible,.gq-aberta:focus-visible,.gq-back:focus-visible{outline:3px solid #fff;outline-offset:2px}
.gq-alt{font:600 14px 'Archivo',system-ui,sans-serif;color:#CFE3E6;text-decoration:underline;padding:8px}
.gq-abertas{display:grid;gap:8px}
.gq-aberta{display:flex;justify-content:space-between;align-items:center;gap:8px;min-height:50px;border:2px solid #DEDBD2;border-radius:10px;background:#fff;padding:0 12px;cursor:pointer;font:600 15px 'Archivo',system-ui,sans-serif;color:#151210;text-align:left}
.gq-aberta span{font-size:12.5px;color:#6F6C67}
.gq-aberta:disabled{opacity:.5}
.gq-qr{background:#fff;color:#151210;border-radius:16px;padding:16px;display:grid;gap:8px;justify-items:center;text-align:center}
.gq-qr b{font-family:'Anton',Impact,sans-serif;font-weight:400;font-size:24px;letter-spacing:.01em}
.gq-qr span{font-size:13px;color:#4a4742;line-height:1.4;max-width:30ch}
.gq-qr img,.gq-qr-ph{width:min(220px,62vw);height:min(220px,62vw);border-radius:10px;border:1px solid #DEDBD2}
.gq-qr-ph{background:#F4F2EC}
.gq-qr small{font-size:12.5px;color:#6F6C67}
.gq-qr em{font-style:normal;font-weight:700;letter-spacing:.2em;color:#151210}
.gq-code{background:rgba(255,197,49,.12);border:2px dashed #FFC531;border-radius:14px;padding:16px;text-align:center;display:grid;gap:4px}
.gq-code small{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#FFC531;font-weight:700}
.gq-code b{font-family:'Anton',Impact,sans-serif;font-weight:400;font-size:60px;letter-spacing:.2em;line-height:1.1;padding-left:.2em}
.gq-code span{font-size:12.5px;color:#CFE3E6;line-height:1.4}
.gq-lista{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.gq-lista li{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:9px 12px;border-radius:9px;background:#F4F2EC;font-size:14.5px;font-weight:600;color:#151210}
.gq-lista li.eu{background:#FFF0C2}
.gq-lista em{font-style:normal;font-size:12.5px;color:#6F6C67;font-weight:700}
.gq-lista small{color:#0F8A57;font-weight:700}
.gq-center{text-align:center;display:grid;gap:10px;justify-items:center;padding-top:40px}
.gq-big{font-family:'Anton',Impact,sans-serif;font-size:120px;line-height:1;color:#FFC531}
.gq-hud{display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#CFE3E6;padding-top:8px}
.gq-hud b{color:#fff}
.gq-nv{font-size:11px;letter-spacing:.07em;text-transform:uppercase;font-weight:700;color:#FFC531}
.gq-tm{font-family:'Anton',Impact,sans-serif;font-size:26px;color:#fff;font-variant-numeric:tabular-nums}
.gq-barra{height:8px;border-radius:99px;background:rgba(255,255,255,.14);overflow:hidden}
.gq-barra i{display:block;height:100%;background:#FFC531;transition:width .25s linear}
.gq-q{background:#E9F4F3;color:#0A2A33;border-radius:14px;padding:16px;font-weight:700;font-size:19px;line-height:1.25;text-wrap:balance}
.gq-q small{display:block;font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:#4A7783;margin-bottom:6px}
.gq-ops{display:grid;gap:8px}
.gq-op{font:600 16px 'Archivo',system-ui,sans-serif;text-align:left;min-height:54px;border-radius:10px;border:2px solid rgba(255,255,255,.18);background:rgba(255,255,255,.07);color:#fff;display:flex;align-items:center;gap:12px;padding:0 14px;cursor:pointer}
.gq-op i{font-style:normal;font-family:'Anton',Impact,sans-serif;font-size:18px;color:#FFC531;width:18px}
.gq-op.pick{background:#FFC531;border-color:#FFC531;color:#151210}
.gq-op.pick i{color:#151210}
.gq-op:disabled{cursor:default}
.gq-op.rev{cursor:default}
.gq-op.right{background:#0F8A57;border-color:#0F8A57}
.gq-op.right i{color:#fff}
.gq-op.wrong{background:#D6392B;border-color:#D6392B}
.gq-op.wrong i{color:#fff}
.gq-op.dim{opacity:.45}
.gq-res{text-align:center;font-weight:700;font-size:16px;border-radius:10px;padding:10px}
.gq-res.ok{background:rgba(15,138,87,.25);color:#7CF0B8}
.gq-res.bad{background:rgba(214,57,43,.25);color:#FFB0A8}
.gq-cur{margin:0;font-size:13.5px;color:#E4EEF0;line-height:1.45}
.gq-warn{background:#FDECEA;color:#9B2318;border-radius:10px;padding:10px 12px;font-size:13px;font-weight:600}
.gq-temabox{display:grid;gap:6px;font-size:12.5px;font-weight:700;color:#4a4742}
.gq-chips{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.gq-chip{display:flex;align-items:center;gap:8px;text-align:left;font:600 13px/1.2 'Archivo',system-ui,sans-serif;min-height:48px;padding:6px 10px;border-radius:10px;border:1.5px solid #DEDBD2;background:#fff;color:#151210;cursor:pointer}
.gq-chip.on{background:#FFF3CC;border-color:#E0A800;box-shadow:inset 0 0 0 1px #E0A800}
.gq-mut{margin:0;font-size:13px;color:#BFD9DE;line-height:1.4}
`
