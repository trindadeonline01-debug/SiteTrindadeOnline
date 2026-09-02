// Ponte com o QZ Tray (app instalado no computador da loja) pra imprimir
// pedidos numa impressora térmica de 80mm via USB. QZ Tray roda em segundo
// plano escutando localhost — o navegador não consegue falar com uma
// impressora USB sozinho (bloqueio de segurança de todo navegador), então
// tudo aqui depende do app estar instalado e aberto.
//
// Modo "não assinado": QZ Tray mostra um aviso pedindo pra permitir o site
// na primeira conexão — se a pessoa marcar "lembrar", não pergunta de novo
// nesse computador. Não precisa de certificado nem de nada no back-end pra
// esse modo funcionar.

let qzModule: Promise<any> | null = null
async function getQz(): Promise<any> {
  if (!qzModule) {
    qzModule = import('qz-tray').then((m: any) => m.default || m)
  }
  return qzModule
}

export async function qzIsInstalled(): Promise<boolean> {
  try {
    const qz = await getQz()
    return !!qz
  } catch {
    return false
  }
}

export async function qzIsConnected(): Promise<boolean> {
  try {
    const qz = await getQz()
    return !!qz.websocket.isActive()
  } catch {
    return false
  }
}

export async function qzConnect(): Promise<void> {
  const qz = await getQz()
  if (!qz.websocket.isActive()) {
    await qz.websocket.connect()
  }
}

// Nomes de "impressora" que o Windows/Mac já vem com de fábrica e não são
// uma impressora térmica de verdade — aparecem na mesma lista que a
// impressora real e só atrapalham quem tá escolhendo qual usar.
const VIRTUAL_PRINTER_PATTERNS = /pdf|xps|fax|onenote|send to|microsoft print|adobe|documentwriter|print to file|onedrive/i

export async function qzListPrinters(): Promise<{ real: string[]; all: string[]; defaultPrinter: string | null }> {
  await qzConnect()
  const qz = await getQz()
  const found = await qz.printers.find()
  const all: string[] = Array.isArray(found) ? found : [found]
  const real = all.filter(name => !VIRTUAL_PRINTER_PATTERNS.test(name))
  let defaultPrinter: string | null = null
  try {
    defaultPrinter = await qz.printers.getDefault()
  } catch {}
  // Se o filtro por acaso zerar a lista (nome real bateu com algum padrão
  // acima, coincidência rara), volta pra lista completa em vez de mostrar
  // "nenhuma impressora encontrada" com a impressora ligada bem ali.
  return { real: real.length > 0 ? real : all, all, defaultPrinter }
}

export async function qzPrintRaw(printerName: string, content: string): Promise<void> {
  await qzConnect()
  const qz = await getQz()
  const config = qz.configs.create(printerName)
  await qz.print(config, [content])
}

// ── Recibo ESC/POS pra impressora térmica de 80mm (largura padrão de
// 42 colunas na fonte A, que é o tamanho mais comum de impressora de
// cupom — Epson, Elgin, Bematech e afins entendem esses comandos) ──
const ESC = '\x1B'
const GS = '\x1D'
const WIDTH = 42

const CMD = {
  init: ESC + '@',
  alignLeft: ESC + 'a' + '\x00',
  alignCenter: ESC + 'a' + '\x01',
  boldOn: ESC + 'E' + '\x01',
  boldOff: ESC + 'E' + '\x00',
  doubleOn: GS + '!' + '\x11',
  doubleOff: GS + '!' + '\x00',
  cut: GS + 'V' + '\x00',
  feed: (n: number) => '\n'.repeat(n),
}

function padRow(left: string, right: string, width = WIDTH): string {
  const space = width - left.length - right.length
  if (space <= 0) return (left + ' ' + right).slice(0, width)
  return left + ' '.repeat(space) + right
}
function wrap(text: string, width = WIDTH): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > width) { lines.push(cur.trim()); cur = w }
    else cur = (cur + ' ' + w).trim()
  }
  if (cur) lines.push(cur)
  return lines
}
function money(n: number) { return 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',') }

type ReceiptItem = { qty: number; name: string; unitPrice: number; options?: { name: string }[] }
export type ReceiptData = {
  companyName: string
  pedidoShortId: string
  createdAt: string
  customerName: string
  customerPhone?: string | null
  deliveryType: 'entrega' | 'retirada'
  address?: string | null
  paymentMethod?: string | null
  notes?: string | null
  items: ReceiptItem[]
  total: number
}

