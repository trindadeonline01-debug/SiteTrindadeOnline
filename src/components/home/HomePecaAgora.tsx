'use client'
import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { fmt, cartStorageKey, checkCartConflict, setActiveCart } from '@/lib/lojaPricing'

export type PecaVitrineItem = {
  id: string; name: string; photo_url: string; price: number
  companyName: string; companySlug: string; open: boolean; hasOptions: boolean
}
export type PecaGroup = { key: string; label: string; emoji: string; photoUrl?: string; items: PecaVitrineItem[] }

const PRICE_FILTERS = [
  { label: 'Qualquer preço', max: 0 },
  { label: 'Até R$ 10', max: 10 },
  { label: 'Até R$ 20', max: 20 },
  { label: 'Até R$ 30', max: 30 },
  { label: 'Até R$ 40', max: 40 },
]

const PAGE_SIZE = 8

// Formato salvo em cardapio_cart_<slug> — mesmo shim que
// ProdutoDetailClient/CardapioClient usam pra passar item adicionado de
// uma tela pra outra (CardapioClient lê essa chave uma vez, no mount, e
// já apaga — não é um carrinho persistente de verdade, é um handoff).
// Como aqui o cliente pode adicionar mais de um produto sem sair da home,
// a leitura sempre funde com o que já estiver pendente, em vez de
// sobrescrever.
type CartPayload = {
  cart: { key: string; produtoId: string; name: string; modifiers: { name: string; price: number }[]; unitPrice: number; qty: number }[]
  deliveryType: string; cep: string; numero: string; cepData: null; address: string
  agendarRetirada: boolean; scheduleDate: string; scheduleTime: string; obs: string; payMethod: string
}
function emptyCart(): CartPayload {
  return { cart: [], deliveryType: 'entrega', cep: '', numero: '', cepData: null, address: '', agendarRetirada: false, scheduleDate: '', scheduleTime: '', obs: '', payMethod: 'pix' }
}
function readCart(slug: string): CartPayload {
  try {
    const saved = localStorage.getItem(cartStorageKey(slug))
    if (saved) return JSON.parse(saved)
  } catch {}
  return emptyCart()
}

