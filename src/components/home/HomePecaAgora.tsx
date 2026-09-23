'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { fmt, cartStorageKey, checkCartConflict, setActiveCart } from '@/lib/lojaPricing'

export type PecaVitrineItem = {
  id: string; name: string; photo_url: string; price: number
  companyName: string; companySlug: string; open: boolean; hasOptions: boolean
}
export type PecaGroup = { key: string; label: string; emoji: string; items: PecaVitrineItem[] }

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
export default function HomePecaAgora({ groups }: { groups: PecaGroup[] }) {
  const [activeKey, setActiveKey] = useState('todas')
  const [maxPrice, setMaxPrice] = useState(0)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [qtyById, setQtyById] = useState<Record<string, number>>({})

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

  const active = groups.find(g => g.key === activeKey) || groups[0]
  const items = maxPrice > 0 ? active.items.filter(i => i.price <= maxPrice) : active.items
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
        .sec-eyebrow { font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--sign-dark); font-weight: 700; margin-bottom: 4px; display: block; font-family: 'Archivo', sans-serif; }
        .oa-empty { font-size: 13px; color: var(--muted); padding: 12px 0 4px; }

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
           (set/2026). padding lateral em 20px pra alinhar o conteúdo de
           dentro com o resto da página (cat-grid, pa-list), que continua
           dentro do .main-wrap normal. */
        .pa-band { background: var(--sign); width: 100vw; margin-left: calc(50% - 50vw); padding: 10px 20px 10px; margin-bottom: 16px; }
        /* Título e "Delivery na Trindade" na mesma linha (alinhados pela
           base), em vez de empilhados — junto com os quadrados mais baixos
           logo abaixo, é o que deixa a faixa inteira mais baixa (Ricardo
           pediu o mínimo de altura possível, pra sobrar mais tela pro
           conteúdo, set/2026). */
        .pa-hdr { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin: 0 0 14px; }
        .pa-eyebrow { color: rgba(21,18,16,.68); margin-bottom: 0; white-space: nowrap; }
        /* O carrossel de subcategorias (dentro da faixa) tinha o mesmo
           problema que o de categorias tinha antes de ir de ponta a ponta —
           só que aqui em vez do .main-wrap é o padding lateral do próprio
           .pa-band que segura ele "dentro de um container". Margem negativa
           igual ao padding do pai cancela isso; o padding interno mantém o
           primeiro/último item alinhados com o resto da página, mas a área
           de rolagem em si vai até a borda da tela (Ricardo, set/2026). */
        .pa-band .pa-scroll { margin: 0 -20px; padding: 2px 20px 8px; gap: 8px; }
        /* Quadrado (não mais círculo/retângulo alto) com fundo branco
           translúcido em vez de chapado, coladinhos entre si — 3 pedidos
           de ajuste do Ricardo depois do mockup (set/2026). */
        .pa-band .pa-item { width: 66px; gap: 6px; }
        .pa-band .pa-photo { width: 64px; height: 64px; border-radius: 14px; background: rgba(255,255,255,.8); border-color: transparent; font-size: 26px; }
        .pa-band .pa-item:hover .pa-photo, .pa-band .pa-item.on .pa-photo { border-color: var(--ink); background: rgba(255,255,255,.95); }
        .pa-band .pa-lbl, .pa-band .pa-item.on .pa-lbl { color: var(--ink); font-size: 10.5px; }
        .pa-scroll { display: flex; gap: 16px; overflow-x: auto; padding: 4px 4px 10px; scrollbar-width: none; }
        .pa-scroll::-webkit-scrollbar { display: none; }
        .pa-item { flex: 0 0 auto; width: 84px; display: flex; flex-direction: column; align-items: center; gap: 7px; text-align: center; cursor: pointer; }
        .pa-photo { width: 76px; height: 76px; border-radius: 50%; background: var(--concrete-2); border: 2.5px solid transparent; display: flex; align-items: center; justify-content: center; font-size: 32px; transition: border-color .15s, transform .15s; }
        .pa-item:hover .pa-photo, .pa-item.on .pa-photo { border-color: var(--sign); transform: translateY(-2px); }
        .pa-lbl { font-size: 12px; font-weight: 700; color: var(--ink); line-height: 1.2; font-family: 'Archivo', sans-serif; }
        .pa-item.on .pa-lbl { color: var(--sign-dark); }
        .pa-filters { display: flex; gap: 8px; flex-wrap: nowrap; overflow-x: auto; padding: 2px 4px 6px; margin: 2px 0 16px; scrollbar-width: none; }
        .pa-filters::-webkit-scrollbar { display: none; }
        .pa-chip { flex: 0 0 auto; padding: 7px 15px; border-radius: 20px; border: 1px solid var(--line); background: var(--paper); font-size: 12px; font-weight: 700; color: var(--ink); cursor: pointer; font-family: 'Archivo', sans-serif; white-space: nowrap; }
        .pa-chip.on { background: var(--sign); border-color: var(--sign-dark); color: var(--ink); }
        .pa-list { display: flex; flex-direction: column; gap: 7px; }
        .pa-row { display: flex; align-items: center; gap: 10px; background: var(--paper); border: 1px solid var(--line); border-radius: 13px; padding: 8px; transition: border-color .15s; }
        .pa-row:hover { border-color: var(--ink); }
        .pa-row-link { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; text-decoration: none; color: inherit; }
        .pa-row-img { width: 52px; height: 52px; border-radius: 10px; flex-shrink: 0; position: relative; overflow: hidden; background: var(--concrete-2); }
        .pa-row-body { flex: 1; min-width: 0; }
        .pa-row-end { flex-shrink: 0; text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 5px; }
        .pa-name { font-size: 13px; font-weight: 700; color: var(--ink); line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: 'Archivo', sans-serif; }
        .pa-biz { font-size: 11px; color: var(--muted); margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pa-price { font-size: 13px; font-weight: 800; color: var(--sign-dark); font-variant-numeric: tabular-nums; }
        .pa-open { display: flex; align-items: center; gap: 4px; justify-content: flex-end; font-size: 9.5px; font-weight: 700; color: var(--open); text-transform: uppercase; letter-spacing: .2px; }
        .pa-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--open); display: inline-block; flex-shrink: 0; }
        .pa-more { width: 100%; margin-top: 10px; padding: 11px; background: var(--paper); border: 1.5px dashed var(--line); border-radius: 12px; font-size: 12.5px; font-weight: 700; color: var(--sign-dark); cursor: pointer; font-family: 'Archivo', sans-serif; }
        .pa-more:hover { border-color: var(--sign-dark); background: var(--concrete-2); }
        .pa-qadd { width: 30px; height: 30px; border-radius: 50%; border: none; background: var(--open); color: #fff; font-size: 16px; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; line-height: 1; }
        .pa-qadd:active { transform: scale(.9); }
        .pa-stepper { display: flex; align-items: center; gap: 7px; background: var(--ink); border-radius: 20px; padding: 3px 5px; }
        .pa-stepper button { width: 19px; height: 19px; border-radius: 50%; border: none; background: rgba(255,255,255,.15); color: #fff; font-size: 12px; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .pa-stepper b { color: #fff; font-size: 11.5px; min-width: 11px; text-align: center; font-family: 'Archivo', sans-serif; }
        .pa-pick { display: inline-flex; align-items: center; gap: 3px; background: var(--concrete-2); border: 1px solid var(--line); color: var(--ink-2); font-size: 10px; font-weight: 800; padding: 6px 10px; border-radius: 20px; text-decoration: none; white-space: nowrap; }
        .pa-pick:hover { border-color: var(--sign-dark); }
      `}</style>
      <div className="pa-band">
        <div className="pa-hdr">
          <h2 className="recent-section-title">🍔 Peça agora</h2>
          <span className="sec-eyebrow pa-eyebrow">Delivery na Trindade</span>
        </div>

        <div className="pa-scroll">
          {groups.map(g => (
            <div key={g.key} className={`pa-item ${activeKey === g.key ? 'on' : ''}`} onClick={() => changeTab(g.key)}>
              <div className="pa-photo">{g.emoji}</div>
              <span className="pa-lbl">{g.label}</span>
            </div>
          ))}
        </div>

      </div>

      <div className="pa-filters">
        {PRICE_FILTERS.map(f => (
          <button type="button" key={f.max} className={`pa-chip ${maxPrice === f.max ? 'on' : ''}`} onClick={() => changePrice(f.max)}>{f.label}</button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="oa-empty">Nenhum produto nessa faixa de preço ainda.</div>
      ) : (
        <>
          <div className="pa-list">
            {visibleItems.map(p => {
              const qty = qtyById[p.id] || 0
              return (
                <div key={p.id} className="pa-row">
                  <a className="pa-row-link" href={`/empresa/${p.companySlug}/item/${p.id}`}>
                    <div className="pa-row-img">
                      <Image src={p.photo_url} alt={p.name} fill sizes="56px" unoptimized style={{objectFit:'cover'}} />
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
            <button type="button" className="pa-more" onClick={() => setVisibleCount(v => v + PAGE_SIZE)}>
              Ver mais {Math.min(PAGE_SIZE, items.length - visibleCount)}
            </button>
          )}
        </>
      )}
    </div>
  )
}
