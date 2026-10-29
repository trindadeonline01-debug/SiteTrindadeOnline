import { supabase } from '../supabase';
import type { Company } from '../types';

// V1 enxuto: só a primeira empresa do dono (mesma simplificação que o PDV
// web já faz hoje, src/app/painel/pdv/page.tsx) — troca de empresa pra
// quem tem mais de uma fica pra uma rodada futura, não é o caso comum.
export async function fetchMyCompany(): Promise<Company | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data } = await supabase
    .from('companies')
    .select('id, name, loja_digital_enabled')
    .eq('owner_id', session.user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as Company) || null;
}
