// Ordem dos complementos: `display_order` de loja_opcoes_grupo e loja_opcoes
// (definida no organizador do cadastro do produto). O select aninhado do
// Supabase não garante ordem, então toda tela/rota que lê produto com grupos
// passa por aqui. Aceita produto único ou lista; não muda nada além da ordem.
type Ord = { display_order?: number | null }
type G = Ord & { options?: Ord[] | null }
type P = { groups?: G[] | null }

const porOrdem = (a: Ord, b: Ord) => (a.display_order ?? 0) - (b.display_order ?? 0)

export function ordenarComplementos<T extends P>(produto: T): T {
  if (!produto?.groups?.length) return produto
  return {
    ...produto,
    groups: [...produto.groups].sort(porOrdem).map(g => ({
      ...g,
      options: g.options ? [...g.options].sort(porOrdem) : g.options,
    })),
  }
}

export function ordenarComplementosLista<T extends P>(produtos: T[] | null | undefined): T[] {
  return (produtos || []).map(ordenarComplementos)
}
