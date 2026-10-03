// Texto da mensagem "novo pedido" que o DONO da loja recebe no WhatsApp —
// compartilhado entre /api/loja/criar-pedido (cardápio público) e
// /api/loja/registrar-pedido (avulso/balcão, pedido pela conversa), pra não
// duplicar a mesma montagem de texto em dois arquivos.
const PAY_LABEL: Record<string, string> = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão' }

export type OrderItem = { name: string; qty: number; unitPrice: number; modifiers?: { name: string; price: number }[] }
export type OwnerOrderInfo = {
  items: OrderItem[]
  total: number
  paymentMethod: string | null
  deliveryType: string | null
  address: string | null
  notes: string | null
  orderNumber: number | string | null
  customerName: string
  customerPhone: string | null
}

function itemLines(items: OrderItem[]): string[] {
  const fmt = (n: number) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',')
  return items.map(it => {
    const mods = (it.modifiers || []).map(m => m.name).join(', ')
    return `• ${it.qty}x ${it.name}${mods ? ` (${mods})` : ''} — ${fmt(it.unitPrice * it.qty)}`
  })
}

export function buildOwnerMessage(opts: OwnerOrderInfo): string {
  const fmt = (n: number) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',')
  const parts = [
    '🔔 *Novo pedido!*',
    ...(opts.orderNumber != null ? [`📦 Pedido nº ${opts.orderNumber}`] : []),
    `👤 ${opts.customerName}${opts.customerPhone ? ` · ${opts.customerPhone}` : ''}`,
    '',
    ...itemLines(opts.items),
    '',
    `*Total: ${fmt(opts.total)}*`,
  ]
  if (opts.paymentMethod) parts.push(`💳 ${PAY_LABEL[opts.paymentMethod] || opts.paymentMethod}`)
  parts.push(opts.deliveryType === 'entrega' && opts.address ? `🚚 Entrega: ${opts.address}` : '🏪 Retirada no local')
  if (opts.notes) parts.push(`📝 Obs: ${opts.notes}`)
  return parts.join('\n')
}
