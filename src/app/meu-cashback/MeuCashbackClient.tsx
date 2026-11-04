'use client'
import { useEffect, useState } from 'react'

type Loja = { companyId: string; nome: string; slug: string | null; saldo: number; venceEm: string | null }
type Mov = { tipo: string; valor: number; data: string; origem: string; saldoApos: number }

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBR = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' })
const mask = (d: string) => {
  const n = d.replace(/\D/g, '').replace(/^55(?=\d{10,})/, '').slice(0, 11)
  if (n.length <= 2) return n
  if (n.length <= 7) return `(${n.slice(0, 2)}) ${n.slice(2)}`
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
}
const LS = 'meu_cashback_sessao'

async function api(body: Record<string, unknown>) {
  const r = await fetch('/api/cliente/cashback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, ...j } as { ok: boolean; status: number; error?: string; [k: string]: any }
}

export default function MeuCashbackClient() {
  const [tela, setTela] = useState<'entrar' | 'lojas' | 'extrato'>('entrar')
  const [zap, setZap] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [espera, setEspera] = useState(0)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState('')
  const [lojas, setLojas] = useState<Loja[]>([])
  const [total, setTotal] = useState(0)
  const [loja, setLoja] = useState<Loja | null>(null)
  const [movs, setMovs] = useState<Mov[]>([])

  useEffect(() => { if (espera <= 0) return; const t = setTimeout(() => setEspera(e => e - 1), 1000); return () => clearTimeout(t) }, [espera])

  async function carregarLojas(tk: string) {
    const r = await api({ acao: 'lojas', token: tk })
    if (r.status === 401) { try { sessionStorage.removeItem(LS) } catch {} setToken(''); setTela('entrar'); return }
    if (!r.ok) { setMsg(r.error || 'Não consegui carregar.'); return }
    setLojas(r.lojas); setTotal(r.total); setTela('lojas')
  }
  useEffect(() => {
    let tk = ''
    try { tk = sessionStorage.getItem(LS) || '' } catch {}
    if (tk) { setToken(tk); carregarLojas(tk) }
  }, [])

  async function enviar() {
    setBusy(true); setMsg('')
    const r = await api({ acao: 'enviar', telefone: zap })
    setBusy(false)
    if (!r.ok) { setMsg(r.error || 'Não consegui enviar.'); return }
    setEnviado(true); setEspera(60); setCodigo('')
  }
  async function entrar(cod: string) {
    setBusy(true); setMsg('')
    const r = await api({ acao: 'entrar', telefone: zap, codigo: cod })
    if (!r.ok) { setBusy(false); setMsg(r.error || 'Código incorreto.'); setCodigo(''); return }
    try { sessionStorage.setItem(LS, r.token) } catch {}
    setToken(r.token); await carregarLojas(r.token); setBusy(false)
  }
  async function abrir(l: Loja) {
    setLoja(l); setMovs([]); setTela('extrato'); setMsg('')
    const r = await api({ acao: 'extrato', token, companyId: l.companyId })
    if (r.ok) setMovs(r.movs); else setMsg(r.error || 'Não consegui carregar o extrato.')
  }
  function sair() {
    try { sessionStorage.removeItem(LS) } catch {}
    setToken(''); setTela('entrar'); setEnviado(false); setCodigo(''); setLojas([]); setMsg('')
  }

  return (
    <div className="mc">
      <style>{CSS}</style>
      <main className="mc-wrap">
        {tela === 'entrar' && (
          <>
            <h1 className="mc-h">Veja seu cashback</h1>
            <p className="mc-p">Entre com o WhatsApp que você usa nos pedidos e nas contas de mesa. Sem senha.</p>
            <label className="mc-k" htmlFor="mc-zap">Seu WhatsApp</label>
            <div className="mc-row">
              <input id="mc-zap" className="mc-in" inputMode="tel" autoComplete="tel" placeholder="(21) 98877-1204" value={zap}
                onChange={e => setZap(mask(e.target.value))} disabled={busy} />
            </div>
            {!enviado ? (
              <button className="mc-btn" onClick={enviar} disabled={busy || zap.replace(/\D/g, '').length < 10}>{busy ? 'Enviando…' : 'Enviar código'}</button>
            ) : (
              <>
                <label className="mc-k" htmlFor="mc-cod" style={{ marginTop: 6 }}>Código de 6 números</label>
                <input id="mc-cod" className="mc-in mc-cod" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={codigo}
                  onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setCodigo(v); if (v.length === 6) entrar(v) }} disabled={busy} autoFocus />
                <p className="mc-sub">Chega no seu WhatsApp, vindo do Trindade Online. Vale por 10 minutos. Só recebe código quem já ganhou cashback em alguma loja.</p>
                <button className="mc-btn" onClick={() => entrar(codigo)} disabled={busy || codigo.length !== 6}>{busy ? 'Entrando…' : 'Entrar'}</button>
                <button className="mc-link" onClick={enviar} disabled={busy || espera > 0}>{espera > 0 ? `Reenviar código em ${espera} s` : 'Reenviar código'}</button>
              </>
            )}
            {msg && <p role="alert" className="mc-err">{msg}</p>}
            <p className="mc-sub mc-foot">Ao entrar, você vê seus saldos e contas em todas as lojas do Trindade Online. Seus dados ficam só com você e com as lojas onde comprou.</p>
          </>
        )}

        {tela === 'lojas' && (
          <>
            <div className="mc-top"><h1 className="mc-h">Meu cashback</h1><button className="mc-link" onClick={sair}>Sair</button></div>
            <div className="mc-total"><span className="mc-k">Saldo total</span><span className="mc-big">{brl(total)}</span></div>
            <p className="mc-sub">Cada saldo só vale na loja onde foi ganho.</p>
            {lojas.length === 0 && <p className="mc-p">Você ainda não tem cashback em nenhuma loja.</p>}
            <ul className="mc-list">
              {lojas.map(l => (
                <li key={l.companyId}>
                  <button className="mc-loja" onClick={() => abrir(l)}>
                    <span className="mc-nome">{l.nome}</span>
                    <span className="mc-saldo">{brl(l.saldo)}</span>
                    <span className="mc-sub">{l.venceEm ? `Vence em ${dataBR(l.venceEm)} se não usar` : 'Sem saldo no momento'}</span>
                  </button>
                </li>
              ))}
            </ul>
            {msg && <p role="alert" className="mc-err">{msg}</p>}
          </>
        )}

        {tela === 'extrato' && loja && (
          <>
            <button className="mc-link mc-back" onClick={() => setTela('lojas')}>← Voltar</button>
            <h1 className="mc-h" style={{ fontSize: 30 }}>{loja.nome}</h1>
            <div className="mc-total"><span className="mc-k">Saldo nesta loja</span><span className="mc-big">{brl(loja.saldo)}</span></div>
            {loja.venceEm && <p className="mc-sub">Vence em {dataBR(loja.venceEm)} se não usar.</p>}
            {loja.slug && <a className="mc-btn" style={{ textAlign: 'center', textDecoration: 'none' }} href={`/cardapio/${loja.slug}`}>Pedir nesta loja</a>}
            <div className="mc-k" style={{ marginTop: 18 }}>Extrato</div>
            {movs.length === 0 && !msg && <p className="mc-sub">Carregando…</p>}
            <ul className="mc-list">
              {movs.map((m, i) => {
                const mais = m.tipo === 'credito' || m.tipo === 'estorno'
                const nome = m.tipo === 'credito' ? 'Ganhou' : m.tipo === 'debito' ? 'Usou' : m.tipo === 'estorno' ? 'Devolvido' : 'Venceu'
                return (
                  <li key={i} className="mc-mov">
                    <div><b>{nome}</b><div className="mc-sub">{dataBR(m.data)}{m.origem ? ` · ${m.origem}` : ''}</div></div>
                    <div style={{ textAlign: 'right' }}><b style={{ color: mais ? 'var(--ok)' : 'var(--ink)' }}>{mais ? '+' : '−'}{brl(m.valor)}</b><div className="mc-sub">saldo {brl(m.saldoApos)}</div></div>
                  </li>
                )
              })}
            </ul>
            {msg && <p role="alert" className="mc-err">{msg}</p>}
          </>
        )}
      </main>
    </div>
  )
}

