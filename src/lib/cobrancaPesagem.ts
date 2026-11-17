import { createClient } from '@supabase/supabase-js'
import { criarPagamentoMp, pixExpiracao } from '@/lib/lojaCheckout'
import { notifyOwnerNewOrder, sendCustomerWhatsApp } from '@/lib/whatsapp'
import { enviarPushLoja } from '@/lib/pushLoja'
import { ofertarJogoPedido } from '@/lib/jogoPedido'
import { PESO_REGEX } from '@/lib/produtoCart'

// Cobrança depois da pesagem (nov/2026, pedido do Ricardo — Peixaria
// Trindade): loja com Mercado Pago conectado + carrinho com produto vendido
// por kg. O pedido nasce SEM pagamento (aguardando_pesagem), a loja pesa,
// ajusta o peso em Editar pedido e clica "Enviar cobrança": gera um Pix com
// o valor real (token DA LOJA) e manda o link /pedido/<id> no WhatsApp do
// cliente. Pagou → pedido vai pra "em preparo" sozinho. 30 min sem pagar →
// pedido cancelado e os dois são avisados.

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.trindadeonline.com.br'
export const COBRANCA_VALIDADE_MIN = 30

export const temProdutoPorPeso = (nomes: string[]) => nomes.some(n => PESO_REGEX.test(n))
const reais = (n: number) => `R$ ${Number(n || 0).toFixed(2).replace('.', ',')}`

type Falha = { ok: false; status: number; error: string }

async function tokenDaLoja(companyId: string): Promise<string | null> {
  const { data } = await sb.from('company_mp_accounts').select('mp_access_token').eq('company_id', companyId).eq('status', 'connected').maybeSingle()
  return data?.mp_access_token || null
}

async function cancelarPagamentoMp(token: string, paymentId: string) {
  try {
    await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    })
  } catch { /* best-effort: se falhar, o Pix vence sozinho */ }
}

export async function enviarCobrancaPesagem(pedidoId: string, companyId: string, reqUrl: string): Promise<{ ok: true; total: number } | Falha> {
  const { data: p } = await sb.from('loja_pedidos')
    .select('id, company_id, order_number, status, total, customer_phone, aguardando_pesagem, payment_status, mp_payment_id')
    .eq('id', pedidoId).eq('company_id', companyId).maybeSingle()
  if (!p) return { ok: false, status: 404, error: 'Pedido não encontrado.' }
  if (!p.aguardando_pesagem || p.payment_status === 'pago') return { ok: false, status: 400, error: 'Esse pedido não está aguardando cobrança.' }
  if (p.status === 'cancelado') return { ok: false, status: 400, error: 'Pedido cancelado.' }
  if (!p.customer_phone) return { ok: false, status: 400, error: 'O pedido não tem WhatsApp do cliente pra mandar a cobrança.' }
  const total = Number(p.total || 0)
  if (!(total > 0)) return { ok: false, status: 400, error: 'Ajuste o peso antes — o total está zerado.' }

  const token = await tokenDaLoja(companyId)
  if (!token) return { ok: false, status: 400, error: 'Mercado Pago da loja não está conectado.' }

  // Cobrança anterior (reenvio depois de corrigir o peso de novo): pagou? então só confirma.
  if (p.mp_payment_id) {
    const conf = await confirmarCobrancaPesagem(p.mp_payment_id)
    if (conf === 'pago') return { ok: false, status: 409, error: 'O cliente já pagou a cobrança anterior.' }
    await cancelarPagamentoMp(token, p.mp_payment_id)
  }

  const { data: company } = await sb.from('companies').select('name').eq('id', companyId).maybeSingle()
  const exp = pixExpiracao()
  const mp = await criarPagamentoMp({ mp_access_token: token, application_fee_pct: 0, mp_public_key: null }, {
    transaction_amount: total,
    description: `Pedido ${p.order_number ? '#' + p.order_number + ' ' : ''}— ${company?.name || 'Trindade Online'}`,
    payment_method_id: 'pix',
    payer: { email: 'cliente@trindadeonline.com.br' },
    date_of_expiration: exp.mp,
    external_reference: `pesagem:${p.id}`,
    notification_url: `${new URL(reqUrl).origin}/api/mp/webhook-loja`,
  }, `pesagem-${p.id}-${Date.now()}`)
  if (!mp.ok) {
    console.error('[cobrancaPesagem] MP recusou', mp.data)
    return { ok: false, status: 502, error: 'O Mercado Pago não gerou o Pix agora. Tenta de novo em instantes.' }
  }

  const agora = new Date()
  const { error } = await sb.from('loja_pedidos').update({
    mp_payment_id: String(mp.data.id), payment_method: 'pix',
    cobranca_enviada_em: agora.toISOString(),
    cobranca_expira_em: new Date(agora.getTime() + COBRANCA_VALIDADE_MIN * 60000).toISOString(),
    cobranca_pix_qr: mp.data.point_of_interaction?.transaction_data?.qr_code_base64 || null,
    cobranca_pix_copia: mp.data.point_of_interaction?.transaction_data?.qr_code || null,
    updated_at: agora.toISOString(),
  }).eq('id', p.id)
  if (error) {
    await cancelarPagamentoMp(token, String(mp.data.id))
    return { ok: false, status: 500, error: 'Não consegui salvar a cobrança. Tenta de novo.' }
  }

  await sendCustomerWhatsApp(companyId, p.customer_phone,
    `⚖️ Seu pedido${p.order_number ? ` #${p.order_number}` : ''} da *${company?.name || 'loja'}* foi pesado!\n\n` +
    `Total: *${reais(total)}*\n\nPague pelo Pix neste link (vale por ${COBRANCA_VALIDADE_MIN} minutos):\n${SITE_URL}/pedido/${p.id}\n\n` +
    `Assim que o pagamento cair, a loja começa a preparar.`)
  return { ok: true, total }
}

