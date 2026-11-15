import { randomBytes } from 'crypto'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/phone'
import { sendCustomerWhatsApp } from '@/lib/whatsapp'
import { creditarCashbackAvulso, debitarCashback, getSaldoCashback, valorItensSemCashback } from '@/lib/cashback'
import { valorDoPremio } from '@/lib/quizRegras'
import { lerQuizPcts, pctDoMarcoQuiz } from '@/lib/jogosPremio'
import { jaGanhouNosUltimosDias } from '@/lib/quizPremio'

// Cashback do DELIVERY pelo jogo (15/nov/2026, Ricardo): na loja com o prêmio dos jogos ligado,
// o cliente recebe no WhatsApp, logo depois de pagar, um link para jogar o Quiz Pesca Premiada.
// A primeira rodada que terminar com marco garantido vira cashback na hora (% da tabela do quiz
// sobre o valor dos produtos do pedido, com o teto da loja). 1 prêmio por pedido, link vale 48 h,
// só para o WhatsApp do pedido e respeitando 1 prêmio por WhatsApp a cada 7 dias (mesa + delivery).
// Pedido cancelado depois: o prêmio sai do saldo.

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const brl = (n: number) => 'R$ ' + n.toFixed(2).replace('.', ',')
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const site = () => process.env.NEXT_PUBLIC_SITE_URL || 'https://www.trindadeonline.com.br'

export type OfertaPedido = { id: string; company_id: string; pedido_id: string; customer_phone: string; base: number; estado: string; expira_em: string }

// Idempotente: pode ser chamado em todo ponto onde o pedido vira "pago" (pagamento online, entregue).
export async function ofertarJogoPedido(pedidoId: string): Promise<void> {
  try {
    const { data: p } = await sb.from('loja_pedidos').select('id, company_id, customer_phone, subtotal, total, delivery_fee, comanda_id, origin, status')
      .eq('id', pedidoId).maybeSingle()
    if (!p || p.comanda_id || p.origin === 'mesa' || p.status === 'cancelado') return
    const phone = normalizePhone(p.customer_phone || '')
    if (!phone) return
    const { data: camp } = await sb.from('quiz_campanhas').select('ativa, premio_ativo, marcos, teto_valor').eq('company_id', p.company_id).maybeSingle()
    if (!camp?.ativa || !camp.premio_ativo) return
    const { data: ja } = await sb.from('jogo_ofertas_pedido').select('id').eq('pedido_id', p.id).maybeSingle()
    if (ja) return
    // Base: produtos do pedido (sem taxa de entrega), sem os itens marcados "sem cashback" e sem o que foi pago com cashback.
    const { data: deb } = await sb.from('cashback_ledger').select('valor').eq('pedido_id', p.id).eq('tipo', 'debito')
    const pagoCash = (deb || []).reduce((s, d) => s + Number(d.valor), 0)
    const produtos = p.subtotal != null ? Number(p.subtotal) : Number(p.total) - Number(p.delivery_fee || 0)
    const base = r2(Math.max(0, produtos - await valorItensSemCashback(sb, [p.id]) - pagoCash))
    if (base <= 0) return
    const token = randomBytes(18).toString('base64url')
    const { error } = await sb.from('jogo_ofertas_pedido').insert({ company_id: p.company_id, pedido_id: p.id, customer_phone: phone, base, token })
    if (error) return
    const { data: co } = await sb.from('companies').select('name').eq('id', p.company_id).maybeSingle()
    const max = Math.max(...lerQuizPcts(camp.marcos))
    const teto = Number(camp.teto_valor) || 0
    await sendCustomerWhatsApp(p.company_id, phone,
      `🎣 Obrigado pelo pedido na *${String(co?.name || '').trim()}*!\n\nQuer ganhar cashback? Jogue o *Quiz Pesca Premiada* e ganhe até *${max}%* do seu pedido de volta${teto > 0 ? ` (até ${brl(teto)})` : ''} para usar na próxima compra:\n${site()}/jogar/${token}\n\nO link vale por 48 horas e é só para este WhatsApp.`)
  } catch (e) { console.error('[jogoPedido] oferta', e) }
}

export async function ofertaPorToken(token: string): Promise<OfertaPedido | null> {
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) return null
  const { data } = await sb.from('jogo_ofertas_pedido').select('id, company_id, pedido_id, customer_phone, base, estado, expira_em').eq('token', token).maybeSingle()
  return (data as OfertaPedido) || null
}

export const ofertaValida = (o: OfertaPedido) => o.estado === 'aberta' && new Date(o.expira_em).getTime() > Date.now()

// O jogador pode levar o prêmio desta oferta? (WhatsApp do pedido + sem prêmio nos últimos 7 dias)
export async function podeGanharNaOferta(o: OfertaPedido, jogadorId: string): Promise<boolean> {
  if (!ofertaValida(o)) return false
  const { data: j } = await sb.from('quiz_jogadores').select('telefone').eq('id', jogadorId).maybeSingle()
  if (!j || normalizePhone(j.telefone || '') !== o.customer_phone) return false
  return !(await jaGanhouNosUltimosDias(sb, o.company_id, jogadorId))
}

