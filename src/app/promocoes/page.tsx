'use client'
import { useState, useEffect } from 'react'
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

  function prev() { setCurrent(i => i === 0 ? filtered.length - 1 : i - 1) }
  function next() { setCurrent(i => i === filtered.length - 1 ? 0 : i + 1) }

  useEffect(() => { setCurrent(0) }, [filter])

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'Inter',sans-serif;background:#111;height:100vh;overflow:hidden;}
        .pg{background:#111;height:100vh;display:flex;flex-direction:column;overflow:hidden;}
        .hero{padding:16px 20px 12px;flex-shrink:0;}
        .hero-title{font-family:'Bebas Neue',sans-serif;font-size:24px;color:#fff;letter-spacing:2px;margin-bottom:3px;}
        .hero-title span{color:#C9951A;}
        .hero-sub{font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:12px;}
        .filters{display:flex;gap:7px;flex-wrap:wrap;}
        .filter-btn{padding:5px 14px;border-radius:20px;font-size:11px;font-weight:500;border:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.5);background:transparent;cursor:pointer;}
        .filter-btn.on{background:#C9951A;color:#111;border-color:#C9951A;}
        .stories-area{flex:1;display:flex;align-items:center;justify-content:center;padding:0 56px;gap:12px;position:relative;overflow:hidden;}
        .story{flex-shrink:0;border-radius:16px;overflow:hidden;cursor:pointer;position:relative;border:2px solid transparent;transition:all .2s;}
        .story.active{border-color:#C9951A;}
        .story.peek{opacity:0.4;transform:scale(0.88);}
        .story img{width:100%;height:100%;object-fit:cover;display:block;}
        .story-overlay{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,0.88));padding:14px 12px 12px;}
        .story-empresa{font-size:10px;color:rgba(255,255,255,0.7);margin-bottom:2px;}
        .story-title{font-size:13px;font-weight:500;color:#fff;line-height:1.3;margin-bottom:4px;}
        .story-validade{font-size:10px;color:#C9951A;}
        .arrow{position:absolute;top:50%;transform:translateY(-50%);width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:10;transition:all .15s;}
        .arrow:hover{background:rgba(201,149,26,0.4);border-color:#C9951A;}
        .arrow-left{left:10px;}
        .arrow-right{right:10px;}
        .dots{display:flex;justify-content:center;gap:5px;padding:10px 0 16px;flex-shrink:0;}
        .dot{width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.25);transition:all .2s;}
        .dot.on{background:#C9951A;width:16px;border-radius:3px;}
        .empty{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;color:#555;gap:8px;}
        @media(max-width:640px){
          .stories-area{padding:0 8px;}
          .arrow{display:none;}
          .story.peek{display:none;}
        }
      `}</style>
      <div className="pg">
        <div className="hero">
          <div className="hero-title">🏷️ PROMOÇÕES <span>DA SEMANA</span></div>
          <div className="hero-sub">{filtered.length} promoções ativas · toque para ver a empresa</div>
          <div className="filters">
            <button className={`filter-btn ${filter==='todos'?'on':''}`} onClick={()=>setFilter('todos')}>Todas</button>
            {categories.map(cat=>(
              <button key={cat} className={`filter-btn ${filter===cat?'on':''}`} onClick={()=>setFilter(cat||'')}>{cat}</button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="empty"><div style={{fontSize:32}}>⏳</div><div>Carregando...</div></div>
        ) : filtered.length === 0 ? (
          <div className="empty"><div style={{fontSize:32}}>🏷️</div><div style={{color:'#555'}}>Nenhuma promoção ativa no momento</div></div>
        ) : (
          <>
            <div className="stories-area">
              <button className="arrow arrow-left" onClick={prev}>‹</button>
              {filtered.map((p, i) => {
                const diff = i - current
                const isActive = diff === 0
                const isPeek = Math.abs(diff) === 1
                if (!isActive && !isPeek) return null
                return (
                  <a key={p.id} href={`/empresa/${p.company?.slug}`}
                    className={`story ${isActive?'active':'peek'}`}
                    style={{width: isActive?'180px':'140px', height: isActive?'300px':'260px'}}>
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.title}/>
                    ) : (
                      <div style={{width:'100%',height:'100%',background:'#1A1A1A',display:'flex',alignItems:'center',justifyContent:'center',fontSize:48}}>
                        {p.company?.category?.emoji || '🏷️'}
                      </div>
                    )}
                    <div className="story-overlay">
                      <div className="story-empresa">{p.company?.name}</div>
                      <div className="story-title">{p.title}</div>
                      <div className="story-validade">até {new Date(p.expires_at).toLocaleDateString('pt-BR')}</div>
                    </div>
                  </a>
                )
              })}
              <button className="arrow arrow-right" onClick={next}>›</button>
            </div>
            <div className="dots">
              {filtered.map((_,i)=>(
                <div key={i} className={`dot ${i===current?'on':''}`} onClick={()=>setCurrent(i)}/>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}
