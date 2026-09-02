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
// v2 — a v1 tinha "Basic Constraints: CA:TRUE" (padrão do openssl pra
// certificado autoassinado) e o QZ Tray recusava com "Invalid Certificate"
// mesmo mostrando a identidade certinha no popup, porque um certificado
// de identidade de cliente precisa ser "end-entity" (CA:FALSE), não uma
// autoridade certificadora. Mesma chave privada de antes — só o
// certificado público mudou, não precisa mexer na variável de ambiente.
const QZ_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIID2TCCAsGgAwIBAgIUPLnHBJrGJr4ztnJjKgqyW80BkbcwDQYJKoZIhvcNAQEN
BQAwajELMAkGA1UEBhMCQlIxCzAJBgNVBAgMAlJKMRQwEgYDVQQHDAtTYW8gR29u
Y2FsbzEYMBYGA1UECgwPVHJpbmRhZGUgT25saW5lMR4wHAYDVQQDDBV0cmluZGFk
ZW9ubGluZS5jb20uYnIwIBcNMjYwOTAyMDI1MTQ3WhgPMjA1NjA4MjUwMjUxNDda
MGoxCzAJBgNVBAYTAkJSMQswCQYDVQQIDAJSSjEUMBIGA1UEBwwLU2FvIEdvbmNh
bG8xGDAWBgNVBAoMD1RyaW5kYWRlIE9ubGluZTEeMBwGA1UEAwwVdHJpbmRhZGVv
bmxpbmUuY29tLmJyMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA3qhi
RP5bxwp2B7c8rkeUzDU+9jCnXgPxb3e32EWihOIhymP62vEbSAM+ZsbZO+BKgeUq
v1HDC3WeLdDhx0uRUP6YTN942uqrNgXoVGivVMs83tE9r5mlu9HBernUzHjiA+Rl
xALQytW3u5CHajwfBskrZ4kcWzXGr7cMipLWEserXW9zcyGd+E17an2VLWhVNA52
lBAI5zWu3iBEiJ+u8HMZBxWVaDIYHype8+jS63WpE+aEjRK7TFdBXVZHh/w7OMOq
I02VC2+V4zHu5UnhYbm5CFmhMUmLnXkeZ0hnahjF5G3h+NVBWtnW6bUNLeDRkTsf
4yT1T4PyCV0xa93RYwIDAQABo3UwczAdBgNVHQ4EFgQUP1Ag6oJJ8u+QhCQo5RO7
u7l1l00wHwYDVR0jBBgwFoAUP1Ag6oJJ8u+QhCQo5RO7u7l1l00wDAYDVR0TAQH/
BAIwADAOBgNVHQ8BAf8EBAMCBaAwEwYDVR0lBAwwCgYIKwYBBQUHAwIwDQYJKoZI
hvcNAQENBQADggEBAC/gj8W+C1/NzYv87yZy4Yi8sGURLY6/D6GqjEol6ecEA9x8
4oKGVNutKFxFXyAA4oYpC2p3n2vIj1sZT1qeN77/ftQhrfodYezKfXme8TFTbNFc
o/eSffsEraP+BHlWHeaCv3sG9Hi8oGrBmICwH8iAQq6jo6R8KmACyDR3sS+/Lwfo
YsUFxXgfPhP/wGXSG57/RVnhhya7DIToaWFpJRHadwj7QZ4sYRPQpCCwFkmEU7cG
DFzXWmAJvIMY86KvazH5hp18fThCOhLzq0AR75nqimPfZjdattM0KQLmyUoJnrdo
WvbUYG+HlNIOAAU8j99YaoECfS715V+AtXNEoJs=
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
  deliveryType: 'entrega' | 'retirada'
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
  lines.push('\n', CMD.alignCenter, 'Impresso em ' + new Date().toLocaleString('pt-BR'), '\n')
  lines.push(CMD.feed(6), CMD.cut)
  return lines.join('')
}
