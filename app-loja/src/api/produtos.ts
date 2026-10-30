import { supabase } from '../supabase';
import type { Produto, Categoria } from '../types';

const SELECT = 'id, name, description, sale_price, photo_url, active, esgotado, category_id, promo_type, promo_value';

export async function fetchProdutos(companyId: string): Promise<{ produtos: Produto[]; categorias: Categoria[] }> {
  const [{ data: produtos }, { data: categorias }] = await Promise.all([
    supabase.from('loja_produtos').select(SELECT).eq('company_id', companyId).eq('active', true).order('display_order'),
    supabase.from('loja_categorias').select('id, name').eq('company_id', companyId).order('display_order'),
  ]);
  return { produtos: (produtos || []) as Produto[], categorias: (categorias || []) as Categoria[] };
}

export async function toggleEsgotado(produtoId: string, esgotadoAtual: boolean) {
  await supabase.from('loja_produtos').update({ esgotado: !esgotadoAtual }).eq('id', produtoId);
}

// Preço promocional de agora: o site guarda a promoção como DESCONTO
// (percent ou fixed). O app mostra e edita o NOVO VALOR direto, e converte
// para desconto fixo na hora de gravar.
export function precoPromocional(p: Pick<Produto, 'promo_type' | 'promo_value' | 'sale_price'>): number | null {
  if (!p.promo_type || !p.promo_value) return null;
  const sale = Number(p.sale_price);
  const v = Number(p.promo_value);
  const novo = p.promo_type === 'percent' ? sale * (1 - v / 100) : sale - v;
  return novo > 0 && novo < sale ? Math.round(novo * 100) / 100 : null;
}

export type EdicaoProduto = { name: string; description: string; sale_price: number; esgotado: boolean; novoValor: number | null };

export async function salvarProduto(p: Produto, e: EdicaoProduto) {
  const promo = e.novoValor != null && e.novoValor > 0 && e.novoValor < e.sale_price
    ? { promo_type: 'fixed', promo_value: Math.round((e.sale_price - e.novoValor) * 100) / 100, promo_starts_at: null, promo_ends_at: null }
    : { promo_type: null, promo_value: null, promo_starts_at: null, promo_ends_at: null };
  const { error } = await supabase.from('loja_produtos').update({
    name: e.name.trim(), description: e.description.trim() || null, sale_price: e.sale_price, esgotado: e.esgotado, ...promo,
  }).eq('id', p.id);
  if (error) throw new Error(error.message);
}

// Troca a foto: envia para o mesmo bucket do site e grava o endereço.
export async function trocarFoto(companyId: string, produtoId: string, uri: string): Promise<string> {
  const resp = await fetch(uri);
  const buf = await resp.arrayBuffer();
  const path = `${companyId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('loja-produtos').upload(path, buf, { upsert: true, contentType: 'image/jpeg' });
  if (error) throw new Error(error.message);
  const url = supabase.storage.from('loja-produtos').getPublicUrl(path).data.publicUrl;
  const { error: e2 } = await supabase.from('loja_produtos').update({ photo_url: url }).eq('id', produtoId);
  if (e2) throw new Error(e2.message);
  return url;
}
