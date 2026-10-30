import { createClient } from '@supabase/supabase-js'
import { sendPlatformWhatsApp, notifyOwnerNewOrder } from '@/lib/whatsapp'
import { buildOwnerMessage } from '@/lib/orderMessages'
import { debitarCashback, registrarDebitoCashback, reembolsarCashback } from '@/lib/cashback'
import { notifyAdmin } from '@/lib/notifyAdmin'
import { promoPrice } from '@/lib/lojaPricing'

// Checkout do cardápio público, compartilhado por /api/loja/criar-pedido,
// /api/loja/pagar-cartao, o webhook do Mercado Pago e a consulta do cliente.
// Loja com Mercado Pago conectado: o carrinho fica em loja_pagamentos_pendentes
// e o pedido de verdade só nasce em loja_pedidos quando o pagamento aprova.

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export const PIX_VALIDADE_MIN = 30
export const CARTAO_ANALISE_DIAS = 3

export type ItemIn = { produtoId: string; name: string; unitPrice: number; qty: number; modifiers?: { name: string; price: number }[] }

export type PedidoPayload = {
  companyId: string
  customerId: string | null
  customerName: string
  customerPhone: string
  items: ItemIn[]
  deliveryType: 'entrega' | 'retirada'
  address: string | null
  scheduledFor: string | null
  paymentMethod: string | null
  notes: string | null
  subtotal: number
  deliveryFee: number
  total: number
  couponId: string | null
  origin: 'cardapio_publico' | 'conversa'
}

export type CheckoutCompany = { id: string; name: string; owner_id: string | null; pix_mp_enabled: boolean; cashback_enabled: boolean }
export type ContaMp = { mp_access_token: string; application_fee_pct: number; mp_public_key: string | null }

type Falha = { ok: false; status: number; error: string }

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function prepararCheckout(body: any): Promise<
  { ok: true; company: CheckoutCompany; payload: PedidoPayload; useCashback: boolean; contaMp: ContaMp | null } | Falha
