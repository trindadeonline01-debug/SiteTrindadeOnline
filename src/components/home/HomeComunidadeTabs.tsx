'use client'
import { useState } from 'react'
import Image from 'next/image'

type Listing = {
  id: string; title: string; price: number | null
  type: string; subtype: string | null; created_at: string
  photos?: { url: string; order: number }[]
}

const TABS: { key: string; icon: string; label: string; href: string }[] = [
  { key: 'emprego', icon: '💼', label: 'Empregos', href: '/empregos' },
  { key: 'imovel',  icon: '🏠', label: 'Imóveis',  href: '/imoveis' },
  { key: 'desapega', icon: '🏷️', label: 'Desapega', href: '/desapega' },
  { key: 'achado',  icon: '🔍', label: 'Achados',  href: '/achados-perdidos' },
]

// Bloco único de Comunidade com abas (ESPECIFICACAO.md §10.1 item 7) —
// substitui as 4 esteiras separadas (Desapega/Empregos/Imóveis/Achados)
// que hoje comem cerca de 60% de altura extra na home.
export default function HomeComunidadeTabs({ listings }: { listings: Record<string, Listing[]> }) {
  const firstWithData = TABS.find(t => (listings[t.key] || []).length > 0)?.key || 'emprego'
  const [tab, setTab] = useState(firstWithData)
  const active = TABS.find(t => t.key === tab)!
  const items = listings[tab] || []

  return (
    <div className="recent-section">
      <style>{`
        .hct-tabs{display:flex;gap:6px;overflow-x:auto;margin-bottom:12px;scrollbar-width:none;}
        .hct-tabs::-webkit-scrollbar{display:none;}
        .hct-tab{flex-shrink:0;font-size:12px;font-weight:600;padding:7px 14px;border-radius:20px;background:#fff;border:1px solid #E0DDD8;color:#666;font-family:'Inter',sans-serif;white-space:nowrap;cursor:pointer;}
        .hct-tab.on{background:#C9951A;border-color:#C9951A;color:#fff;}
      `}</style>
      <div className="recent-section-hdr">
        <span className="recent-section-title">🧭 COMUNIDADE</span>
        <a href={active.href} className="sec-link" style={{ marginLeft: 'auto' }}>Ver tudo →</a>
      </div>
      <div className="hct-tabs">
        {TABS.map(t => (
          <button key={t.key} className={`hct-tab ${tab === t.key ? 'on' : ''}`} onClick={() => setTab(t.key)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <div className="empty-state">Nenhum anúncio de {active.label.toLowerCase()} por aqui ainda.</div>
      ) : (
        <div className="recent-scroll">
          {items.map(l => (
            <a key={l.id} className="recent-card" href={`/anuncio/${l.id}`}>
              <div className="recent-card-img">
                {l.photos?.length ? (
                  <Image unoptimized src={[...l.photos].sort((a, b) => a.order - b.order)[0]?.url} alt={l.title} fill sizes="(max-width:639px) 45vw, 220px" style={{ objectFit: 'cover' }} />
                ) : active.icon}
              </div>
              <div className="recent-card-title">{l.title}</div>
              {tab === 'emprego' && <div className="recent-card-sub">Vaga de emprego</div>}
              {tab === 'achado' && <div className="recent-card-sub">Achado/Perdido</div>}
              {tab === 'imovel' && l.price != null && (
                <div className="recent-card-price">R$ {l.price.toLocaleString('pt-BR')}{l.subtype === 'aluguel' ? '/mês' : ''}</div>
              )}
              {tab === 'desapega' && l.price != null && (
                <div className="recent-card-price">R$ {l.price.toLocaleString('pt-BR')}</div>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
