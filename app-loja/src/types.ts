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
  customer_name: string
  customer_phone: string | null
  delivery_address: string | null
  origin: string
  status: Status
  payment_method: string | null
  payment_status: string
  delivery_type: 'entrega' | 'retirada' | 'balcao'
  notes: string | null
  subtotal: number
  total: number
  delivery_fee: number
  created_at: string
  itens: Item[]
}

export type Produto = {
  id: string
  name: string
  sale_price: number
  photo_url: string | null
  active: boolean
  esgotado: boolean
  category_id: string | null
}

export type Categoria = { id: string; name: string }

export type Company = {
  id: string
  name: string
  loja_digital_enabled: boolean
}

export const STATUS_LABEL: Record<Status, string> = {
  recebido: 'Recebido', em_preparo: 'Em preparo', pronto: 'Pronto',
  saiu_entrega: 'Saiu p/ entrega', entregue: 'Entregue', cancelado: 'Cancelado',
}

// Avançar de 1 em 1 (o app não pula etapa) — mesma ordem do kanban web.
export const STATUS_NEXT: Partial<Record<Status, Status>> = {
  recebido: 'em_preparo', em_preparo: 'pronto', pronto: 'saiu_entrega', saiu_entrega: 'entregue',
}
