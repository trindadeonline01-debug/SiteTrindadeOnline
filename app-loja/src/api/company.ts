import { supabase } from '../supabase';
import type { Company } from '../types';

const SELECT = 'id, name, slug, loja_digital_enabled, entrega_enabled, entrega_chamada_automatica, loja_auto_aceitar_pedidos, store_paused, address';

// V1: só a primeira empresa do dono (mesma simplificação do PDV web).
export async function fetchMyCompany(): Promise<Company | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data } = await supabase
    .from('companies').select(SELECT)
    .eq('owner_id', session.user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as Company) || null;
}

// Quem tem motoboy PRÓPRIO ativo nunca chama o da plataforma sozinho (regra
// do site, ver maybeAutoChamarMotoboy em /painel/pedidos).
export async function temMotoboyProprioAtivo(companyId: string): Promise<boolean> {
  const { count } = await supabase.from('loja_motoboys').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('ativo', true);
  return (count || 0) > 0;
}

export type CompanyFlag = 'store_paused' | 'loja_auto_aceitar_pedidos' | 'entrega_chamada_automatica';
export async function setCompanyFlag(companyId: string, campo: CompanyFlag, valor: boolean) {
  const { error } = await supabase.from('companies').update({ [campo]: valor }).eq('id', companyId);
  if (error) throw new Error(error.message);
}
