'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

type Favorite = {
  id: string
  company: {
    id: string; name: string; slug: string
    avg_rating?: number; address?: string
    category?: any; photos?: any[]
  }
}

export default function FavoritosPage() {
  const [favs, setFavs]       = useState<Favorite[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId]   = useState<string|null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!s) { window.location.href = '/login'; return }
      setUserId(s.user.id)
      loadFavs(s.user.id)
    })
  }, [])

  async function loadFavs(uid: string) {
    const { data } = await supabase
      .from('favorites')
      .select('id, company:companies(id,name,slug,avg_rating,address,category:categories(name,emoji),photos:company_photos(url,order))')
      .eq('user_id', uid)
      .eq('entity_type', 'company')
      .order('created_at', { ascending: false })
    setFavs((data || []) as any)
    setLoading(false)
  }

  async function removeFav(favId: string) {
    await supabase.from('favorites').delete().eq('id', favId)
    setFavs(f => f.filter(x => x.id !== favId))
  }

  function getCover(c: any): string | null {
    if (!c.photos?.length) return null
    return [...c.photos].sort((a:any,b:any) => a.order - b.order)[0]?.url || null
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'Inter',sans-serif;background:#fff;}

        .topbar{background:#111;position:sticky;top:0;z-index:50;}
        .ti{max-width:1200px;margin:0 auto;padding:13px 24px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;}
        .logo{font-family:'Bebas Neue',sans-serif;font-size:22px;color:#fff;letter-spacing:2px;text-decoration:none;}
        .logo span{color:#C9951A;}
        .bc{display:flex;align-items:center;gap:7px;font-size:13px;}
        .bc a{color:#C9951A;font-weight:700;text-decoration:none;}
        .bcs{color:#444;font-size:14px;}
        .bcc{color:#fff;font-weight:700;}

        .hero{background:linear-gradient(160deg,#fff 0%,#FEF8EC 100%);padding:28px 24px;border-bottom:1px solid #F0EDE8;}
        .hi{max-width:1200px;margin:0 auto;display:flex;align-items:center;gap:16px;}
        .he{font-size:44px;flex-shrink:0;}
        .hn{font-family:'Bebas Neue',sans-serif;font-size:clamp(28px,4vw,40px);color:#111;letter-spacing:2px;margin-bottom:4px;}
        .hc{font-size:13px;color:#888;}
        .hc span{color:#C9951A;font-weight:600;}

        .page{max-width:1200px;margin:0 auto;padding:28px 24px 48px;}
        @media(max-width:767px){.page{padding:20px 16px 40px;}}

        .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;}
        @media(min-width:640px){.grid{grid-template-columns:repeat(3,1fr);}}
        @media(min-width:1024px){.grid{grid-template-columns:repeat(4,1fr);}}

        .card{background:#fff;border:0.5px solid #E0DDD8;border-radius:14px;overflow:hidden;text-decoration:none;display:block;transition:all .18s;position:relative;}
        .card:hover{transform:translateY(-3px);box-shadow:0 6px 20px rgba(0,0,0,.1);border-color:#C9951A;}
        .ci{height:120px;background:#FEF3E2;display:flex;align-items:center;justify-content:center;font-size:40px;overflow:hidden;}
        .ci img{width:100%;height:100%;object-fit:cover;}
        .cb{padding:11px 12px;}
        .ct{font-size:13px;font-weight:600;color:#222;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .cc{font-size:10px;color:#AAA;margin-bottom:4px;}
        .cs{font-size:11px;color:#C9951A;font-weight:600;}
        .ca{font-size:10px;color:#BBB;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:3px;}

        .rm-btn{position:absolute;top:8px;right:8px;width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.95);border:0.5px solid #E0DDD8;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,.1);transition:all .15s;z-index:2;}
        .rm-btn:hover{background:#FEE;border-color:#E24B4A;}

        .sk{background:linear-gradient(90deg,#F0EDE8 25%,#E8E4DD 50%,#F0EDE8 75%);background-size:200% 100%;animation:sh 1.5s infinite;border-radius:14px;}
        @keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}

        .empty{text-align:center;padding:60px 20px;}
        .empty-ico{font-size:56px;margin-bottom:16px;}
        .empty-title{font-size:20px;font-weight:700;color:#111;margin-bottom:8px;}
        .empty-sub{font-size:13px;color:#AAA;margin-bottom:24px;line-height:1.7;}
        .btn-explore{display:inline-block;padding:12px 28px;background:#C9951A;color:#fff;border-radius:12px;text-decoration:none;font-size:14px;font-weight:700;transition:opacity .15s;}
        .btn-explore:hover{opacity:.9;}

        .footer{padding:24px 0 0;text-align:center;font-size:12px;color:#AAA;border-top:0.5px solid #F0EDE8;margin-top:24px;}
        .footer a{color:#C9951A;text-decoration:none;}
      `}</style>

      <div className="topbar">
        <div className="ti">
          <a className="logo" href="/">TRINDADE <span>ONLINE</span></a>
          <div className="bc">
            <a href="/">Início</a>
            <span className="bcs">›</span>
            <span className="bcc">Meus Favoritos</span>
          </div>
          <div/>
        </div>
      </div>

      <div className="hero">
        <div className="hi">
          <div className="he">❤️</div>
          <div>
            <div className="hn">MEUS FAVORITOS</div>
            <div className="hc">
              {loading ? 'Carregando...' : favs.length === 0
                ? 'Nenhuma empresa salva ainda'
                : <>Você salvou <span>{favs.length}</span> empresa{favs.length !== 1 ? 's' : ''}</>
              }
            </div>
          </div>
        </div>
      </div>

      <div className="page">
        {loading && (
          <div className="grid">
            {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="sk" style={{height:190}}/>)}
          </div>
        )}

        {!loading && favs.length > 0 && (
          <div className="grid">
            {favs.map(f => {
              const c = f.company
              const cover = getCover(c)
              return (
                <div key={f.id} style={{position:'relative'}}>
                  <a className="card" href={`/empresa/${c.slug}`}>
                    <div className="ci">
                      {cover ? <img src={cover} alt={c.name}/> : <span>{c.category?.emoji || '🏪'}</span>}
                    </div>
                    <div className="cb">
                      <div className="ct">{c.name}</div>
                      <div className="cc">{c.category?.emoji} {c.category?.name || '—'}</div>
                      {(c.avg_rating || 0) > 0 && <div className="cs">★ {Number(c.avg_rating).toFixed(1)}</div>}
                      {c.address && <div className="ca">📍 {c.address}</div>}
                    </div>
                  </a>
                  <button className="rm-btn" onClick={() => removeFav(f.id)} title="Remover dos favoritos">🗑</button>
                </div>
              )
            })}
          </div>
        )}

        {!loading && favs.length === 0 && (
          <div className="empty">
            <div className="empty-ico">❤️</div>
            <div className="empty-title">Nenhum favorito ainda</div>
            <div className="empty-sub">
              Explore as empresas da Trindade e salve<br/>as que você mais gosta clicando em "Salvar nos favoritos".
            </div>
            <a className="btn-explore" href="/">← Explorar empresas</a>
          </div>
        )}

        {!loading && favs.length > 0 && (
          <div className="footer">
            <a href="/">← Voltar ao Trindade Online</a>
          </div>
        )}
      </div>
    </>
  )
}