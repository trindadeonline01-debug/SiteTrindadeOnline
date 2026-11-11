'use client'
import { useEffect, useMemo, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'
import { personalizar, primeiroNome } from '@/lib/ofertasTexto'

// Janela de "Enviar oferta" (Inteligência de consumo, nov/2026): escolhe o produto, a IA sugere mensagens curtas
// que terminam numa pergunta, a loja revisa e confirma. O envio é 1 mensagem por vez pelo WhatsApp da própria
// loja (15 por dia, 2 a 4 min entre elas, 8h às 20h). Quando o cliente responde, a IA manda o link do produto.

export type DestOferta = { phone: string; nome: string }
type Estado = { loja: string; conectada: boolean; iaLigada: boolean; enviadosHoje: number; naFila: number; limite: number; produtos: { id: string; nome: string; preco: number }[] }
type Resultado = { aceitos: number; ignorados: { optout: number; recentes: number; semNumero: number }; dias: number }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s*\(?c[óo]pia\)?/g, '').trim()

export default function OfertaComposer({ companyId, lojaNome, tipo, dest, produtoSugerido, onClose, onEnviado }:
  { companyId: string; lojaNome: string; tipo: 'retorno' | 'carrinho'; dest: DestOferta[]; produtoSugerido?: string; onClose: () => void; onEnviado: () => void }) {
  const [est, setEst] = useState<Estado | null>(null)
  const [erro, setErro] = useState('')
  const [produtoId, setProdutoId] = useState('')
  const [sug, setSug] = useState<string[]>([])
  const [sel, setSel] = useState(0)
  const [texto, setTexto] = useState('')
  const [carregandoSug, setCarregandoSug] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [res, setRes] = useState<Resultado | null>(null)

  useEffect(() => {
    let vivo = true
    adminFetch('/api/painel/ofertas', { method: 'POST', body: JSON.stringify({ companyId, action: 'estado' }) })
      .then(async r => {
        const j = await r.json()
        if (!vivo) return
        if (!r.ok) { setErro(j.error || 'Não consegui carregar.'); return }
        setEst(j)
        const alvo = produtoSugerido ? norm(produtoSugerido) : ''
        const achado = alvo ? (j.produtos as Estado['produtos']).find(p => norm(p.nome) === alvo || norm(p.nome).includes(alvo) || alvo.includes(norm(p.nome))) : null
        const escolhido = achado || (j.produtos as Estado['produtos'])[0]
        setProdutoId(escolhido?.id || '')
        if (escolhido) void sugerir(escolhido.nome)
      })
      .catch(() => { if (vivo) setErro('Não consegui carregar. Tente de novo.') })
    return () => { vivo = false }
  }, [companyId, produtoSugerido])

  const produto = est?.produtos.find(p => p.id === produtoId)

  async function sugerir(nomeProduto?: string) {
    const nome = nomeProduto || produto?.nome
    if (!nome) return
    setCarregandoSug(true); setErro('')
    try {
      const r = await adminFetch('/api/painel/ofertas', { method: 'POST', body: JSON.stringify({ companyId, action: 'sugerir', produtoNome: nome, tipo }) })
      const j = await r.json()
      if (!r.ok) { setErro(j.error || 'Não consegui sugerir.'); return }
      setSug(j.sugestoes || []); setSel(0); setTexto((j.sugestoes || [])[0] || '')
    } catch { setErro('Não consegui sugerir. Tente de novo.') } finally { setCarregandoSug(false) }
  }

  const prim = dest.find(d => primeiroNome(d.nome))
  const previa = useMemo(() => personalizar(texto, prim?.nome), [texto, prim])

  async function enviar() {
    if (!est || enviando) return
    setEnviando(true); setErro('')
    try {
      const r = await adminFetch('/api/painel/ofertas', { method: 'POST', body: JSON.stringify({ companyId, action: 'criar', produtoId: produtoId || null, mensagem: texto, destinatarios: dest }) })
      const j = await r.json()
      if (!r.ok) { setErro(j.error || 'Não consegui criar o envio.'); return }
      setRes(j); onEnviado()
    } catch { setErro('Não consegui criar o envio. Tente de novo.') } finally { setEnviando(false) }
  }

  const bloqueada = !!est && !est.conectada
  const resta = est ? Math.max(0, est.limite - est.enviadosHoje) : 0

  return (
    <div className="oc-ov" onClick={onClose}>
      <aside className="oc-dr" onClick={e => e.stopPropagation()} aria-label="Enviar oferta">
        <style>{CSS}</style>
        <div className="oc-dh"><h3>{tipo === 'carrinho' ? 'Lembrar do carrinho' : 'Enviar oferta'} · {lojaNome}</h3><button onClick={onClose}>Fechar</button></div>
        <div className="oc-body">
          {res ? (
            <div className="oc-bx">
              <div className="oc-ok"><b>Pronto! {res.aceitos} mensagens na fila.</b><br />Saem uma por vez, de 2 a 4 minutos uma da outra, só das 8h às 20h, pelo WhatsApp da loja ({est?.limite || 15} por dia). {res.dias > 1 ? `Vai levar cerca de ${res.dias} dias.` : 'Termina hoje.'}</div>
              {(res.ignorados.optout > 0 || res.ignorados.recentes > 0 || res.ignorados.semNumero > 0) && (
                <p className="oc-nt">Ficaram de fora: {res.ignorados.recentes > 0 ? res.ignorados.recentes + ' que já receberam oferta nos últimos 7 dias; ' : ''}{res.ignorados.optout > 0 ? res.ignorados.optout + ' que pediram para não receber; ' : ''}{res.ignorados.semNumero > 0 ? res.ignorados.semNumero + ' sem número válido.' : ''}</p>
              )}
              <p className="oc-nt">Quando o cliente responder, a IA continua a conversa e manda o link do produto. O resultado aparece em “Resultado das ofertas enviadas”.</p>
              <button className="oc-cta" onClick={onClose}>Fechar</button>
            </div>
          ) : !est ? (
            <div className="oc-bx">{erro || 'Carregando…'}</div>
          ) : (
            <>
              <div className="oc-bx">
                <h4><span className="oc-step">1</span>Quem recebe</h4>
                <p>{dest.length} {dest.length === 1 ? 'cliente' : 'clientes'} do filtro atual. Quem já recebeu oferta nos últimos 7 dias e quem pediu para sair ficam de fora automaticamente.</p>
              </div>
              {bloqueada && <div className="oc-warn"><b>O WhatsApp da loja não está conectado.</b> Conecte em Mensagens antes de enviar ofertas. A plataforma não envia no lugar da loja, para proteger o número dela.</div>}
              {!bloqueada && !est.iaLigada && <div className="oc-warn amar"><b>A IA de atendimento desta loja está desligada.</b> Quem responder a oferta vai cair na conversa para você responder. Ligue em Mensagens → ⚙️ → Atendente IA se quiser que ela mande o link sozinha.</div>}
              <div className="oc-bx">
                <h4><span className="oc-step">2</span>Qual produto oferecer</h4>
                <select className="oc-sel" value={produtoId} onChange={e => { setProdutoId(e.target.value); const n = est.produtos.find(p => p.id === e.target.value)?.nome; if (n) void sugerir(n) }}>
                  {est.produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div className="oc-bx">
                <h4><span className="oc-step">3</span>Mensagem</h4>
                <p>Curta e terminando numa pergunta fácil de responder. Sem link: a IA manda o link quando o cliente responder.</p>
                <div className="oc-opts">
                  {sug.map((m, i) => (
                    <button key={i} className={'oc-op' + (sel === i ? ' sel' : '')} onClick={() => { setSel(i); setTexto(m) }}><i />{m}</button>
                  ))}
                </div>
                <button className="oc-link" onClick={() => sugerir()} disabled={carregandoSug}>{carregandoSug ? 'Escrevendo…' : 'Sugerir outras mensagens'}</button>
                <textarea value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escreva ou ajuste a mensagem. Use {nome} para o primeiro nome do cliente." />
                <div className={'oc-cnt' + (texto.length > 400 ? ' bad' : '')}>{texto.length} de 400 letras</div>
              </div>
              <div className="oc-bx">
                <h4>Como o cliente vai ver</h4>
                <div className="oc-wa"><div className="oc-bub">{previa || '…'}<small>(Para não receber mais mensagens, responda SAIR.)</small></div></div>
              </div>
              <div className="oc-bx">
                <h4><span className="oc-step">4</span>Como sai</h4>
                <p>Uma mensagem por vez, de 2 a 4 minutos entre elas, só das 8h às 20h, pelo WhatsApp da loja. Máximo de {est.limite} por dia: hoje ainda cabem {resta}{est.naFila > 0 ? ` (já há ${est.naFila} na fila de outras ofertas)` : ''}. É assim que o número da loja não corre risco de bloqueio.</p>
              </div>
              {erro && <div className="oc-warn">{erro}</div>}
              <button className="oc-cta" onClick={enviar} disabled={enviando || bloqueada || dest.length === 0 || texto.trim().length < 15 || texto.length > 400}>
                {enviando ? 'Criando…' : `Enviar para ${dest.length} ${dest.length === 1 ? 'cliente' : 'clientes'}`}
              </button>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}

const CSS = `
.oc-ov{position:fixed;inset:0;background:rgba(21,18,16,.55);z-index:70;display:flex;justify-content:flex-end}
.oc-dr{background:#E6E7DF;width:100%;max-width:620px;height:100%;overflow-y:auto;color:#151210;font-size:14px;line-height:1.45}
.oc-dh{background:#151210;color:#fff;padding:16px 24px;display:flex;align-items:center;gap:14px;position:sticky;top:0;z-index:2}
.oc-dh h3{margin:0;font-family:'Anton',Impact,sans-serif;font-weight:400;font-size:22px;letter-spacing:.01em}
.oc-dh button{margin-left:auto;border:1px solid #4A443D;background:transparent;color:#fff;border-radius:8px;min-height:40px;padding:0 14px;font:600 13px inherit;cursor:pointer}
.oc-body{padding:18px 24px 40px;display:flex;flex-direction:column;gap:14px}
.oc-bx{background:#fff;border:1px solid #A9AAA0;border-radius:12px;padding:16px}
.oc-bx h4{margin:0 0 4px;font-size:15px;font-weight:700}
.oc-bx p,.oc-nt{margin:0;color:#3E3B37;font-size:13px}
.oc-nt{margin-top:10px}
.oc-step{display:inline-block;background:#151210;color:#FFC531;border-radius:6px;font-size:11px;font-weight:800;padding:2px 8px;margin-right:8px}
.oc-sel{width:100%;margin-top:10px;border:1.5px solid #8E8F85;border-radius:10px;padding:11px 12px;font:600 14px inherit;background:#fff;color:#151210}
.oc-opts{display:flex;flex-direction:column;gap:8px;margin-top:10px}
.oc-op{border:1.5px solid #8E8F85;background:#fff;border-radius:10px;padding:11px 13px;text-align:left;font:500 13px/1.45 inherit;color:#151210;display:flex;gap:10px;cursor:pointer}
.oc-op.sel{border-color:#151210;background:#FFF7DA}
.oc-op i{width:16px;height:16px;border-radius:50%;border:2px solid #8E8F85;flex-shrink:0;margin-top:2px;display:block}
.oc-op.sel i{border-color:#151210;background:radial-gradient(#151210 45%,transparent 50%)}
.oc-link{border:0;background:none;color:#8A5E00;font:700 13px inherit;text-decoration:underline;padding:10px 0 0;cursor:pointer}
.oc-bx textarea{width:100%;box-sizing:border-box;border:1.5px solid #8E8F85;border-radius:10px;padding:11px 13px;font:500 14px/1.45 inherit;resize:vertical;min-height:90px;margin-top:10px;color:#151210}
.oc-cnt{font-size:12px;color:#0B6B43;font-weight:700;margin-top:4px}
.oc-cnt.bad{color:#9C2417}
.oc-wa{background:#E7DFD2;border-radius:14px;padding:14px;margin-top:8px}
.oc-bub{max-width:90%;margin-left:auto;background:#D9FDD3;border-radius:10px;padding:8px 11px;font-size:13px;line-height:1.4;box-shadow:0 1px 1px rgba(0,0,0,.12);white-space:pre-wrap}
.oc-bub small{display:block;margin-top:8px;font-size:11px;color:#3E3B37}
.oc-warn{background:#FBE3E0;border:1px solid #E5A79E;color:#7A1D12;border-radius:10px;padding:10px 12px;font-size:13px}
.oc-warn.amar{background:#FFF0C2;border-color:#E3B63C;color:#4A3500}
.oc-ok{background:#DDF1E7;border:1px solid #9CD3B8;color:#0B5F3C;border-radius:10px;padding:12px;font-size:14px}
.oc-cta{border:0;background:#FFC531;color:#151210;border-radius:10px;padding:14px 20px;font:800 15px inherit;min-height:50px;cursor:pointer;margin-top:4px}
.oc-cta:disabled{background:#4A443D;color:#F2EFE8;cursor:not-allowed}
`
