'use client'
import { useState } from 'react'
import Image from 'next/image'

type Subcat = { id: string; name: string; emoji: string }
type Company = {
  id: string; name: string; slug: string
  category?: { emoji?: string } | null
  photos?: { url: string; order: number }[]
  subcategories?: { subcategory: Subcat | null }[]
}
type Chip = { id: string; name: string; emoji: string; count: number }

export default function HomeAbertoAgora({ companies, chips }: { companies: Company[]; chips: Chip[] }) {
  const [active, setActive] = useState<string | null>(null)

  const filtered = active
    ? companies.filter(c => c.subcategories?.some(s => s.subcategory?.id === active))
    : companies

  if (companies.length === 0) return null

  return (
    <div className="recent-section">
      <div className="recent-section-hdr">
        <span className="recent-section-title oa-title"><span className="oa-live-dot" />ABERTO AGORA</span>
      </div>
      {chips.length > 0 && (
        <div className="oa-chips">
          <button type="button" className={`oa-chip ${!active ? 'on' : ''}`} onClick={() => setActive(null)}>Tudo</button>
          {chips.map(c => (
            <button type="button" key={c.id} className={`oa-chip ${active === c.id ? 'on' : ''}`} onClick={() => setActive(c.id)}>{c.emoji} {c.name}</button>
          ))}
        </div>
      )}
      {filtered.length === 0 ? (
        <div className="oa-empty">Nenhuma empresa aberta nessa subcategoria agora.</div>
      ) : (
        <div className="recent-scroll">
          {filtered.map(c => {
            const cover = [...(c.photos || [])].sort((a, b) => a.order - b.order)[0]?.url
            return (
              <a key={c.id} className="recent-card" href={`/empresa/${c.slug}`}>
                <div className="recent-card-img">
                  {cover ? <Image src={cover} alt={c.name} fill sizes="(max-width:639px) 45vw, 220px" style={{objectFit:'cover'}} /> : (c.category?.emoji || '🏪')}
                  <span className="oa-badge"><span className="oa-badge-dot" />ABERTO</span>
                </div>
                <div className="recent-card-title">{c.name}</div>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
