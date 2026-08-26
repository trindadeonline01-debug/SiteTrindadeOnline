'use client'
import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import ShareButton from '@/components/ShareButton'

type Promotion = {
  id: string; title: string; image_url: string; starts_at: string; expires_at: string
  company: { id: string; name: string; slug: string; category?: { name: string; emoji: string } }
}

export default function PromocoesPageClient({ initialPromos, embedded, search }: { initialPromos: Promotion[]; embedded?: boolean; search?: string }) {
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
  const searchTerm = (search || '').trim().toLowerCase()
  const filtered = promos
    .filter(p => filter === 'todos' || p.company?.category?.name === filter)
    .filter(p => !searchTerm || p.title.toLowerCase().includes(searchTerm) || (p.company?.name || '').toLowerCase().includes(searchTerm))

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
    body{font-family:'Archivo',sans-serif;background:#000;min-height:100vh;}

    /* MOBILE - stories */
    .pg-mobile{position:fixed;left:0;right:0;top:54px;bottom:0;background:#000;display:flex;flex-direction:column;overflow:hidden;}
    .topbar{background:rgba(0,0,0,0.9);padding:10px 16px;flex-shrink:0;backdrop-filter:blur(10px);}
    .top-title{font-family:'Anton',sans-serif;font-size:20px;color:#fff;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;}
    .top-title span{color:var(--sign);}
    .filters-row{display:flex;align-items:center;gap:10px;}
    .filters{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none;flex:1;min-width:0;}
    .filters::-webkit-scrollbar{display:none;}
    .filter-btn{padding:4px 14px;border-radius:20px;font-size:11px;font-weight:500;border:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.5);background:transparent;cursor:pointer;white-space:nowrap;flex-shrink:0;font-family:'Archivo',sans-serif;}
    .filter-btn.on{background:var(--sign);color:var(--ink);border-color:var(--sign);}
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
    .pg-desktop{background:var(--concrete);min-height:100vh;}
    .hero{background:var(--ink);padding:18px 24px 20px;}
    .hero-inner{max-width:1100px;margin:0 auto;}
    .hero-title{font-family:'Anton',sans-serif;font-size:24px;color:#fff;letter-spacing:1px;text-transform:uppercase;margin-bottom:3px;}
    .hero-title span{color:var(--sign);}
    .hero-sub{font-size:11px;color:rgba(255,255,255,0.4);}

    /* SEGMENTOS — mesma linguagem dos chips de subcategoria/cupom. */
    .seg-wrap{padding:14px 24px 0;max-width:1100px;margin:0 auto;}
    .seg-row{display:flex;gap:10px;overflow-x:auto;scrollbar-width:none;padding:2px 2px 6px;}
    .seg-row::-webkit-scrollbar{display:none;}
    .seg-chip{flex:0 0 auto;width:60px;display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer;text-align:center;}
    .seg-ico{width:44px;height:44px;border-radius:10px;border:1px solid var(--line);background:var(--paper);display:flex;align-items:center;justify-content:center;font-size:19px;transition:all .15s;}
    .seg-chip:hover .seg-ico{border-color:var(--sign-dark);}
    .seg-chip.on .seg-ico{border-color:var(--sign-dark);background:var(--concrete-2);}
    .seg-label{font-size:10px;font-weight:500;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;}
    .seg-chip.on .seg-label{color:var(--sign-dark);font-weight:700;}

    .grid-body{padding:20px 24px;max-width:1100px;margin:0 auto;}

    /* CARDS — mesmo formato "OFERTAS DO BAIRRO" da home/cupons. */
    .promo-grid{display:grid;grid-template-columns:1fr;gap:12px;}
    @media(min-width:640px){.promo-grid{grid-template-columns:repeat(2,1fr);}}
    @media(min-width:1024px){.promo-grid{grid-template-columns:repeat(3,1fr);}}
    .of-card{background:var(--paper);border:1px solid var(--line);border-radius:10px;overflow:hidden;display:flex;flex-direction:column;text-decoration:none;transition:border-color .15s,transform .15s;}
    .of-card:hover{border-color:var(--ink);transform:translateY(-2px);}
    .of-tag{font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:6px 12px;color:#fff;background:var(--ink);}
    .of-body{padding:13px;flex:1;display:flex;gap:10px;align-items:flex-start;}
    .of-img{width:44px;height:44px;border-radius:8px;overflow:hidden;flex-shrink:0;background:var(--concrete-2);display:flex;align-items:center;justify-content:center;font-size:18px;position:relative;}
    .of-img img{width:100%;height:100%;object-fit:cover;}
    .of-text{flex:1;min-width:0;}
    .of-who{font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;}
    .of-title{font-family:'Anton',sans-serif;font-size:17px;margin:0 0 4px;line-height:1.1;text-transform:uppercase;color:var(--ink);}
    .of-ft{padding:10px 13px;border-top:1px dashed var(--line);display:flex;justify-content:space-between;align-items:center;font-size:11.5px;}
    .of-ft .l{color:var(--muted);font-weight:600;}
    .of-ft .g{font-weight:700;color:var(--sign-dark);}
    .empty-desktop{text-align:center;padding:60px 20px;color:#AAA;font-size:14px;}
  `

  // DESKTOP (e sempre que embutida em /ofertas, também no mobile — a
  // versão "stories" fica só na rota /promocoes standalone)
  if (!isMobile || embedded) return (
    <>
      <style dangerouslySetInnerHTML={{__html: CSS}}/>
      <div className="pg-desktop">
        {!embedded && (
          <div className="hero">
            <div className="hero-inner">
              <div className="hero-title">🏷️ PROMOÇÕES <span>DA SEMANA</span></div>
              <div className="hero-sub">{filtered.length} promoções ativas · clique para ver a empresa</div>
            </div>
          </div>
        )}
        {categories.length > 0 && (
          <div className="seg-wrap">
            <div className="seg-row">
              <div className={`seg-chip ${filter==='todos'?'on':''}`} onClick={()=>setFilter('todos')}>
                <span className="seg-ico">🏷️</span><span className="seg-label">Todas</span>
              </div>
              {categories.map(cat=>(
                <div key={cat} className={`seg-chip ${filter===cat?'on':''}`} onClick={()=>setFilter(cat||'')}>
                  <span className="seg-ico">{promos.find(p=>p.company?.category?.name===cat)?.company?.category?.emoji || '🏷️'}</span>
                  <span className="seg-label">{cat}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="grid-body">
          {filtered.length === 0 ? (
            <div className="empty-desktop">🏷️ Nenhuma promoção ativa no momento</div>
          ) : (
            <div className="promo-grid">
              {filtered.map(p => (
                <a key={p.id} className="of-card" href={'/empresa/'+p.company?.slug}>
                  <span className="of-tag">🏷️ PROMOÇÃO DA SEMANA</span>
                  <div className="of-body">
                    <div className="of-img">
                      {p.image_url ? <Image src={p.image_url} alt="" fill sizes="44px" unoptimized style={{objectFit:'cover'}} /> : (p.company?.category?.emoji || '🏷️')}
                    </div>
                    <div className="of-text">
                      <div className="of-who">{p.company?.name}</div>
                      <div className="of-title">{p.title}</div>
                    </div>
                  </div>
                  <div className="of-ft">
                    <span className="l">até {new Date(p.expires_at).toLocaleDateString('pt-BR')}</span>
                    <span className="g">Ver oferta</span>
                  </div>
                </a>
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
