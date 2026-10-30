import type { Entrega, Pedido } from './types';

export const fmt = (n: number | string | null | undefined) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');

export function resumoItens(p: Pedido): string {
  return (p.itens || []).map(i => `${i.peso_kg ? i.peso_kg + 'kg' : i.qty + '×'} ${i.product_name}`).join(', ');
}

export const pagoNoSite = (p: Pedido) => !!p.mp_payment_id && p.payment_status === 'pago';

const PAY_LABEL: Record<string, string> = { pix: 'Pix', dinheiro: 'Dinheiro', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito', cartao_online: 'Cartão', cartao: 'Cartão' };
export const payLabel = (m: string | null) => (m ? PAY_LABEL[m] || m : 'Pagamento');

export function minutosAtras(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

export function horaCurta(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000);
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
}

export type MotoEstado = 'buscando' | 'sem' | 'caminho' | 'retirado' | 'entregue';
export function motoEstado(e: Entrega | undefined): MotoEstado | null {
  if (!e) return null;
  if (e.status === 'buscando_motoboy') return 'buscando';
  if (e.status === 'sem_motoboy') return 'sem';
  if (e.status === 'a_caminho') return e.picked_up_at ? 'retirado' : 'caminho';
  if (e.status === 'entregue') return 'entregue';
  return null;
}

// Códigos só interessam enquanto a corrida está viva e o pedido não fechou.
export function codigosVisiveis(p: Pedido, e: Entrega | undefined): boolean {
  if (!e || !(e.pickup_code || e.delivery_code)) return false;
  if (!['recebido', 'em_preparo', 'pronto', 'saiu_entrega'].includes(p.status)) return false;
  return ['buscando_motoboy', 'sem_motoboy', 'a_caminho'].includes(e.status);
}

export function acaoLabel(p: Pedido): string {
  if (p.status === 'recebido') return 'Aceitar';
  if (p.status === 'em_preparo') return 'Pronto';
  if (p.status === 'pronto') return p.delivery_type === 'entrega' ? 'Saiu para entrega' : 'Entregue';
  return 'Entregue';
}
