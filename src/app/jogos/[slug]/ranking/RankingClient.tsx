'use client'
import { useEffect, useMemo, useState } from 'react'

// Ranking dos jogos da loja: pódio (ouro/prata/bronze), lista do 4º em diante e barra fixa "sua posição".
// Dados de /api/jogos (ação ranking). Quem está identificado (token da mesa/jogos) aparece destacado.

type Lin = { pos: number; nome: string; pontos: number; sub: string; eu: boolean }
type Dados = { inicioSemana: string | null; geral: Lin[]; solo: Lin[]; duelo: Lin[]; grupos: Lin[] }
type Info = { loja: string }
type Jogo = 'geral' | 'solo' | 'duelo'
const IDENT_KEY = 'trindade_ident'
const JOGOS: [Jogo, string][] = [['geral', 'Geral'], ['solo', 'Quiz solo'], ['duelo', 'Quiz em grupo']]
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

async function post(body: unknown) {
  const r = await fetch('/api/jogos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { ok: r.ok, d: await r.json().catch(() => ({})) }
}
const ini = (n: string) => { const p = n.trim().split(/\s+/); return ((p[0]?.[0] || '?') + (p[1]?.[0] || '')).toUpperCase() }
const fmt = (n: number) => n.toLocaleString('pt-BR')

// "Semana de 10 a 16 de novembro" a partir do início (segunda 00:00 de Brasília, em ISO).
function rotuloSemana(inicio: string | null) {
  if (!inicio) return 'Semana atual'
  const seg = new Date(new Date(inicio).getTime() - 3 * 3600_000)
  const dom = new Date(seg.getTime() + 6 * 86_400_000)
  const d1 = seg.getUTCDate(), d2 = dom.getUTCDate()
  return seg.getUTCMonth() === dom.getUTCMonth()
    ? `Semana de ${d1} a ${d2} de ${MESES[dom.getUTCMonth()]}`
    : `Semana de ${d1} de ${MESES[seg.getUTCMonth()]} a ${d2} de ${MESES[dom.getUTCMonth()]}`
}

const COROA = (
  <svg className="rk-crown" viewBox="0 0 48 34" aria-hidden="true">
    <path d="M3 9l10 8 11-14 11 14 10-8-4 22H7z" fill="url(#rkcg)" stroke="#8A5A00" strokeWidth="1.6" strokeLinejoin="round" />
    <circle cx="3" cy="8" r="3" fill="#FFE79A" /><circle cx="24" cy="3" r="3" fill="#FFE79A" /><circle cx="45" cy="8" r="3" fill="#FFE79A" />
    <defs><linearGradient id="rkcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFE79A" /><stop offset="1" stopColor="#F0A800" /></linearGradient></defs>
  </svg>
)

export default function RankingClient({ slug }: { slug: string }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [dados, setDados] = useState<Dados | null>(null)
  const [falhou, setFalhou] = useState(false)
  const [per, setPer] = useState<'sem' | 'sempre'>('sem')
  const [quem, setQuem] = useState<'jog' | 'grp'>('jog')
  const [jogo, setJogo] = useState<Jogo>('geral')
  const [tokenIdent, setTokenIdent] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)

  useEffect(() => {
    let vivo = true
    let t: string | null = null
    try { t = JSON.parse(localStorage.getItem(IDENT_KEY) || 'null')?.token || null } catch {}
    Promise.resolve().then(() => { if (vivo) { setTokenIdent(t); setPronto(true) } })
    post({ acao: 'info', slug }).then(r => { if (!vivo) return; if (r.ok) setInfo(r.d as Info); else setFalhou(true) }).catch(() => { if (vivo) setFalhou(true) })
    return () => { vivo = false }
  }, [slug])

  useEffect(() => {
    if (!pronto) return
    let vivo = true
    post({ acao: 'ranking', slug, aba: per, ident: tokenIdent }).then(r => { if (vivo && r.ok) setDados(r.d as Dados) }).catch(() => {})
    return () => { vivo = false }
  }, [slug, per, tokenIdent, pronto])

  const grp = quem === 'grp'
  const lista: Lin[] = useMemo(() => !dados ? [] : grp ? dados.grupos : dados[jogo], [dados, grp, jogo])
  const idxEu = lista.findIndex(l => l.eu)
  const eu = idxEu >= 0 ? lista[idxEu] : null
  const acima = idxEu > 0 ? lista[idxEu - 1] : null
  const falta = eu && acima ? Math.max(acima.pontos - eu.pontos, 0) : 0
  const pct = eu && acima && acima.pontos > 0 ? Math.round((eu.pontos / acima.pontos) * 100) : 100
  const jogarUrl = grp ? `/jogos/${slug}` : jogo === 'duelo' ? `/jogos/${slug}` : `/jogos/${slug}/quiz`
  const un = grp ? 'média' : 'pts'

  if (falhou) return <main className="rk"><div className="rk-box"><h1>Ranking indisponível</h1><p>Não encontramos essa loja. Confira o endereço.</p></div><style>{CSS}</style></main>

  const pd = (cls: string, it: Lin | undefined) => {
    if (!it) return <div className={`rk-pd ${cls}`} />
    return (
      <div className={`rk-pd ${cls}`}>
        <div className="rk-av">{cls === 'p1' && COROA}<i>{grp ? '👥' : ini(it.nome)}</i></div>
        <div className="rk-nm">{it.nome}{it.eu ? ' · você' : ''}</div>
        <div className="rk-pt">{fmt(it.pontos)}<small>{un}</small></div>
        {it.sub && <div className="rk-sub">{it.sub}</div>}
        <div className="rk-ped">{cls === 'p1' ? 1 : cls === 'p2' ? 2 : 3}</div>
      </div>
    )
  }

  return (
    <main className="rk">
      <div className="rk-wrap">
        <header className="rk-bar">
          <a href={`/jogos/${slug}`}>‹ Jogos</a>
          <div className="rk-brand">{info?.loja || ' '}</div>
          <span className="rk-sp" />
        </header>
        <div className="rk-scroll">
          <div className="rk-head">
            <div><h1>Ranking</h1><p>{per === 'sem' ? rotuloSemana(dados?.inicioSemana ?? null) : 'Desde o início'}</p></div>
            <div className="rk-seg" role="group" aria-label="Período">
              <button type="button" aria-pressed={per === 'sem'} onClick={() => setPer('sem')}>Semana</button>
              <button type="button" aria-pressed={per === 'sempre'} onClick={() => setPer('sempre')}>Sempre</button>
            </div>
          </div>
          <div className="rk-filtros">
            <div className="rk-seg full" role="group" aria-label="Quem">
              <button type="button" aria-pressed={!grp} onClick={() => setQuem('jog')}>Jogadores</button>
              <button type="button" aria-pressed={grp} onClick={() => setQuem('grp')}>Grupos</button>
            </div>
            {!grp && (
              <div className="rk-chips" role="group" aria-label="Jogo">
                {JOGOS.map(([id, nome]) => <button key={id} type="button" className="rk-chip" aria-pressed={jogo === id} onClick={() => setJogo(id)}>{nome}</button>)}
              </div>
            )}
          </div>

          {!dados ? <div className="rk-vazio">Carregando ranking…</div> : lista.length === 0 ? (
            <div className="rk-vazio">{grp ? 'Ainda não há grupos no ranking. Jogue em grupo pelo QR da mesa!' : 'Ninguém no ranking ainda. Seja o primeiro!'}</div>
          ) : (
            <>
              <div className="rk-podio" aria-label="Pódio">{pd('p2', lista[1])}{pd('p1', lista[0])}{pd('p3', lista[2])}</div>
              {lista.length > 3 ? (
                <ol className="rk-lista">
                  {lista.slice(3).map(it => (
                    <li key={`${it.pos}-${it.nome}`} className={`rk-rw${it.eu ? ' eu' : ''}`}>
                      <span className="rk-ps">{it.pos}º</span>
                      <span className="rk-av2">{grp ? '👥' : ini(it.nome)}</span>
                      <span className="rk-who"><b>{it.nome}{it.eu ? ' · você' : ''}</b>{it.sub && <span>{it.sub}</span>}</span>
                      <span className="rk-pp">{fmt(it.pontos)}<small>{un}</small></span>
                    </li>
                  ))}
                </ol>
              ) : <div className="rk-vazio">Só três no ranking por enquanto. Jogue para entrar na disputa!</div>}
            </>
          )}
          <div className="rk-fim" />
          <div className="rk-eubar">
            {eu ? (
              <div className="rk-eucard">
                <div className="rk-n">{eu.pos}º</div>
                <div>
                  <b>Sua posição · {fmt(eu.pontos)} pts</b>
                  <span>{acima ? `Faltam ${fmt(falta)} pts para o ${acima.pos}º lugar` : 'Você lidera o ranking!'}</span>
                  <div className="rk-prog"><i style={{ width: `${pct}%` }} /></div>
                </div>
              </div>
            ) : grp ? (
              <div className="rk-eucard"><div className="rk-n">👥</div><div><b>Quer ver seu grupo aqui?</b><span>Na mesa, crie um grupo e jogue 15 perguntas com os amigos</span></div></div>
            ) : (
              <div className="rk-eucard"><div className="rk-n">🏆</div><div><b>{tokenIdent ? 'Você ainda não está neste ranking' : 'Entre na disputa'}</b><span>{tokenIdent ? 'Jogue uma rodada para aparecer na lista' : 'Jogue e apareça no ranking da loja'}</span></div></div>
            )}
            <a className="rk-cta" href={jogarUrl}>{grp ? 'Ir para os jogos' : 'Jogar agora'}</a>
          </div>
        </div>
      </div>
      <style>{CSS}</style>
    </main>
  )
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@400;500;600;700&display=swap');
.rk{--sea-1:#0E4D64;--sea-2:#082B38;--sea-3:#051D27;--ink:#F2F7F8;--mut:#8FB5BE;--line:rgba(255,255,255,.12);--card:rgba(255,255,255,.06);
  --gold:#FFC531;--gold-hi:#FFE79A;--gold-lo:#B97F06;--silver-hi:#F4F7FA;--silver:#C2CCD6;--silver-lo:#7C8794;--bronze-hi:#F6C79A;--bronze:#D58A4B;--bronze-lo:#8A4F23;
  --display:'Anton',Impact,'Arial Narrow',sans-serif;--body:'Archivo',system-ui,-apple-system,'Segoe UI',sans-serif;
  position:fixed;inset:0;color-scheme:dark;background:radial-gradient(120% 60% at 50% 0%,var(--sea-1) 0%,var(--sea-2) 55%,var(--sea-3) 100%);color:var(--ink);font-family:var(--body);display:flex;justify-content:center}
.rk *{box-sizing:border-box}
.rk-wrap{width:100%;max-width:480px;height:100%;display:flex;flex-direction:column}
.rk-bar{display:flex;align-items:center;justify-content:space-between;padding:max(14px,env(safe-area-inset-top,0px)) 18px 12px;border-bottom:1px solid var(--line);flex:none}
.rk-bar a{font:600 14px var(--body);color:var(--ink);text-decoration:none;min-height:36px;display:inline-flex;align-items:center;width:64px}
.rk-brand{font-family:var(--display);font-size:19px;letter-spacing:.01em;text-transform:uppercase;text-align:center;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rk-sp{width:64px}
.rk-scroll{flex:1;min-height:0;overflow-y:auto;scrollbar-width:none;padding:16px 18px 0;display:flex;flex-direction:column;gap:14px}
.rk-scroll::-webkit-scrollbar{display:none}
.rk-head{display:flex;align-items:flex-end;justify-content:space-between;gap:10px}
.rk-head h1{margin:0;font-family:var(--display);font-weight:400;font-size:40px;line-height:1;text-transform:uppercase;letter-spacing:.01em}
.rk-head p{margin:4px 0 0;font-size:12.5px;color:var(--mut)}
.rk-seg{display:inline-flex;background:rgba(255,255,255,.09);border-radius:10px;padding:3px;gap:3px}
.rk-seg.full{display:flex}.rk-seg.full button{flex:1}
.rk-seg button{font:600 13px var(--body);min-height:36px;padding:0 13px;border:0;border-radius:8px;background:transparent;color:#CFE3E6;cursor:pointer}
.rk-seg button[aria-pressed="true"]{background:var(--gold);color:#1B1300}
.rk-seg button:focus-visible,.rk-chip:focus-visible,.rk-cta:focus-visible,.rk-bar a:focus-visible{outline:3px solid #fff;outline-offset:2px}
.rk-filtros{position:sticky;top:0;z-index:4;margin:0 -18px;padding:6px 18px 12px;display:grid;gap:10px;background:linear-gradient(180deg,#0B4054 78%,rgba(11,64,84,0))}
.rk-chips{display:grid;grid-template-columns:repeat(3,1fr);border-bottom:1px solid rgba(255,255,255,.16)}
.rk-chip{font:600 13.5px/1.15 var(--body);min-height:46px;padding:0 4px;border:0;border-bottom:3px solid transparent;margin-bottom:-1px;background:transparent;color:#A9C9D0;cursor:pointer;text-align:center}
.rk-chip[aria-pressed="true"]{color:var(--gold);border-bottom-color:var(--gold)}
.rk-podio{position:relative;display:grid;grid-template-columns:1fr 1.18fr 1fr;align-items:end;gap:8px;padding-top:34px;isolation:isolate}
.rk-podio::before{content:"";position:absolute;left:50%;top:-6px;width:78%;aspect-ratio:1;transform:translateX(-50%);background:radial-gradient(circle,rgba(255,215,100,.30),transparent 62%);z-index:-1}
.rk-pd{display:grid;justify-items:center;align-content:end;gap:5px;min-width:0}
.rk-av{position:relative;display:grid;place-items:center;border-radius:50%;font-family:var(--display);color:#0A1E26;letter-spacing:.02em;box-shadow:0 8px 20px rgba(0,0,0,.4);width:62px;height:62px;font-size:24px;padding:3px}
.p1 .rk-av{width:86px;height:86px;font-size:34px;padding:4px;background:conic-gradient(from 200deg,var(--gold-hi),var(--gold),var(--gold-lo),var(--gold-hi))}
.p2 .rk-av{background:conic-gradient(from 200deg,var(--silver-hi),var(--silver),var(--silver-lo),var(--silver-hi))}
.p3 .rk-av{background:conic-gradient(from 200deg,var(--bronze-hi),var(--bronze),var(--bronze-lo),var(--bronze-hi))}
.rk-av i{display:grid;place-items:center;width:100%;height:100%;border-radius:50%;font-style:normal;background:#F3F6F8}
.rk-crown{position:absolute;top:-30px;left:50%;transform:translateX(-50%);width:44px;filter:drop-shadow(0 4px 6px rgba(0,0,0,.4))}
.rk-nm{max-width:100%;text-align:center;font-weight:700;font-size:13.5px;line-height:1.15;overflow-wrap:anywhere}
.p1 .rk-nm{font-size:15px}
.rk-pt{font-family:var(--display);font-size:20px;line-height:1;color:var(--gold);font-variant-numeric:tabular-nums}
.rk-pt small,.rk-pp small{font-family:var(--body);font-size:10.5px;color:var(--mut);margin-left:3px;letter-spacing:.04em}
.rk-sub{font-size:11px;color:var(--mut);text-align:center;margin-top:-2px}
.rk-ped{width:100%;display:grid;place-items:start center;padding-top:8px;border-radius:12px 12px 0 0;font-family:var(--display);font-size:40px;line-height:1;color:rgba(10,30,38,.78);position:relative;box-shadow:inset 0 2px 0 rgba(255,255,255,.55)}
.rk-ped::after{content:"";position:absolute;inset:0;border-radius:inherit;background:linear-gradient(90deg,rgba(255,255,255,.22),transparent 38%,rgba(0,0,0,.14));pointer-events:none}
.p1 .rk-ped{height:132px;font-size:54px;background:linear-gradient(180deg,var(--gold-hi),var(--gold) 45%,var(--gold-lo))}
.p2 .rk-ped{height:98px;background:linear-gradient(180deg,var(--silver-hi),var(--silver) 45%,var(--silver-lo))}
.p3 .rk-ped{height:74px;background:linear-gradient(180deg,var(--bronze-hi),var(--bronze) 45%,var(--bronze-lo))}
@media (prefers-reduced-motion:no-preference){
  .rk-ped{transform-origin:bottom;animation:rksobe .7s cubic-bezier(.2,.8,.2,1) both}
  .p1 .rk-ped{animation-delay:.12s}.p3 .rk-ped{animation-delay:.2s}
  @keyframes rksobe{from{transform:scaleY(.35);opacity:.4}to{transform:none;opacity:1}}
}
.rk-lista{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.rk-rw{display:grid;grid-template-columns:30px 38px 1fr auto;align-items:center;gap:10px;padding:8px 12px 8px 10px;border-radius:12px;background:var(--card);border:1px solid transparent}
.rk-ps{font-family:var(--display);font-size:19px;color:var(--mut);text-align:center}
.rk-av2{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;font-family:var(--display);font-size:15px;background:linear-gradient(135deg,#3C6F80,#1D4655);color:#E8F4F6}
.rk-who{min-width:0;display:grid}
.rk-who b{font-size:14.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rk-who span{font-size:11.5px;color:var(--mut)}
.rk-pp{font-family:var(--display);font-size:19px;font-variant-numeric:tabular-nums;color:var(--ink)}
.rk-rw.eu{background:rgba(255,197,49,.14);border-color:var(--gold)}
.rk-rw.eu .rk-ps{color:var(--gold)}
.rk-vazio{padding:18px;border-radius:12px;background:var(--card);text-align:center;color:var(--mut);font-size:13.5px}
.rk-fim{height:6px;flex:none}
.rk-eubar{position:sticky;bottom:0;z-index:5;margin:auto -18px 0;padding:12px 18px max(14px,env(safe-area-inset-bottom,0px));background:linear-gradient(180deg,rgba(5,29,39,0),var(--sea-3) 20px);display:grid;gap:10px}
.rk-eucard{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:center;padding:10px 14px;border-radius:14px;background:#0A3342;border:1px solid rgba(255,197,49,.5)}
.rk-n{font-family:var(--display);font-size:32px;line-height:1;color:var(--gold)}
.rk-eucard b{font-size:14px}
.rk-eucard span{display:block;font-size:12px;color:var(--mut);margin-top:1px}
.rk-prog{height:6px;border-radius:99px;background:rgba(255,255,255,.12);overflow:hidden;margin-top:6px}
.rk-prog i{display:block;height:100%;background:linear-gradient(90deg,var(--gold-lo),var(--gold-hi));border-radius:99px}
.rk-cta{display:grid;place-items:center;text-decoration:none;font-family:var(--display);font-size:22px;letter-spacing:.04em;text-transform:uppercase;min-height:54px;border-radius:14px;color:#2B1B00;background:linear-gradient(180deg,#FFE27A,#FFC531 55%,#F0A800);box-shadow:0 8px 22px rgba(255,197,49,.28)}
.rk-box{margin:auto;padding:24px;text-align:center}
.rk-box h1{font-family:var(--display);font-weight:400;text-transform:uppercase}
@media (max-width:360px){.rk-av{width:54px;height:54px;font-size:20px}.p1 .rk-av{width:74px;height:74px}.rk-nm{font-size:12.5px}}
`
