// Mesmo modelo de dado de /painel/pedidos e /painel/catalogo no site —
// loja_pedidos/loja_pedido_itens/loja_produtos não mudam, só a tela muda.
export type Status = 'recebido' | 'em_preparo' | 'pronto' | 'saiu_entrega' | 'entregue' | 'cancelado'

export type Item = {
  id: string
  product_name: string
  unit_price: number
  qty: number
  peso_kg: number | null
  selected_options: { name: string; price: number }[]
}

export type Pedido = {
  id: string
  order_number: number | null
  customer_id: string | null
  customer_name: string
  customer_phone: string | null
  delivery_address: string | null
  origin: string
  status: Status
  payment_method: string | null
  payment_status: string
  mp_payment_id: string | null
  delivery_type: 'entrega' | 'retirada' | 'balcao'
  notes: string | null
  subtotal: number
  total: number
  delivery_fee: number
  created_at: string
  cancelamento_solicitado_em: string | null
  cancelado_por: string | null
  refund_status: string | null
  itens: Item[]
}

// Corrida do motoboy da plataforma (tabela delivery_orders). O dono da
// empresa já tem permissão de leitura (RLS "dono ou admin ve entregas").
export type Entrega = {
  id: string
  pedido_id: string | null
  status: 'buscando_motoboy' | 'a_caminho' | 'sem_motoboy' | 'entregue' | 'cancelada'
  motoboy_name: string | null
  motoboy_phone: string | null
  pickup_code: string | null
  delivery_code: string | null
  picked_up_at: string | null
}

export type Produto = {
  id: string
  name: string
  description: string | null
  sale_price: number
  photo_url: string | null
  active: boolean
  esgotado: boolean
  category_id: string | null
  promo_type: 'percent' | 'fixed' | null
  promo_value: number | null
}

export type Categoria = { id: string; name: string }

export type Company = {
  id: string
  name: string
  slug: string
  loja_digital_enabled: boolean
  entrega_enabled: boolean
  entrega_chamada_automatica: boolean
  loja_auto_aceitar_pedidos: boolean
  store_paused: boolean
  address: string | null
}

export const STATUS_LABEL: Record<Status, string> = {
  recebido: 'Recebido', em_preparo: 'Em preparo', pronto: 'Pronto',
  saiu_entrega: 'Saiu p/ entrega', entregue: 'Entregue', cancelado: 'Cancelado',
}

// Avançar de 1 em 1 (o app não pula etapa) — mesma ordem do kanban web.
export const STATUS_NEXT: Partial<Record<Status, Status>> = {
  recebido: 'em_preparo', em_preparo: 'pronto', pronto: 'saiu_entrega', saiu_entrega: 'entregue',
}

export function proximoStatus(p: Pick<Pedido, 'status' | 'delivery_type'>): Status | null {
  if (p.status === 'pronto' && p.delivery_type !== 'entrega') return 'entregue'
  return STATUS_NEXT[p.status] || null
}
