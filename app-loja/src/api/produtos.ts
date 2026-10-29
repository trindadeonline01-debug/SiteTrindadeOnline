import { supabase } from '../supabase';
import type { Produto, Categoria } from '../types';

export async function fetchProdutos(companyId: string): Promise<{ produtos: Produto[]; categorias: Categoria[] }> {
  const [{ data: produtos }, { data: categorias }] = await Promise.all([
    supabase.from('loja_produtos').select('id, name, sale_price, photo_url, active, esgotado, category_id').eq('company_id', companyId).eq('active', true).order('display_order'),
    supabase.from('loja_categorias').select('id, name').eq('company_id', companyId).order('display_order'),
  ]);
  return { produtos: (produtos || []) as Produto[], categorias: (categorias || []) as Categoria[] };
}

// Mesma ação de /painel/catalogo (botão "✕" — marcar esgotado hoje/voltar)
// — só essa, de propósito: o app não edita preço, foto nem cadastra
// produto novo, só pausa/despausa o que já existe.
export async function toggleEsgotado(produtoId: string, esgotadoAtual: boolean) {
  await supabase.from('loja_produtos').update({ esgotado: !esgotadoAtual }).eq('id', produtoId);
}
