import { supabase } from '../supabase';
import type { Pedido, Status } from '../types';

const SELECT = 'id, order_number, customer_name, customer_phone, delivery_address, origin, status, payment_method, payment_status, delivery_type, notes, subtotal, total, delivery_fee, created_at, itens:loja_pedido_itens(*)';

// Fila de trabalho — só o que ainda precisa de ação. Entregue/cancelado não
// aparece aqui (não tem o que fazer com eles no app; consulta de histórico
// fica pro site, não é o foco do app enxuto).
const ABERTOS: Status[] = ['recebido', 'em_preparo', 'pronto', 'saiu_entrega'];

export async function fetchPedidosAbertos(companyId: string): Promise<Pedido[]> {
  const { data } = await supabase
    .from('loja_pedidos')
    .select(SELECT)
    .eq('company_id', companyId)
    .in('status', ABERTOS)
    .order('created_at', { ascending: true });
  return (data || []) as unknown as Pedido[];
}

export async function setPedidoStatus(id: string, status: Status) {
  await supabase.from('loja_pedidos').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
}

// Realtime (não polling) — o lojista TEM Supabase Auth de verdade, dá pra
// assinar a tabela com RLS normalmente (diferente do motoboy, que usa
// token opaco e precisa de poll). onNewOrder só dispara em INSERT (pra
// tocar som/imprimir); onAnyChange dispara em INSERT e UPDATE (pra
// recarregar a lista — o payload de Realtime não traz os itens
// relacionados, só a linha do pedido). Devolve a função de unsubscribe.
export function subscribePedidos(companyId: string, onNewOrder: (pedidoId: string) => void, onAnyChange: () => void): () => void {
  const channel = supabase
    .channel(`app-loja-pedidos-${companyId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'loja_pedidos', filter: `company_id=eq.${companyId}` }, (payload) => {
      onNewOrder((payload.new as { id: string }).id);
      onAnyChange();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'loja_pedidos', filter: `company_id=eq.${companyId}` }, () => {
      onAnyChange();
    })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
