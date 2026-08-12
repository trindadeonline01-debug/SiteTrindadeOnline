'use client'
import { useState, useRef } from 'react'
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

  // No desktop os cards não quebram linha (fileira única, ver CSS de
  // .oa-scroll) — como não tem barra de scroll visível pra indicar que dá
  // pra rolar de lado, isso aqui permite arrastar com o mouse (clicar e
  // arrastar), igual um touchpad/celular faria por padrão
  const scrollRef = useRef<HTMLDivElement>(null)
  const drag = useRef({ down: false, startX: 0, scrollLeft: 0, moved: false })

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'mouse') return
    const el = scrollRef.current
    if (!el) return
    drag.current = { down: true, startX: e.clientX, scrollLeft: el.scrollLeft, moved: false }
    el.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current.down) return
    const el = scrollRef.current
    if (!el) return
    const dx = e.clientX - drag.current.startX
    if (Math.abs(dx) > 3) drag.current.moved = true
    el.scrollLeft = drag.current.scrollLeft - dx
  }
  function onPointerUp() { drag.current.down = false }
  function onClickCapture(e: React.MouseEvent<HTMLDivElement>) {
    if (drag.current.moved) { e.preventDefault(); e.stopPropagation(); drag.current.moved = false }
  }

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
        <div
          className="oa-scroll"
          ref={scrollRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onClickCapture={onClickCapture}
        >
          {filtered.map(c => {
            const cover = [...(c.photos || [])].sort((a, b) => a.order - b.order)[0]?.url
            return (
              <a key={c.id} className="oa-card" href={`/empresa/${c.slug}`}>
                <div className="oa-card-img">
                  {cover ? <Image unoptimized src={cover} alt={c.name} fill sizes="(max-width:639px) 20vw, 120px" style={{objectFit:'cover'}} /> : (c.category?.emoji || '🏪')}
                  <span className="oa-badge"><span className="oa-badge-dot" />ABERTO</span>
                </div>
                <div className="oa-card-title">{c.name}</div>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