// Vitrine cruzando o catálogo de todas as empresas com cardápio digital
// ativo — ESPECIFICACAO.md §7 (índice de produtos), mas aplicado aqui numa
// versão simples: sem busca por palavra, só recorte por subcategoria e por
// faixa de preço, direto na home. Grupos e itens já vêm prontos do servidor
// (page.tsx), incluindo se a empresa está aberta agora.
//
// Compra rápida: produto sem opcional ganha botão de "+" que já adiciona
// ao carrinho daquela loja sem sair da home (mockup aprovado em conversa,
// set/2026). Produto com opcional (combo, sabor, tamanho) continua indo
// pra página do produto — lá já existe a escolha obrigatória, não vale a
// pena duplicar essa lógica aqui.
export default function HomePecaAgora({ groups, search = '', initialTab }: { groups: PecaGroup[]; search?: string; initialTab?: string }) {
  // Vem do card de tipo clicado na home (ex: "Mercado") via ?tab= na URL —
  // pedido do Ricardo, out/2026: clicar num card tinha que abrir a página
  // já filtrada naquele tipo, não sempre em "Todas". Só usado na primeira
  // renderização (initializer); se a chave não existir entre os grupos,
  // o fallback de `active` logo abaixo (groups[0]) já cobre.
  const [activeKey, setActiveKey] = useState(initialTab || 'todas')
  const [maxPrice, setMaxPrice] = useState(0)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [qtyById, setQtyById] = useState<Record<string, number>>({})
  // Mockup aprovado, out/2026: sem persistência nenhuma — "o cardápio abre
  // sempre exibindo primeiro os produtos", nunca lembra a última escolha
  // entre visitas (nada de localStorage aqui, só state em memória).
  const [viewMode, setViewMode] = useState<'produtos' | 'lojas'>('produtos')
  const sentinelRef = useRef<HTMLDivElement>(null)
  // Carrossel de tipos (Japonês, Hambúrguer, Doce...) rola na horizontal.
  // No mobile, toque/arraste já é suficiente — os cards com foto real são
  // bem maiores que os quadradinhos de antes, então dá pra perceber
  // visualmente que tem mais pra rolar (setas removidas aí, pedido do
  // Ricardo, out/2026). No desktop ele volta a usar o mouse, sem gesto de
  // arrastar natural, então as setas continuam (Ricardo, out/2026: "só no
  // mobile" a remoção valia).
  const tabsScrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  // Se já tem item pendente daquela loja (adicionado antes, sem ter
  // visitado o cardápio pra "consumir" o handoff), reflete a quantidade
  // real ao carregar a home, em vez de mostrar "+" como se estivesse vazio.
  useEffect(() => {
    const slugs = new Set<string>()
    groups.forEach(g => g.items.forEach(i => slugs.add(i.companySlug)))
    const map: Record<string, number> = {}
    slugs.forEach(slug => readCart(slug).cart.forEach(c => { map[c.key] = c.qty }))
    setQtyById(map)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const active = groups.find(g => g.key === activeKey) || groups[0]
  // Busca (pedido do Ricardo, set/2026: "ali é pra buscar produto, não
  // aquela busca completa de empresa") — digitou algo, ignora aba e faixa
  // de preço e procura por nome em TODO o catálogo ("Todas", que já reúne
  // tudo exceto bebida), não só na aba selecionada.
  const query = search.trim().toLowerCase()
  const searching = query.length > 0
  const todasGroup = groups.find(g => g.key === 'todas')
  const items = searching
    ? (todasGroup?.items || []).filter(i => i.name.toLowerCase().includes(query))
    : active ? (maxPrice > 0 ? active.items.filter(i => i.price <= maxPrice) : active.items) : []

  // Vista "Lojas" (mockup aprovado, out/2026) — os MESMOS itens já
  // filtrados por aba/preço, só reagrupados por empresa em vez de listados
  // soltos. Durante busca por nome ignora o modo e segue sempre em lista
  // plana (grupo "Todas", já é o que a busca precisa) — agrupar por loja
  // num resultado de busca não ajuda em nada.
  const groupingByStore = viewMode === 'lojas' && !searching
  const storeGroups = groupingByStore
    ? Object.values(items.reduce((acc, it) => {
        if (!acc[it.companySlug]) acc[it.companySlug] = { companyName: it.companyName, companySlug: it.companySlug, open: it.open, items: [] as PecaVitrineItem[] }
        acc[it.companySlug].items.push(it)
        return acc
      }, {} as Record<string, { companyName: string; companySlug: string; open: boolean; items: PecaVitrineItem[] }>))
    : null

  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [search])

  useEffect(() => {
    const el = tabsScrollRef.current
    if (!el) return
    const update = () => {
      setCanScrollLeft(el.scrollLeft > 4)
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => { el.removeEventListener('scroll', update); window.removeEventListener('resize', update) }
  }, [groups.length, searching])

  function scrollTabs(dir: 1 | -1) {
    tabsScrollRef.current?.scrollBy({ left: dir * 200, behavior: 'smooth' })
  }

  // Rolou até perto do fim da lista carregada → revela mais PAGE_SIZE, sem
  // precisar clicar em "Ver mais" (pedido do Ricardo, set/2026: com o teto
  // de 8 produtos por empresa removido — ver pecaAgora.server.ts — a lista
  // completa pode passar de 200 itens, então carregar aos poucos conforme
  // o scroll evita jogar isso tudo na tela de uma vez). Vista "Lojas" não
  // pagina — bem menos linhas (uma por empresa) que a de produtos, não
  // precisa.
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || groupingByStore || visibleCount >= items.length) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) setVisibleCount(v => Math.min(v + PAGE_SIZE, items.length))
    }, { rootMargin: '600px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [visibleCount, items.length, activeKey, maxPrice, query, groupingByStore])

  if (groups.length === 0) return null

  function changeTab(key: string) { setActiveKey(key); setVisibleCount(PAGE_SIZE) }
  function changePrice(max: number) { setMaxPrice(max); setVisibleCount(PAGE_SIZE) }

  // Cliente só compra de uma loja por vez — se o carrinho ativo é de outra
  // empresa, confirma antes de esvaziar aquele carrinho e trocar. Sem essa
  // checagem, dava pra ir clicando "+" em produtos de lojas diferentes e
  // misturar tudo (que nenhuma das duas lojas ia conseguir separar depois).
  function ensureStore(slug: string, companyName: string): boolean {
    const conflict = checkCartConflict(slug)
    if (!conflict) return true
    const ok = window.confirm(`Seu carrinho tem ${conflict.count} ${conflict.count === 1 ? 'item' : 'itens'} de ${conflict.companyName}. Trocar pro carrinho de ${companyName}? O carrinho anterior será esvaziado.`)
    if (!ok) return false
    localStorage.removeItem(cartStorageKey(conflict.slug))
    setQtyById(m => {
      const copy = { ...m }
      groups.forEach(g => g.items.forEach(i => { if (i.companySlug === conflict.slug) delete copy[i.id] }))
      return copy
    })
    return true
  }

  function syncActiveCart(slug: string, companyName: string, data: CartPayload) {
    const count = data.cart.reduce((s, c) => s + c.qty, 0)
    const total = data.cart.reduce((s, c) => s + c.unitPrice * c.qty, 0)
    setActiveCart(slug, companyName, count, total)
  }

  function quickAdd(p: PecaVitrineItem) {
    if (!ensureStore(p.companySlug, p.companyName)) return
    const data = readCart(p.companySlug)
    const existing = data.cart.find(c => c.key === p.id)
    if (existing) existing.qty += 1
    else data.cart.push({ key: p.id, produtoId: p.id, name: p.name, modifiers: [], unitPrice: p.price, qty: 1 })
    localStorage.setItem(cartStorageKey(p.companySlug), JSON.stringify(data))
    syncActiveCart(p.companySlug, p.companyName, data)
    setQtyById(m => ({ ...m, [p.id]: (m[p.id] || 0) + 1 }))
  }

  function changeQty(p: PecaVitrineItem, delta: number) {
    const data = readCart(p.companySlug)
    const item = data.cart.find(c => c.key === p.id)
    if (item) {
      item.qty += delta
      if (item.qty <= 0) data.cart = data.cart.filter(c => c.key !== p.id)
    }
    localStorage.setItem(cartStorageKey(p.companySlug), JSON.stringify(data))
    syncActiveCart(p.companySlug, p.companyName, data)
    setQtyById(m => {
      const next = Math.max(0, (m[p.id] || 0) + delta)
      const copy = { ...m }
      if (next === 0) delete copy[p.id]; else copy[p.id] = next
      return copy
    })
  }

  const visibleItems = items.slice(0, visibleCount)

  return (
    <div className="recent-section pa-wrap">
      <style>{`
        /* Classes compartilhadas com a home (page.tsx) — duplicadas aqui de
           propósito pra esse componente funcionar sozinho em qualquer
           página (home embutida E /peca-agora dedicada), sem depender do
           <style> global de quem o usa. */
        .recent-section { margin-top: 48px; }
        .recent-section-title { font-family: 'Anton', sans-serif; font-size: 21px; color: var(--ink); letter-spacing: .5px; text-transform: uppercase; line-height: 1; }
        .oa-empty { font-size: 13px; color: var(--muted); padding: 12px 0 4px; }
        /* Buscando produto (pedido do Ricardo, set/2026): troca a faixa
           amarela de categorias + filtro de preço por essa linha simples
           dizendo o que foi buscado — a busca já filtra o catálogo inteiro,
           não faz sentido manter aba/faixa de preço junto. */
        .pa-search-hdr { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin: 0 0 16px; padding: 0 2px; font-size: 13px; color: var(--ink-2); font-family: 'Archivo', sans-serif; }
        .pa-search-hdr b { color: var(--ink); }
        .pa-search-count { font-size: 11.5px; color: var(--muted); white-space: nowrap; }

        /* PEÇA AGORA — vitrine de delivery. .recent-section/.sec-hdr
           empilhavam 48px + 32px de margem-topo (~80px de vazio antes do
           título) — aqui isso é resetado pra 20px, e o título+abas+filtros
           ganham uma faixa amarela (cor de assinatura da marca) destacando
           o bloco inteiro; a lista de produtos continua fora da faixa, em
           fundo branco normal (aprovado por Ricardo, set/2026). */
        .pa-wrap { margin-top: 20px; }
        /* Faixa de ponta a ponta da tela (mesmo truque do .hero, que também
           não fica preso à largura do .main-wrap) — Ricardo pediu depois de
           ver a primeira versão, que tinha lateral igual container comum
           (set/2026). A cor continua indo até a borda, mas o CONTEÚDO
           (.pa-band-inner) fica contido em max-width 1120px — igual
           .pca-main — pra não ficar colado na borda esquerda da tela em
           telas largas, desalinhado da lista de produtos logo abaixo
           (achado do Ricardo, set/2026). */
        .pa-band { background: var(--sign); width: 100vw; margin-left: calc(50% - 50vw); padding: 10px 0; margin-bottom: 8px; }
        .pa-band-inner { max-width: 1120px; margin: 0 auto; padding: 0 20px; }
        /* Título e "Delivery na Trindade" na mesma linha (alinhados pela
           base), em vez de empilhados — junto com os quadrados mais baixos
           logo abaixo, é o que deixa a faixa inteira mais baixa (Ricardo
           pediu o mínimo de altura possível, pra sobrar mais tela pro
           conteúdo, set/2026). */
        .pa-hdr { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 0 0 14px; }
        .pa-hdr-left { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; }
        /* "Delivery na Trindade" saiu e o título ganhou um pouco de altura
           — pedido do Ricardo, out/2026, mesma leva de "otimizar espaço"
           do filtro de preço abaixo. */
        .pa-hdr .recent-section-title { font-size: 24px; }
        /* Virou texto + barra divisória, igual o filtro de preço logo
           abaixo (.pa-filters/.pa-filter-item) — pedido do Ricardo,
           out/2026: tirar o visual de retângulo preto/branco, deixar só
           texto preto com um quadradinho branco no que tá selecionado
           (aqui branco, não amarelo, porque já está em cima do amarelo da
           faixa). Ocupa menos espaço que o segmentado anterior. */
        .pa-view-toggle { flex: none; display: flex; align-items: center; white-space: nowrap; }
        .pa-view-sep { width: 1px; height: 13px; background: rgba(21,18,16,.35); margin: 0 10px; }
        .pa-view-seg { border: none; background: none; color: var(--ink); font-size: 12.5px; font-weight: 700; padding: 5px 7px; border-radius: 6px; cursor: pointer; font-family: 'Archivo', sans-serif; }
        .pa-view-seg.on { background: var(--paper); font-weight: 800; }
        /* Vista "Lojas" — um cartão por empresa, prateleirinha horizontal
           com os produtos dela (mesmas fotos de produto já usadas na lista,
           sem precisar de logo). */
        .pa-store-card { background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 12px; }
        .pa-store-hdr { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 9px; }
        .pa-store-name { font-size: 14px; font-weight: 800; color: var(--ink); font-family: 'Archivo', sans-serif; }
        .pa-store-meta { font-size: 9px; font-weight: 700; color: var(--muted); margin-top: 2px; }
        .pa-store-meta.open { color: var(--open); }
        .pa-store-link { font-size: 10.5px; font-weight: 800; color: var(--sign-dark); text-decoration: none; white-space: nowrap; flex: none; }
        .pa-store-shelf { display: flex; gap: 9px; overflow-x: auto; scrollbar-width: none; }
        .pa-store-shelf::-webkit-scrollbar { display: none; }
        .pa-store-thumb { flex: none; width: 64px; display: flex; flex-direction: column; gap: 4px; text-decoration: none; }
        .pa-store-thumb-img { width: 64px; height: 64px; border-radius: 11px; background: var(--concrete-2); position: relative; overflow: hidden; }
        .pa-store-thumb-name { font-size: 10.5px; font-weight: 700; color: var(--ink); line-height: 1.2; font-family: 'Archivo', sans-serif; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .pa-store-thumb-price { font-size: 10px; font-weight: 800; color: var(--sign-dark); }
        /* O carrossel de subcategorias (dentro da faixa) tinha o mesmo
           problema que o de categorias tinha antes de ir de ponta a ponta —
           só que aqui quem segura ele "dentro de um container" é o padding
           lateral do .pa-band-inner. Margem negativa igual a esse padding
           cancela isso; o padding interno mantém o primeiro/último item
           alinhados com o resto da página, mas a área de rolagem em si vai
           até a borda do container (a borda da tela em mobile, onde o
           container já ocupa 100% da largura) (Ricardo, set/2026). */
        .pa-band .pa-scroll { margin: 0 -20px; padding: 2px 20px 8px; gap: 8px; }
        /* Wrapper só pra posicionar as setas nas bordas do carrossel — só no
           desktop (ver media query abaixo). No mobile o toque/arraste já é
           natural e as setas saem (Ricardo, out/2026). */
        .pa-scroll-wrap { position: relative; }
        .pa-scroll-arrow { position: absolute; top: 44%; transform: translateY(-50%); z-index: 3; width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--ink); background: var(--paper); color: var(--ink); font-size: 13px; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,.22); padding: 0; }
        .pa-scroll-arrow.left { left: -4px; }
        .pa-scroll-arrow.right { right: -4px; }
        @media(max-width: 767.98px) {
          .pa-scroll-arrow { display: none; }
        }
        /* Card com foto real do produto (em vez de quadrado com emoji) —
           tarja branca colada embaixo da foto com o nome do tipo em
           dourado, mockup aprovado por Ricardo out/2026 ("branca com texto
           amarelo"). Foto vem do primeiro produto (já embaralhado) daquele
           tipo — ver photoUrl em pecaAgora.server.ts. */
        .pa-scroll { display: flex; gap: 10px; overflow-x: auto; padding: 4px 4px 10px; scrollbar-width: none; }
        .pa-scroll::-webkit-scrollbar { display: none; }
        .pa-tcard { flex: 0 0 auto; width: 142px; height: 176px; border-radius: 16px; position: relative; overflow: hidden; cursor: pointer; background: var(--concrete-2); box-shadow: 0 2px 8px rgba(0,0,0,.18); transition: box-shadow .15s, transform .15s; }
        .pa-tcard:hover, .pa-tcard.on { box-shadow: 0 0 0 3px #FFFFFF, 0 4px 14px rgba(0,0,0,.28); transform: translateY(-2px); }
        .pa-tcard-img { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 26px; }
        .pa-tcard-tag { position: absolute; left: 0; right: 0; bottom: 0; background: #FFFFFF; padding: 6px 6px 7px; text-align: center; }
        .pa-tcard-lbl { font-size: 11px; font-weight: 800; color: var(--sign-dark); line-height: 1.15; font-family: 'Archivo', sans-serif; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        /* Virou menu de texto com separador em barra, em vez de pílulas —
           pedido do Ricardo, out/2026: "otimizar o espaço", ganhar área
           visual pra lista de produtos. Selecionado ganha um retângulo
           preenchido de amarelo (opção que o Ricardo preferiu à de só
           colorir o texto). */
        .pa-filters { display: flex; align-items: center; flex-wrap: nowrap; overflow-x: auto; padding: 0 4px; margin: 0 0 8px; scrollbar-width: none; }
        .pa-filters::-webkit-scrollbar { display: none; }
        .pa-filter-sep { flex: 0 0 auto; width: 1px; height: 13px; background: var(--line); margin: 0 10px; }
        .pa-filter-item { flex: 0 0 auto; border: none; background: none; padding: 5px 7px; border-radius: 6px; font-size: 12.5px; font-weight: 700; color: var(--ink); cursor: pointer; font-family: 'Archivo', sans-serif; white-space: nowrap; }
        .pa-filter-item.on { background: var(--sign); font-weight: 800; }
        .pa-list { display: flex; flex-direction: column; gap: 7px; }
        .pa-row { display: flex; align-items: center; gap: 10px; background: var(--paper); border: 1px solid var(--line); border-radius: 13px; padding: 8px; transition: border-color .15s; }
        .pa-row:hover { border-color: var(--ink); }
        .pa-row-link { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; text-decoration: none; color: inherit; }
        .pa-row-img { width: 78px; height: 78px; border-radius: 14px; flex-shrink: 0; position: relative; overflow: hidden; background: var(--concrete-2); }
        .pa-row-body { flex: 1; min-width: 0; }
        .pa-row-end { flex-shrink: 0; text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 5px; }
        .pa-name { font-size: 13px; font-weight: 700; color: var(--ink); line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: 'Archivo', sans-serif; }
        .pa-biz { font-size: 11px; color: var(--muted); margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pa-price { font-size: 13px; font-weight: 800; color: var(--sign-dark); font-variant-numeric: tabular-nums; }
        .pa-open { display: flex; align-items: center; gap: 4px; justify-content: flex-end; font-size: 9.5px; font-weight: 700; color: var(--open); text-transform: uppercase; letter-spacing: .2px; }
        .pa-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--open); display: inline-block; flex-shrink: 0; }
        /* Sentinela que dispara o carregamento automático ao entrar na
           tela (IntersectionObserver) — substituiu o botão "Ver mais"
           (set/2026). Sem interação nenhuma do lado do usuário: rola a
           página, mais produtos aparecem sozinhos. */
        .pa-loadmore { width: 100%; margin-top: 10px; padding: 14px; text-align: center; font-size: 12px; font-weight: 700; color: var(--muted); font-family: 'Archivo', sans-serif; }
        .pa-qadd { width: 30px; height: 30px; border-radius: 50%; border: none; background: var(--open); color: #fff; font-size: 16px; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; line-height: 1; }
        .pa-qadd:active { transform: scale(.9); }
        .pa-stepper { display: flex; align-items: center; gap: 7px; background: var(--ink); border-radius: 20px; padding: 3px 5px; }
        .pa-stepper button { width: 19px; height: 19px; border-radius: 50%; border: none; background: rgba(255,255,255,.15); color: #fff; font-size: 12px; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .pa-stepper b { color: #fff; font-size: 11.5px; min-width: 11px; text-align: center; font-family: 'Archivo', sans-serif; }
        .pa-pick { display: inline-flex; align-items: center; gap: 3px; background: var(--concrete-2); border: 1px solid var(--line); color: var(--ink-2); font-size: 10px; font-weight: 800; padding: 6px 10px; border-radius: 20px; text-decoration: none; white-space: nowrap; }
        .pa-pick:hover { border-color: var(--sign-dark); }
      `}</style>
      {searching ? (
        <div className="pa-search-hdr">
          <span>Resultados para <b>&ldquo;{search.trim()}&rdquo;</b></span>
          <span className="pa-search-count">{items.length} {items.length === 1 ? 'produto' : 'produtos'}</span>
        </div>
      ) : (
        <>
          <div className="pa-band">
            <div className="pa-band-inner">
              <div className="pa-hdr">
                <div className="pa-hdr-left">
                  <h2 className="recent-section-title">🍔 Peça agora</h2>
                </div>
                <div className="pa-view-toggle" role="tablist" aria-label="Ver como">
                  <button type="button" role="tab" aria-selected={viewMode === 'produtos'} className={`pa-view-seg ${viewMode === 'produtos' ? 'on' : ''}`} onClick={() => setViewMode('produtos')}>Produtos</button>
                  <span className="pa-view-sep" aria-hidden="true" />
                  <button type="button" role="tab" aria-selected={viewMode === 'lojas'} className={`pa-view-seg ${viewMode === 'lojas' ? 'on' : ''}`} onClick={() => setViewMode('lojas')}>Lojas</button>
                </div>
              </div>

              <div className="pa-scroll-wrap">
                <div className="pa-scroll" ref={tabsScrollRef}>
                  {groups.map(g => (
                    <div key={g.key} className={`pa-tcard ${activeKey === g.key ? 'on' : ''}`} onClick={() => changeTab(g.key)}>
                      {g.photoUrl ? (
                        <div className="pa-tcard-img"><Image src={g.photoUrl} alt={g.label} fill sizes="142px" unoptimized style={{ objectFit: 'cover' }} /></div>
                      ) : (
                        <div className="pa-tcard-img">{g.emoji}</div>
                      )}
                      <div className="pa-tcard-tag"><span className="pa-tcard-lbl">{g.label}</span></div>
                    </div>
                  ))}
                </div>
                {canScrollLeft && <button type="button" className="pa-scroll-arrow left" aria-label="Ver tipos anteriores" onClick={() => scrollTabs(-1)}>‹</button>}
                {canScrollRight && <button type="button" className="pa-scroll-arrow right" aria-label="Ver mais tipos" onClick={() => scrollTabs(1)}>›</button>}
              </div>
            </div>
          </div>

          <div className="pa-filters">
            {PRICE_FILTERS.map((f, i) => [
              i > 0 && <span key={`sep-${f.max}`} className="pa-filter-sep" aria-hidden="true" />,
              <button type="button" key={f.max} className={`pa-filter-item ${maxPrice === f.max ? 'on' : ''}`} onClick={() => changePrice(f.max)}>{f.label}</button>,
            ])}
          </div>
        </>
      )}

      {items.length === 0 ? (
        <div className="oa-empty">{searching ? `Nenhum produto encontrado para "${search.trim()}".` : 'Nenhum produto nessa faixa de preço ainda.'}</div>
      ) : storeGroups ? (
        <div className="pa-list">
          {storeGroups.map(g => (
            <div key={g.companySlug} className="pa-store-card">
              <div className="pa-store-hdr">
                <div>
                  <div className="pa-store-name">{g.companyName}</div>
                  <div className={`pa-store-meta ${g.open ? 'open' : ''}`}>{g.open ? '● Aberto' : 'Fechado'} · {g.items.length} {g.items.length === 1 ? 'produto' : 'produtos'}</div>
                </div>
                <a className="pa-store-link" href={`/cardapio/${g.companySlug}`}>Ver cardápio ›</a>
              </div>
              <div className="pa-store-shelf">
                {g.items.map(p => (
                  <a key={p.id} className="pa-store-thumb" href={`/empresa/${p.companySlug}/item/${p.id}`}>
                    <div className="pa-store-thumb-img">
                      <Image src={p.photo_url} alt={p.name} fill sizes="64px" unoptimized style={{objectFit:'cover'}} />
                    </div>
                    <div className="pa-store-thumb-name">{p.name}</div>
                    <div className="pa-store-thumb-price">{fmt(p.price)}</div>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="pa-list">
            {visibleItems.map(p => {
              const qty = qtyById[p.id] || 0
              return (
                <div key={p.id} className="pa-row">
                  <a className="pa-row-link" href={`/empresa/${p.companySlug}/item/${p.id}`}>
                    <div className="pa-row-img">
                      <Image src={p.photo_url} alt={p.name} fill sizes="78px" unoptimized style={{objectFit:'cover'}} />
                    </div>
                    <div className="pa-row-body">
                      <div className="pa-name">{p.name}</div>
                      <div className="pa-biz">{p.companyName}</div>
                    </div>
                  </a>
                  <div className="pa-row-end">
                    <div className="pa-price">{fmt(p.price)}</div>
                    {p.open && <div className="pa-open"><span className="pa-dot" />Aberto</div>}
                    {p.hasOptions ? (
                      <a className="pa-pick" href={`/empresa/${p.companySlug}/item/${p.id}`}>Escolher ›</a>
                    ) : qty > 0 ? (
                      <div className="pa-stepper">
                        <button type="button" aria-label="Tirar um" onClick={() => changeQty(p, -1)}>−</button>
                        <b>{qty}</b>
                        <button type="button" aria-label="Adicionar mais um" onClick={() => changeQty(p, 1)}>+</button>
                      </div>
                    ) : (
                      <button type="button" className="pa-qadd" aria-label={`Adicionar ${p.name}`} onClick={() => quickAdd(p)}>+</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {visibleCount < items.length && (
            <div ref={sentinelRef} className="pa-loadmore">Carregando mais produtos…</div>
          )}
        </>
      )}
    </div>
  )
}
