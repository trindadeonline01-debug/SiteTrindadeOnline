// Ordem dos complementos: `display_order` de loja_opcoes_grupo e loja_opcoes
// (definida no organizador do cadastro do produto). O select aninhado do
// Supabase não garante ordem, então toda tela/rota que lê produto com grupos
// passa por aqui. Aceita produto único ou lista; não muda nada além da ordem.
type Ord = { display_order?: number | null; pausado?: boolean | null }
type G = Ord & { required?: boolean | null; options?: Ord[] | null }
type P = { groups?: G[] | null }

const porOrdem = (a: Ord, b: Ord) => (a.display_order ?? 0) - (b.display_order ?? 0)

// Complemento pausado (loja_opcoes.pausado) some de toda tela de venda. Se um
// grupo OPCIONAL ficar sem nenhuma opção por causa disso, o grupo some junto;
// grupo obrigatório fica (vazio) e o produto deixa de poder ser pedido — melhor
// do que vender sem a escolha que a loja exige.
export function ordenarComplementos<T extends P>(produto: T): T {
  if (!produto?.groups?.length) return produto
  const groups = [...produto.groups].sort(porOrdem).map(g => {
    const todas = g.options || []
    const ativas = todas.filter(o => !o.pausado)
    return { ...g, options: g.options ? [...ativas].sort(porOrdem) : g.options, _tinha: todas.length }
  }).filter(g => g.required || !g._tinha || (g.options?.length ?? 0) > 0)
    .map(g => { const { _tinha, ...resto } = g; void _tinha; return resto })
  return { ...produto, groups: groups as unknown as T['groups'] }
}

export function ordenarComplementosLista<T extends P>(produtos: T[] | null | undefined): T[] {
  return (produtos || []).map(ordenarComplementos)
}
