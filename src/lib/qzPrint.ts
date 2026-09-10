// Ponte com o QZ Tray (app instalado no computador da loja) pra imprimir
// pedidos numa impressora térmica de 80mm via USB. QZ Tray roda em segundo
// plano escutando localhost — o navegador não consegue falar com uma
// impressora USB sozinho (bloqueio de segurança de todo navegador), então
// tudo aqui depende do app estar instalado e aberto.
//
// Modo assinado: o QZ Tray confirma a identidade do site com um
// certificado + assinatura (a chave privada fica só no servidor, em
// /api/qz/sign) em vez do modo "anônimo". Isso é o que faz o "Site
// Manager" do QZ Tray lembrar da permissão de vez — no modo anônimo ele
// volta a perguntar quase toda hora, mesmo marcando "lembrar".
// v4 — a Root CA v1 se perdeu (gerada numa sessão anterior, nunca foi
// salva em lugar nenhum de propósito — chave de CA é sensível demais pra
// commitar). Sem ela, o certificado do site ficava órfão e o "Remember
// this decision" nunca tinha como funcionar mesmo (achado pelo Ricardo,
// set/2026, tentando instalar numa loja nova). Gerada uma "Trindade
// Online Root CA v2" nova (chave privada da CA, de novo, só existiu
// aqui na hora de assinar — nunca commitada) + certificado do site
// reemitido por ela, com uma chave privada NOVA (a antiga também se
// perdeu junto) — por isso a QZ_PRIVATE_KEY da Vercel também precisou
// ser trocada dessa vez (raro; normalmente só o certificado público muda).
// DESSA VEZ o certificado da Root CA (público, sem problema nenhum expor)
// fica hospedado de verdade em /api/qz/certificado/raiz — ver
// src/lib/qzRootCa.ts — pra nunca mais se perder.
export const QZ_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIE3jCCAsagAwIBAgIUJrlazyzgTcsdfc0j361nhei7iDEwDQYJKoZIhvcNAQEN
BQAwbzELMAkGA1UEBhMCQlIxCzAJBgNVBAgMAlJKMRQwEgYDVQQHDAtTYW8gR29u
Y2FsbzEYMBYGA1UECgwPVHJpbmRhZGUgT25saW5lMSMwIQYDVQQDDBpUcmluZGFk
ZSBPbmxpbmUgUm9vdCBDQSB2MjAgFw0yNjA5MTAyMjA4MzFaGA8yMDU2MDkwMjIy
MDgzMVowajELMAkGA1UEBhMCQlIxCzAJBgNVBAgMAlJKMRQwEgYDVQQHDAtTYW8g
R29uY2FsbzEYMBYGA1UECgwPVHJpbmRhZGUgT25saW5lMR4wHAYDVQQDDBV0cmlu
ZGFkZW9ubGluZS5jb20uYnIwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIB
AQCdqnsimmdrLRqK5TsroK+nYubAWlGO1W7tga7xZ0bQS/gRPvGh46kpBlQMcE9E
hvQQ3110zvSOZsE5SPuxyZIA++f+zHJSAtL3V5z4DVXndUze6hM1tZ5x6A6XFfah
puoYmRkuwMzlk/D5Lv7kj6WYjE9w9rKQaz2MzJOwvlGb2IBEU/eaQsr20aBY4GL+
36pjrkCfu2AWm65sjlslikmuJbsnacBKzlLemz1dp4D6/k2QyluYxGpC45j25kXl
spiNXthgmVY8Zjpl+J6v5m0QiA/ag/pvaiEE7DYu5I7cAiXhwaKUScybbmjM2yIO
EEIPLVqnN2jQ0eKb8NWWk+KjAgMBAAGjdTBzMAwGA1UdEwEB/wQCMAAwDgYDVR0P
AQH/BAQDAgWgMBMGA1UdJQQMMAoGCCsGAQUFBwMCMB0GA1UdDgQWBBTX21aLdzQK
Z+u2DU/KJqq6zFtrPDAfBgNVHSMEGDAWgBTByRFlFeaRiPCzjywXkobUL9O7jDAN
BgkqhkiG9w0BAQ0FAAOCAgEAYSMynbwblyr5fVNUCjwZFN3tlqqQM/dao2102CTA
GnACX5T0IwgXuAaAL+x7cG/AtsPkBFp8pnfWU1aAVKr5Jf5MFI8ZvwRpfy0vHP24
bJllStoU8W8+0S3qCHv71OxzbIAZ9VxGCxNWDHmEJkoYetfKJvWrGOqGRdqHo9nZ
sci+z4l+5MhRjasG8Xxplis1UqhHJjTZ92oIfkendGkz9uXkO6HNwHjYUAeYly8l
e3EH5rVJxzJIbyHyLv4yFZMRu8UasdI1VP41kQntpj8EKCIKVgTKDXoK7LqeACqr
6oSxT6zQOxDFH3sCofcXBIXIpXW7sTbv2+HCJgAgdxowh2lrkvYKZodyqfPIDj6R
9YDqIHZDIj3k/QFaW05qJBKzs9Mk16qcTrscQIGX1jHZdc54r3axcnJKabroWsKc
hHxjDwdCrfnmtB66jLAGt5aLkTwRdiZFQirYf0947cqyi8Nj4Aag5wrfVzrbJauk
bex1rCcHEZu/C5y+gZXG8ip2MYJsRr0jywr9M49ZjBF2VxxeeoJZuWuhkz6y4tTS
xtDNgbVPnxQ3He3lifeVx29VQ+yhKyvGyBlYsCmg8RgRUzthhaq/WM57kZr7pcfI
Cd4XyQDH2q/xbGKkaYsKPSOC/KzOQ3Uqpr2k3XSuloW4lEALd2fFYAIXCtZp8oxm
/y0=
-----END CERTIFICATE-----`

let qzModule: Promise<any> | null = null
let qzSecurityConfigured = false
async function getQz(): Promise<any> {
  if (!qzModule) {
    qzModule = import('qz-tray').then((m: any) => m.default || m)
  }
  const qz = await qzModule
  if (!qzSecurityConfigured) {
    qzSecurityConfigured = true
    qz.security.setCertificatePromise((resolve: (v: string) => void) => resolve(QZ_CERTIFICATE))
    qz.security.setSignatureAlgorithm('SHA512')
    qz.security.setSignaturePromise((toSign: string) => (resolve: (v: string) => void, reject: (e: any) => void) => {
      fetch('/api/qz/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toSign }),
      })
        .then(r => r.json())
        .then(data => (data?.signature ? resolve(data.signature) : reject(new Error(data?.error || 'Falha ao assinar'))))
        .catch(reject)
    })
  }
  return qz
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

// Formato espelhado no recibo do Cardápio Web (referência trazida pelo
// Ricardo do teste real na Satolo's) — seções tituladas em vez de texto
// corrido, subtotal/taxa separados do total, e um rodapé deixando claro
// que não é nota fiscal (mesmo aviso que sistemas do tipo já usam).
export function buildReceipt(d: ReceiptData): string {
  const lines: string[] = []
  lines.push(CMD.init, CMD.alignCenter, CMD.boldOn, CMD.doubleOn)
  lines.push(d.companyName.toUpperCase(), '\n')
  lines.push(CMD.doubleOff, CMD.boldOff)
  lines.push(`Pedido Nº ${d.pedidoShortId}`, '\n')
  lines.push(new Date(d.createdAt).toLocaleString('pt-BR'), '\n')
  lines.push('-'.repeat(WIDTH), '\n')
  lines.push(CMD.alignLeft)

  lines.push('Cliente: ' + d.customerName, '\n')
  if (d.customerPhone) lines.push('Telefone: ' + d.customerPhone, '\n')

  if (d.deliveryType === 'entrega') {
    lines.push('\n', CMD.boldOn, 'ENDEREÇO PARA ENTREGA:', CMD.boldOff, '\n')
    if (d.address) wrap(d.address).forEach(l => lines.push(l, '\n'))
  } else if (d.deliveryType === 'balcao') {
    lines.push('\n', CMD.boldOn, 'PEDIDO DE BALCÃO', CMD.boldOff, '\n')
  } else {
    lines.push('\n', CMD.boldOn, 'RETIRADA NO LOCAL', CMD.boldOff, '\n')
  }
  lines.push('-'.repeat(WIDTH), '\n')

  lines.push(CMD.boldOn, 'ITENS DO PEDIDO', CMD.boldOff, '\n')
  lines.push('-'.repeat(WIDTH), '\n')
  for (const it of d.items) {
    wrap(`${it.qty}x ${it.name}`).forEach((l, i) => {
      if (i === 0) lines.push(padRow(l, money(it.unitPrice * it.qty)), '\n')
      else lines.push(l, '\n')
    })
    if (it.options?.length) lines.push('  ' + it.options.map(o => o.name).join(', '), '\n')
  }
  lines.push('-'.repeat(WIDTH), '\n')

  lines.push(padRow('Subtotal', money(d.subtotal)), '\n')
  if (d.deliveryType === 'entrega') lines.push(padRow('Taxa de entrega', money(d.deliveryFee || 0)), '\n')
  lines.push('='.repeat(WIDTH), '\n')
  lines.push(CMD.boldOn, CMD.doubleOn, padRow('Total', money(d.total)), CMD.doubleOff, CMD.boldOff, '\n')
  lines.push('='.repeat(WIDTH), '\n')

  if (d.paymentMethod) {
    lines.push('\n', CMD.boldOn, 'FORMAS DE PAGAMENTO', CMD.boldOff, '\n')
    lines.push(PAY_LABEL[d.paymentMethod] || d.paymentMethod, '\n')
  }
  if (d.notes) { lines.push('-'.repeat(WIDTH), '\n', CMD.boldOn, 'Obs: ', CMD.boldOff, '\n'); wrap(d.notes).forEach(l => lines.push(l, '\n')) }

  lines.push('\n', CMD.alignCenter)
  lines.push('Fornecido por Trindade Online', '\n')
  lines.push('Impresso em ' + new Date().toLocaleString('pt-BR'), '\n')
  lines.push('NÃO É DOCUMENTO FISCAL', '\n')

  // A faca de corte da impressora fica alguns milímetros abaixo da cabeça
  // de impressão — 3 linhas de avanço não era o bastante e cortava em cima
  // da última linha. 6 dá folga de sobra.
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
  deliveryType: 'entrega' | 'retirada' | 'balcao'
  items: ReceiptItem[]
  notes?: string | null
}

const KITCHEN_DELIVERY_LABEL: Record<KitchenTicketData['deliveryType'], string> = {
  entrega: 'ENTREGA', retirada: 'RETIRADA NO LOCAL', balcao: 'BALCÃO',
}

export function buildKitchenTicket(d: KitchenTicketData): string {
  const lines: string[] = []
  lines.push(CMD.init, CMD.alignCenter)
  lines.push(CMD.boldOn, CMD.doubleOn, `PEDIDO #${d.pedidoShortId}`, CMD.doubleOff, CMD.boldOff, '\n')
  lines.push(new Date(d.createdAt).toLocaleString('pt-BR'), '\n')
  lines.push(CMD.boldOn + KITCHEN_DELIVERY_LABEL[d.deliveryType] + CMD.boldOff, '\n')
  lines.push('-'.repeat(WIDTH), '\n')
  lines.push(CMD.alignLeft)

  for (const it of d.items) {
    lines.push(CMD.boldOn)
    wrap(`${it.qty}x ${it.name}`).forEach(l => lines.push(l, '\n'))
    lines.push(CMD.boldOff)
    if (it.options?.length) lines.push('  ' + it.options.map(o => o.name).join(', '), '\n')
  }
  if (d.notes) { lines.push('-'.repeat(WIDTH), '\n', CMD.boldOn, 'Obs: ', CMD.boldOff, '\n'); wrap(d.notes).forEach(l => lines.push(l, '\n')) }
  lines.push('\n', CMD.alignCenter, 'Impresso em ' + new Date().toLocaleString('pt-BR'), '\n')
  lines.push(CMD.feed(6), CMD.cut)
  return lines.join('')
}