// Chamado quando uma rodada do quiz termina. Rodada de pedido com marco garantido vira cashback na hora.
export async function liberarPremioRodadaPedido(rodadaId: string): Promise<void> {
  try {
    const { data: r } = await sb.from('quiz_rodadas').select('id, company_id, jogador_id, pedido_id, marco, estado').eq('id', rodadaId).maybeSingle()
    if (!r?.pedido_id || r.estado !== 'encerrada' || !(r.marco > 0) || !r.jogador_id) return
    const { data: o } = await sb.from('jogo_ofertas_pedido').select('id, company_id, pedido_id, customer_phone, base, estado, expira_em').eq('pedido_id', r.pedido_id).maybeSingle()
    if (!o || !(await podeGanharNaOferta(o as OfertaPedido, r.jogador_id))) return
    const { data: ped } = await sb.from('loja_pedidos').select('status').eq('id', o.pedido_id).maybeSingle()
    if (!ped || ped.status === 'cancelado') return
    const { data: camp } = await sb.from('quiz_campanhas').select('premio_ativo, modo, marcos, teto_valor').eq('company_id', o.company_id).maybeSingle()
    if (!camp?.premio_ativo) return
    const valor = valorDoPremio({ modo: camp.modo === 'fixo' ? 'fixo' : 'percentual', marco: r.marco, marcos: (camp.marcos || {}) as Record<string, number>, base: Number(o.base), teto: Number(camp.teto_valor) || 0 })
    if (!(valor > 0)) return
    // Trava a oferta antes de creditar: só uma rodada leva o prêmio.
    const { data: trava } = await sb.from('jogo_ofertas_pedido').update({ estado: 'premiada', premio_valor: valor, premio_rodada_id: r.id })
      .eq('id', o.id).eq('estado', 'aberta').select('id')
    if (!trava?.length) return
    const agora = new Date().toISOString()
    const ins = await sb.from('quiz_premios').insert({ company_id: o.company_id, rodada_id: r.id, comanda_id: null, pedido_id: o.pedido_id, marco: r.marco, estado: 'liberado', valor, liberado_em: agora })
    if (ins.error || !(await creditarCashbackAvulso(sb, { companyId: o.company_id, phoneRaw: o.customer_phone, valor }))) {
      if (!ins.error) await sb.from('quiz_premios').update({ estado: 'cancelado' }).eq('rodada_id', r.id)
      await sb.from('jogo_ofertas_pedido').update({ estado: 'aberta', premio_valor: null, premio_rodada_id: null }).eq('id', o.id)
      return
    }
    await sb.from('quiz_rodadas').update({ premiada: true }).eq('id', r.id)
    const { data: co } = await sb.from('companies').select('name').eq('id', o.company_id).maybeSingle()
    const saldo = await getSaldoCashback(sb, o.company_id, o.customer_phone)
    await sendCustomerWhatsApp(o.company_id, o.customer_phone,
      `🎣 Parabéns! No Quiz Pesca Premiada você garantiu *${pctDoMarcoQuiz(camp.marcos, r.marco)}%* e ganhou *${brl(valor)}* de cashback da *${String(co?.name || '').trim()}*. Seu saldo agora é *${brl(r2(saldo))}*, para usar no próximo pedido. Ver saldo: ${site()}/meu-cashback`)
  } catch (e) { console.error('[jogoPedido] premio', e) }
}

// Pedido cancelado: fecha a oferta e, se o prêmio já tinha saído, tira do saldo (até o que houver).
export async function cancelarJogoPedido(supabase: SupabaseClient, pedidoId: string): Promise<void> {
  try {
    const { data: o } = await supabase.from('jogo_ofertas_pedido').select('id, company_id, customer_phone, estado, premio_valor, premio_rodada_id').eq('pedido_id', pedidoId).maybeSingle()
    if (!o || o.estado === 'cancelada') return
    const { data: upd } = await supabase.from('jogo_ofertas_pedido').update({ estado: 'cancelada' }).eq('id', o.id).neq('estado', 'cancelada').select('id')
    if (!upd?.length || o.estado !== 'premiada') return
    const valor = Number(o.premio_valor || 0)
    if (valor > 0) {
      const tirado = await debitarCashback(supabase, { companyId: o.company_id, phoneRaw: o.customer_phone, valorDesejado: valor })
      if (tirado > 0) await supabase.from('cashback_ledger').insert({ company_id: o.company_id, customer_phone: o.customer_phone, pedido_id: pedidoId, tipo: 'debito', valor: tirado })
    }
    if (o.premio_rodada_id) await supabase.from('quiz_premios').update({ estado: 'cancelado' }).eq('rodada_id', o.premio_rodada_id)
  } catch (e) { console.error('[jogoPedido] cancelar', e) }
}
