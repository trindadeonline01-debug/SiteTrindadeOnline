'use client'
import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import ShareButton from '@/components/ShareButton'

type Promotion = {
  id: string; title: string; image_url: string; starts_at: string; expires_at: string
  company: { id: string; name: string; slug: string; category?: { name: string; emoji: string } }
}

export default function PromocoesPageClient({ initialPromos }: { initialPromos: Promotion[] }) {
  const [promos] = useState<Promotion[]>(initialPromos)
  const [current, setCurrent] = useState(0)
  const [filter, setFilter] = useState('todos')
  const [isMobile, setIsMobile] = useState(false)
  const touchStartX = useRef(0)
  const touchEndX = useRef(0)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const categories = [...new Set(promos.map(p => p.company?.category?.name).filter(Boolean))]
  const filtered = filter === 'todos' ? promos : promos.filter(p => p.company?.category?.name === filter)

  function prev() { setCurrent(i => Math.max(0, i - 1)) }
  function next() { setCurrent(i => Math.min(filtered.length - 1, i + 1)) }
  useEffect(() => { setCurrent(0) }, [filter])

  function handleTouchStart(e: React.TouchEvent) { touchStartX.current = e.touches[0].clientX }
  function handleTouchEnd(e: React.TouchEvent) {
    touchEndX.current = e.changedTouches[0].clientX
    const diff = touchStartX.current - touchEndX.current
    if (Math.abs(diff) > 50) { diff > 0 ? next() : prev() }
  }

  const promo = filtered[current]

  const CSS = `
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Inter',sans-serif;background:#000;min-height:100vh;}

    /* MOBILE - stories */
    .pg-mobile{position:fixed;left:0;right:0;top:54px;bottom:0;background:#000;display:flex;flex-direction:column;overflow:hidden;}
    .topbar{background:rgba(0,0,0,0.9);padding:10px 16px;flex-shrink:0;backdrop-filter:blur(10px);}
    .top-title{font-family:'Bebas Neue',sans-serif;font-size:20px;color:#fff;letter-spacing:2px;margin-bottom:6px;}
    .top-title span{color:#C9951A;}
    .filters-row{display:flex;align-items:center;gap:10px;}
    .filters{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none;flex:1;min-width:0;}
    .filters::-webkit-scrollbar{display:none;}
    .filter-btn{padding:4px 14px;border-radius:20px;font-size:11px;font-weight:500;border:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.5);background:transparent;cursor:pointer;white-space:nowrap;flex-shrink:0;}
    .filter-btn.on{background:#C9951A;color:#111;border-color:#C9951A;}
    .filters-share{flex-shrink:0;}
    .progress-bar{display:flex;gap:3px;padding:8px 16px 0;flex-shrink:0;}
    .progress-item{flex:1;height:2px;background:rgba(255,255,255,0.2);border-radius:2px;overflow:hidden;cursor:pointer;}
    .progress-fill{height:100%;background:#fff;border-radius:2px;transition:width .3s;}
    .story-wrap{flex:1;position:relative;overflow:hidden;}
    .story-img{width:100%;height:100%;object-fit:contain;display:block;background:#000;}
    .story-bg{width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#1A1A1A;font-size:80px;}
    .nav-left,.nav-center,.nav-right{-webkit-tap-highlight-color:transparent;-webkit-touch-callout:none;user-select:none;outline:none;}
    .nav-left{position:absolute;left:0;top:0;bottom:0;width:25%;cursor:pointer;z-index:10;}
    .nav-center{position:absolute;left:25%;top:0;bottom:0;width:50%;cursor:pointer;z-index:10;display:block;}
    .nav-right{position:absolute;right:0;top:0;bottom:0;width:25%;cursor:pointer;z-index:10;}
    .empty-mobile{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;color:#555;gap:8px;font-size:14px;}

    /* DESKTOP - grid */
    .pg-desktop{background:#F0EDE8;min-height:100vh;}
    .hero{background:#111;padding:18px 24px 20px;}
    .hero-inner{max-width:1100px;margin:0 auto;}
    .hero-title{font-family:'Bebas Neue',sans-serif;font-size:24px;color:#fff;letter-spacing:2px;margin-bottom:3px;}
    .hero-title span{color:#C9951A;}
    .hero-sub{font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:14px;}
    .desktop-filters{display:flex;gap:7px;flex-wrap:wrap;}
    .desktop-filter-btn{padding:5px 14px;border-radius:20px;font-size:11px;font-weight:500;border:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.5);background:transparent;cursor:pointer;}
    .desktop-filter-btn.on{background:#C9951A;color:#111;border-color:#C9951A;}
    .grid-body{padding:20px 24px;max-width:1100px;margin:0 auto;}
    .promo-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;}
    .promo-card{background:#fff;border-radius:14px;overflow:hidden;border:0.5px solid #E0DDD8;cursor:pointer;transition:transform .15s;}
    .promo-card:hover{transform:translateY(-2px);}
    .promo-card-img{aspect-ratio:9/16;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#F5F0E8;font-size:60px;position:relative;}
    .promo-card-img img{width:100%;height:100%;object-fit:cover;}
    .promo-card-body{padding:12px 14px;}
    .promo-card-cat{font-size:10px;color:#888;margin-bottom:3px;}
    .promo-card-empresa{font-size:14px;font-weight:600;color:#111;margin-bottom:3px;}
    .promo-card-title{font-size:12px;color:#555;margin-bottom:6px;}
    .promo-card-validade{font-size:10px;color:#C9951A;margin-bottom:8px;}
    .promo-card-btn{display:inline-block;padding:6px 14px;background:#111;color:#C9951A;border-radius:20px;font-size:11px;font-weight:500;text-decoration:none;}
    .empty-desktop{text-align:center;padding:60px 20px;color:#AAA;font-size:14px;}
  `

  // DESKTOP
  if (!isMobile) return (
    <>
      <style dangerouslySetInnerHTML={{__html: CSS}}/>
      <div className="pg-desktop">
        <div className="hero">
          <div className="hero-inner">
            <div className="hero-title">🏷️ PROMOÇÕES <span>DA SEMANA</span></div>
            <div className="hero-sub">{filtered.length} promoções ativas · clique para ver a empresa</div>
            <div className="desktop-filters">
              <button className={`desktop-filter-btn ${filter==='todos'?'on':''}`} onClick={()=>setFilter('todos')}>Todas ({promos.length})</button>
              {categories.map(cat=>(
                <button key={cat} className={`desktop-filter-btn ${filter===cat?'on':''}`} onClick={()=>setFilter(cat||'')}>{cat}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="grid-body">
          {filtered.length === 0 ? (
            <div className="empty-desktop">🏷️ Nenhuma promoção ativa no momento</div>
          ) : (
            <div className="promo-grid">
              {filtered.map(p => (
                <div key={p.id} className="promo-card" style={{position:'relative'}}>
                  <a href={'/empresa/'+p.company?.slug} style={{display:'block',color:'inherit',textDecoration:'none'}}>
                    <div className="promo-card-img">
                      {p.image_url ? <Image unoptimized src={p.image_url} alt={p.title} fill sizes="(max-width:639px) 45vw, 220px" style={{objectFit:'cover'}}/> : (p.company?.category?.emoji || '🏷️')}
                    </div>
                    <div className="promo-card-body">
                      <div className="promo-card-cat">{p.company?.category?.emoji} {p.company?.category?.name}</div>
                      <div className="promo-card-empresa">{p.company?.name}</div>
                      <div className="promo-card-title">{p.title}</div>
                      <div className="promo-card-validade">válido até {new Date(p.expires_at).toLocaleDateString('pt-BR')}</div>
                      <span className="promo-card-btn">Ver empresa →</span>
                    </div>
                  </a>
                  <div style={{position:'absolute',top:8,right:8,zIndex:5}} onClick={e=>e.stopPropagation()}>
                    <ShareButton title={p.title} text={`🏷️ ${p.title} — ${p.company?.name} no Trindade Online!`} label="" fullWidth={false}/>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )

  // MOBILE - stories
  return (
    <>
      <style dangerouslySetInnerHTML={{__html: CSS}}/>
      <div className="pg-mobile" style={{bottom: 'calc(64px + env(safe-area-inset-bottom))'}}>
        <div className="topbar">
          <div className="top-title">🏷️ PROMOÇÕES <span>DA SEMANA</span></div>
          <div className="filters-row">
            <div className="filters">
              <button className={`filter-btn ${filter==='todos'?'on':''}`} onClick={()=>setFilter('todos')}>Todas</button>
              {categories.map(cat=>(
                <button key={cat} className={`filter-btn ${filter===cat?'on':''}`} onClick={()=>setFilter(cat||'')}>{cat}</button>
              ))}
            </div>
            {promo && (
              <div className="filters-share">
                <ShareButton title={promo.title} text={`🏷️ ${promo.title} — ${promo.company?.name} no Trindade Online!`} label="" fullWidth={false}/>
              </div>
            )}
          </div>
        </div>
        {filtered.length > 0 && (
          <div className="progress-bar">
            {filtered.map((_,i) => (
              <div key={i} className="progress-item" onClick={()=>setCurrent(i)}>
                <div className="progress-fill" style={{width: i < current ? '100%' : i === current ? '50%' : '0%'}}/>
              </div>
            ))}
          </div>
        )}
        {filtered.length === 0 ? (
          <div className="empty-mobile">🏷️ Nenhuma promoção ativa</div>
        ) : (
          <div className="story-wrap" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
            {promo.image_url ? (
              <Image unoptimized className="story-img" src={promo.image_url} alt={promo.title} fill sizes="100vw" style={{objectFit:'contain'}}/>
            ) : (
              <div className="story-bg">{promo.company?.category?.emoji || '🏷️'}</div>
            )}
            <div className="nav-left" onClick={prev}/>
            <a className="nav-center" href={'/empresa/'+promo.company?.slug} aria-label={`Ver empresa ${promo.company?.name}`}/>
            <div className="nav-right" onClick={next}/>
          </div>
        )}
      </div>
    </>
  )
}
