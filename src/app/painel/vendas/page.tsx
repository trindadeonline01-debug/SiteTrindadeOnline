'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { usePainelShell } from '@/contexts/PainelShellContext'
import PeriodFilterBar from '@/components/admin/PeriodFilterBar'
import { PeriodSel, periodRange, periodLabel } from '@/lib/periodFilter'
import { clampVirada } from '@/lib/diaComercial'
import { ORIGENS_DELIVERY } from '@/lib/canais'

// Vendas por canal (nov/2026): Delivery, PDV e Mesas separados, cada um com as
// próprias regras. Delivery e PDV vêm dos pedidos (loja_pedidos); Mesa vem da
// comanda FECHADA (e dos pagamentos reais registrados nela), nunca das rodadas.
// A taxa de serviço das mesas aparece à parte: não é venda da loja.

type Formas = Record<string, number>
type Canal = { qtd: number; bruto: number; canc: number; formas: Formas }
type Mesa = Canal & { consumo: number; desconto: number; taxa: number; recebido: number }
type Dados = { delivery: Canal; pdv: Canal; mesa: Mesa }

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const brl = (n: number) => 'R$ ' + (Number.isFinite(n) ? n : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const FORMA_LABEL: Record<string, string> = { dinheiro: 'Dinheiro', pix: 'Pix', cartao: 'Cartão', cashback: 'Cashback', outro: 'Outras' }
const FORMA_ORDEM = ['dinheiro', 'pix', 'cartao', 'cashback', 'outro']
function formaKey(m: string | null | undefined): string {
  const v = String(m || '').toLowerCase()
  if (v === 'dinheiro' || v === 'pix' || v === 'cashback') return v
  if (v.startsWith('cartao')) return 'cartao'
  return 'outro'
}
const vazio = (): Canal => ({ qtd: 0, bruto: 0, canc: 0, formas: {} })
const add = (f: Formas, k: string, v: number) => { f[k] = r2((f[k] || 0) + v) }

type PedidoRow = { total: number; status: string; origin: string; payment_method: string | null }
type ComandaRow = { status: string; subtotal: number; desconto: number; taxa_valor: number; total: number; pagamentos: { forma: string; valor: number }[] | null }

export default function VendasPage() {
  const { company, loading: shellLoading } = usePainelShell()
  const [period, setPeriod] = useState<PeriodSel>({ kind: 'today' })
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState('')
  const companyId = company?.id
  const [virada, setVirada] = useState<number | null>(null)
  useEffect(() => {
    if (!companyId) return
    supabase.from('companies').select('dia_virada_hora').eq('id', companyId).maybeSingle().then(({ data }) => setVirada(clampVirada(data?.dia_virada_hora)))
  }, [companyId])

  useEffect(() => {
    if (shellLoading || !companyId || virada == null) return
    let vivo = true
    const { from, to } = periodRange(period, virada)
    let qp = supabase.from('loja_pedidos').select('total, status, origin, payment_method').eq('company_id', companyId).in('origin', [...ORIGENS_DELIVERY, 'pdv'])
    if (from) qp = qp.gte('created_at', from)
    if (to) qp = qp.lt('created_at', to)
    let qc = supabase.from('loja_comandas').select('status, subtotal, desconto, taxa_valor, total, pagamentos:loja_comanda_pagamentos(forma, valor)').eq('company_id', companyId).in('status', ['fechada', 'cancelada'])
    if (from) qc = qc.gte('fechada_em', from)
    if (to) qc = qc.lt('fechada_em', to)
    Promise.all([qp.limit(20000), qc.limit(20000)]).then(([pr, cr]) => {
      if (!vivo) return
      if (pr.error || cr.error) { setErro('Não consegui carregar as vendas. Tente de novo.'); return }
      setErro('')
      const delivery = vazio(), pdv = vazio()
      const mesa: Mesa = { ...vazio(), consumo: 0, desconto: 0, taxa: 0, recebido: 0 }
      for (const p of (pr.data || []) as PedidoRow[]) {
        const c = p.origin === 'pdv' ? pdv : delivery
        if (p.status === 'cancelado') { c.canc += 1; continue }
        c.qtd += 1; c.bruto = r2(c.bruto + Number(p.total)); add(c.formas, formaKey(p.payment_method), Number(p.total))
      }
      for (const cm of (cr.data || []) as unknown as ComandaRow[]) {
        if (cm.status === 'cancelada') { mesa.canc += 1; continue }
        mesa.qtd += 1
        mesa.consumo = r2(mesa.consumo + Number(cm.subtotal)); mesa.desconto = r2(mesa.desconto + Number(cm.desconto))
        mesa.taxa = r2(mesa.taxa + Number(cm.taxa_valor)); mesa.recebido = r2(mesa.recebido + Number(cm.total))
        mesa.bruto = r2(mesa.bruto + Number(cm.subtotal) - Number(cm.desconto))
        for (const pg of cm.pagamentos || []) add(mesa.formas, formaKey(pg.forma), Number(pg.valor))
      }
      setDados({ delivery, pdv, mesa })
    })
    return () => { vivo = false }
  }, [shellLoading, companyId, period, virada])

  const totalVendas = dados ? r2(dados.delivery.bruto + dados.pdv.bruto + dados.mesa.bruto) : 0
  const totalQtd = dados ? dados.delivery.qtd + dados.pdv.qtd + dados.mesa.qtd : 0
  const formasUsadas = dados ? FORMA_ORDEM.filter(k => [dados.delivery, dados.pdv, dados.mesa].some(c => (c.formas[k] || 0) > 0)) : []
  const ticket = (c: Canal) => (c.qtd ? c.bruto / c.qtd : 0)

  return (
    <div className="vc">
      <style>{CSS}</style>
      <header className="vc-top"><h1>Vendas por canal</h1><span className="vc-sub">{periodLabel(period)}</span></header>
      <PeriodFilterBar value={period} onChange={setPeriod} />
      {erro && <div className="vc-err" role="alert">{erro}</div>}
      {!dados && !erro && <p className="vc-sub">Carregando…</p>}

      {dados && (
        <>
          <section className="vc-total">
            <div><em>Total vendido</em><b>{brl(totalVendas)}</b><small>Delivery + PDV + Mesas, sem a taxa de serviço</small></div>
            <div><em>Vendas</em><b>{totalQtd}</b><small>pedidos e comandas fechadas</small></div>
            <div><em>Ticket médio</em><b>{brl(totalQtd ? totalVendas / totalQtd : 0)}</b><small>por venda</small></div>
          </section>

          <div className="vc-grid">
            <section className="vc-card">
              <h2>🛵 Delivery</h2>
              <p className="vc-hint">Site, WhatsApp e pedido manual</p>
              <div className="vc-kpis">
                <div><em>Faturado</em><b>{brl(dados.delivery.bruto)}</b></div>
                <div><em>Pedidos</em><b>{dados.delivery.qtd}</b></div>
                <div><em>Ticket médio</em><b>{brl(ticket(dados.delivery))}</b></div>
                <div><em>Cancelados</em><b className={dados.delivery.canc ? 'bad' : ''}>{dados.delivery.canc}</b></div>
              </div>
            </section>

            <section className="vc-card">
              <h2>🖥️ PDV (balcão)</h2>
              <p className="vc-hint">Venda paga na hora</p>
              <div className="vc-kpis">
                <div><em>Faturado</em><b>{brl(dados.pdv.bruto)}</b></div>
                <div><em>Vendas</em><b>{dados.pdv.qtd}</b></div>
                <div><em>Ticket médio</em><b>{brl(ticket(dados.pdv))}</b></div>
                <div><em>Canceladas</em><b className={dados.pdv.canc ? 'bad' : ''}>{dados.pdv.canc}</b></div>
              </div>
            </section>

            <section className="vc-card">
              <h2>🍽️ Mesas</h2>
              <p className="vc-hint">Contas fechadas no período</p>
              <div className="vc-kpis">
                <div><em>Vendido (sem serviço)</em><b>{brl(dados.mesa.bruto)}</b></div>
                <div><em>Contas fechadas</em><b>{dados.mesa.qtd}</b></div>
                <div><em>Ticket médio</em><b>{brl(ticket(dados.mesa))}</b></div>
                <div><em>Canceladas / liberadas</em><b className={dados.mesa.canc ? 'bad' : ''}>{dados.mesa.canc}</b></div>
              </div>
              <div className="vc-lines">
                <div><span>Consumo</span><b>{brl(dados.mesa.consumo)}</b></div>
                <div><span>Descontos</span><b>{dados.mesa.desconto > 0 ? '− ' + brl(dados.mesa.desconto) : '—'}</b></div>
                <div><span>Taxa de serviço (à parte)</span><b>{brl(dados.mesa.taxa)}</b></div>
                <div className="t"><span>Recebido na mesa (com serviço)</span><b>{brl(dados.mesa.recebido)}</b></div>
              </div>
            </section>
          </div>

          <section className="vc-card">
            <h2>Forma de pagamento</h2>
            {formasUsadas.length === 0 ? <p className="vc-hint">Nenhuma venda no período.</p> : (
              <div className="vc-table" role="table">
                <div className="r h" role="row"><span>Forma</span><span>Delivery</span><span>PDV</span><span>Mesas</span><span>Total</span></div>
                {formasUsadas.map(k => {
                  const d = dados.delivery.formas[k] || 0, p = dados.pdv.formas[k] || 0, m = dados.mesa.formas[k] || 0
                  return <div key={k} className="r" role="row"><span>{FORMA_LABEL[k]}</span><span>{d ? brl(d) : '—'}</span><span>{p ? brl(p) : '—'}</span><span>{m ? brl(m) : '—'}</span><b>{brl(d + p + m)}</b></div>
                })}
              </div>
            )}
            <p className="vc-note">No delivery, o valor é o do pedido (pago na entrega ou pelo site). Nas mesas, são os pagamentos registrados na comanda, e incluem a taxa de serviço.</p>
          </section>
        </>
      )}
    </div>
  )
}

const CSS = `
.vc,.vc *{box-sizing:border-box}
.vc{max-width:1100px;margin:0 auto;padding:20px 16px 60px;display:flex;flex-direction:column;gap:14px;font-family:'Archivo',system-ui,sans-serif;color:#151210}
.vc-top{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}.vc-top h1{margin:0;font-family:'Anton',sans-serif;font-weight:400;font-size:34px;text-transform:uppercase;letter-spacing:.02em}
.vc-sub{color:#6F6C67;font-size:14px}
.vc-err{background:#FBE6E3;color:#B3261A;border-radius:8px;padding:10px 14px;font-weight:600;font-size:14px}
.vc-total{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.vc-total>div{background:#FFF6D6;border:1px solid #EBD27C;border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:3px;min-width:0}
.vc-total em,.vc-kpis em{font-style:normal;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#4f4c47;font-weight:700}
.vc-total b{font-family:'Anton',sans-serif;font-weight:400;font-size:34px;line-height:1.05;font-variant-numeric:tabular-nums}.vc-total small{font-size:12px;color:#6F6C67}
.vc-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:start}
.vc-card{background:#fff;border:1px solid #DCDDD6;border-radius:12px;padding:18px;display:flex;flex-direction:column;gap:12px;min-width:0}
.vc-card h2{margin:0;font-family:'Anton',sans-serif;font-weight:400;font-size:22px;text-transform:uppercase;letter-spacing:.02em}
.vc-hint{margin:-6px 0 0;color:#6F6C67;font-size:13px}.vc-note{margin:0;color:#6F6C67;font-size:12.5px;line-height:1.4}
.vc-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.vc-kpis>div{background:#F5F6F2;border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:2px;min-width:0}
.vc-kpis b{font-size:19px;font-variant-numeric:tabular-nums}.vc-kpis b.bad{color:#B3261A}
.vc-lines{display:flex;flex-direction:column}
.vc-lines>div{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid #ECEDE8;font-size:14px}.vc-lines b{font-variant-numeric:tabular-nums}
.vc-lines .t{font-weight:700;border-top:2px solid #151210}
.vc-table{display:flex;flex-direction:column;overflow-x:auto}
.vc-table .r{display:grid;grid-template-columns:minmax(110px,1.2fr) repeat(4,minmax(96px,1fr));gap:10px;padding:10px 0;border-top:1px solid #ECEDE8;font-size:14.5px;font-variant-numeric:tabular-nums;min-width:520px}
.vc-table .r.h{border-top:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#4f4c47;font-weight:700}
@media(max-width:900px){.vc-grid{grid-template-columns:minmax(0,1fr)}.vc-total{grid-template-columns:minmax(0,1fr)}}
`
