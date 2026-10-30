import { supabase } from '../supabase';
import { apiPost } from './http';
import type { Pedido, Status } from '../types';

const SELECT = 'id, order_number, customer_id, customer_name, customer_phone, delivery_address, origin, status, payment_method, payment_status, mp_payment_id, delivery_type, notes, subtotal, total, delivery_fee, created_at, cancelamento_solicitado_em, cancelado_por, refund_status, itens:loja_pedido_itens(*)';

// Fila de trabalho — só o que ainda precisa de ação.
const ABERTOS: Status[] = ['recebido', 'em_preparo', 'pronto', 'saiu_entrega'];

export async function fetchPedidosAbertos(companyId: string): Promise<Pedido[]> {
  const { data } = await supabase
    .from('loja_pedidos').select(SELECT)
    .eq('company_id', companyId).in('status', ABERTOS)
    .order('created_at', { ascending: true });
  return (data || []) as unknown as Pedido[];
}

// Todos os pedidos de hoje (meia-noite de Brasília em diante), qualquer
// status — alimenta a tela "Hoje". Brasília é UTC-3 o ano todo (sem horário
// de verão desde 2019).
export async function fetchPedidosHoje(companyId: string): Promise<Pedido[]> {
  const br = new Date(Date.now() - 3 * 3600 * 1000);
  const inicio = new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate(), 3, 0, 0)).toISOString();
  const { data } = await supabase
    .from('loja_pedidos').select(SELECT)
    .eq('company_id', companyId).gte('created_at', inicio)
    .order('created_at', { ascending: false });
  return (data || []) as unknown as Pedido[];
}

// Mesmo roteiro do site (setStatus em /painel/pedidos): grava o status — com
// "pago" automático ao entregar — e depois avisa o cliente por push e por
// WhatsApp (a rota de status também credita o cashback).
export async function setPedidoStatus(companyId: string, companyName: string, p: Pedido, status: Status) {
  const autoPago = status === 'entregue' ? { payment_status: 'pago' } : {};
  const { error } = await supabase.from('loja_pedidos')
    .update({ status, updated_at: new Date().toISOString(), ...autoPago }).eq('id', p.id);
  if (error) throw new Error(error.message);
  apiPost('/api/loja/status-pedido', { companyId, pedidoId: p.id, status }).catch(() => {});
  notificarPush(p, companyName, status);
}

const MSG_CLIENTE: Partial<Record<Status, string>> = {
  em_preparo: '👨‍🍳 Seu pedido está em preparo!',
  pronto: '✅ Seu pedido está pronto!',
  saiu_entrega: '🚴 Seu pedido saiu para entrega!',
  entregue: '🎉 Pedido entregue! Obrigado pela preferência.',
  cancelado: '❌ Seu pedido foi cancelado.',
};
function notificarPush(p: Pedido, companyName: string, status: Status) {
  const msg = MSG_CLIENTE[status];
  if (!p.customer_id || !msg) return;
  fetch('https://www.trindadeonline.com.br/api/push/send', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: companyName, body: msg, target: 'external_user_id', userId: p.customer_id, url: 'https://www.trindadeonline.com.br/perfil' }),
  }).catch(() => {});
}

export type ResultadoCancelamento = { estorno: { status: 'processando' | 'estornado' | 'falhou'; valor: number; erro?: string } | null };

// Cancelar passa pelo servidor: marca quem cancelou, devolve cashback, solta
// a chamada de motoboy e estorna no Mercado Pago o pedido pago pelo site.
export async function cancelarPedido(p: Pedido): Promise<ResultadoCancelamento> {
  const r = await apiPost('/api/loja/cancelar-pedido', { pedidoId: p.id, por: 'loja' });
  return { estorno: r.estorno || null };
}

// "Manter pedido" quando o cliente pediu cancelamento.
export async function manterPedido(id: string) {
  await supabase.from('loja_pedidos').update({ cancelamento_solicitado_em: null }).eq('id', id);
}

// Realtime: INSERT de pedido novo + qualquer mudança em pedidos/entregas da
// loja. Devolve a função de unsubscribe.
export function subscribePedidos(companyId: string, onNewOrder: (pedidoId: string) => void, onAnyChange: () => void): () => void {
  const channel = supabase
    .channel(`app-loja-${companyId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'loja_pedidos', filter: `company_id=eq.${companyId}` }, (payload) => {
      onNewOrder((payload.new as { id: string }).id);
      onAnyChange();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'loja_pedidos', filter: `company_id=eq.${companyId}` }, () => onAnyChange())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_orders', filter: `company_id=eq.${companyId}` }, () => onAnyChange())
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

// Um pedido só (com itens) — usado quando o Realtime avisa de pedido novo.
export async function fetchPedido(id: string): Promise<Pedido | null> {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const { data } = await supabase.from('loja_pedidos').select(SELECT).eq('id', id).maybeSingle();
    const p = data as unknown as Pedido | null;
    // O checkout grava o pedido e os itens em 2 inserts: espera os itens.
    if (p && p.itens?.length > 0) return p;
    if (tentativa === 4) return p;
    await new Promise(r => setTimeout(r, 700));
  }
  return null;
}