// Confere no Mercado Pago e, se aprovado, marca pago e manda pra "em preparo".
// Idempotente: webhook, tela do cliente e cron podem chamar ao mesmo tempo.
export async function confirmarCobrancaPesagem(mpPaymentId: string): Promise<'pago' | 'pendente' | 'desconhecido'> {
  const { data: p } = await sb.from('loja_pedidos')
    .select('id, company_id, order_number, status, total, customer_name, customer_phone, aguardando_pesagem, payment_status')
    .eq('mp_payment_id', mpPaymentId).maybeSingle()
  if (!p || !p.aguardando_pesagem) return 'desconhecido'
  if (p.payment_status === 'pago') return 'pago'
  const token = await tokenDaLoja(p.company_id)
  if (!token) return 'pendente'
  let status = ''
  try {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${mpPaymentId}`, { headers: { Authorization: `Bearer ${token}` } })
    status = (await res.json())?.status || ''
  } catch { return 'pendente' }
  if (status !== 'approved') return 'pendente'

  const agora = new Date().toISOString()
  // Trava: só quem virar de pendente pra pago manda os avisos.
  const { data: virou } = await sb.from('loja_pedidos').update({
    payment_status: 'pago', aguardando_pesagem: false, cobranca_pix_qr: null,
    status: p.status === 'recebido' ? 'em_preparo' : p.status, updated_at: agora,
  }).eq('id', p.id).eq('payment_status', 'pendente').select('id')
  if (!virou?.length) return 'pago'

  // Pagou o Pix de um pedido que a loja já tinha cancelado: avisa pra devolver ou reabrir.
  if (p.status === 'cancelado') {
    await notifyOwnerNewOrder(p.company_id, `⚠️ ${p.customer_name || 'Cliente'} pagou ${reais(p.total)} do pedido #${p.order_number ?? ''}, que estava *cancelado*. Devolva pelo app do Mercado Pago ou fale com o cliente.`)
    return 'pago'
  }

  const msg = `✅ *Pagamento confirmado* — Pedido #${p.order_number ?? ''}\n${p.customer_name || 'Cliente'} pagou ${reais(p.total)} pelo Pix depois da pesagem. O pedido já foi pra *em preparo*.`
  await Promise.allSettled([
    notifyOwnerNewOrder(p.company_id, msg),
    enviarPushLoja(p.company_id, { title: `Pix recebido #${p.order_number ?? ''} — ${reais(p.total)}`, body: `${p.customer_name || 'Cliente'} pagou depois da pesagem`, data: { tipo: 'pedido_pago', pedidoId: String(p.id) } }),
    sendCustomerWhatsApp(p.company_id, p.customer_phone, `✅ Pagamento recebido! Seu pedido${p.order_number ? ` #${p.order_number}` : ''} já está sendo preparado.`),
  ])
  await ofertarJogoPedido(p.id)
  return 'pago'
}

// Cron (a cada 5 min): cobrança vencida sem pagamento → cancela o pedido.
export async function varrerCobrancasPesagemVencidas(): Promise<{ canceladas: number; pagas: number }> {
  const { data } = await sb.from('loja_pedidos')
    .select('id, company_id, order_number, customer_name, customer_phone, mp_payment_id, status')
    .eq('aguardando_pesagem', true).eq('payment_status', 'pendente').neq('status', 'cancelado')
    .lt('cobranca_expira_em', new Date().toISOString()).limit(50)
  let canceladas = 0, pagas = 0
  for (const p of data || []) {
    if (p.mp_payment_id && (await confirmarCobrancaPesagem(p.mp_payment_id)) === 'pago') { pagas++; continue }
    const agora = new Date().toISOString()
    const { data: cancelou } = await sb.from('loja_pedidos').update({
      status: 'cancelado', cancelado_por: 'loja', aguardando_pesagem: false, cobranca_pix_qr: null, updated_at: agora,
    }).eq('id', p.id).eq('payment_status', 'pendente').eq('aguardando_pesagem', true).select('id')
    if (!cancelou?.length) continue
    canceladas++
    const token = p.mp_payment_id ? await tokenDaLoja(p.company_id) : null
    if (token && p.mp_payment_id) await cancelarPagamentoMp(token, p.mp_payment_id)
    await Promise.allSettled([
      notifyOwnerNewOrder(p.company_id, `⌛ Pedido #${p.order_number ?? ''} (${p.customer_name || 'Cliente'}) foi *cancelado*: a cobrança depois da pesagem venceu sem pagamento (${COBRANCA_VALIDADE_MIN} min).`),
      sendCustomerWhatsApp(p.company_id, p.customer_phone, `⌛ A cobrança do seu pedido${p.order_number ? ` #${p.order_number}` : ''} venceu sem pagamento e o pedido foi cancelado. Se ainda quiser, é só fazer um novo pedido pelo cardápio.`),
    ])
  }
  return { canceladas, pagas }
}
