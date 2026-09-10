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
      <div className="pa-band">
        <div className="sec-hdr pa-hdr">
          <div>
            <span className="sec-eyebrow pa-eyebrow">Delivery na Trindade</span>
            <h2 className="recent-section-title">🍔 Peça agora</h2>
          </div>
        </div>

        <div className="pa-scroll">
          {groups.map(g => (
            <div key={g.key} className={`pa-item ${activeKey === g.key ? 'on' : ''}`} onClick={() => changeTab(g.key)}>
              <div className="pa-photo">{g.emoji}</div>
              <span className="pa-lbl">{g.label}</span>
            </div>
          ))}
        </div>

        <div className="pa-filters">
          {PRICE_FILTERS.map(f => (
            <button type="button" key={f.max} className={`pa-chip ${maxPrice === f.max ? 'on' : ''}`} onClick={() => changePrice(f.max)}>{f.label}</button>
          ))}
        </div>
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
