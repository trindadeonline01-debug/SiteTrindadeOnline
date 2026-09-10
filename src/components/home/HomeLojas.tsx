'use client'
import { useState } from 'react'
import Image from 'next/image'

export type LojaItem = {
  id: string; name: string; slug: string
  categoryKey: string; categoryLabel: string; categoryEmoji: string
  avgRating: number; cover: string | null; open: boolean
}

// Substitui os 3 carrosséis "Gastronomia/Comércios/Serviços" (quase
// idênticos entre si, sem recorte próprio) por uma lista única, completa e
// filtrável — o "ver tudo" que fecha a home, no mesmo estilo de linha já
// usado no Peça Agora. Mockup aprovado em conversa (set/2026).
export default function HomeLojas({ items }: { items: LojaItem[] }) {
  const [activeCat, setActiveCat] = useState<string | null>(null)
  const [onlyOpen, setOnlyOpen] = useState(false)

  if (items.length === 0) return null

  const cats = Object.entries(
    items.reduce<Record<string, { label: string; emoji: string }>>((acc, i) => {
      acc[i.categoryKey] = { label: i.categoryLabel, emoji: i.categoryEmoji }
      return acc
    }, {})
  )

  const filtered = items
    .filter(i => !activeCat || i.categoryKey === activeCat)
    .filter(i => !onlyOpen || i.open)

  return (
    <div className="recent-section">
      <div className="sec-hdr">
        <div>
          <span className="sec-eyebrow">Todo o bairro, num lugar só</span>
          <h2 className="recent-section-title">🏪 Lojas</h2>
        </div>
      </div>

      <div className="lj-chips">
        <button type="button" className={`lj-chip ${!activeCat ? 'on' : ''}`} onClick={() => setActiveCat(null)}>Todas</button>
        {cats.map(([key, meta]) => (
          <button type="button" key={key} className={`lj-chip ${activeCat === key ? 'on' : ''}`} onClick={() => setActiveCat(key)}>{meta.emoji} {meta.label}</button>
        ))}
        <button type="button" className={`lj-chip ${onlyOpen ? 'on' : ''}`} onClick={() => setOnlyOpen(v => !v)}>📶 Aberto agora</button>
      </div>

      {filtered.length === 0 ? (
        <div className="oa-empty">Nenhuma loja nesse filtro agora.</div>
      ) : (
        <div className="lj-list">
          {filtered.map(i => (
            <a key={i.id} className="lj-row" href={`/empresa/${i.slug}`}>
              <div className="lj-row-img">
                {i.cover ? <Image src={i.cover} alt={i.name} fill sizes="52px" unoptimized style={{objectFit:'cover'}} /> : <span>{i.categoryEmoji}</span>}
              </div>
              <div className="lj-row-body">
                <div className="lj-name">{i.name}</div>
                <div className="lj-sub">{i.categoryLabel}</div>
              </div>
              <div className="lj-row-end">
                {i.avgRating > 0 && <div className="lj-stars">★ {i.avgRating.toFixed(1)}</div>}
                {i.open ? <div className="lj-open"><span className="lj-dot" />Aberto</div> : <div className="lj-closed">Fechado</div>}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
