'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// Página da mesa (QR do cliente). O celular só PEDE: o servidor confere mesa,
// conta, produto, opções e preço, e o garçom confirma antes de ir pra cozinha.
// docs/DESENHO_MESAS_JOGOS.md §5.

type Opcao = { id: string; name: string; price: number }
type Grupo = { id: string; name: string; required: boolean; min: number; max: number; options: Opcao[] }
type Prod = { id: string; name: string; description: string | null; photo: string | null; categoriaId: string | null; preco: number; precoCheio: number | null; porPeso: boolean; grupos: Grupo[] }
type Info = { empresa: { nome: string }; mesa: { numero: number }; contaAberta: boolean; sessao: string | null; podePedir: boolean; cashback: { ativo: boolean; percentual: number }; categorias: { id: string; name: string }[]; produtos: Prod[] }
type Linha = { key: string; prod: Prod; qty: number; opcoes: Opcao[]; unit: number }
type Carteira = { verificado: boolean; saldo: number; telefone: string | null }
type Envio = { chamadoId: string; status: 'aberto' | 'atendido' | 'cancelado'; motivo: string | null }

const fmt = (n: number) => 'R$ ' + n.toFixed(2).replace('.', ',')
const PEND = (t: string) => `mesa_pend_${t}`

export default function MesaClient({ token }: { token: string }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [falha, setFalha] = useState('')
  const [cat, setCat] = useState<string>('todas')
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [opc, setOpc] = useState<{ p: Prod; sel: string[][] } | null>(null)
  const [carrinho, setCarrinho] = useState(false)
  const [obs, setObs] = useState('')
  const [tel, setTel] = useState('')
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
  // Identificação por código (cashback)
  const [cart, setCart] = useState<Carteira | null>(null)
  const [idTel, setIdTel] = useState('')
  const [idCod, setIdCod] = useState('')
  const [idEtapa, setIdEtapa] = useState<'tel' | 'codigo'>('tel')
  const [idMsg, setIdMsg] = useState('')
  const [idBusy, setIdBusy] = useState(false)
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
      if (r.data.contaAberta && r.data.cashback?.ativo) {
        call('carteira').then(c => { if (vivo && c.ok) setCart({ verificado: !!c.data.verificado, saldo: Number(c.data.saldo) || 0, telefone: c.data.telefone || null }) })
      }
    })
    return () => { vivo = false }
  }, [call, token])

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
  const visiveis = useMemo(() => (info?.produtos || []).filter(p => cat === 'todas' || p.categoriaId === cat), [info, cat])
  const catsComItem = useMemo(() => (info?.categorias || []).filter(c => info?.produtos.some(p => p.categoriaId === c.id)), [info])

  async function enviarCodigo() {
    setIdBusy(true); setIdMsg('')
    const r = await call('codigo_enviar', { telefone: idTel })
    setIdBusy(false)
    if (!r.ok) { setIdMsg(r.data?.error || 'Não consegui enviar o código.'); return }
    setIdEtapa('codigo'); setIdCod(''); setIdMsg('Enviamos um código de 6 números para o seu WhatsApp.')
  }
  async function confirmarCodigo() {
    setIdBusy(true); setIdMsg('')
    const r = await call('codigo_verificar', { telefone: idTel, codigo: idCod })
    setIdBusy(false)
    if (!r.ok) { setIdMsg(r.data?.error || 'Código incorreto.'); return }
    setCart({ verificado: true, saldo: Number(r.data.saldo) || 0, telefone: r.data.telefone || null }); setIdMsg('')
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
    setBusy(true); setAviso('')
    const r = await call('pedir', {
      itens: linhas.map(l => ({ produtoId: l.prod.id, qty: l.qty, opcoes: l.opcoes.map(o => o.id) })),
      obs: obs.trim() || undefined, telefone: tel.trim() || undefined,
    })
    setBusy(false)
    if (r.status === 409) { await carregar(); setAviso(r.data?.error || 'A conta mudou. Confira o pedido e envie de novo.'); return }
    if (!r.ok) { setAviso(r.data?.error || 'Não consegui enviar. Chame o garçom.'); return }
    try { localStorage.setItem(PEND(token), r.data.chamadoId) } catch {}
    setEnvio({ chamadoId: r.data.chamadoId, status: 'aberto', motivo: null })
    setCarrinho(false)
  }

  if (falha) return <Tela><div className="mz-box"><h1>Ops</h1><p>{falha}</p></div></Tela>
  if (!info) return <Tela><div className="mz-box"><p>Abrindo a mesa…</p></div></Tela>

  return (
    <Tela>
      <header className="mz-top">
        <div>
          <span className="mz-eyebrow">{info.empresa.nome}</span>
          <h1>Mesa {info.mesa.numero}</h1>
        </div>
        <div className="mz-acoes">
          <button className="mz-btn ghost" disabled={busy} onClick={() => chamar('garcom')}>{chamou === 'garcom' ? '✓ Garçom avisado' : 'Chamar garçom'}</button>
          {info.contaAberta && <button className="mz-btn ghost" disabled={busy} onClick={() => chamar('conta')}>{chamou === 'conta' ? '✓ Conta pedida' : 'Pedir a conta'}</button>}
        </div>
      </header>

      {quizOn && (
        <a href={`/mesa/${token}/quiz`} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#082B38', color: '#fff', borderRadius: 12, padding: '14px 16px', textDecoration: 'none', margin: '0 0 12px' }}>
          <span style={{ fontSize: 26 }}>🎣</span>
          <span style={{ display: 'grid', gap: 2 }}><b style={{ fontSize: 15 }}>Jogar · Quiz Pesca Premiada</b><span style={{ fontSize: 12.5, color: '#BFD9DE' }}>Acerte as perguntas e suba no ranking da loja</span></span>
        </a>
      )}

      {info.contaAberta && info.cashback.ativo && cart && (
        <section className="mz-cash" aria-label="Cashback">
          {cart.verificado ? (
            <>
              <b>🎁 Seu cashback nesta loja: {fmt(cart.saldo)}</b>
              <small>Ao pagar a conta você ganha {String(info.cashback.percentual).replace('.', ',')}% de volta para o próximo pedido. Para usar o saldo, avise o garçom na hora de pagar.</small>
            </>
          ) : idEtapa === 'tel' ? (
            <>
              <b>🎁 Ganhe {String(info.cashback.percentual).replace('.', ',')}% de volta</b>
              <small>Confirme seu WhatsApp e receba cashback para usar no próximo pedido.</small>
              <div className="mz-idrow">
                <input inputMode="tel" autoComplete="tel" placeholder="(21) 99999-9999" value={idTel} onChange={e => setIdTel(e.target.value)} aria-label="Seu WhatsApp" />
                <button className="mz-btn" disabled={idBusy || idTel.replace(/\D/g, '').length < 10} onClick={enviarCodigo}>{idBusy ? 'Enviando…' : 'Receber código'}</button>
              </div>
            </>
          ) : (
            <>
              <b>Digite o código que chegou no WhatsApp</b>
              <div className="mz-idrow">
                <input inputMode="numeric" maxLength={6} placeholder="000000" value={idCod} onChange={e => setIdCod(e.target.value.replace(/\D/g, ''))} aria-label="Código de 6 números" />
                <button className="mz-btn" disabled={idBusy || idCod.length < 6} onClick={confirmarCodigo}>{idBusy ? 'Conferindo…' : 'Confirmar'}</button>
              </div>
              <button className="mz-link" onClick={() => { setIdEtapa('tel'); setIdMsg('') }}>Trocar número</button>
            </>
          )}
          {idMsg && <small className="mz-idmsg" role="status">{idMsg}</small>}
        </section>
      )}

      {!info.podePedir ? (
        <div className="mz-box"><p>Hoje os pedidos desta mesa são feitos com o garçom. Use “Chamar garçom”.</p></div>
      ) : (
        <>
          {catsComItem.length > 1 && (
            <nav className="mz-cats" aria-label="Categorias">
              <button className={cat === 'todas' ? 'on' : ''} onClick={() => setCat('todas')}>Tudo</button>
              {catsComItem.map(c => <button key={c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>{c.name}</button>)}
            </nav>
          )}
          {aviso && !carrinho && <div className="mz-aviso" role="status">{aviso}</div>}
          <ul className="mz-lista">
            {visiveis.map(p => (
              <li key={p.id} className="mz-item">
                {p.photo && <img src={p.photo} alt="" loading="lazy" />}
                <div className="mz-info">
                  <b>{p.name}</b>
                  {p.description && <small>{p.description}</small>}
                  <span className="mz-preco">{p.porPeso ? `${fmt(p.preco)} / kg` : fmt(p.preco)}{p.precoCheio && !p.porPeso && <s>{fmt(p.precoCheio)}</s>}</span>
                </div>
                {p.porPeso
                  ? <button className="mz-btn peso" disabled={busy} onClick={() => chamar('garcom', `Quer pedir "${p.name}" (por peso)`)}>Chamar garçom</button>
                  : <button className="mz-add" aria-label={`Adicionar ${p.name}`} onClick={() => tocar(p)}>+</button>}
              </li>
            ))}
            {visiveis.length === 0 && <li className="mz-vazio">Nada por aqui ainda.</li>}
          </ul>
        </>
      )}

      {qtdTotal > 0 && !carrinho && (
        <button className="mz-barra" onClick={() => setCarrinho(true)}>
          <span>Ver pedido · {qtdTotal} {qtdTotal === 1 ? 'item' : 'itens'}</span><b>{fmt(total)}</b>
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
          {!info.contaAberta && (
            <label className="mz-lbl">Em qual WhatsApp coloco o pedido? <small>(opcional)</small>
              <input inputMode="tel" autoComplete="tel" value={tel} onChange={e => setTel(e.target.value)} placeholder="(21) 99999-9999" />
            </label>
          )}
          <p className="mz-nota">O garçom confirma o pedido antes de ir para a cozinha. {info.contaAberta ? '' : 'Sua conta será aberta por ele.'}</p>
          {aviso && <div className="mz-aviso" role="alert">{aviso}</div>}
          <div className="mz-tot"><span>Total do pedido</span><b>{fmt(total)}</b></div>
          <button className="mz-btn full" disabled={busy || linhas.length === 0} onClick={enviar}>{busy ? 'Enviando…' : 'Enviar para o garçom'}</button>
          <small className="mz-nota">Taxa de serviço, se houver, entra só na conta final.</small>
        </Sheet>
      )}

      {envio && (
        <div className="mz-ov" role="dialog" aria-modal="true">
          <div className="mz-card">
            {envio.status === 'aberto' && (<><div className="mz-pulse" aria-hidden="true" /><h2>Pedido enviado!</h2><p>Estamos avisando o garçom. Assim que ele confirmar, o pedido vai para a cozinha.</p></>)}
            {envio.status === 'atendido' && (<><div className="mz-ok" aria-hidden="true">✓</div><h2>Pedido confirmado</h2><p>Já está indo para a cozinha. Quer pedir mais alguma coisa?</p><button className="mz-btn full" onClick={() => setEnvio(null)}>Voltar ao cardápio</button></>)}
            {envio.status === 'cancelado' && (<><div className="mz-no" aria-hidden="true">!</div><h2>O garçom não pôde aceitar</h2><p>{envio.motivo || 'Chame o garçom para ajudar com o pedido.'}</p><button className="mz-btn full" onClick={() => setEnvio(null)}>Voltar ao cardápio</button></>)}
          </div>
        </div>
      )}
    </Tela>
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
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--mz-ink:#F4F1EA;--mz-paper:#231F1B;--mz-bg:#151210;--mz-line:#3A342D;--mz-muted:#A8A39B;--mz-soft:#3A2F0E}}
.mz{min-height:100vh;min-height:100dvh;background:var(--mz-bg);color:var(--mz-ink);font-family:Archivo,system-ui,sans-serif;padding-bottom:96px}
.mz *{box-sizing:border-box}.mz button{font-family:inherit;cursor:pointer}
.mz-top{position:sticky;top:0;z-index:5;background:#151210;color:#fff;padding:14px 16px;display:flex;flex-direction:column;gap:10px}
.mz-eyebrow{font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:#FFC531;font-weight:700}
.mz-top h1{margin:2px 0 0;font-family:Anton,sans-serif;font-weight:400;font-size:34px;line-height:1;text-transform:uppercase}
.mz-acoes{display:flex;gap:8px;flex-wrap:wrap}
.mz-btn{height:46px;padding:0 18px;border-radius:10px;border:2px solid var(--mz-ink);background:var(--mz-sign);color:#151210;font-weight:700;font-size:15px}
.mz-btn:disabled{opacity:.5;cursor:not-allowed}
.mz-btn.full{width:100%;margin-top:12px;height:52px;font-size:16px}
.mz-btn.ghost{background:transparent;color:#fff;border:1.5px solid #5a5148;height:42px;font-size:14px;font-weight:600}
.mz-btn.peso{height:40px;font-size:13px;background:var(--mz-paper);color:var(--mz-ink);border:1.5px solid var(--mz-line);flex:none}
.mz-cats{display:flex;gap:8px;overflow-x:auto;padding:12px 16px;scrollbar-width:none}
.mz-cats button{flex:none;height:38px;padding:0 16px;border-radius:8px;border:1.5px solid var(--mz-line);background:var(--mz-paper);color:var(--mz-ink);font-weight:600;font-size:14px}
.mz-cats button.on{background:var(--mz-sign);color:#151210;border:2px solid #151210;font-weight:700}
.mz-lista{list-style:none;margin:0;padding:4px 16px 0;display:flex;flex-direction:column;gap:10px}
.mz-item{display:flex;align-items:center;gap:12px;background:var(--mz-paper);border:1px solid var(--mz-line);border-radius:12px;padding:10px}
.mz-item img{width:72px;height:72px;object-fit:cover;border-radius:8px;flex:none;background:var(--mz-line)}
.mz-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.mz-info b{font-size:15.5px;line-height:1.25}
.mz-info small{color:var(--mz-muted);font-size:12.5px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.mz-preco{font-weight:700;font-size:15px;font-variant-numeric:tabular-nums}.mz-preco s{color:var(--mz-muted);font-weight:400;font-size:12.5px;margin-left:8px}
.mz-add{flex:none;width:46px;height:46px;border-radius:10px;border:2px solid #151210;background:var(--mz-sign);color:#151210;font-size:26px;font-weight:700;line-height:1}
.mz-vazio{text-align:center;color:var(--mz-muted);padding:30px 0}
.mz-barra{position:fixed;left:12px;right:12px;bottom:12px;z-index:6;height:58px;border-radius:12px;border:2px solid #151210;background:var(--mz-sign);color:#151210;display:flex;align-items:center;justify-content:space-between;padding:0 20px;font-size:16px;font-weight:700;box-shadow:0 6px 18px rgba(0,0,0,.25)}
.mz-cash{margin:12px 16px 0;background:var(--mz-soft);border:1.5px solid var(--mz-sign);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:8px}
.mz-cash b{font-size:15px}.mz-cash small{color:var(--mz-muted);font-size:12.5px;line-height:1.4}.mz-cash .mz-idmsg{color:var(--mz-ink);font-weight:600}
.mz-idrow{display:flex;gap:8px}.mz-idrow input{flex:1;min-width:0;height:46px;border:1.5px solid var(--mz-line);border-radius:10px;background:var(--mz-paper);color:var(--mz-ink);font:inherit;font-size:16px;padding:0 12px}
.mz-idrow .mz-btn{flex:none;height:46px;padding:0 14px;font-size:14px}
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
`