> {
  const {
    access_token, companyId, customerName, customerPhone,
    items, deliveryType, address, scheduledFor, paymentMethod, notes,
    deliveryFee, couponId, origin, useCashback,
  } = body || {}

  if (!companyId) return { ok: false, status: 400, error: 'empresa obrigatória' }
  if (!Array.isArray(items) || items.length === 0) return { ok: false, status: 400, error: 'carrinho vazio' }

  // Chave-geral do admin (aba "Peça Agora") — desligada, nenhuma loja aceita
  // pedido, nem pelo link direto do cardápio.
  const { data: pecaAgoraSetting } = await supabaseAdmin.from('site_settings').select('value').eq('key', 'peca_agora_enabled').maybeSingle()
  if (pecaAgoraSetting?.value !== 'true') {
    return { ok: false, status: 503, error: 'Pedidos pausados no momento em toda a plataforma — tenta de novo daqui a pouco.' }
  }

  let customerId: string | null = null
  let finalName = String(customerName || '').trim()
  let finalPhone = String(customerPhone || '').trim()
  if (access_token) {
    const { data: userData } = await supabaseAuth.auth.getUser(access_token)
    if (userData?.user) {
      customerId = userData.user.id
      const { data: profile } = await supabaseAdmin.from('profiles').select('name, phone').eq('id', customerId).maybeSingle()
      finalName = finalName || profile?.name || 'Cliente'
      finalPhone = finalPhone || profile?.phone || ''
    }
  }
  if (!customerId) {
    if (!finalName) return { ok: false, status: 400, error: 'Informe seu nome.' }
    if (finalPhone.replace(/\D/g, '').length < 10) return { ok: false, status: 400, error: 'Informe um WhatsApp válido.' }
  }

  const { data: company } = await supabaseAdmin.from('companies')
    .select('id, name, owner_id, status, loja_digital_enabled, store_paused, pix_mp_enabled, cashback_enabled')
    .eq('id', companyId).maybeSingle()
  if (!company || company.status !== 'active' || !company.loja_digital_enabled) {
    return { ok: false, status: 400, error: 'Essa loja não está disponível pra pedidos agora.' }
  }
  if (company.store_paused) return { ok: false, status: 400, error: 'A loja pausou o recebimento de pedidos no momento.' }

  // Preço vem do navegador: confere com o cardápio real antes de cobrar (com
  // pagamento pelo site, a loja não confere mais na hora de receber). Cada
  // item precisa custar pelo menos o preço atual do produto (opcionais só somam).
  const itens = (items as ItemIn[]).map(l => ({ produtoId: l.produtoId, name: l.name, unitPrice: Number(l.unitPrice), qty: Number(l.qty), modifiers: l.modifiers || [] }))
  if (itens.some(l => !l.produtoId || !(l.qty > 0) || !(l.unitPrice >= 0))) return { ok: false, status: 400, error: 'Carrinho inválido — atualiza a página do cardápio.' }
  const { data: produtos } = await supabaseAdmin.from('loja_produtos')
    .select('id, sale_price, promo_type, promo_value, promo_starts_at, promo_ends_at, active, esgotado, track_stock, stock_qty')
    .eq('company_id', companyId).in('id', [...new Set(itens.map(l => l.produtoId))])
  const porId = new Map((produtos || []).map(p => [p.id, p]))
  for (const l of itens) {
    const p = porId.get(l.produtoId)
    if (!p || !p.active) return { ok: false, status: 409, error: `"${l.name}" não está mais disponível — tira do carrinho pra continuar.` }
    if (p.esgotado || (p.track_stock && (p.stock_qty ?? 0) <= 0)) return { ok: false, status: 409, error: `"${l.name}" esgotou — tira do carrinho pra continuar.` }
    const piso = promoPrice({ ...p, sale_price: Number(p.sale_price), promo_value: p.promo_value != null ? Number(p.promo_value) : null } as never) ?? Number(p.sale_price)
    if (l.unitPrice < piso - 0.01) return { ok: false, status: 409, error: 'O preço de algum item mudou — atualiza a página do cardápio e confere o carrinho.' }
  }
  const subtotalReal = Number(itens.reduce((s, l) => s + l.unitPrice * l.qty, 0).toFixed(2))

  let desconto = 0
  let cupomValido: string | null = null
  if (couponId) {
    const { data: c } = await supabaseAdmin.from('coupons')
      .select('id, discount_type, discount_value, min_purchase, active, expires_at')
      .eq('id', couponId).eq('company_id', companyId).maybeSingle()
    if (c && c.active && new Date(c.expires_at).getTime() > Date.now() && subtotalReal >= Number(c.min_purchase || 0)) {
      desconto = c.discount_type === 'fixed'
        ? Math.min(Number(c.discount_value), subtotalReal)
        : Math.round(subtotalReal * (Number(c.discount_value) / 100) * 100) / 100
      cupomValido = c.id
    }
  }
  const taxa = deliveryType === 'entrega' ? Math.max(0, Number(deliveryFee || 0)) : 0
  // Total ANTES do cashback — o cashback é descontado depois, por reservarCashback.
  const totalReal = Number((Math.max(0, subtotalReal - desconto) + taxa).toFixed(2))

  let contaMp: ContaMp | null = null
  if (company.pix_mp_enabled) {
    const { data } = await supabaseAdmin.from('company_mp_accounts')
      .select('mp_access_token, application_fee_pct, mp_public_key')
      .eq('company_id', companyId).eq('status', 'connected').maybeSingle()
    contaMp = data ? { ...data, application_fee_pct: Number(data.application_fee_pct) } : null
  }

  return {
    ok: true,
    company: { id: company.id, name: company.name, owner_id: company.owner_id, pix_mp_enabled: !!company.pix_mp_enabled, cashback_enabled: !!company.cashback_enabled },
    contaMp,
    useCashback: !!useCashback,
    payload: {
      companyId, customerId, customerName: finalName || 'Cliente', customerPhone: finalPhone,
      items: itens,
      deliveryType: deliveryType === 'retirada' ? 'retirada' : 'entrega',
      address: deliveryType === 'entrega' ? (address || null) : null,
      scheduledFor: scheduledFor || null,
      paymentMethod: paymentMethod || null,
      notes: notes || null,
      subtotal: subtotalReal, deliveryFee: taxa, total: totalReal,
      couponId: cupomValido,
      origin: origin === 'conversa' ? 'conversa' : 'cardapio_publico',
    },
  }
}

