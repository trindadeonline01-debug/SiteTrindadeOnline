'use client'
import { Fragment, useEffect, useState } from 'react'

type Item = { id: string; product_name: string; unit_price: number; qty: number; selected_options: { name: string; price: number }[] | null }
type Status = 'recebido' | 'em_preparo' | 'pronto' | 'saiu_entrega' | 'entregue' | 'cancelado'
type Pedido = {
  id: string; order_number: number | null; customer_name: string; status: Status
  payment_method: string | null; payment_status: string
  delivery_type: 'entrega' | 'retirada' | 'balcao'; delivery_address: string | null
  subtotal: number; delivery_fee: number; total: number; notes: string | null
  created_at: string; cancelamento_solicitado_em: string | null
  itens: Item[]
}
type Company = { name: string; slug: string; phone: string | null } | null
type Entrega = { status: string; motoboy_name: string | null; delivery_code: string | null; picked_up_at: string | null; delivered_at: string | null } | null

const PAY_LABEL: Record<string, string> = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito' }

const STEPS_ENTREGA: { key: Status; label: string; icon: string }[] = [
  { key: 'recebido', label: 'Recebido', icon: '📥' },
  { key: 'em_preparo', label: 'Em preparo', icon: '🍳' },
  { key: 'pronto', label: 'Pronto', icon: '📦' },
  { key: 'saiu_entrega', label: 'A caminho', icon: '🏍️' },
]
const STEPS_RETIRADA: { key: Status; label: string; icon: string }[] = [
  { key: 'recebido', label: 'Recebido', icon: '📥' },
  { key: 'em_preparo', label: 'Em preparo', icon: '🍳' },
  { key: 'pronto', label: 'Pronto', icon: '📦' },
]

