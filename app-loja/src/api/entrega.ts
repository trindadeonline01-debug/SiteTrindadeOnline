import { supabase } from '../supabase';
import { apiPostComTokenNoCorpo } from './http';
import type { Entrega, Pedido } from '../types';

const SELECT = 'id, pedido_id, status, motoboy_name, motoboy_phone, pickup_code, delivery_code, picked_up_at';

// Entregas dos pedidos informados (a mais recente de cada pedido, ignorando
// as canceladas — igual ao painel do site).
export async function fetchEntregas(companyId: string, pedidoIds: string[]): Promise<Record<string, Entrega>> {
  if (pedidoIds.length === 0) return {};
  const { data } = await supabase
    .from('delivery_orders').select(SELECT)
    .eq('company_id', companyId).in('pedido_id', pedidoIds).neq('status', 'cancelada')
    .order('created_at', { ascending: true });
  const map: Record<string, Entrega> = {};
  for (const e of (data || []) as Entrega[]) if (e.pedido_id) map[e.pedido_id] = e;
  return map;
}

export async function chamarMotoboy(companyId: string, p: Pedido) {
  return apiPostComTokenNoCorpo('/api/entrega/criar', {
    company_id: companyId, pedido_id: p.id, customer_name: p.customer_name,
    customer_phone: p.customer_phone, dropoff_address: p.delivery_address,
  });
}

export async function chamarDeNovo(companyId: string, entregaId: string) {
  return apiPostComTokenNoCorpo('/api/entrega/retry', { company_id: companyId, delivery_order_id: entregaId });
}

export async function cancelarChamada(companyId: string, entregaId: string) {
  return apiPostComTokenNoCorpo('/api/entrega/cancelar', { company_id: companyId, delivery_order_id: entregaId });
}
