import { supabaseAdmin } from '@/lib/lojaCheckout'
import { reembolsarCashback } from '@/lib/cashback'
import { sendCustomerWhatsApp, notifyOwnerNewOrder } from '@/lib/whatsapp'
import { cancelarChamadaMotoboy } from '@/lib/entregaDispatch'
import { moduleActive } from '@/lib/modules'
import { notifyAdmin } from '@/lib/notifyAdmin'

// Cancelamento de pedido do cardápio (item 25 da base de conhecimento,
// regras do Ricardo, out/2026). Um lugar só pra: marcar cancelado + quem
// cancelou, devolver o cashback usado, soltar a chamada de motoboy, estornar
// o pagamento no Mercado Pago (só pedido pago pelo site, em loja conectada)
// e avisar a outra parte. Loja sem Mercado Pago conectado: nada de estorno —
// segue como sempre foi (pagamento combinado na entrega).

export type CanceladoPor = 'cliente' | 'loja'
export type ResultadoEstorno = { status: 'estornado' | 'processando' | 'falhou'; valor: number; erro?: string } | null

const PEDIDO_SELECT = 'id, company_id, status, payment_status, mp_payment_id, total, customer_phone, customer_name, order_number, delivery_type, cancelado_por, refund_status'

type PedidoCancelavel = {
  id: string; company_id: string; status: string; payment_status: string; mp_payment_id: string | null
  total: number; customer_phone: string | null; customer_name: string; order_number: number | null
  delivery_type: string; cancelado_por: string | null; refund_status: string | null
}

// Mensagens do Mercado Pago chegam em inglês — traduz as que a loja vai ver.
function traduzirErroMp(msg: string): string {
  if (/enough available money|insufficient/i.test(msg)) return 'a conta Mercado Pago da loja não tem saldo disponível pra devolver agora (dinheiro de cartão costuma ficar "a liberar" alguns dias)'
  if (/already refunded/i.test(msg)) return 'esse pagamento já foi devolvido'
  if (/not found/i.test(msg)) return 'pagamento não encontrado no Mercado Pago'
  return msg
}

function fmt(n: number) { return 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',') }

function pagoPeloSite(p: Pick<PedidoCancelavel, 'mp_payment_id' | 'payment_status'>) {
  return !!p.mp_payment_id && p.payment_status === 'pago'
}