// Debita o cashback e devolve o payload já com o total final a cobrar.
export async function reservarCashback(company: CheckoutCompany, payload: PedidoPayload, useCashback: boolean) {
  let cashbackUsado = 0
  if (useCashback && company.cashback_enabled && payload.customerPhone) {
    cashbackUsado = await debitarCashback(supabaseAdmin, { companyId: company.id, phoneRaw: payload.customerPhone, valorDesejado: payload.total })
  }
  return { cashbackUsado, payload: { ...payload, total: Math.max(0, Number((payload.total - cashbackUsado).toFixed(2))) } }
}

export async function devolverCashback(companyId: string, phone: string, valor: number) {
  if (valor > 0) await reembolsarCashback(supabaseAdmin, { companyId, phoneRaw: phone, valor })
}

// Cria o pedido de verdade + itens + avisos (cliente, dono, push, admin).
// Com mpPaymentId, é idempotente: se já existir pedido desse pagamento, devolve ele.
export async function finalizarPedidoLoja(
  payload: PedidoPayload,
  opts: { company: CheckoutCompany; reqUrl: string; cashbackUsado: number; mpPaymentId?: string | null; pagoOnline?: boolean; devolverCashbackSeFalhar: boolean }
): Promise<{ ok: true; pedidoId: string; orderNumber: number | null } | Falha> {
  const { company, reqUrl, cashbackUsado, mpPaymentId = null, pagoOnline = false } = opts

  if (mpPaymentId) {
    const { data: existente } = await supabaseAdmin.from('loja_pedidos').select('id, order_number').eq('mp_payment_id', mpPaymentId).maybeSingle()
    if (existente) return { ok: true, pedidoId: existente.id, orderNumber: existente.order_number }
  }

  const falhar = async (error: string): Promise<Falha> => {
    if (opts.devolverCashbackSeFalhar) await devolverCashback(company.id, payload.customerPhone, cashbackUsado)
    return { ok: false, status: 500, error }
  }

  const { data: pedido, error: pedidoError } = await supabaseAdmin.from('loja_pedidos').insert({
    company_id: company.id, customer_id: payload.customerId,
    customer_name: payload.customerName || 'Cliente', customer_phone: payload.customerPhone || null,
    delivery_address: payload.deliveryType === 'entrega' ? payload.address : null,
    delivery_type: payload.deliveryType,
    scheduled_for: payload.scheduledFor,
    origin: payload.origin, payment_method: payload.paymentMethod,
    subtotal: payload.subtotal, total: payload.total, delivery_fee: payload.deliveryFee,
    notes: payload.notes, mp_payment_id: mpPaymentId,
    payment_status: pagoOnline ? 'pago' : 'pendente',
  }).select('id, order_number').single()
  if (pedidoError || !pedido) {
    // Outro processo (webhook x consulta do cliente) criou o mesmo pedido primeiro.
    if (mpPaymentId && pedidoError?.code === '23505') {
      const { data: existente } = await supabaseAdmin.from('loja_pedidos').select('id, order_number').eq('mp_payment_id', mpPaymentId).maybeSingle()
      if (existente) return { ok: true, pedidoId: existente.id, orderNumber: existente.order_number }
    }
    console.error('[lojaCheckout] falha ao criar pedido:', pedidoError)
    return falhar('Não deu pra enviar seu pedido agora. Tenta de novo em alguns segundos.')
  }

  const { error: itensError } = await supabaseAdmin.from('loja_pedido_itens').insert(
    payload.items.map(l => ({
      pedido_id: pedido.id, produto_id: l.produtoId, product_name: l.name, unit_price: l.unitPrice, qty: l.qty,
      selected_options: l.modifiers || [],
    }))
  )
  if (itensError) {
    console.error('[lojaCheckout] falha ao salvar itens:', itensError)
    await supabaseAdmin.from('loja_pedidos').delete().eq('id', pedido.id)
    return falhar('Não deu pra enviar seu pedido agora. Tenta de novo em alguns segundos.')
  }

  if (cashbackUsado > 0) await registrarDebitoCashback(supabaseAdmin, { companyId: company.id, phoneRaw: payload.customerPhone, pedidoId: pedido.id, valor: cashbackUsado })

  // Cupom só fica registrado (e conta pro limite de uso) pra quem tem conta.
  if (payload.couponId && payload.customerId) {
    const code = 'TRD-' + Math.random().toString(36).substring(2, 6).toUpperCase()
    await supabaseAdmin.from('coupon_redemptions').insert({ coupon_id: payload.couponId, user_id: payload.customerId, code, status: 'used', used_at: new Date().toISOString() })
  }

  // Avisos em paralelo, mas com await no conjunto: a função serverless pode
  // morrer assim que responde, cortando fetch em voo.
  const origin = new URL(reqUrl).origin
  const valorFmt = `R$ ${payload.total.toFixed(2).replace('.', ',')}`
  const jobs: Promise<unknown>[] = []

  jobs.push(
    fetch(new URL('/api/loja/registrar-pedido', reqUrl), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: company.id, pedidoId: pedido.id, phone: payload.customerPhone || null, name: payload.customerName || 'Cliente',
        address: payload.deliveryType === 'entrega' ? payload.address : null, total: payload.total, subtotal: payload.subtotal, deliveryFee: payload.deliveryFee,
        paymentMethod: payload.paymentMethod, deliveryType: payload.deliveryType, notes: payload.notes,
        items: payload.items.map(l => ({ produtoId: l.produtoId, name: l.name, qty: l.qty, unitPrice: l.unitPrice, modifiers: l.modifiers || [] })),
        skipOwnerNotify: true,
      }),
    }).catch(err => console.error('[lojaCheckout] falha registrar-pedido', err))
  )

  jobs.push(
    notifyOwnerNewOrder(company.id, buildOwnerMessage({
      items: payload.items.map(l => ({ name: l.name, qty: l.qty, unitPrice: l.unitPrice, modifiers: l.modifiers || [] })),
      total: payload.total, paymentMethod: payload.paymentMethod, deliveryType: payload.deliveryType,
      address: payload.deliveryType === 'entrega' ? payload.address : null, notes: payload.notes,
      orderNumber: pedido.order_number ?? null, customerName: payload.customerName || 'Cliente', customerPhone: payload.customerPhone || null,
      pagoOnline,
    })).then(result => { if (!result.ok) console.error('[lojaCheckout] aviso pro dono falhou:', result.detail) })
  )

  if (company.owner_id) {
    jobs.push(
      fetch(new URL('/api/push/send', reqUrl), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Novo pedido — ${company.name}`,
          body: `${payload.customerName || 'Cliente'} pediu ${valorFmt}${pagoOnline ? ' (já pago)' : ''}`,
          target: 'external_user_id', userId: company.owner_id,
          url: `${origin}/painel/pedidos`,
        }),
      }).catch(err => console.error('[lojaCheckout] falha push dono', err))
    )
  }

  jobs.push((async () => {
    try {
      const { data: admins } = await supabaseAdmin.from('profiles').select('id, phone').eq('user_type', 'admin')
      if (!admins?.length) return
      const pushUrl = `${origin}/painel/pedidos?empresa=${company.id}`
      await Promise.allSettled(admins.flatMap(admin => [
        fetch(new URL('/api/push/send', reqUrl), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `🔔 Novo pedido — ${company.name}`,
            body: `${payload.customerName || 'Cliente'} pediu ${valorFmt}`,
            target: 'external_user_id', userId: admin.id, url: pushUrl,
          }),
        }).catch(err => console.error('[lojaCheckout] falha push admin', err)),
        admin.phone
          ? sendPlatformWhatsApp(admin.phone, `🔔 *Novo pedido na Trindade Online!*\n\nLoja: *${company.name}*\nCliente: ${payload.customerName || 'Cliente'}\nValor: ${valorFmt}${pagoOnline ? ' ✅ pago pelo site' : ''}\n\n${pushUrl}`).catch(err => console.error('[lojaCheckout] falha whatsapp admin', err))
          : Promise.resolve(),
      ]))
    } catch (err) {
      console.error('[lojaCheckout] falha ao notificar admin', err)
    }
  })())

  await Promise.allSettled(jobs)
  return { ok: true, pedidoId: pedido.id, orderNumber: pedido.order_number ?? null }
}

// Mercado Pago pede a data com fuso explícito.
function isoComFusoBrasil(d: Date): string {
  const local = new Date(d.getTime() - 3 * 3600000)
  return local.toISOString().replace('Z', '-03:00')
}

export async function criarPagamentoMp(
  contaMp: ContaMp,
  body: Record<string, unknown>,
  idempotencyKey: string
): Promise<{ ok: true; data: any } | { ok: false; data: any }> {
  const res = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${contaMp.mp_access_token}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  return res.ok && data?.id ? { ok: true, data } : { ok: false, data }
}

export function pixExpiracao(): { mp: string; db: string } {
  // 5min a mais do que mostramos pro cliente: margem pro mínimo que o MP aceita.
  const d = new Date(Date.now() + (PIX_VALIDADE_MIN + 5) * 60000)
  return { mp: isoComFusoBrasil(d), db: d.toISOString() }
}

export function taxaPlataforma(contaMp: ContaMp, total: number) {
  return Number((total * (contaMp.application_fee_pct / 100)).toFixed(2))
}

export async function salvarPendente(args: {
  company: CheckoutCompany; payload: PedidoPayload; mpPaymentId: string; metodo: 'pix' | 'cartao'; cashbackUsado: number; expiresAt: string
}): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from('loja_pagamentos_pendentes').insert({
    company_id: args.company.id, mp_payment_id: args.mpPaymentId, metodo: args.metodo,
    payload: args.payload, cashback_usado: args.cashbackUsado, expires_at: args.expiresAt,
  }).select('id').single()
  if (error || !data) {
    console.error('[lojaCheckout] falha ao salvar pendente', error)
    return null
  }
  return data.id
}

const STATUS_RECUSADOS = ['rejected', 'cancelled', 'refunded', 'charged_back']
// "convertendo" parado há mais que isso = o processo caiu no meio; pode retomar.
const CONVERTENDO_TRAVADO_MS = 2 * 60000

export type EstadoPendente =
  | { estado: 'convertido'; pedidoId: string; orderNumber: number | null }
  | { estado: 'aguardando' }
  | { estado: 'recusado'; detalhe: string | null }
  | { estado: 'expirado' }
  | { estado: 'desconhecido' }

// Confere com o Mercado Pago e, se aprovado, cria o pedido de verdade.
// Chamado pelo webhook, pela consulta do cliente e pelo cron — a trava
// 'aguardando' → 'convertendo' garante que só um deles cria o pedido.
export async function confirmarPendente(mpPaymentId: string, reqUrl: string): Promise<EstadoPendente> {
  const { data: pend } = await supabaseAdmin.from('loja_pagamentos_pendentes').select('*').eq('mp_payment_id', mpPaymentId).maybeSingle()
  if (!pend) return { estado: 'desconhecido' }

  if (pend.status === 'convertido' && pend.pedido_id) {
    const { data: ped } = await supabaseAdmin.from('loja_pedidos').select('order_number').eq('id', pend.pedido_id).maybeSingle()
    return { estado: 'convertido', pedidoId: pend.pedido_id, orderNumber: ped?.order_number ?? null }
  }
  if (pend.status === 'recusado') return { estado: 'recusado', detalhe: null }
  const travado = pend.status === 'convertendo' && Date.now() - new Date(pend.updated_at).getTime() > CONVERTENDO_TRAVADO_MS
  if (pend.status === 'convertendo' && !travado) return { estado: 'aguardando' }

  const { data: conta } = await supabaseAdmin.from('company_mp_accounts').select('mp_access_token').eq('company_id', pend.company_id).maybeSingle()
  if (!conta) return { estado: 'aguardando' }
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${mpPaymentId}`, { headers: { Authorization: `Bearer ${conta.mp_access_token}` } })
  if (!res.ok) return { estado: 'aguardando' }
  const payment = await res.json()

  // Expirado ainda converte se o MP aprovar depois (cartão em análise): o
  // dinheiro foi cobrado, o pedido tem que existir.
  if (payment.status === 'approved') {
    // updated_at na trava: só um processo consegue "pegar" esse carrinho.
    const { data: claimed } = await supabaseAdmin.from('loja_pagamentos_pendentes')
      .update({ status: 'convertendo', updated_at: new Date().toISOString() })
      .eq('id', pend.id).eq('status', pend.status).eq('updated_at', pend.updated_at).select('id')
    if (!claimed?.length) return { estado: 'aguardando' }

    const { data: company } = await supabaseAdmin.from('companies')
      .select('id, name, owner_id, pix_mp_enabled, cashback_enabled').eq('id', pend.company_id).maybeSingle()
    const payload = pend.payload as PedidoPayload
    const result = company
      ? await finalizarPedidoLoja(payload, {
          company: { ...company, pix_mp_enabled: !!company.pix_mp_enabled, cashback_enabled: !!company.cashback_enabled },
          // Expirado já teve o cashback devolvido: não registra débito de novo.
          reqUrl, cashbackUsado: pend.status === 'expirado' ? 0 : Number(pend.cashback_usado), mpPaymentId, pagoOnline: true, devolverCashbackSeFalhar: false,
        })
      : null

    if (result?.ok) {
      await supabaseAdmin.from('loja_pagamentos_pendentes')
        .update({ status: 'convertido', pedido_id: result.pedidoId, updated_at: new Date().toISOString() }).eq('id', pend.id)
      return { estado: 'convertido', pedidoId: result.pedidoId, orderNumber: result.orderNumber }
    }
    // Pago mas o pedido não salvou: volta pra fila e a próxima consulta tenta de novo.
    await supabaseAdmin.from('loja_pagamentos_pendentes').update({ status: pend.status === 'expirado' ? 'expirado' : 'aguardando', updated_at: new Date().toISOString() }).eq('id', pend.id)
    return { estado: 'aguardando' }
  }

  if (pend.status === 'expirado') return { estado: 'expirado' }

  if (STATUS_RECUSADOS.includes(payment.status)) {
    const { data: claimed } = await supabaseAdmin.from('loja_pagamentos_pendentes')
      .update({ status: 'recusado', updated_at: new Date().toISOString() })
      .eq('id', pend.id).eq('status', 'aguardando').select('id')
    if (claimed?.length) await devolverCashback(pend.company_id, (pend.payload as PedidoPayload).customerPhone, Number(pend.cashback_usado))
    return { estado: 'recusado', detalhe: payment.status_detail || null }
  }

  return { estado: 'aguardando' }
}

// Varredura do cron: dá a última chance (pode ter pago no último segundo),
// senão expira e devolve o cashback. Pago e ainda sem pedido depois do prazo = avisa o admin.
export async function varrerPendentesVencidos(reqUrl: string) {
  const limite = new Date(Date.now() - 5 * 60000).toISOString()
  const { data: vencidos } = await supabaseAdmin.from('loja_pagamentos_pendentes')
    .select('id, mp_payment_id, company_id, payload, cashback_usado, metodo, expires_at')
    .or(`and(status.eq.aguardando,expires_at.lt.${limite}),and(status.eq.convertendo,updated_at.lt.${new Date(Date.now() - CONVERTENDO_TRAVADO_MS).toISOString()})`)
    .limit(50)

  const resumo = { verificados: 0, convertidos: 0, expirados: 0, pagosSemPedido: 0 }
  for (const pend of vencidos || []) {
    resumo.verificados++
    const estado = await confirmarPendente(pend.mp_payment_id, reqUrl)
    if (estado.estado === 'convertido') { resumo.convertidos++; continue }
    if (estado.estado !== 'aguardando') continue

    // Ainda "aguardando" depois do prazo: ou o cliente desistiu (normal), ou o
    // MP aprovou e o pedido não conseguiu salvar — esse caso nunca expira nem
    // devolve cashback: fica na fila e o admin é avisado.
    const { data: conta } = await supabaseAdmin.from('company_mp_accounts').select('mp_access_token').eq('company_id', pend.company_id).maybeSingle()
    const res = conta
      ? await fetch(`https://api.mercadopago.com/v1/payments/${pend.mp_payment_id}`, { headers: { Authorization: `Bearer ${conta.mp_access_token}` } })
      : null
    const payment = res?.ok ? await res.json() : null
    if (!payment) continue
    if (payment.status === 'approved') {
      resumo.pagosSemPedido++
      // Avisa só na 1ª varredura depois do prazo (o cron roda a cada 5 min).
      if (new Date(pend.expires_at).getTime() < Date.now() - 10 * 60000) continue
      const { data: company } = await supabaseAdmin.from('companies').select('name').eq('id', pend.company_id).maybeSingle()
      await notifyAdmin({ type: 'pagamento_sem_pedido', empresa: company?.name || pend.company_id, mpPaymentId: pend.mp_payment_id })
      continue
    }

    const { data: claimed } = await supabaseAdmin.from('loja_pagamentos_pendentes')
      .update({ status: 'expirado', updated_at: new Date().toISOString() })
      .eq('id', pend.id).eq('status', 'aguardando').select('id')
    if (!claimed?.length) continue
    resumo.expirados++
    await devolverCashback(pend.company_id, (pend.payload as PedidoPayload).customerPhone, Number(pend.cashback_usado))
  }
  return resumo
}