const PAY_LABEL: Record<string, string> = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão' }

export function buildReceipt(d: ReceiptData): string {
  const lines: string[] = []
  lines.push(CMD.init, CMD.alignCenter, CMD.boldOn, CMD.doubleOn)
  lines.push(d.companyName.toUpperCase(), '\n')
  lines.push(CMD.doubleOff, CMD.boldOff)
  lines.push(`Pedido #${d.pedidoShortId}`, '\n')
  lines.push(new Date(d.createdAt).toLocaleString('pt-BR'), '\n')
  lines.push('-'.repeat(WIDTH), '\n')
  lines.push(CMD.alignLeft)

  lines.push(CMD.boldOn + (d.deliveryType === 'retirada' ? 'RETIRADA NO LOCAL' : 'ENTREGA') + CMD.boldOff, '\n')
  lines.push(d.customerName, '\n')
  if (d.customerPhone) lines.push(d.customerPhone, '\n')
  if (d.deliveryType === 'entrega' && d.address) {
    wrap(d.address).forEach(l => lines.push(l, '\n'))
  }
  lines.push('-'.repeat(WIDTH), '\n')

  for (const it of d.items) {
    wrap(`${it.qty}x ${it.name}`).forEach((l, i) => {
      if (i === 0) lines.push(padRow(l, money(it.unitPrice * it.qty)), '\n')
      else lines.push(l, '\n')
    })
    if (it.options?.length) lines.push('  ' + it.options.map(o => o.name).join(', '), '\n')
  }
  lines.push('-'.repeat(WIDTH), '\n')
  lines.push(CMD.boldOn, CMD.doubleOn, padRow('TOTAL', money(d.total)), CMD.doubleOff, CMD.boldOff, '\n')
  if (d.paymentMethod) lines.push('Pagamento: ' + (PAY_LABEL[d.paymentMethod] || d.paymentMethod), '\n')
  if (d.notes) { lines.push('-'.repeat(WIDTH), '\n', 'Obs: ', '\n'); wrap(d.notes).forEach(l => lines.push(l, '\n')) }
  // A faca de corte da impressora fica alguns milímetros abaixo da cabeça
  // de impressão — 3 linhas de avanço não era o bastante e cortava em cima
  // da última linha (forma de pagamento). 6 dá folga de sobra.
  lines.push(CMD.feed(6), CMD.cut)
  return lines.join('')
}

// Segunda via — vai pra cozinha quando o pedido é aceito automaticamente.
// Só o essencial pra produzir: número do pedido bem grande, itens com
// variação/observação, e a observação geral do cliente. Sem preço, sem
// endereço, sem forma de pagamento — isso fica só na via do caixa.
export type KitchenTicketData = {
  pedidoShortId: string
  createdAt: string
  deliveryType: 'entrega' | 'retirada'
  items: ReceiptItem[]
  notes?: string | null
}

export function buildKitchenTicket(d: KitchenTicketData): string {
  const lines: string[] = []
  lines.push(CMD.init, CMD.alignCenter)
  lines.push(CMD.boldOn, CMD.doubleOn, `PEDIDO #${d.pedidoShortId}`, CMD.doubleOff, CMD.boldOff, '\n')
  lines.push(new Date(d.createdAt).toLocaleString('pt-BR'), '\n')
  lines.push(CMD.boldOn + (d.deliveryType === 'retirada' ? 'RETIRADA NO LOCAL' : 'ENTREGA') + CMD.boldOff, '\n')
  lines.push('-'.repeat(WIDTH), '\n')
  lines.push(CMD.alignLeft)

  for (const it of d.items) {
    lines.push(CMD.boldOn)
    wrap(`${it.qty}x ${it.name}`).forEach(l => lines.push(l, '\n'))
    lines.push(CMD.boldOff)
    if (it.options?.length) lines.push('  ' + it.options.map(o => o.name).join(', '), '\n')
  }
  if (d.notes) { lines.push('-'.repeat(WIDTH), '\n', CMD.boldOn, 'Obs: ', CMD.boldOff, '\n'); wrap(d.notes).forEach(l => lines.push(l, '\n')) }
  lines.push(CMD.feed(6), CMD.cut)
  return lines.join('')
}