// Devolve o valor inteiro no Mercado Pago, com o token DA LOJA (o dinheiro
// está na conta dela). Pagamento já devolvido por fora (painel do MP) conta
// como estornado — não tenta de novo.
async function estornarNoMercadoPago(pedido: PedidoCancelavel): Promise<ResultadoEstorno> {
  const valor = Number(pedido.total)
  const { data: conta } = await supabaseAdmin.from('company_mp_accounts')
    .select('mp_access_token').eq('company_id', pedido.company_id).maybeSingle()
  const salvar = (campos: Record<string, unknown>) =>
    supabaseAdmin.from('loja_pedidos').update(campos).eq('id', pedido.id)

  if (!conta?.mp_access_token) {
    const erro = 'conta do Mercado Pago da loja não está conectada'
    await salvar({ refund_status: 'falhou', refund_error: erro })
    return { status: 'falhou', valor, erro }
  }
  await salvar({ refund_status: 'processando', refund_error: null })

  const auth = { Authorization: `Bearer ${conta.mp_access_token}` }
  try {
    const atual = await fetch(`https://api.mercadopago.com/v1/payments/${pedido.mp_payment_id}`, { headers: auth })
    const pag = await atual.json().catch(() => ({}))
    if (pag?.status === 'refunded') {
      await salvar({ refund_status: 'estornado', refund_amount: valor, refunded_at: new Date().toISOString() })
      return { status: 'estornado', valor }
    }

    const res = await fetch(`https://api.mercadopago.com/v1/payments/${pedido.mp_payment_id}/refunds`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json', 'X-Idempotency-Key': `estorno-${pedido.id}` },
      body: JSON.stringify({}),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.id) {
      const erro = traduzirErroMp(String(data?.message || data?.error || `Mercado Pago respondeu ${res.status}`)).slice(0, 300)
      await salvar({ refund_status: 'falhou', refund_error: erro })
      return { status: 'falhou', valor, erro }
    }
    const status = data.status === 'approved' ? 'estornado' : 'processando'
    await salvar({
      refund_status: status, refund_amount: Number(data.amount ?? valor), mp_refund_id: String(data.id),
      refunded_at: status === 'estornado' ? new Date().toISOString() : null,
    })
    return { status, valor: Number(data.amount ?? valor) }
  } catch (err) {
    const erro = `falha ao falar com o Mercado Pago: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300)
    await salvar({ refund_status: 'falhou', refund_error: erro })
    return { status: 'falhou', valor, erro }
  }
}

// Cashback usado no pedido volta pra carteira do cliente naquela loja. O
// índice único (pedido_id, tipo='estorno') garante que volta uma vez só.
async function devolverCashbackDoPedido(pedido: PedidoCancelavel) {
  const { data: debito } = await supabaseAdmin.from('cashback_ledger')
    .select('valor, customer_phone').eq('pedido_id', pedido.id).eq('tipo', 'debito').maybeSingle()
  const valor = Number(debito?.valor || 0)
  if (!debito || valor <= 0) return
  const { error } = await supabaseAdmin.from('cashback_ledger').insert({
    company_id: pedido.company_id, customer_phone: debito.customer_phone, pedido_id: pedido.id, tipo: 'estorno', valor,
  })
  if (error) return
  await reembolsarCashback(supabaseAdmin, { companyId: pedido.company_id, phoneRaw: debito.customer_phone, valor })
}

async function soltarMotoboy(pedidoId: string) {
  const { data: entregas } = await supabaseAdmin.from('delivery_orders')
    .select('id, status').eq('pedido_id', pedidoId).in('status', ['buscando_motoboy', 'a_caminho', 'sem_motoboy'])
  for (const e of entregas || []) {
    const r = await cancelarChamadaMotoboy(e.id)
    if (!r.ok) console.error('[lojaCancelamento] não soltou o motoboy', e.id, r.error)
  }
}

function textoEstorno(estorno: ResultadoEstorno): string {
  if (!estorno) return ''
  if (estorno.status === 'estornado') return `\n💸 O valor de *${fmt(estorno.valor)}* foi devolvido pelo Mercado Pago. No Pix volta na hora; no cartão pode levar alguns dias pra aparecer na fatura.`
  if (estorno.status === 'processando') return `\n💸 A devolução de *${fmt(estorno.valor)}* já foi pedida ao Mercado Pago e está sendo processada.`
  return `\n⚠️ A devolução de *${fmt(estorno.valor)}* não saiu automática — a loja vai resolver com você.`
}

export async function cancelarPedidoLoja(args: { pedidoId: string; por: CanceladoPor }): Promise<
  { ok: true; jaCancelado?: boolean; estorno: ResultadoEstorno } | { ok: false; error: string; status?: number }
> {
  const { data: pedido } = await supabaseAdmin.from('loja_pedidos').select(PEDIDO_SELECT).eq('id', args.pedidoId).maybeSingle()
  if (!pedido) return { ok: false, error: 'pedido não encontrado', status: 404 }
  const p = pedido as PedidoCancelavel
  if (p.status === 'entregue') return { ok: false, error: 'Pedido já entregue não pode ser cancelado.' }

  // Já cancelado: só tenta o estorno de novo se ele tinha falhado (botão
  // "tentar estorno de novo" do painel). Não repete aviso nem cashback.
  if (p.status === 'cancelado') {
    if (args.por === 'loja' && pagoPeloSite(p) && p.refund_status === 'falhou') {
      return { ok: true, jaCancelado: true, estorno: await estornarNoMercadoPago(p) }
    }
    return { ok: true, jaCancelado: true, estorno: null }
  }

  const agora = new Date().toISOString()
  const { data: claimed } = await supabaseAdmin.from('loja_pedidos').update({
    status: 'cancelado', cancelado_por: args.por, cancelado_em: agora, cancelamento_solicitado_em: null, updated_at: agora,
  }).eq('id', p.id).eq('status', p.status).select('id')
  if (!claimed?.length) return { ok: false, error: 'O pedido mudou de status agora — atualiza a tela e tenta de novo.', status: 409 }

  await devolverCashbackDoPedido(p)
  await soltarMotoboy(p.id)
  const estorno = pagoPeloSite(p) ? await estornarNoMercadoPago(p) : null

  const { data: company } = await supabaseAdmin.from('companies')
    .select('name, owner_id, crm_whatsapp_enabled, trial_modules_until').eq('id', p.company_id).maybeSingle()
  const numero = p.order_number ? ` nº ${p.order_number}` : ''

  if (estorno?.status === 'falhou') {
    await notifyAdmin({ type: 'estorno_falhou', empresa: company?.name || p.company_id, pedido: `${numero.trim() || p.id} · ${p.customer_name}`, valor: estorno.valor, motivo: estorno.erro || '' })
  }

  if (args.por === 'cliente') {
    const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.trindadeonline.com.br'
    const txtEstorno = estorno?.status === 'estornado' ? `\n💸 ${fmt(estorno.valor)} devolvidos ao cliente pelo Mercado Pago.`
      : estorno?.status === 'falhou' ? `\n⚠️ O estorno de ${fmt(estorno.valor)} falhou — devolva pelo app do Mercado Pago.` : ''
    await notifyOwnerNewOrder(p.company_id, `❌ *Pedido${numero} cancelado pelo cliente*\n${p.customer_name} cancelou antes do preparo.${txtEstorno}`)
    if (company?.owner_id) {
      fetch(`${site}/api/push/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '❌ Pedido cancelado pelo cliente', body: `${p.customer_name} cancelou o pedido${numero}.`, target: 'external_user_id', userId: company.owner_id, url: `${site}/painel/pedidos` }),
      }).catch(() => {})
    }
  } else if (p.customer_phone && (estorno || (company && moduleActive(company.crm_whatsapp_enabled, company.trial_modules_until)))) {
    // Pedido pago pelo site: o cliente sempre fica sabendo do estorno. Sem
    // pagamento pelo site: mesmo gate de sempre (módulo de WhatsApp ativo).
    await sendCustomerWhatsApp(p.company_id, p.customer_phone, `❌ Seu pedido${numero} foi cancelado pela loja.${textoEstorno(estorno)}`)
  }

  return { ok: true, estorno }
}
