'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

type Promotion = {
  id: string; title: string; image_url: string; starts_at: string; expires_at: string
  company: { id: string; name: string; slug: string; category?: { name: string; emoji: string } }
}

export default function PromocoesPage() {
  const [promos, setPromos] = useState<Promotion[]>([])
  const [loading, setLoading] = useState(true)
  const [current, setCurrent] = useState(0)
  const [filter, setFilter] = useState('todos')
  const touchStartX = useRef(0)
  const touchEndX = useRef(0)

  useEffect(() => {
    supabase.from('promotions')
      .select('id,title,image_url,starts_at,expires_at,company:companies(id,name,slug,category:categories(name,emoji))')
      .eq('status', 'active')
      .lte('starts_at', new Date().toISOString())
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .then(({ data }) => { setPromos(data as any || []); setLoading(false) })
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

  return (
    <>
      <style>{\`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        html,body{height:100%;overflow:hidden;}
        body{font-family:'Inter',sans-serif;background:#000;}
        .pg{position:fixed;inset:0;top:60px;background:#000;display:flex;flex-direction:column;overflow:hidden;}
        .topbar{background:rgba(0,0,0,0.9);padding:10px 16px;flex-shrink:0;backdrop-filter:blur(10px);}
        .topbar-inner{max-width:1100px;margin:0 auto;}
        .top-title{font-family:'Bebas Neue',sans-serif;font-size:20px;color:#fff;letter-spacing:2px;margin-bottom:6px;}
        .top-title span{color:#C9951A;}
        .filters{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none;}
        .filters::-webkit-scrollbar{display:none;}
        .filter-btn{padding:4px 14px;border-radius:20px;font-size:11px;font-weight:500;border:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.5);background:transparent;cursor:pointer;white-space:nowrap;flex-shrink:0;}
        .filter-btn.on{background:#C9951A;color:#111;border-color:#C9951A;}
        .progress-bar{display:flex;gap:3px;padding:8px 16px 0;flex-shrink:0;}
        .progress-item{flex:1;height:2px;background:rgba(255,255,255,0.2);border-radius:2px;overflow:hidden;cursor:pointer;}
        .progress-fill{height:100%;background:#fff;border-radius:2px;transition:width .3s;}
        .story-wrap{flex:1;position:relative;overflow:hidden;}
        .story-img{width:100%;height:100%;object-fit:cover;display:block;}
        .story-bg{width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#1A1A1A;font-size:80px;}
        .story-overlay{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,0.9));padding:24px 20px 40px;}
        .story-cat{font-size:11px;color:rgba(255,255,255,0.6);margin-bottom:4px;}
        .story-empresa{font-size:22px;font-weight:700;color:#fff;margin-bottom:4px;}
        .story-title{font-size:15px;color:rgba(255,255,255,0.85);margin-bottom:6px;}
        .story-validade{font-size:12px;color:#C9951A;margin-bottom:14px;}
        .story-btn{display:inline-flex;align-items:center;gap:6px;padding:11px 22px;background:#C9951A;color:#111;border-radius:24px;font-size:13px;font-weight:700;text-decoration:none;}
        .nav-left{position:absolute;left:0;top:0;bottom:0;width:35%;cursor:pointer;z-index:10;}
        .nav-right{position:absolute;right:0;top:0;bottom:0;width:35%;cursor:pointer;z-index:10;}
        .arrow-btn{position:absolute;top:50%;transform:translateY(-50%);width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);color:#fff;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:20;}
        .arrow-left-btn{left:12px;}
        .arrow-right-btn{right:12px;}
        .empty{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;color:#555;gap:8px;font-size:14px;}
        @media(max-width:640px){.arrow-btn{display:none;}.pg{top:56px;}}
      \`}</style>
      <div className="pg">
        <div className="topbar">
          <div className="topbar-inner">
            <div className="top-title">🏷️ PROMOÇÕES <span>DA SEMANA</span></div>
            <div className="filters">
              <button className={\`filter-btn \${filter==='todos'?'on':''}\`} onClick={()=>setFilter('todos')}>Todas</button>
              {categories.map(cat=>(
                <button key={cat} className={\`filter-btn \${filter===cat?'on':''}\`} onClick={()=>setFilter(cat||'')}>{cat}</button>
              ))}
            </div>
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
        {loading ? (
          <div className="empty">⏳ Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="empty">🏷️ Nenhuma promoção ativa no momento</div>
        ) : (
          <div className="story-wrap" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
            {promo.image_url ? (
              <img className="story-img" src={promo.image_url} alt={promo.title}/>
            ) : (
              <div className="story-bg">{promo.company?.category?.emoji || '🏷️'}</div>
            )}
            <div className="nav-left" onClick={prev}/>
            <div className="nav-right" onClick={next}/>
            {current > 0 && <button className="arrow-btn arrow-left-btn" onClick={prev}>‹</button>}
            {current < filtered.length - 1 && <button className="arrow-btn arrow-right-btn" onClick={next}>›</button>}
            <div className="story-overlay">
              <div className="story-cat">{promo.company?.category?.emoji} {promo.company?.category?.name}</div>
              <div className="story-empresa">{promo.company?.name}</div>
              <div className="story-title">{promo.title}</div>
              <div className="story-validade">válido até {new Date(promo.expires_at).toLocaleDateString('pt-BR')}</div>
              <a className="story-btn" href={'/empresa/'+promo.company?.slug}>Ver empresa →</a>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
