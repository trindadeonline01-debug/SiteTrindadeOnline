// Regras de preço/disponibilidade do cardápio digital — extraído de
// /empresa/[slug]/cardapio pra ser reaproveitado também na página de
// produto (/empresa/[slug]/item/[id]), sem duplicar a lógica de promoção
// e de grupos de opcionais em dois lugares que podem divergir com o tempo.

export type Opcao = { id: string; name: string; price: number; max_qty: number | null; photo_url?: string | null }
export type Grupo = { id: string; name: string; required: boolean; min_select: number; max_select: number; pricing_rule: 'soma' | 'maior_valor'; options: Opcao[] }
export type Produto = {
  id: string; name: string; description: string | null; photo_url: string | null
  category_id: string | null; sale_price: number
  promo_type: 'percent' | 'fixed' | null; promo_value: number | null
  promo_starts_at: string | null; promo_ends_at: string | null
  available_days: number[] | null
  total_pedidos: number
  esgotado: boolean; track_stock: boolean; stock_qty: number | null
  groups: Grupo[]
}

export function fmt(n: number) { return 'R$ ' + n.toFixed(2).replace('.', ',') }

export function promoPrice(p: Produto): number | null {
  if (!p.promo_type || !p.promo_value) return null
  const now = Date.now()
  if (p.promo_starts_at && now < new Date(p.promo_starts_at).getTime()) return null
  if (p.promo_ends_at && now > new Date(p.promo_ends_at).getTime()) return null
  return p.promo_type === 'percent' ? p.sale_price * (1 - p.promo_value / 100) : Math.max(0, p.sale_price - p.promo_value)
}

export function availableToday(p: Produto) {
  if (!p.available_days || p.available_days.length === 0) return true
  return p.available_days.includes(new Date().getDay())
}

export function isSoldOut(p: Produto) { return p.esgotado || (p.track_stock && (p.stock_qty ?? 0) <= 0) }

export function groupContribution(g: Grupo, selectedIdx: number[]): number {
  const prices = selectedIdx.map(oi => g.options[oi].price)
  if (prices.length === 0) return 0
  return g.pricing_rule === 'maior_valor' ? Math.max(...prices) : prices.reduce((a, b) => a + b, 0)
}

export function cartStorageKey(slug: string) { return `cardapio_cart_${slug}` }

// Entidade Interesse (ESPECIFICACAO.md §8) — carrinho com valor que o
// cliente monta e ENVIA, sem virar Pedido sozinho (só o lojista fechando
// a venda na conversa é que confirma). O servidor nunca sabe o telefone
// de quem mandou — a mensagem carrega um código curto, que quem tem inbox
// conectado (CRM WhatsApp) lê sozinho e amarra o interesse ao contato.
export type InteresseItem = { produto_id: string; nome: string; qtd: number; preco_unitario: number; observacoes?: string }

function gerarCodigoInteresse(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sem O/0/I/1 — confusos de digitar/ler
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// Cria o registro no banco (anônimo — RLS permite insert público) e monta
// o link wa.me já com a mensagem formatada: itens · total · entrega ou
// retirada · código, legível em 3 segundos (ESPECIFICACAO.md §9.5).
export async function criarInteresseEAbrirWhatsapp(opts: {
  supabase: any; companyId: string; companyPhone: string
  itens: InteresseItem[]; valorTotal: number
  deliveryType: 'entrega' | 'retirada'; origem?: 'whatsapp_link' | 'qr_balcao' | 'status' | 'portal'
  cupomLabel?: string
}) {
  const codigo = gerarCodigoInteresse()
  await opts.supabase.from('interesses').insert({
    company_id: opts.companyId, codigo, itens: opts.itens, valor_total: opts.valorTotal,
    origem: opts.origem || 'whatsapp_link',
  })
  const linhas = [
    'Olá! Quero fazer este pedido:',
    ...opts.itens.map(i => `${i.qtd}x ${i.nome}`),
    ...(opts.cupomLabel ? [`Cupom aplicado: ${opts.cupomLabel}`] : []),
    `Total: ${fmt(opts.valorTotal)}`,
    opts.deliveryType === 'entrega' ? '🚴 Entrega' : '🏪 Retirada',
    `Código: ${codigo}`,
  ]
  const url = `https://wa.me/55${opts.companyPhone.replace(/\D/g, '')}?text=${encodeURIComponent(linhas.join('\n'))}`
  window.open(url, '_blank')
}
