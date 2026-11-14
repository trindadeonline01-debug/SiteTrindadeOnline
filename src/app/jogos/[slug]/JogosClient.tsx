'use client'
import { useEffect, useState } from 'react'

// Lista de jogos da loja + identificação (nome + WhatsApp confirmado por código). Cada jogo novo é só
// mais um item em `jogos` (api/jogos). Regra: jogo aberto aqui vale SÓ para o ranking; cashback só
// pelo QR da mesa, e só é creditado quando a conta é paga (servidor decide, não esta tela).

type Jogo = { id: string; nome: string; descricao: string; ativo: boolean; rota: string }
type Info = { loja: string; logo: string; jogos: Jogo[] }
type Ident = { nome: string; telefone: string; token: string }
const IDENT_KEY = 'trindade_ident'

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const d = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, d }
}

export default function JogosClient({ slug }: { slug: string }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [falhou, setFalhou] = useState(false)
  const [ident, setIdent] = useState<Ident | null>(null)
  const [passo, setPasso] = useState<'lista' | 'dados' | 'codigo'>('lista')
  const [destino, setDestino] = useState<Jogo | null>(null)
  const [nome, setNome] = useState('')
  const [tel, setTel] = useState('')
  const [cod, setCod] = useState('')
  const [idade, setIdade] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [logoOk, setLogoOk] = useState(true)

  useEffect(() => {
    let vivo = true
    post('/api/jogos', { acao: 'info', slug }).then(r => {
      if (!vivo) return
      try {
        const salvo = JSON.parse(localStorage.getItem(IDENT_KEY) || 'null')
        if (salvo?.token) { setIdent(salvo); setNome(salvo.nome || ''); setTel(salvo.telefone || '') }
      } catch {}
      if (!r.ok) { setFalhou(true); return }
      setInfo(r.d as Info)
      if (new URLSearchParams(window.location.search).get('identificar')) { setPasso('dados') }
    }).catch(() => { if (vivo) setFalhou(true) })
    return () => { vivo = false }
  }, [slug])

  async function abrir(j: Jogo, i: Ident) {
    setBusy(true); setMsg('')
    const r = await post('/api/mesa/quiz', { token: `loja:${slug}`, acao: 'cadastro_ident', ident: i.token, idade: true, aceite: true })
    setBusy(false)
    if (r.status === 401) { try { localStorage.removeItem(IDENT_KEY) } catch {} setIdent(null); setDestino(j); setPasso('dados'); setMsg('Sua identificação venceu. Confirme seu WhatsApp de novo.'); return }
    if (!r.ok) { setMsg(r.d?.error || 'Não consegui abrir o jogo agora.'); return }
    try { localStorage.setItem(`quizjt:loja:${slug}`, r.d.jt) } catch {}
    window.location.assign(j.rota)
  }

  function jogar(j: Jogo) {
    setMsg('')
    if (ident) { void abrir(j, ident); return }
    setDestino(j); setPasso('dados')
  }

  async function enviarCodigo() {
    if (!idade) { setMsg('Confirme que você tem 18 anos ou mais.'); return }
    setBusy(true); setMsg('')
    const r = await post('/api/jogos', { acao: 'ident_enviar', slug, nome, telefone: tel })
    setBusy(false)
    if (!r.ok) { setMsg(r.d?.error || 'Não consegui enviar o código.'); return }
    setPasso('codigo')
  }

  async function confirmar() {
    setBusy(true); setMsg('')
    const r = await post('/api/jogos', { acao: 'ident_verificar', slug, nome, telefone: tel, codigo: cod })
    if (!r.ok) { setBusy(false); setMsg(r.d?.error || 'Código incorreto.'); return }
    const i: Ident = { nome: String(r.d.nome), telefone: String(r.d.telefone), token: String(r.d.token) }
    try { localStorage.setItem(IDENT_KEY, JSON.stringify(i)) } catch {}
    setIdent(i)
    const alvo = destino || info?.jogos.find(j => j.ativo) || null
    if (alvo) { await abrir(alvo, i) } else { setBusy(false); setPasso('lista') }
  }

  const ativos = info?.jogos.filter(j => j.ativo) || []
  const marca = (info?.loja || '').trim()

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@400;500;600;700&display=swap" />
      <style>{CSS}</style>
      <div className="jg">
        <div className="jg-in">
          <header className="jg-top">
            {info && logoOk && (
              // eslint-disable-next-line @next/next/no-img-element -- logo pública opcional, some se não existir
              <img src={info.logo} alt="" className="jg-logo" onError={() => setLogoOk(false)} />
            )}
            <span className="jg-kick">Jogos</span>
            <h1>{marca || 'Carregando…'}</h1>
            <p>Jogue, suba no ranking da loja e divirta-se.</p>
          </header>

          {falhou && <div className="jg-box">Esta loja não tem jogos disponíveis agora.</div>}

          {passo === 'lista' && info && (
            <>
              <div className="jg-aviso">
                <b>🏆 Aqui os jogos valem só para o ranking</b>
                <span>Quer ganhar cashback? Jogue pelo QR da sua mesa no restaurante. O cashback só é creditado depois que a conta é paga.</span>
              </div>
              {ativos.length === 0 && <div className="jg-box">Nenhum jogo ligado nesta loja agora.</div>}
              {ativos.map(j => (
                <div key={j.id} className="jg-card">
                  <div className="jg-ic" aria-hidden="true">🎣</div>
                  <div className="jg-tx"><b>{j.nome}</b><span>{j.descricao}</span></div>
                  <button type="button" className="jg-go" disabled={busy} onClick={() => jogar(j)}>{busy ? '…' : 'Jogar'}</button>
                </div>
              ))}
              <a className="jg-rkl" href={`/jogos/${slug}/ranking`}>
                <span className="jg-rkl-i">🏆</span>
                <span className="jg-tx"><b>Ranking da loja</b><span>Pódio da semana, individual e de grupos</span></span>
                <span className="jg-rkl-g">Ver ›</span>
              </a>
              {ident && <p className="jg-nt">Você está identificado como <b>{ident.nome}</b>. Ao jogar, você confirma ter 18 anos ou mais e aceita aparecer no ranking.</p>}
              {msg && <div className="jg-warn">{msg}</div>}
            </>
          )}

          {passo === 'dados' && (
            <div className="jg-form">
              <h2>Antes de jogar</h2>
              <p>Informe seu nome e WhatsApp. Enviamos um código para confirmar. Seu nome aparece no ranking como &quot;Maria S.&quot;.</p>
              <label>Seu nome<input value={nome} onChange={e => setNome(e.target.value)} autoComplete="name" maxLength={40} /></label>
              <label>WhatsApp com DDD<input value={tel} onChange={e => setTel(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="(21) 99999-9999" /></label>
              <label className="jg-chk"><input type="checkbox" checked={idade} onChange={e => setIdade(e.target.checked)} /> Tenho 18 anos ou mais e aceito aparecer no ranking</label>
              {msg && <div className="jg-warn">{msg}</div>}
              <button type="button" className="jg-btn" disabled={busy} onClick={enviarCodigo}>{busy ? 'Enviando…' : 'Enviar código no WhatsApp'}</button>
              <button type="button" className="jg-alt" onClick={() => { setPasso('lista'); setMsg('') }}>Voltar</button>
            </div>
          )}

          {passo === 'codigo' && (
            <div className="jg-form">
              <h2>Digite o código</h2>
              <p>Enviamos 6 números para o WhatsApp <b>{tel}</b>. Vale por 10 minutos.</p>
              <label>Código de 6 números<input className="jg-cod" value={cod} onChange={e => setCod(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" /></label>
              {msg && <div className="jg-warn">{msg}</div>}
              <button type="button" className="jg-btn" disabled={busy || cod.length !== 6} onClick={confirmar}>{busy ? 'Confirmando…' : 'Confirmar e jogar'}</button>
              <button type="button" className="jg-alt" onClick={() => { setPasso('dados'); setMsg(''); setCod('') }}>Trocar o número</button>
            </div>
          )}

          <footer className="jg-ft">Trindade Online</footer>
        </div>
      </div>
    </>
  )
}

const CSS = `
body{background:#082B38}
.jg{position:fixed;inset:0;overflow:auto;background:radial-gradient(120% 70% at 50% 0%,#0E4D64 0%,#082B38 70%);color:#fff;font-family:'Archivo',system-ui,-apple-system,'Segoe UI',sans-serif}
.jg-in{max-width:520px;margin:0 auto;padding:max(20px,env(safe-area-inset-top)) 16px 28px;display:grid;gap:14px}
.jg-top{text-align:center;display:grid;gap:6px;justify-items:center;padding-top:8px}
.jg-logo{width:64px;height:64px;border-radius:50%;object-fit:cover;background:#fff}
.jg-kick{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#FFC531;font-weight:700}
.jg-top h1{margin:0;font-family:'Anton',Impact,'Arial Narrow',sans-serif;font-weight:400;font-size:34px;line-height:1.05;text-wrap:balance}
.jg-top p{margin:0;font-size:14px;color:#CFE3E6}
.jg-aviso{background:rgba(255,197,49,.12);border:1px solid rgba(255,197,49,.45);border-radius:12px;padding:12px 14px;display:grid;gap:4px}
.jg-aviso b{font-size:14.5px;color:#FFC531}
.jg-aviso span{font-size:13px;color:#E4EEF0;line-height:1.4}
.jg-card{display:flex;align-items:center;gap:12px;background:#fff;color:#151210;border-radius:14px;padding:14px}
.jg-ic{width:48px;height:48px;border-radius:12px;background:#F4F2EC;display:grid;place-items:center;font-size:24px;flex:none}
.jg-tx{flex:1;min-width:0;display:grid;gap:2px}
.jg-tx b{font-size:16px}
.jg-tx span{font-size:12.5px;color:#6F6C67;line-height:1.35}
.jg-go,.jg-btn{font:700 16px 'Archivo',system-ui,sans-serif;min-height:48px;border:0;border-radius:10px;background:#FFC531;color:#151210;cursor:pointer;padding:0 18px}
.jg-go:disabled,.jg-btn:disabled{opacity:.55;cursor:default}
.jg-btn{width:100%}
.jg-alt{font:600 14px 'Archivo',system-ui,sans-serif;min-height:44px;background:transparent;border:0;color:#CFE3E6;cursor:pointer;text-decoration:underline}
.jg-go:focus-visible,.jg-btn:focus-visible,.jg-alt:focus-visible{outline:3px solid #fff;outline-offset:2px}
.jg-form{background:#fff;color:#151210;border-radius:14px;padding:18px 16px;display:grid;gap:12px}
.jg-form h2{margin:0;font-family:'Anton',Impact,sans-serif;font-weight:400;font-size:26px}
.jg-form p{margin:0;font-size:13.5px;color:#4a4742;line-height:1.4}
.jg-form label{display:grid;gap:5px;font-size:12.5px;font-weight:700;color:#4a4742}
.jg-form input{font:500 16px 'Archivo',system-ui,sans-serif;min-height:48px;border:1.5px solid #DEDBD2;border-radius:10px;padding:0 12px;background:#FAFAF8;color:#151210}
.jg-form input:focus-visible{outline:3px solid #FFC531;outline-offset:1px}
.jg-form .jg-chk{display:flex;align-items:flex-start;gap:8px;font-weight:500;line-height:1.35}
.jg-form .jg-chk input{min-height:0;width:20px;height:20px;margin-top:1px;flex:none}
.jg-cod{font-size:26px!important;letter-spacing:.35em;text-align:center}
.jg-warn{background:#FDECEA;color:#9B2318;border-radius:10px;padding:10px 12px;font-size:13px;font-weight:600}
.jg-box{background:rgba(255,255,255,.1);border-radius:12px;padding:16px;font-size:14px;text-align:center;color:#E4EEF0}
.jg-rkl{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;padding:14px;border-radius:14px;background:linear-gradient(135deg,rgba(255,197,49,.22),rgba(255,197,49,.06));border:1px solid rgba(255,197,49,.5);color:inherit;text-decoration:none}
.jg-rkl .jg-tx span{color:#BFD9DE}
.jg-rkl-i{font-size:28px}
.jg-rkl-g{font-family:'Anton',Impact,sans-serif;font-size:16px;color:#FFC531;letter-spacing:.04em;text-transform:uppercase}
.jg-nt{margin:0;font-size:12.5px;color:#BFD9DE;text-align:center;line-height:1.4}
.jg-ft{text-align:center;font-size:12px;color:#7FA9B3;padding-top:6px}
`
