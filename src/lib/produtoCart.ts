// Tipos e cálculo de preço do carrinho de produto com opcionais/adicionais —
// compartilhado entre "Novo Pedido"/"Editar Pedido" (/painel/pedidos) e o PDV
// (/painel/pdv), que usam o mesmo catálogo (loja_produtos +
// loja_opcoes_grupo/loja_opcoes) e a mesma regra de grupo obrigatório/
// opcional, soma ou maior_valor.
export type NpOpcao = { id: string; name: string; price: number; max_qty: number | null }
export type NpGrupo = { id: string; name: string; required: boolean; min_select: number; max_select: number; pricing_rule: 'soma' | 'maior_valor'; options: NpOpcao[] }
export type NpProduto = { id: string; name: string; sale_price: number; category_id: string | null; groups: NpGrupo[]; photo_url?: string | null }
export type NpCartLine = { key: string; produtoId: string; name: string; modifiers: { name: string; price: number }[]; unitPrice: number; qty: number }

export function npGroupContribution(g: NpGrupo, selectedIdx: number[]): number {
  const prices = selectedIdx.map(oi => g.options[oi].price)
  if (prices.length === 0) return 0
  return g.pricing_rule === 'maior_valor' ? Math.max(...prices) : prices.reduce((a, b) => a + b, 0)
}

// Máscara de peso em kg estilo PDV — guarda só os dígitos digitados, os
// últimos 3 sempre viram a casa decimal (kg até grama), a vírgula é só de
// exibição. Extraído de EditarPedidoPanel (set/2026) pra ser reaproveitado
// também pelo PDV (/painel/pdv), sem duplicar a lógica em dois lugares que
// podem divergir com o tempo.
export const PESO_REGEX = /\bkg\b/i
export function pesoDigitsFromKg(n: number): string {
  return String(Math.max(0, Math.round(n * 1000)))
}
export function pesoNum(digits: string): number {
  const clean = digits.replace(/\D/g, '')
  return clean ? parseInt(clean, 10) / 1000 : 0
}
export function pesoDisplay(digits: string): string {
  const clean = digits.replace(/\D/g, '')
  if (!clean) return ''
  const padded = clean.padStart(4, '0')
  const whole = padded.slice(0, -3).replace(/^0+(?=\d)/, '')
  return `${whole},${padded.slice(-3)}`
}