function fmt(n: number) { return 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',') }
function fmtDT(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ', ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
function waLink(phone: string | null, text: string) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  const full = digits.startsWith('55') ? digits : '55' + digits
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`
}

export default function PedidoClient({ id, initialPedido, initialCompany, initialEntrega }: {
  id: string; initialPedido: Pedido | null; initialCompany: Company; initialEntrega: Entrega
}) {
  const [pedido, setPedido] = useState(initialPedido)
  const [company] = useState(initialCompany)
  const [entrega, setEntrega] = useState(initialEntrega)
  const [cancelando, setCancelando] = useState(false)
  const [cancelError, setCancelError] = useState('')

  // Busca de novo em segundo plano — quem acompanha o pedido abre esse link
  // várias vezes esperando o status mudar, sem recarregar a página na mão.
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/pedido/${id}`)
        if (!res.ok) return
        const j = await res.json()
        if (j.pedido) setPedido(j.pedido)
        setEntrega(j.entrega || null)
      } catch {}
    }, 15000)
    return () => clearInterval(t)
  }, [id])

  async function solicitarCancelamento() {
    if (!pedido) return
    if (!confirm('Tem certeza que quer pedir o cancelamento? A loja vai ser avisada e decide se cancela.')) return
    setCancelando(true)
    setCancelError('')
    const res = await fetch('/api/loja/solicitar-cancelamento', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pedidoId: pedido.id }),
    })
    const data = await res.json()
    setCancelando(false)
    if (data.error) { setCancelError(data.error); return }
    setPedido(p => p ? { ...p, cancelamento_solicitado_em: new Date().toISOString() } : p)
  }

  const style = `
    body{margin:0;}
    .pd-wrap{max-width:420px;margin:0 auto;min-height:100vh;background:var(--concrete-2,#F5F6F2);font-family:'Archivo',sans-serif;color:var(--ink);display:flex;flex-direction:column;}
    .pd-logo{padding:16px 18px 10px;font-family:'Anton',sans-serif;font-size:15px;letter-spacing:.5px;}
    .pd-logo span{color:var(--sign-dark);}
    .pd-store{margin:0 18px 14px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px 14px;display:flex;align-items:center;gap:12px;}
    .pd-store-ico{width:40px;height:40px;border-radius:10px;background:#F0EDE4;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;flex:none;}
    .pd-store-name{font-weight:800;font-size:14px;}
    .pd-store-sub{font-size:11px;color:var(--muted);margin-top:1px;}
    .pd-card{margin:0 18px 14px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 16px;}
    .pd-steps{display:flex;align-items:flex-start;}
    .pd-step{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;}
    .pd-dot{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;}
    .pd-dot.done{background:var(--open);color:#fff;}
    .pd-dot.now{width:26px;height:26px;background:var(--sign);color:var(--ink);box-shadow:0 0 0 4px #FFF2CC;font-size:13px;}
    .pd-dot.todo{background:var(--concrete,#E9EAE5);color:var(--muted);}
    .pd-steplabel{font-size:9.5px;font-weight:700;color:var(--muted);text-align:center;}
    .pd-steplabel.now{font-weight:800;color:var(--ink);}
    .pd-line{flex:1;height:2px;margin-top:11px;}
    .pd-callout{margin:0 18px 14px;background:#FFF8E6;border:1.5px solid var(--sign);border-radius:14px;padding:16px;}
    .pd-callout.cancel{background:#FBEAEA;border-color:#F3C6C6;}
    .pd-callout-title{font-size:13px;font-weight:800;color:var(--sign-dark);}
    .pd-callout.cancel .pd-callout-title{color:var(--alert);}
    .pd-callout-sub{font-size:12px;color:var(--ink);margin-top:5px;line-height:1.5;}
    .pd-code-box{margin:0 18px 14px;background:var(--ink);border-radius:14px;padding:16px;text-align:center;}
    .pd-code-lbl{font-size:10.5px;font-weight:700;color:#B9B4A8;text-transform:uppercase;letter-spacing:.05em;}
    .pd-code-val{font-family:'Anton',sans-serif;font-size:34px;letter-spacing:6px;color:var(--sign);margin-top:4px;}
    .pd-code-hint{font-size:11px;color:#B9B4A8;margin-top:4px;line-height:1.5;}
    .pd-note{margin:0 18px 14px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:10px;font-size:11.5px;color:var(--muted);line-height:1.45;}
    .pd-label{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:4px;}
    .pd-itemrow{display:flex;justify-content:space-between;font-size:12.5px;padding:6px 0;border-bottom:1px solid var(--concrete-2,#F5F6F2);}
    .pd-sumrow{display:flex;justify-content:space-between;font-size:11.5px;color:var(--muted);padding:6px 0 2px;}
    .pd-totalrow{display:flex;justify-content:space-between;font-size:14.5px;font-weight:800;padding-top:8px;border-top:1.5px solid var(--ink);margin-top:4px;}
    .pd-actions{margin:0 18px 10px;display:flex;flex-direction:column;gap:10px;}
    .pd-btn{display:block;text-align:center;padding:13px;border-radius:12px;font-weight:800;font-size:13.5px;text-decoration:none;border:none;cursor:pointer;font-family:inherit;}
    .pd-btn-wa{background:var(--open);color:#fff;}
    .pd-btn-ghost{background:#fff;border:1.5px solid var(--line);color:var(--alert);font-weight:700;font-size:12.5px;padding:11px;}
    .pd-btn-ghost:disabled{opacity:.6;cursor:default;}
    .pd-footnote{margin:0 18px 24px;text-align:center;font-size:11px;color:var(--muted);line-height:1.5;}
    .pd-notfound{padding:60px 24px;text-align:center;}
  `

  if (!pedido || !company) {
    return (
      <div className="pd-wrap" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <style>{style}</style>
        <div className="pd-notfound">
          <div style={{ fontSize: 36, marginBottom: 10 }}>🔎</div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Pedido não encontrado</div>
          <div style={{ fontSize: 12.5, color: '#8A8478', marginTop: 6 }}>Confere se o link está completo.</div>
        </div>
      </div>
    )
  }

  const isEntrega = pedido.delivery_type === 'entrega'
  const steps = isEntrega ? STEPS_ENTREGA : STEPS_RETIRADA
  const stepIdx = steps.findIndex(s => s.key === pedido.status)
  const podeCancelar = ['recebido', 'em_preparo'].includes(pedido.status) && !pedido.cancelamento_solicitado_em
  const waTexto = `Oi! Sobre o meu pedido${pedido.order_number ? ` nº ${pedido.order_number}` : ''}...`
  const waHref = waLink(company.phone, waTexto)

  return (
    <div className="pd-wrap">
      <style>{style}</style>
      <div className="pd-logo">TRINDADE <span>ONLINE</span></div>

      <div className="pd-store">
        <div className="pd-store-ico">{(company.name || '').trim().slice(0, 2).toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="pd-store-name">{company.name}</div>
          <div className="pd-store-sub">Pedido{pedido.order_number ? ` nº ${pedido.order_number}` : ''} · {fmtDT(pedido.created_at)}</div>
        </div>
      </div>

      {pedido.status === 'cancelado' ? (
        <div className="pd-callout cancel">
          <div className="pd-callout-title">✕ Pedido cancelado</div>
          <div className="pd-callout-sub">Esse pedido foi cancelado. Qualquer dúvida, fala com a loja.</div>
        </div>
      ) : pedido.status === 'entregue' ? (
        <div style={{ margin: '4px 18px 18px', textAlign: 'center', padding: '28px 16px' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--open)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, margin: '0 auto 14px' }}>✓</div>
          <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 20, letterSpacing: '.3px' }}>{isEntrega ? 'PEDIDO ENTREGUE' : 'PEDIDO RETIRADO'}</div>
          <div style={{ fontSize: 12.5, color: '#8A8478', marginTop: 6 }}>Obrigado pela preferência! 🙏</div>
        </div>
      ) : (
        <>
          <div className="pd-card">
            <div className="pd-steps">
              {steps.map((s, i) => (
                <Fragment key={s.key}>
                  <div className="pd-step">
                    <div className={`pd-dot ${i < stepIdx ? 'done' : i === stepIdx ? 'now' : 'todo'}`}>{i < stepIdx ? '✓' : s.icon}</div>
                    <div className={`pd-steplabel ${i === stepIdx ? 'now' : ''}`}>{s.label}</div>
                  </div>
                  {i < steps.length - 1 && <div className="pd-line" style={{ background: i < stepIdx ? 'var(--open)' : 'var(--line)' }} />}
                </Fragment>
              ))}
            </div>
          </div>

          <div className="pd-callout">
            <div className="pd-callout-title">
              {pedido.status === 'recebido' && '📥 Recebido'}
              {pedido.status === 'em_preparo' && '🍳 Em preparo'}
              {pedido.status === 'pronto' && (isEntrega ? '📦 Pronto' : '📦 Pronto pra retirar')}
              {pedido.status === 'saiu_entrega' && '🏍️ Saiu para entrega'}
            </div>
            <div className="pd-callout-sub">
              {pedido.status === 'recebido' && 'A loja recebeu seu pedido e vai confirmar em instantes.'}
              {pedido.status === 'em_preparo' && 'A loja já confirmou seu pedido e está preparando agora.'}
              {pedido.status === 'pronto' && (isEntrega ? 'Seu pedido está pronto, só esperando o motoboy.' : 'Pode vir buscar!')}
              {pedido.status === 'saiu_entrega' && (entrega?.motoboy_name ? <><b>{entrega.motoboy_name}</b> está a caminho com seu pedido.</> : 'O motoboy está a caminho com seu pedido.')}
            </div>
          </div>

          {pedido.status === 'saiu_entrega' && entrega?.delivery_code && (
            <div className="pd-code-box">
              <div className="pd-code-lbl">Seu código de entrega</div>
              <div className="pd-code-val">{entrega.delivery_code}</div>
              <div className="pd-code-hint">Informa esse número pro motoboy quando ele chegar — é o que libera a confirmação da entrega.</div>
            </div>
          )}
        </>
      )}

      {pedido.payment_method && (
        <div className="pd-note">
          <span style={{ fontSize: 16 }}>💵</span>
          <div>{PAY_LABEL[pedido.payment_method] || pedido.payment_method} · cobrado <b style={{ color: 'var(--ink)' }}>{isEntrega ? 'na entrega' : 'na retirada'}</b>, não foi pago agora pelo site.</div>
        </div>
      )}

      {isEntrega && pedido.delivery_address && (
        <div className="pd-card">
          <div className="pd-label">🚚 Entrega</div>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>{pedido.delivery_address}</div>
        </div>
      )}

      <div className="pd-card">
        <div className="pd-label">Itens do pedido</div>
        {pedido.itens.map(it => (
          <div className="pd-itemrow" key={it.id}>
            <span>{it.qty}x {it.product_name}{it.selected_options?.length ? ` (${it.selected_options.map(o => o.name).join(', ')})` : ''}</span>
            <span style={{ fontWeight: 700 }}>{fmt(it.unit_price * it.qty)}</span>
          </div>
        ))}
        <div className="pd-sumrow"><span>Subtotal</span><span>{fmt(pedido.subtotal)}</span></div>
        {pedido.delivery_fee > 0 && <div className="pd-sumrow"><span>Taxa de entrega</span><span>{fmt(pedido.delivery_fee)}</span></div>}
        <div className="pd-totalrow"><span>Total</span><span>{fmt(pedido.total)}</span></div>
      </div>

      <div style={{ flex: 1 }} />

      <div className="pd-actions">
        {waHref && <a className="pd-btn pd-btn-wa" href={waHref} target="_blank" rel="noopener noreferrer">💬 Falar com a loja</a>}

        {pedido.status !== 'cancelado' && pedido.status !== 'entregue' && (
          podeCancelar ? (
            <button className="pd-btn pd-btn-ghost" disabled={cancelando} onClick={solicitarCancelamento}>
              {cancelando ? 'Enviando...' : '✕ Solicitar cancelamento'}
            </button>
          ) : pedido.cancelamento_solicitado_em ? (
            <div className="pd-footnote" style={{ margin: 0 }}>✓ Cancelamento solicitado — aguardando a loja.</div>
          ) : (
            <div className="pd-footnote" style={{ margin: 0 }}>Seu pedido já saiu — cancelamento não está mais disponível nessa etapa.</div>
          )
        )}
        {cancelError && <div style={{ color: 'var(--alert)', fontSize: 11.5, textAlign: 'center' }}>{cancelError}</div>}
      </div>
      <div style={{ height: 14 }} />
    </div>
  )
}
