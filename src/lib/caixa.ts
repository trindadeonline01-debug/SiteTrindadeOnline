import { sb, r2 } from '@/lib/mesas'

// Caixa da loja (nov/2026): PDV e mesas dividem a mesma gaveta, um caixa aberto
// por loja. Delivery fica de fora (dinheiro chega pelo motoboy/maquininha, não
// pela gaveta do balcão). Tudo calculado aqui no servidor a partir das vendas
// da janela aberto_em → agora/fechado_em; o tablet nunca manda total.

export type CaixaRow = {
  id: string; company_id: string; status: 'aberto' | 'fechado'; troco_inicial: number
  aberto_em: string; aberto_por: string | null; fechado_em: string | null; fechado_por: string | null
  dinheiro_esperado: number | null; dinheiro_contado: number | null; diferenca: number | null
  observacao: string | null; resumo: unknown
}
type Linha = { valor: number; qtd: number }
export type ResumoCaixa = {
  trocoInicial: number
  porForma: Record<string, Linha>      // pdv + mesa juntos, por forma de pagamento
  canais: { pdv: Linha; mesa: Linha }
  totalVendas: number
  suprimentos: number; sangrias: number
  dinheiroVendas: number
  dinheiroEsperado: number
}
export type Movimento = { id: string; tipo: 'sangria' | 'suprimento'; valor: number; motivo: string | null; por: string | null; criado_em: string }

export async function caixaAberto(companyId: string): Promise<CaixaRow | null> {
  const { data } = await sb.from('loja_caixas').select('*').eq('company_id', companyId).eq('status', 'aberto').maybeSingle()
  return (data as CaixaRow | null) ?? null
}

// A loja "adota" o caixa ao abrir o primeiro. Daí em diante, sem caixa aberto,
// não vende no PDV nem recebe na mesa. Quem nunca abriu um segue como sempre foi.
export async function caixaObrigatorioFechado(companyId: string): Promise<boolean> {
  if (await caixaAberto(companyId)) return false
  const { count } = await sb.from('loja_caixas').select('id', { count: 'exact', head: true }).eq('company_id', companyId)
  return (count || 0) > 0
}

export async function movimentosDoCaixa(caixaId: string): Promise<Movimento[]> {
  const { data } = await sb.from('loja_caixa_movimentos').select('id, tipo, valor, motivo, por, criado_em').eq('caixa_id', caixaId).order('criado_em', { ascending: true })
  return (data || []).map(m => ({ ...m, valor: Number(m.valor) })) as Movimento[]
}

const soma = (l: Linha, v: number): Linha => ({ valor: r2(l.valor + v), qtd: l.qtd + 1 })

export async function resumoCaixa(caixa: CaixaRow, movs?: Movimento[]): Promise<ResumoCaixa> {
  const de = caixa.aberto_em
  const ate = caixa.fechado_em || new Date().toISOString()
  const movimentos = movs ?? await movimentosDoCaixa(caixa.id)

  const porForma: Record<string, Linha> = {}
  const canais = { pdv: { valor: 0, qtd: 0 } as Linha, mesa: { valor: 0, qtd: 0 } as Linha }

  // PDV: uma venda = uma forma de pagamento (payment_method), total da venda.
  const { data: vendas } = await sb.from('loja_pedidos').select('total, payment_method')
    .eq('company_id', caixa.company_id).eq('origin', 'pdv').neq('status', 'cancelado').gte('created_at', de).lte('created_at', ate)
  for (const v of vendas || []) {
    const f = String(v.payment_method || 'outro')
    porForma[f] = soma(porForma[f] || { valor: 0, qtd: 0 }, Number(v.total))
    canais.pdv = soma(canais.pdv, Number(v.total))
  }

  // Mesas: cada pagamento registrado na comanda dentro da janela (comanda cancelada não conta).
  const { data: pgs } = await sb.from('loja_comanda_pagamentos').select('comanda_id, forma, valor')
    .eq('company_id', caixa.company_id).gte('criado_em', de).lte('criado_em', ate)
  const ids = [...new Set((pgs || []).map(p => p.comanda_id))]
  const canceladas = new Set<string>()
  if (ids.length > 0) {
    const { data: cs } = await sb.from('loja_comandas').select('id, status').in('id', ids)
    for (const c of cs || []) if (c.status === 'cancelada') canceladas.add(c.id)
  }
  for (const p of pgs || []) {
    if (canceladas.has(p.comanda_id)) continue
    const f = String(p.forma)
    porForma[f] = soma(porForma[f] || { valor: 0, qtd: 0 }, Number(p.valor))
    canais.mesa = soma(canais.mesa, Number(p.valor))
  }

  const suprimentos = r2(movimentos.filter(m => m.tipo === 'suprimento').reduce((t, m) => t + m.valor, 0))
  const sangrias = r2(movimentos.filter(m => m.tipo === 'sangria').reduce((t, m) => t + m.valor, 0))
  const dinheiroVendas = porForma['dinheiro']?.valor || 0
  const trocoInicial = Number(caixa.troco_inicial)
  return {
    trocoInicial, porForma, canais,
    totalVendas: r2(canais.pdv.valor + canais.mesa.valor),
    suprimentos, sangrias, dinheiroVendas,
    dinheiroEsperado: r2(trocoInicial + dinheiroVendas + suprimentos - sangrias),
  }
}
