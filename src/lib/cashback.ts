import { SupabaseClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/phone'

// Valor padrão só pro campo do painel quando a loja ainda não configurou
// nada — o prazo real mora em `companies.cashback_expira_dias`, por loja,
// lido direto pela função expirar_cashback() no Postgres (não aqui).
export const CASHBACK_EXPIRA_DIAS_DEFAULT = 90

// Teto no % que a loja pode configurar sozinha no painel — evita erro de
// digitação (ex: "30" em vez de "3") virando prejuízo real sem ninguém notar.
export const CASHBACK_PERCENT_MAX = 15

export async function getSaldoCashback(
  supabase: SupabaseClient, companyId: string, phoneRaw: string
): Promise<number> {
  const phone = normalizePhone(phoneRaw)
  if (!phone) return 0
  const { data } = await supabase.from('company_cashback_wallet')
    .select('saldo').eq('company_id', companyId).eq('customer_phone', phone).maybeSingle()
  return Number(data?.saldo || 0)
}

// Credita cashback pro telefone, ligado a UM pedido específico — o índice
// único em cashback_ledger (pedido_id where tipo='credito') garante que
// chamar isso 2x pro mesmo pedido (ex: status "entregue" marcado de novo por
// engano) só credita uma vez. Nunca lança: cashback é bônus, não pode
// quebrar o fluxo principal (marcar pedido como entregue) se falhar.
export async function creditarCashback(
  supabase: SupabaseClient,
  args: { companyId: string; phoneRaw: string; pedidoId: string; valor: number }
): Promise<void> {
  try {
    const phone = normalizePhone(args.phoneRaw)
    if (!phone || args.valor <= 0) return

    const { error: ledgerError } = await supabase.from('cashback_ledger').insert({
      company_id: args.companyId, customer_phone: phone, pedido_id: args.pedidoId,
      tipo: 'credito', valor: args.valor,
    })
    // Conflito no índice único = esse pedido já creditou antes — não soma
    // de novo na carteira.
    if (ledgerError) return

    const saldoAtual = await getSaldoCashback(supabase, args.companyId, phone)
    await supabase.from('company_cashback_wallet').upsert({
      company_id: args.companyId, customer_phone: phone,
      saldo: saldoAtual + args.valor, updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id,customer_phone' })
  } catch (err) {
    console.error('[cashback] falha ao creditar', err)
  }
}

// Crédito sem pedido ligado (prêmio do Quiz). A anti-duplicidade fica por conta de quem chama
// (quiz_premios tem rodada_id único); aqui só grava o extrato e soma na carteira.
export async function creditarCashbackAvulso(
  supabase: SupabaseClient,
  args: { companyId: string; phoneRaw: string; valor: number }
): Promise<boolean> {
  try {
    const phone = normalizePhone(args.phoneRaw)
    if (!phone || args.valor <= 0) return false
    const { error } = await supabase.from('cashback_ledger').insert({ company_id: args.companyId, customer_phone: phone, pedido_id: null, tipo: 'credito', valor: args.valor })
    if (error) return false
    const saldoAtual = await getSaldoCashback(supabase, args.companyId, phone)
    await supabase.from('company_cashback_wallet').upsert({
      company_id: args.companyId, customer_phone: phone,
      saldo: saldoAtual + args.valor, updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id,customer_phone' })
    return true
  } catch (err) {
    console.error('[cashback] falha ao creditar avulso', err)
    return false
  }
}

// Debita até `valorDesejado` do saldo disponível (nunca mais que o saldo
// real) e devolve quanto foi de fato usado — chamado ANTES de criar o
// pedido, pra abater do total cobrado. Guarda contra corrida (duas abas
// usando o mesmo saldo ao mesmo tempo) checando `saldo >= valorUsado` no
// próprio UPDATE; se perder a corrida, simplesmente não desconta nada em
// vez de deixar saldo negativo.
export async function debitarCashback(
  supabase: SupabaseClient,
  args: { companyId: string; phoneRaw: string; valorDesejado: number }
): Promise<number> {
  try {
    const phone = normalizePhone(args.phoneRaw)
    if (!phone || args.valorDesejado <= 0) return 0

    const saldoAtual = await getSaldoCashback(supabase, args.companyId, phone)
    const valorUsado = Math.min(saldoAtual, args.valorDesejado)
    if (valorUsado <= 0) return 0

    const { data, error } = await supabase.from('company_cashback_wallet')
      .update({ saldo: saldoAtual - valorUsado, updated_at: new Date().toISOString() })
      .eq('company_id', args.companyId).eq('customer_phone', phone).gte('saldo', valorUsado)
      .select('saldo')
    if (error || !data?.length) return 0
    return valorUsado
  } catch (err) {
    console.error('[cashback] falha ao debitar', err)
    return 0
  }
}

// Registra o débito no ledger depois que o pedido já foi criado (precisa do
// id dele) — separado de debitarCashback porque a ordem é: debita a
// carteira primeiro (pro total do pedido já saber o valor certo), cria o
// pedido, só então grava o ledger com o pedido_id de verdade.
export async function registrarDebitoCashback(
  supabase: SupabaseClient,
  args: { companyId: string; phoneRaw: string; pedidoId: string; valor: number }
): Promise<void> {
  if (args.valor <= 0) return
  try {
    const phone = normalizePhone(args.phoneRaw)
    await supabase.from('cashback_ledger').insert({
      company_id: args.companyId, customer_phone: phone, pedido_id: args.pedidoId,
      tipo: 'debito', valor: args.valor,
    })
  } catch (err) {
    console.error('[cashback] falha ao registrar débito', err)
  }
}

// Desfaz um débito (devolve o saldo) quando o pedido falha DEPOIS de já ter
// debitado — ex: itens não salvaram e o pedido foi apagado. Raro, mas sem
// isso o cliente perderia cashback de um pedido que nem chegou a existir.
export async function reembolsarCashback(
  supabase: SupabaseClient,
  args: { companyId: string; phoneRaw: string; valor: number }
): Promise<void> {
  if (args.valor <= 0) return
  try {
    const phone = normalizePhone(args.phoneRaw)
    const saldoAtual = await getSaldoCashback(supabase, args.companyId, phone)
    await supabase.from('company_cashback_wallet').upsert({
      company_id: args.companyId, customer_phone: phone,
      saldo: saldoAtual + args.valor, updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id,customer_phone' })
  } catch (err) {
    console.error('[cashback] falha ao reembolsar', err)
  }
}

// Soma (em R$) das linhas desses pedidos que NÃO geram cashback: produto marcado
// "sem cashback" (loja_produtos.sem_cashback) — vale sempre, em promoção ou não.
// Tolerante: se a coluna ainda não existir ou a consulta falhar, devolve 0.
export async function valorItensSemCashback(supabase: SupabaseClient, pedidoIds: string[]): Promise<number> {
  try {
    if (!pedidoIds.length) return 0
    const { data: itens, error } = await supabase.from('loja_pedido_itens')
      .select('produto_id, unit_price, qty').in('pedido_id', pedidoIds)
    if (error || !itens?.length) return 0
    const ids = [...new Set(itens.map(i => i.produto_id).filter(Boolean) as string[])]
    if (!ids.length) return 0
    const { data: prods, error: e2 } = await supabase.from('loja_produtos')
      .select('id').in('id', ids).eq('sem_cashback', true)
    if (e2 || !prods?.length) return 0
    const excluidos = new Set(prods.map(p => p.id))
    let soma = 0
    for (const i of itens) if (i.produto_id && excluidos.has(i.produto_id)) soma += Number(i.unit_price) * Number(i.qty)
    return Math.round((soma + Number.EPSILON) * 100) / 100
  } catch (err) {
    console.error('[cashback] falha ao somar itens sem cashback', err)
    return 0
  }
}
