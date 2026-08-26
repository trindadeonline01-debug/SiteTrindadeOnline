'use client'

import React, { useRef, useState } from 'react'
import Image from 'next/image'
import { CATEGORY_IMAGES } from '@/lib/categoryImages'

type Category    = { id: string; name: string; emoji: string; slug: string }
type Subcategory = { id: string; name: string; emoji: string; slug?: string }
type Highlight   = { id: string; company: { name: string; slug: string; photos?: any[]; category?: any; avg_rating?: number } }
type Company     = {
  id: string; name: string; slug: string
  avg_rating?: number; address?: string; plan?: string; description?: string; tags?: string[]
  photos?: any[]; subcategories?: any[]
}

type Props = {
  slug: string
  category: Category
  subcats: Subcategory[]
  companies: Company[]
  highlights: Highlight[]
}

export default function CategoriaPageClient({ slug, category, subcats, companies, highlights }: Props) {
  const [filtered, setFiltered]     = useState<Company[]>(companies)
  const [sortOrder, setSortOrder]     = useState<'az'|'rating'|'recent'>('az')
  const [activeSub, setActiveSub]   = useState<string | null>(null)
  const [search, setSearch]         = useState('')
  const subcatScrollRef = useRef<HTMLDivElement>(null)
  function scrollSubcats(dir: number) {
    subcatScrollRef.current?.scrollBy({ left: dir * 240, behavior: 'smooth' })
  }

  function filterBySub(subId: string | null) {
    setActiveSub(subId); setSearch('')
    setFiltered(!subId ? companies : companies.filter(c =>
      c.subcategories?.some((s: any) => s.subcategory?.id === subId)
    ))
  }

  function handleSearch(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value; setSearch(q); setActiveSub(null)
    const ql = q.toLowerCase()
    setFiltered(!q.trim() ? companies : companies.filter(c =>
      c.name.toLowerCase().includes(ql) ||
      c.subcategories?.some((s: any) => {
        const sub = Array.isArray(s.subcategory) ? s.subcategory[0] : s.subcategory
        return sub?.name?.toLowerCase().includes(ql)
      }) ||
      (c.plan === 'paid' && (
        c.description?.toLowerCase().includes(ql) ||
        c.address?.toLowerCase().includes(ql) ||
        c.tags?.some((t: string) => t.toLowerCase().includes(ql))
      ))
    ))
  }

  function getCover(photos?: any[]): string | null {
    if (!photos?.length) return null
    return [...photos].sort((a, b) => a.order - b.order)[0]?.url || null
  }

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Archivo', sans-serif; background: var(--concrete); }

        /* ── TOPBAR ── */
        .topbar { background: var(--ink); z-index: 50; }
        .topbar-inner { max-width: 1200px; margin: 0 auto; padding: 13px 24px; display: flex; align-items: center; justify-content: center; gap: 16px; }
        .t-bc { display: flex; align-items: center; gap: 7px; font-size: 13px; }
        .t-bc a { color: var(--sign); font-weight: 700; text-decoration: none; }
        .t-bc a:hover { text-decoration: underline; }
        .t-bc-sep { color: #444; font-size: 14px; }
        .t-bc-cur { color: #fff; font-weight: 700; }
        .t-actions { display: none; align-items: center; gap: 8px; }
        @media(min-width: 768px) { .t-actions { display: flex; } }
        .t-btn-entrar { color: var(--sign); font-size: 13px; font-weight: 600; border: 1.5px solid var(--sign); border-radius: 10px; padding: 7px 14px; text-decoration: none; }
        .t-btn-cad { background: var(--sign); color: var(--ink); font-size: 13px; font-weight: 700; border-radius: 10px; padding: 8px 14px; text-decoration: none; }

        /* ── HERO centralizado ── */
        .cat-hero { background: var(--ink); padding: 32px 24px 28px; border-bottom: 2px solid var(--sign); }
        .cat-hero-inner { display: flex; align-items: center; justify-content: center; gap: 18px; }
        .cat-hero-img { width: 74px; height: 74px; border-radius: 12px; overflow: hidden; position: relative; flex-shrink: 0; border: 2px solid var(--sign); }
        .cat-nm { font-family: 'Anton', sans-serif; font-size: clamp(32px,5vw,48px); color: #fff; letter-spacing: 1px; text-transform: uppercase; line-height: 1; margin-bottom: 6px; }
        .cat-cnt { font-size: 13px; color: #666; font-family: 'Archivo', sans-serif; }
        .cat-cnt span { color: var(--sign); font-weight: 600; }

        /* ── BUSCA ── */
        .search-bar-wrap { background: var(--concrete); padding: 0 24px; }
        .search-bar-inner { max-width: 640px; margin: 0 auto; transform: translateY(-20px); }
        .search-bar { display: flex; align-items: center; gap: 10px; background: var(--sign); border: 2.5px solid var(--ink); border-radius: 14px; padding: 13px 20px; box-shadow: 4px 4px 0 var(--ink); }
        .search-bar input { flex: 1; border: none; background: transparent; font-size: 15px; font-family: 'Archivo', sans-serif; font-weight: 500; color: var(--ink); outline: none; }
        .search-bar input::placeholder { color: var(--ink-2); opacity: .55; }

        .page { max-width: 1200px; margin: 0 auto; padding: 8px 24px 48px; }

        @media(max-width: 767px) {
          .topbar-inner, .page { padding-left: 16px; padding-right: 16px; }
          .search-bar-wrap { padding: 0 12px; }
          .search-bar-inner { max-width: 100%; }
          .search-bar { padding: 8px 12px; gap: 6px; }
          .search-bar input { font-size: 13px; }
        }

        .sec-label { font-family: 'Anton', sans-serif; font-size: 20px; color: var(--muted); letter-spacing: 1px; text-transform: uppercase; margin-bottom: 12px; display: flex; align-items: center; gap: 10px; }
        .sec-label::after { content: ''; flex: 1; height: 0.5px; background: #ddd; }

        /* DESTAQUES — carrossel */
        .dest-grid { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 8px; scrollbar-width: none; margin-bottom: 28px; }
        .dest-grid::-webkit-scrollbar { display: none; }
        .dest-card { flex-shrink: 0; width: 140px; background: var(--paper); border: 1.5px solid var(--sign-dark); border-radius: 12px; overflow: hidden; text-decoration: none; display: block; transition: all .18s; }
        .dest-card:hover { transform: translateY(-3px); box-shadow: 0 6px 20px rgba(0,0,0,.1); }
        @media(min-width: 768px) { .dest-card { width: 180px; } }
        .dest-img { width: 100%; height: 117px; background: var(--concrete-2); display: flex; align-items: center; justify-content: center; font-size: 32px; overflow: hidden; position: relative; }
        .dest-img img { width: 100%; height: 100%; object-fit: cover; }
        .dest-badge { position: absolute; top: 6px; left: 6px; background: var(--sign); color: var(--ink); font-size: 8px; font-weight: 700; padding: 2px 6px; border-radius: 3px; letter-spacing: 0.5px; }
        .dest-body { padding: 8px 10px; }
        .dest-name { font-size: 11px; font-weight: 600; color: var(--ink); margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: 'Archivo', sans-serif; }
        .dest-stars { font-size: 10px; color: var(--sign-dark); font-weight: 600; }

        /* SUBCATEGORIAS — chips pequenos, deslizando na horizontal (sem
           barra de rolagem visível); no desktop, sem como arrastar, uma
           setinha de cada lado avança a rolagem. */
        .subcat-wrap { background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 14px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); margin-bottom: 24px; display: flex; align-items: center; gap: 4px; }
        .subcat-pills { display: flex; gap: 10px; overflow-x: auto; scroll-behavior: smooth; scrollbar-width: none; flex: 1; min-width: 0; padding: 2px 6px 4px; }
        .subcat-pills::-webkit-scrollbar { display: none; }
        .subcat-pill { flex: 0 0 auto; width: 62px; display: flex; flex-direction: column; align-items: center; gap: 5px; cursor: pointer; text-align: center; }
        .subcat-pill-emoji { width: 46px; height: 46px; border-radius: 10px; border: 1px solid var(--line); background: var(--paper); display: flex; align-items: center; justify-content: center; font-size: 20px; transition: all .15s; }
        .subcat-pill:hover .subcat-pill-emoji { border-color: var(--sign-dark); }
        .subcat-pill.on .subcat-pill-emoji { border-color: var(--sign-dark); background: var(--concrete-2); }
        .subcat-pill-name { font-size: 10.5px; line-height: 1.25; font-weight: 500; color: #555; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }
        .subcat-pill.on .subcat-pill-name { color: var(--sign-dark); font-weight: 700; }
        .subcat-arrow { display: none; }
        @media(min-width: 768px) {
          .subcat-arrow { flex: none; display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--line); background: var(--paper); color: var(--ink); font-size: 15px; font-weight: 700; cursor: pointer; }
          .subcat-arrow:hover { border-color: var(--sign-dark); color: var(--sign-dark); }
        }

        .result-cnt { font-size: 13px; color: var(--muted); margin-bottom: 16px; }
        .result-cnt span { color: var(--ink); font-weight: 600; }

        /* EMPRESAS — mesma linguagem visual dos cards da home: foto grande
           em cima, nome embaixo, sem info extra. */
        .companies-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 14px; }
        @media(min-width: 640px) { .companies-grid { grid-template-columns: repeat(3,1fr); } }
        @media(min-width: 900px) { .companies-grid { grid-template-columns: repeat(4,1fr); } }
        @media(min-width: 1200px) { .companies-grid { grid-template-columns: repeat(5,1fr); } }
        .cc { background: var(--paper); border: 0.5px solid var(--line); border-radius: 14px; overflow: hidden; text-decoration: none; transition: all .18s; display: block; }
        .cc:hover { border-color: var(--sign-dark); box-shadow: 0 6px 18px rgba(0,0,0,.08); }
        .cc-img { width: 100%; aspect-ratio: 1/1; background: var(--concrete-2); display: flex; align-items: center; justify-content: center; font-size: 32px; overflow: hidden; position: relative; }
        .cc-img img { width: 100%; height: 100%; object-fit: cover; }
        .cc-body { padding: 10px 12px 12px; }
        .cc-name { font-size: 14px; font-weight: 600; color: var(--ink); line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-family: 'Archivo', sans-serif; }

        .sk { background: linear-gradient(90deg,#F0EDE8 25%,#E8E4DD 50%,#F0EDE8 75%); background-size: 200% 100%; animation: sh 1.5s infinite; border-radius: 12px; }
        @keyframes sh { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

        .empty { text-align: center; padding: 56px 20px; color: var(--muted); }
        .empty-ico { font-size: 48px; margin-bottom: 14px; }
        .empty-title { font-size: 16px; font-weight: 600; color: #555; margin-bottom: 6px; }
        .empty-sub { font-size: 13px; line-height: 1.7; }
        .btn-clear { margin-top: 16px; display: inline-block; padding: 9px 22px; background: var(--concrete-2); color: var(--sign-dark); border: 1px solid var(--sign-dark); border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: 'Archivo', sans-serif; }
      `}</style>

      {/* TOPBAR */}
      <div className="topbar">
        <div className="topbar-inner">
          <div className="t-bc">
            <a href="/">Início</a>
            <span className="t-bc-sep">›</span>
            <span className="t-bc-cur">{category.name}</span>
          </div>
          <div className="t-actions">
            <a className="t-btn-entrar" href="/login">Entrar</a>
            <a className="t-btn-cad" href="/anunciar">+ Cadastrar empresa</a>
          </div>
        </div>
      </div>

      {/* HERO centralizado com foto da categoria */}
      <div className="cat-hero">
        <div className="cat-hero-inner">
          {CATEGORY_IMAGES[slug] && (
            <div className="cat-hero-img"><Image src={CATEGORY_IMAGES[slug]} alt="" fill sizes="74px" unoptimized style={{objectFit:'cover'}} /></div>
          )}
          <div>
            <div className="cat-nm">{category.name}</div>
            <div className="cat-cnt">
              <span>{companies.length}</span> empresa{companies.length !== 1 ? 's' : ''} cadastrada{companies.length !== 1 ? 's' : ''} na Trindade
            </div>
          </div>
        </div>
      </div>

      {/* BUSCA centralizada */}
      <div className="search-bar-wrap">
        <div className="search-bar-inner">
          <div className="search-bar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              placeholder={`Buscar dentro de ${category.name}...`}
              value={search}
              onChange={handleSearch}
              onKeyDown={e => e.key === 'Enter' && handleSearch({ target: { value: search } } as any)}
            />
            {search && (
              <button onClick={() => { setSearch(''); setFiltered(companies) }} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--ink-2)', fontSize:18, lineHeight:1 }}>✕</button>
            )}
            <button onClick={() => handleSearch({ target: { value: search } } as any)}
              style={{background:'var(--ink)',border:'none',borderRadius:10,padding:'7px 18px',color:'var(--sign)',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'Archivo,sans-serif',whiteSpace:'nowrap'}}>
              Buscar
            </button>
          </div>
        </div>
      </div>

      {/* CONTEÚDO */}
      <div className="page">

        {/* 1. EM DESTAQUE */}
        {highlights.length > 0 && (
          <>
            <div className="sec-label">EM DESTAQUE</div>
            <div className="dest-grid">
              {highlights.map(h => {
                const cover = getCover(h.company.photos)
                return (
                  <a key={h.id} className="dest-card" href={`/empresa/${h.company.slug}`}>
                    <div className="dest-img">
                      {cover
                        ? <Image unoptimized src={cover} alt={h.company.name} fill sizes="180px" style={{objectFit:'cover'}} />
                        : <span>{h.company.category?.emoji || '🏪'}</span>
                      }
                      <span className="dest-badge">DESTAQUE</span>
                    </div>
                    <div className="dest-body">
                      <div className="dest-name">{h.company.name}</div>
                      {(h.company.avg_rating || 0) > 0 && (
                        <div className="dest-stars">★ {Number(h.company.avg_rating).toFixed(1)}</div>
                      )}
                    </div>
                  </a>
                )
              })}
            </div>
          </>
        )}

        {/* 2. SUBCATEGORIAS */}
        {subcats.length > 0 && (
          <>
            <div className="sec-label">SUBCATEGORIAS</div>
            <div className="subcat-wrap">
              <button className="subcat-arrow" onClick={() => scrollSubcats(-1)} aria-label="Anterior">‹</button>
              <div className="subcat-pills" ref={subcatScrollRef}>
                <div className={`subcat-pill ${!activeSub ? 'on' : ''}`} onClick={() => filterBySub(null)}>
                  <span className="subcat-pill-emoji">🏪</span>
                  <span className="subcat-pill-name">Todas</span>
                </div>
                {subcats.filter(s => companies.filter(c => c.subcategories?.some((cs: any) => cs.subcategory?.id === s.id)).length > 0).map(s => (
                  <div key={s.id} className={`subcat-pill ${activeSub === s.id ? 'on' : ''}`} onClick={() => filterBySub(s.id)}>
                    <span className="subcat-pill-emoji">{s.emoji}</span>
                    <span className="subcat-pill-name">{s.name}</span>
                  </div>
                ))}
              </div>
              <button className="subcat-arrow" onClick={() => scrollSubcats(1)} aria-label="Próximo">›</button>
            </div>
          </>
        )}

        {/* 3. EMPRESAS */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:8}}>
          <div style={{fontSize:13,color:'#AAA'}}>
            Mostrando <span style={{color:'#111',fontWeight:600}}>{filtered.length}</span> empresa{filtered.length !== 1 ? 's' : ''}
            {activeSub && ` em ${subcats.find(s => s.id === activeSub)?.name}`}
            {search && ` para "${search}"`}
          </div>
          {filtered.length > 0 && (
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:12,color:'#CCC'}}>|</span>
              <span style={{fontSize:12,color:'#999',fontWeight:500}}>Ordenar:</span>
              {([['az','A–Z'],['rating','⭐ Avaliado'],['recent','🕐 Recente']] as const).map(([v,l])=>(
                <button key={v} onClick={()=>setSortOrder(v)}
                  style={{padding:'7px 14px',borderRadius:20,border:'1.5px solid',borderColor:sortOrder===v?'var(--sign-dark)':'#E0DDD8',background:sortOrder===v?'var(--concrete-2)':'#fff',color:sortOrder===v?'var(--sign-dark)':'#888',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'Archivo,sans-serif',whiteSpace:'nowrap'}}>
                  {l}
                </button>
              ))}
            </div>
          )}
        </div>

        {filtered.length > 0 && (() => {
          const sorted = [...filtered].sort((a,b)=>{
            if(sortOrder==='az') return a.name.localeCompare(b.name,'pt')
            if(sortOrder==='rating') return (b.avg_rating||0)-(a.avg_rating||0)
            return 0
          })
          const pagas = sorted.filter(c => c.plan === 'paid')
          const outras = sorted.filter(c => c.plan !== 'paid')
          const renderCard = (c: any) => {
              const cover = getCover(c.photos)
              return (
                <a key={c.id} className="cc" href={`/empresa/${c.slug}`}>
                  <div className="cc-img">
                    {cover
                      ? <Image unoptimized src={cover} alt={c.name} fill sizes="(max-width:639px) 45vw, 220px" style={{objectFit:'cover'}} />
                      : <span>{category.emoji || '🏪'}</span>
                    }
                  </div>
                  <div className="cc-body">
                    <div className="cc-name">{c.name}</div>
                  </div>
                </a>
              )
          }
          return (
            <div>
              {pagas.length > 0 && (
                <>
                  <div style={{fontFamily:"'Archivo',sans-serif",fontWeight:800,fontSize:11,color:'var(--sign-dark)',letterSpacing:'.08em',marginBottom:10,display:'flex',alignItems:'center',gap:8}}>
                    <svg width="16" height="16" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="28" stroke="var(--sign-dark)" strokeWidth="5" fill="none"/><path d="M18 32 L27 42 L46 22" stroke="var(--sign-dark)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    EMPRESAS INDICADAS ({pagas.length})
                  </div>
                  <div className="companies-grid" style={{marginBottom:24}}>{pagas.map(c => renderCard(c))}</div>
                </>
              )}
              {outras.length > 0 && (
                <>
                  <div style={{fontFamily:"'Archivo',sans-serif",fontWeight:800,fontSize:11,color:'#AAA',letterSpacing:'.08em',marginBottom:10,marginTop:pagas.length>0?8:0}}>
                    OUTRAS EMPRESAS ({outras.length})
                  </div>
                  <div className="companies-grid">{outras.map(c => renderCard(c))}</div>
                </>
              )}
            </div>
          )
        })()}

        {filtered.length === 0 && (
          <div className="empty">
            <div className="empty-ico">🔍</div>
            <div className="empty-title">
              {search ? `Nenhum resultado para "${search}"` : 'Nenhuma empresa nesta categoria ainda'}
            </div>
            <div className="empty-sub">
              {search ? 'Tente outro termo ou remova o filtro.' : 'Em breve novos estabelecimentos serão cadastrados aqui.'}
            </div>
            {(search || activeSub) && (
              <button className="btn-clear" onClick={() => { setSearch(''); filterBySub(null) }}>
                Limpar filtro
              </button>
            )}
          </div>
        )}

      </div>
    </>
  )
}
