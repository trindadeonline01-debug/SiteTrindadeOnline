import { isOpenNow, HourRow } from '@/lib/businessHours'
import { promoPrice, isSoldOut, availableToday, Produto } from '@/lib/lojaPricing'
import { shuffle } from '@/lib/shuffle'
import type { PecaGroup, PecaVitrineItem } from '@/components/home/HomePecaAgora'

interface PecaCompanyRow {
  id: string; name: string; slug: string
  flexible_hours: boolean; store_paused?: boolean; store_forced_open?: boolean
  hours?: HourRow[]
}

interface PecaProdutoRow {
  id: string; name: string; photo_url: string | null; sale_price: number
  groups?: { id: string }[]
  promo_type: 'percent' | 'fixed' | null; promo_value: number | null
  promo_starts_at: string | null; promo_ends_at: string | null
  available_days: number[] | null; esgotado: boolean; track_stock: boolean; stock_qty: number | null
  tipo_vitrine: string | null
  company_id: string
}

// Vitrine cruzando o catálogo de todas as empresas com cardápio digital
// ativo (ESPECIFICACAO.md §7), recortada pelo TIPO do produto (Hambúrguer,
// Bebida, Doce...), não pela categoria/subcategoria da empresa — uma
// hamburgueria vende Coca-Cola e batata frita também, e agrupar pela
// subcategoria da loja jogava esses itens dentro da aba "Hambúrguer"
// junto com os hambúrgueres de verdade. Extraído de src/app/page.tsx
// (set/2026) pra ser reaproveitado tanto no banner da home quanto na
// página própria /peca-agora — mesma lógica, uma fonte só.
export async function buildPecaAgoraGroups(supabaseServer: any): Promise<PecaGroup[]> {
  const [{ data: pecaCompaniesData }, { data: pecaTiposData }] = await Promise.all([
    supabaseServer.from('companies')
      .select('id, name, slug, flexible_hours, store_paused, store_forced_open, hours:company_hours(day_of_week,open_time,close_time,closed)')
      .eq('status', 'active').eq('loja_digital_enabled', true),
    // Lista de tipos e ordem definidas pelo admin (aba "Peça Agora"), não
    // mais fixa no código — ver src/components/admin/PecaAgoraTab.tsx
    supabaseServer.from('vitrine_tipos').select('value,label,emoji').eq('active', true).order('display_order'),
  ])

  const pecaCompanies = (pecaCompaniesData || []) as PecaCompanyRow[]
  const pecaTipos = (pecaTiposData || []) as { value: string; label: string; emoji: string }[]

  if (pecaCompanies.length === 0) return []

  const { data: pecaProdutosData } = await supabaseServer
    .from('loja_produtos')
    .select('id, name, photo_url, sale_price, promo_type, promo_value, promo_starts_at, promo_ends_at, available_days, esgotado, track_stock, stock_qty, tipo_vitrine, company_id, groups:loja_opcoes_grupo(id)')
    .in('company_id', pecaCompanies.map((c) => c.id))
    .eq('active', true)
    .not('photo_url', 'is', null)
    .order('display_order')

  const companyMap = new Map(pecaCompanies.map((c) => [c.id, c]))
  const byCompany = new Map<string, PecaProdutoRow[]>()
  ;((pecaProdutosData || []) as PecaProdutoRow[]).forEach((p) => {
    const arr = byCompany.get(p.company_id) || []
    arr.push(p)
    byCompany.set(p.company_id, arr)
  })

  const allItems: PecaVitrineItem[] = []
  const bucketMap = new Map<string, PecaVitrineItem[]>()

  byCompany.forEach((rows, companyId) => {
    const company = companyMap.get(companyId)
    if (!company) return
    const open = isOpenNow(company.hours, company.flexible_hours, company.store_paused, company.store_forced_open)
    // Peça Agora é "peça AGORA" — loja fechada não entra, mesmo que esteja
    // ativa/em dia (pedido do Ricardo, set/2026: antes entrava junto, só
    // sem o selo "Aberto", o que dava a entender que dava pra pedir mesmo
    // fechada).
    if (!open) return
    const disponiveis = rows.filter((p) => {
      const produto = { ...p, description: null, category_id: null, total_pedidos: 0, groups: [] } as unknown as Produto
      return !isSoldOut(produto) && availableToday(produto)
    })
    const toItem = (p: PecaProdutoRow): PecaVitrineItem => {
      const produto = { ...p, description: null, category_id: null, total_pedidos: 0, groups: [] } as unknown as Produto
      return {
        id: p.id, name: p.name, photo_url: p.photo_url!, price: promoPrice(produto) ?? p.sale_price,
        companyName: company.name, companySlug: company.slug, open,
        hasOptions: (p.groups?.length || 0) > 0,
      }
    }

    // "Todas" — até 8 produtos por empresa, sorteados do catálogo inteiro
    // (sem bebida, ver comentário acima). Satolo's sozinho tem 77 produtos
    // ativos; sem esse teto ela tomaria conta da seção inteira em vez de
    // dividir espaço com o resto do bairro.
    shuffle(disponiveis.filter((p) => p.tipo_vitrine !== 'Bebida')).slice(0, 8)
      .forEach((p) => allItems.push(toItem(p)))

    // Por tipo — até 8 produtos DAQUELE TIPO por empresa, sorteados à
    // parte do corte de "Todas" acima.
    const porTipo = new Map<string, PecaProdutoRow[]>()
    disponiveis.forEach((p) => {
      if (!p.tipo_vitrine) return
      const arr = porTipo.get(p.tipo_vitrine) || []
      arr.push(p)
      porTipo.set(p.tipo_vitrine, arr)
    })
    porTipo.forEach((prods, tipo) => {
      shuffle(prods).slice(0, 8).forEach((p) => {
        const bucket = bucketMap.get(tipo) || []
        bucket.push(toItem(p))
        bucketMap.set(tipo, bucket)
      })
    })
  })

  if (allItems.length === 0) return []

  // Intercala por empresa em vez de só ordenar aberta-primeiro — sem isso,
  // uma loja com catálogo grande enchia os primeiros 8 sozinha, e as
  // outras só apareciam depois de rolar/clicar bastante. Dentro de cada
  // loja continua aberta-primeiro; entre lojas, revezamento 1 a 1.
  const interleaveByCompany = (items: PecaVitrineItem[]) => {
    const bySlug = new Map<string, PecaVitrineItem[]>()
    items.forEach((i) => {
      const arr = bySlug.get(i.companySlug) || []
      arr.push(i)
      bySlug.set(i.companySlug, arr)
    })
    const groups = [...bySlug.values()].map((arr) => [...arr].sort((a, b) => (b.open ? 1 : 0) - (a.open ? 1 : 0)))
    const result: PecaVitrineItem[] = []
    for (let i = 0; result.length < items.length; i++) {
      for (const g of groups) if (i < g.length) result.push(g[i])
    }
    return result
  }

  return [
    { key: 'todas', label: 'Todas', emoji: '🍽️', items: interleaveByCompany(allItems) },
    // Ordem definida pelo admin (vitrine_tipos.display_order), não por
    // contagem — fica estável entre carregamentos, só pula tipo sem item.
    ...pecaTipos
      .filter((t) => bucketMap.has(t.value))
      .map((t) => ({ key: t.value, label: t.label, emoji: t.emoji, items: interleaveByCompany(bucketMap.get(t.value)!) })),
  ]
}
