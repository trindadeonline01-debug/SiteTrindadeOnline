'use client'
import { useState } from 'react'
import Image from 'next/image'
import { fmt } from '@/lib/lojaPricing'

export type PecaVitrineItem = {
  id: string; name: string; description?: string | null; photo_url: string; price: number
  companyName: string; companySlug: string; open: boolean
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

// Vitrine cruzando o catálogo de todas as empresas com cardápio digital
// ativo — ESPECIFICACAO.md §7 (índice de produtos), mas aplicado aqui numa
// versão simples: sem busca por palavra, só recorte por subcategoria e por
// faixa de preço, direto na home. Grupos e itens já vêm prontos do servidor
// (page.tsx), incluindo se a empresa está aberta agora.
export default function HomePecaAgora({ groups }: { groups: PecaGroup[] }) {
  const [activeKey, setActiveKey] = useState('todas')
  const [maxPrice, setMaxPrice] = useState(0)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  if (groups.length === 0) return null

  function changeTab(key: string) { setActiveKey(key); setVisibleCount(PAGE_SIZE) }
  function changePrice(max: number) { setMaxPrice(max); setVisibleCount(PAGE_SIZE) }

  const active = groups.find(g => g.key === activeKey) || groups[0]
  const items = maxPrice > 0 ? active.items.filter(i => i.price <= maxPrice) : active.items
  const visibleItems = items.slice(0, visibleCount)

  return (
    <div className="recent-section">
      <div className="sec-hdr">
        <div>
          <span className="sec-eyebrow">Delivery na Trindade</span>
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

      {items.length === 0 ? (
        <div className="oa-empty">Nenhum produto nessa faixa de preço ainda.</div>
      ) : (
        <>
          <div className="pa-list">
            {visibleItems.map(p => (
              <a key={p.id} className="pa-row" href={`/empresa/${p.companySlug}/item/${p.id}`}>
                <div className="pa-row-img">
                  <Image src={p.photo_url} alt={p.name} fill sizes="56px" unoptimized style={{objectFit:'cover'}} />
                </div>
                <div className="pa-row-body">
                  <div className="pa-name">{p.name}</div>
                  <div className="pa-biz">{p.companyName}</div>
                  {p.description && <div className="pa-desc">{p.description}</div>}
                </div>
                <div className="pa-row-end">
                  <div className="pa-price">{fmt(p.price)}</div>
                  {p.open && <div className="pa-open"><span className="pa-dot" />Aberto</div>}
                </div>
              </a>
            ))}
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