const CSS = `
.mc{--ink:#151210;--paper:#fff;--bg:#E9EAE5;--sign:#FFC531;--ok:#0F8A57;--alert:#D6392B;--muted:#6F6C67;--line:#DCDDD6;--soft:#F5F6F2;
  background:var(--bg);color:var(--ink);min-height:100vh;font-family:Archivo,system-ui,sans-serif;padding:20px 0 110px}
@media(prefers-color-scheme:dark){.mc{--ink:#F2EFE8;--paper:#231F1B;--bg:#151210;--ok:#3DD28D;--alert:#FF7A6B;--muted:#A8A39A;--line:#3A352F;--soft:#1C1917}}
.mc-wrap{max-width:460px;margin:0 auto;padding:16px 20px;display:flex;flex-direction:column;gap:12px}
.mc-h{font-family:Anton,Impact,sans-serif;font-weight:400;font-size:36px;line-height:1.1;margin:0}
.mc-p{font-size:15px;margin:0;line-height:1.45}
.mc-k{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:600}
.mc-sub{font-size:13px;color:var(--muted);margin:0;line-height:1.45}
.mc-in{min-height:52px;width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);padding:0 14px;font:600 17px Archivo,sans-serif}
.mc-in:focus-visible,.mc-btn:focus-visible,.mc-link:focus-visible,.mc-loja:focus-visible{outline:3px solid var(--ink);outline-offset:2px}
.mc-cod{letter-spacing:.4em;text-align:center;font-size:24px}
.mc-btn{min-height:52px;border:0;border-radius:8px;background:var(--sign);color:#151210;font:700 16px Archivo,sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center}
.mc-btn:disabled{opacity:.5;cursor:default}
.mc-link{background:none;border:0;color:var(--ink);font:600 14px Archivo,sans-serif;text-decoration:underline;cursor:pointer;padding:10px 0;min-height:44px;align-self:center}
.mc-link:disabled{color:var(--muted);text-decoration:none;cursor:default}
.mc-back{align-self:flex-start;padding-left:0}
.mc-err{color:var(--alert);font-size:14px;font-weight:600;margin:0}
.mc-foot{margin-top:14px}
.mc-top{display:flex;justify-content:space-between;align-items:center}
.mc-total{background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:16px;display:flex;flex-direction:column;gap:4px}
.mc-big{font-family:Anton,Impact,sans-serif;font-size:40px;line-height:1;font-variant-numeric:tabular-nums}
.mc-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.mc-loja{width:100%;text-align:left;background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:14px 16px;cursor:pointer;color:var(--ink);display:grid;grid-template-columns:1fr auto;gap:2px 12px;min-height:44px}
.mc-nome{font-weight:700;font-size:16px}
.mc-saldo{font-weight:700;font-size:18px;font-variant-numeric:tabular-nums}
.mc-loja .mc-sub{grid-column:1/-1}
.mc-mov{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums}
`
