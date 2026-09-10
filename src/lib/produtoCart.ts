// Tipos e cálculo de preço do carrinho de produto com opcionais/adicionais —
// compartilhado entre "Novo Pedido" e "Editar Pedido" em /painel/pedidos,
// que usam o mesmo catálogo (loja_produtos + loja_opcoes_grupo/loja_opcoes)
// e a mesma regra de grupo obrigatório/opcional, soma ou maior_valor.
export type NpOpcao = { id: string; name: string; price: number; max_qty: number | null }
export type NpGrupo = { id: string; name: string; required: boolean; min_select: number; max_select: number; pricing_rule: 'soma' | 'maior_valor'; options: NpOpcao[] }
export type NpProduto = { id: string; name: string; sale_price: number; category_id: string | null; groups: NpGrupo[] }
export type NpCartLine = { key: string; produtoId: string; name: string; modifiers: { name: string; price: number }[]; unitPrice: number; qty: number }

export function npGroupContribution(g: NpGrupo, selectedIdx: number[]): number {
  const prices = selectedIdx.map(oi => g.options[oi].price)
  if (prices.length === 0) return 0
  return g.pricing_rule === 'maior_valor' ? Math.max(...prices) : prices.reduce((a, b) => a + b, 0)
}
