// Mesmo CONTEÚDO/layout de src/lib/qzPrint.ts (site) — número do pedido,
// cliente, itens, total, "NÃO É DOCUMENTO FISCAL" — mas na sintaxe própria
// da lib DantSu ([C]/[L]/[R], <b>, <font size>) em vez de comando ESC/POS
// cru. É a sintaxe que o módulo nativo (modules/thermal-printer-loja)
// entende, e ela já lida com largura/coluna por conta própria a partir do
// charsPerLine configurado — não precisa de padRow manual como no site.
function sanitize(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ºª]/g, '')
    .replace(/[[\]]/g, m => (m === '[' ? '(' : ')'))
    .replace(/[<>]/g, '')
}
function money(n: number) { return 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',') }
function line(charsPerLine: number, ch = '-') { return ch.repeat(charsPerLine) }

export type ReceiptItem = { qty: number; pesoKg?: number | null; name: string; unitPrice: number; options?: { name: string }[] }
function itemLabel(it: ReceiptItem): string {
  return it.pesoKg != null ? `${it.pesoKg}kg ${sanitize(it.name)}` : `${it.qty}x ${sanitize(it.name)}`
}

export type ReceiptData = {
  companyName: string
  pedidoShortId: string
  createdAt: string
  customerName: string
  customerPhone?: string | null
  deliveryType: 'entrega' | 'retirada' | 'balcao'
  address?: string | null
  paymentMethod?: string | null
  notes?: string | null
  items: ReceiptItem[]
  subtotal: number
  deliveryFee?: number
  total: number
}

const PAY_LABEL: Record<string, string> = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão' }

export function buildReceipt(d: ReceiptData, charsPerLine: number): string {
  const L: string[] = []
  L.push(`[C]<b><font size='wide'>${sanitize(d.companyName).toUpperCase()}</font></b>\n`)
  L.push(`[C]Pedido ${sanitize(d.pedidoShortId)}\n`)
  L.push(`[C]${new Date(d.createdAt).toLocaleString('pt-BR')}\n`)
  L.push(`[C]${line(charsPerLine)}\n`)

  L.push(`[L]Cliente: ${sanitize(d.customerName)}\n`)
  if (d.customerPhone) L.push(`[L]Telefone: ${sanitize(d.customerPhone)}\n`)

  if (d.deliveryType === 'entrega') {
    L.push(`[L]\n[L]<b>ENDERECO PARA ENTREGA:</b>\n`)
    if (d.address) L.push(`[L]${sanitize(d.address)}\n`)
  } else if (d.deliveryType === 'balcao') {
    L.push(`[L]\n[L]<b>PEDIDO DE BALCAO</b>\n`)
  } else {
    L.push(`[L]\n[L]<b>RETIRADA NO LOCAL</b>\n`)
  }
  L.push(`[C]${line(charsPerLine)}\n`)
  L.push(`[L]<b>ITENS DO PEDIDO</b>\n`)
  L.push(`[C]${line(charsPerLine)}\n`)

  for (const it of d.items) {
    L.push(`[L]${itemLabel(it)}[R]${money(it.unitPrice * it.qty)}\n`)
    it.options?.forEach(o => L.push(`[L]  - ${sanitize(o.name)}\n`))
  }
  L.push(`[C]${line(charsPerLine)}\n`)

  L.push(`[L]Subtotal[R]${money(d.subtotal)}\n`)
  if (d.deliveryType === 'entrega') L.push(`[L]Taxa de entrega[R]${money(d.deliveryFee || 0)}\n`)
  L.push(`[C]${line(charsPerLine, '=')}\n`)
  L.push(`[L]<b><font size='wide'>Total[R]${money(d.total)}</font></b>\n`)
  L.push(`[C]${line(charsPerLine, '=')}\n`)

  if (d.paymentMethod) {
    L.push(`[L]\n[L]<b>FORMA DE PAGAMENTO</b>\n`)
    L.push(`[L]${PAY_LABEL[d.paymentMethod] || sanitize(d.paymentMethod)}\n`)
  }
  if (d.notes) { L.push(`[C]${line(charsPerLine)}\n[L]<b>Obs:</b> ${sanitize(d.notes)}\n`) }

  L.push(`[C]\n[C]Fornecido por Trindade Online\n`)
  L.push(`[C]Impresso em ${new Date().toLocaleString('pt-BR')}\n`)
  L.push(`[C]NAO E DOCUMENTO FISCAL\n`)
  return L.join('')
}

export type KitchenTicketData = {
  pedidoShortId: string
  createdAt: string
  deliveryType: 'entrega' | 'retirada' | 'balcao'
  items: ReceiptItem[]
  notes?: string | null
}

const KITCHEN_DELIVERY_LABEL: Record<KitchenTicketData['deliveryType'], string> = {
  entrega: 'ENTREGA', retirada: 'RETIRADA NO LOCAL', balcao: 'BALCAO',
}

export function buildKitchenTicket(d: KitchenTicketData, charsPerLine: number): string {
  const L: string[] = []
  L.push(`[C]<b><font size='wide'>PEDIDO #${sanitize(d.pedidoShortId)}</font></b>\n`)
  L.push(`[C]${new Date(d.createdAt).toLocaleString('pt-BR')}\n`)
  L.push(`[C]<b>${KITCHEN_DELIVERY_LABEL[d.deliveryType]}</b>\n`)
  L.push(`[C]${line(charsPerLine)}\n`)

  for (const it of d.items) {
    L.push(`[L]<b>${itemLabel(it)}</b>\n`)
    it.options?.forEach(o => L.push(`[L]  - ${sanitize(o.name)}\n`))
  }
  if (d.notes) L.push(`[C]${line(charsPerLine)}\n[L]<b>Obs:</b> ${sanitize(d.notes)}\n`)
  L.push(`[C]\n[C]Impresso em ${new Date().toLocaleString('pt-BR')}\n`)
  return L.join('')
}

export function buildTestTicket(companyName: string, charsPerLine: number): string {
  const L: string[] = []
  L.push(`[C]<b><font size='wide'>IMPRESSAO DE TESTE</font></b>\n`)
  L.push(`[C]${sanitize(companyName).toUpperCase()}\n\n`)
  L.push(`[C]${new Date().toLocaleString('pt-BR')}\n`)
  L.push(`[C]${line(charsPerLine)}\n`)
  L.push(`[L]Se voce esta lendo isso, a impressora do app esta configurada certinho.\n`)
  L.push(`[C]${line(charsPerLine)}\n`)
  return L.join('')
}
