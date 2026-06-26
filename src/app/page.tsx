'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

type Category = { id: string; name: string; emoji: string; slug: string }
type Company = {
  id: string; name: string; slug: string; avg_rating?: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  category?: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  photos?: any[]
}
type UserSession = { name?: string; user_type?: string } | null

const STATIC_CATEGORIES = [
  { id:'1', name:'Comércios',          emoji:'🏪', slug:'comercios'        },
  { id:'2', name:'Serviços',           emoji:'🔧', slug:'servicos'         },
  { id:'3', name:'Gastronomia',        emoji:'🍽️', slug:'gastronomia'      },
  { id:'4', name:'Empregos',           emoji:'💼', slug:'empregos'         },
  { id:'5', name:'Imóveis',            emoji:'🏠', slug:'imoveis'          },
  { id:'6', name:'Desapega',           emoji:'🏷️', slug:'desapega'         },
  { id:'7', name:'Achados & Perdidos', emoji:'🔍', slug:'achados-perdidos' },
  { id:'8', name:'Igrejas',            emoji:'⛪', slug:'igrejas'          },
]

export default function Home() {
  const [destaques, setDestaques]   = useState<Company[]>([])
  const [recentes, setRecentes]     = useState<Company[]>([])
  const [session, setSession]       = useState<UserSession>(null)
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')

  useEffect(() => {
    loadAll()
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      if (s) {
        const { data: p } = await supabase.from('profiles').select('name, user_type').eq('id', s.user.id).single()
        setSession(p)
      }
    })
  }, [])

  async function loadAll() {
    setLoading(true)

    // Busca highlights globais (home)
    const { data: hlData } = await supabase
      .from('highlights')
      .select('id, company_id, company:companies(id,name,slug,avg_rating,category:categories(name,emoji))')
      .eq('active', true)
      .eq('level', 'home')
      .order('display_order')

    if (hlData && hlData.length > 0) {
      // Busca fotos separadamente
      const ids = hlData.map((h: any) => h.company_id)
      const { data: photos } = await supabase
        .from('company_photos').select('company_id,url,order').in('company_id', ids).order('order')
      const destWithPhotos = hlData.map((h: any) => ({
        ...h.company,
        photos: photos?.filter((p: any) => p.company_id === h.company_id) || []
      }))
      setDestaques(destWithPhotos as any)
    } else {
      // Fallback: empresas mais bem avaliadas
      const { data: destData } = await supabase
        .from('companies')
        .select('id, name, slug, avg_rating, category:categories(name,emoji), photos:company_photos(url,order)')
        .eq('status', 'active')
        .order('avg_rating', { ascending: false })
        .limit(6)
      setDestaques((destData || []) as any)
    }

    // Busca empresas recém aprovadas
    const { data: recData } = await supabase
      .from('companies')
      .select('id, name, slug, category:categories(name,emoji), photos:company_photos(url,order)')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(6)
    setRecentes((recData || []) as any)

    setLoading(false)
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (search.trim()) window.location.href = `/busca?q=${encodeURIComponent(search.trim())}`
  }

  function getCoverPhoto(company: Company): string | null {
    if (!company.photos || company.photos.length === 0) return null
    const sorted = [...company.photos].sort((a,b) => a.order - b.order)
    return sorted[0]?.url || null
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'Inter',sans-serif;background:#F0EDE8;color:#111;}

        /* HEADER */
        .site-header{background:#fff;border-bottom:1px solid #EDE8E0;position:sticky;top:0;z-index:50;}
        .header-inner{max-width:1200px;margin:0 auto;padding:12px 20px;display:flex;align-items:center;gap:12px;justify-content:space-between;}
        .logo{display:flex;align-items:baseline;flex-shrink:0;text-decoration:none;}
        .logo-main{font-family:'Bebas Neue',sans-serif;font-size:26px;color:#111;letter-spacing:2px;}
        .logo-dot{font-family:'Bebas Neue',sans-serif;font-size:18px;color:#DDD;margin:0 5px;}
        .logo-online{font-family:'Bebas Neue',sans-serif;font-size:26px;color:#C9951A;letter-spacing:2px;}
        .search-wrap{flex:1;display:flex;align-items:center;gap:8px;background:#F5F2EC;border:1.5px solid #C9951A;border-radius:30px;padding:9px 16px;}
        .search-wrap input{flex:1;border:none;background:transparent;font-size:14px;font-family:'Inter',sans-serif;color:#222;outline:none;}
        .search-wrap input::placeholder{color:#BBB;}
        .search-btn{width:28px;height:28px;border-radius:50%;background:#C9951A;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        @media(min-width:768px){.search-wrap{display:none;}.search-btn{display:none;}}
        .btn-login-icon{width:36px;height:36px;border-radius:50%;border:1.5px solid #C9951A;color:#C9951A;display:flex;align-items:center;justify-content:center;text-decoration:none;flex-shrink:0;transition:background .15s;}
        .btn-login-icon:hover{background:#FEF3E2;}
        .btn-entrar{display:none;align-items:center;gap:5px;background:transparent;color:#C9951A;border:1.5px solid #C9951A;border-radius:10px;padding:8px 16px;font-size:13px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;white-space:nowrap;flex-shrink:0;text-decoration:none;transition:background .15s;}
        .btn-entrar:hover{background:#FEF3E2;}
        .btn-cadastrar{display:none;background:#C9951A;color:#fff;border:none;border-radius:10px;padding:9px 16px;font-size:13px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;white-space:nowrap;flex-shrink:0;text-decoration:none;transition:background .15s;}
        .btn-cadastrar:hover{background:#B8841A;}
        .btn-painel{display:none;background:#111;color:#C9951A;border:none;border-radius:10px;padding:9px 16px;font-size:13px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;white-space:nowrap;flex-shrink:0;text-decoration:none;}
        @media(min-width:768px){
          .btn-login-icon{display:none;}
          .btn-entrar{display:flex;}
          .btn-cadastrar,.btn-painel{display:block;}
        }

        /* HERO */
        .hero{background:linear-gradient(160deg,#fff 0%,#FEF8EC 60%,#FEF3E2 100%);padding:40px 20px 36px;text-align:center;border-bottom:1px solid #EDE8E0;}
        .hero-title{font-family:'Bebas Neue',sans-serif;font-size:clamp(42px,6vw,72px);letter-spacing:4px;line-height:1;margin-bottom:8px;display:none;}
        .hero-title span{color:#C9951A;}
        .hero-sub{font-size:clamp(14px,2vw,16px);color:#888;margin-bottom:24px;display:none;}
        .hero-search{display:none;}
        @media(min-width:768px){
          .hero-title,.hero-sub{display:block;}
          .hero{padding:60px 20px 50px;}
          .hero-search{max-width:600px;margin:0 auto;display:flex;align-items:center;gap:8px;background:#fff;border:2px solid #C9951A;border-radius:50px;padding:12px 20px;box-shadow:0 4px 20px rgba(201,149,26,.12);}
          .hero-search input{flex:1;border:none;background:transparent;font-size:15px;font-family:'Inter',sans-serif;color:#222;outline:none;}
          .hero-search input::placeholder{color:#BBB;}
          .hero-search-btn{background:#C9951A;border:none;border-radius:50px;padding:9px 22px;color:#fff;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;}
        }

        /* MAIN */
        .main-wrap{max-width:1200px;margin:0 auto;padding:0 20px;}
        .sec-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;margin-top:28px;}
        .sec-title{font-family:'Bebas Neue',sans-serif;font-size:13px;color:#999;letter-spacing:2px;}
        .sec-link{font-size:12px;color:#C9951A;font-weight:500;cursor:pointer;text-decoration:none;}
        .sec-link:hover{text-decoration:underline;}
        .divider{height:1px;background:#F0EDE8;margin:28px 0 0;}

        /* CATEGORIAS */
        .cat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;}
        @media(min-width:1024px){.cat-grid{grid-template-columns:repeat(8,1fr);gap:14px;}}
        .cat-card{display:flex;flex-direction:column;align-items:center;gap:8px;padding:14px 8px;border-radius:14px;border:1px solid #EDE8E0;background:#FAFAF8;cursor:pointer;transition:all .18s;text-align:center;}
        .cat-card:hover{border-color:#C9951A;background:#FEF3E2;transform:translateY(-2px);box-shadow:0 4px 12px rgba(201,149,26,.15);}
        .cat-emoji{font-size:28px;line-height:1;}
        .cat-name{font-size:11px;font-weight:500;color:#444;line-height:1.3;}
        @media(min-width:1024px){.cat-card{padding:18px 10px;}.cat-emoji{font-size:32px;}.cat-name{font-size:12px;}}

        /* DESTAQUES */
        .dest-grid{display:flex;gap:12px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none;}
        .dest-grid::-webkit-scrollbar{display:none;}
        @media(min-width:768px){.dest-grid{display:grid;grid-template-columns:repeat(3,1fr);overflow:visible;}}
        @media(min-width:1024px){.dest-grid{grid-template-columns:repeat(6,1fr);}}
        .dest-card{flex-shrink:0;width:148px;background:#fff;border:0.5px solid #E0DDD8;border-radius:14px;overflow:hidden;cursor:pointer;transition:all .18s;text-decoration:none;}
        .dest-card:hover{transform:translateY(-3px);box-shadow:0 6px 20px rgba(0,0,0,.1);border-color:#C9951A;}
        @media(min-width:768px){.dest-card{width:auto;}}
        .dest-img{height:90px;background:#FEF3E2;display:flex;align-items:center;justify-content:center;font-size:36px;position:relative;overflow:hidden;}
        .dest-img img{width:100%;height:100%;object-fit:cover;}
        .dest-body{padding:10px 11px;}
        .dest-name{font-size:12px;font-weight:600;color:#222;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .dest-cat{font-size:10px;color:#AAA;margin-bottom:5px;}
        .dest-stars{font-size:11px;color:#C9951A;font-weight:600;}

        /* RECENTES */
        .rec-grid{display:flex;flex-direction:column;border:0.5px solid #EDE8E0;border-radius:14px;overflow:hidden;background:#fff;}
        @media(min-width:768px){.rec-grid{display:grid;grid-template-columns:repeat(2,1fr);}}
        @media(min-width:1024px){.rec-grid{grid-template-columns:repeat(3,1fr);}}
        .rec-item{display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:0.5px solid #F5F2EC;cursor:pointer;transition:background .15s;text-decoration:none;}
        .rec-item:hover{background:#FAFAF8;}
        .rec-icon{width:44px;height:44px;border-radius:11px;background:#F0EDE8;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;border:0.5px solid #E0DDD8;overflow:hidden;}
        .rec-icon img{width:100%;height:100%;object-fit:cover;}
        .rec-name{font-size:13px;font-weight:600;color:#222;margin-bottom:2px;}
        .rec-cat{font-size:11px;color:#999;margin-bottom:3px;}
        .rec-new{font-size:10px;color:#0F8050;font-weight:600;}

        /* CTA */
        .cta-section{margin:36px 0 48px;background:linear-gradient(135deg,#1A1A1A,#333);border-radius:20px;padding:36px 32px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:16px;}
        @media(min-width:768px){.cta-section{flex-direction:row;text-align:left;justify-content:space-between;padding:36px 48px;}}
        .cta-title{font-family:'Bebas Neue',sans-serif;font-size:clamp(22px,3vw,30px);color:#fff;letter-spacing:1px;margin-bottom:6px;}
        .cta-title span{color:#C9951A;}
        .cta-sub{font-size:13px;color:#AAA;}
        .cta-btn{background:#C9951A;color:#fff;border:none;border-radius:12px;padding:14px 28px;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;white-space:nowrap;flex-shrink:0;text-decoration:none;display:inline-block;transition:background .15s;}
        .cta-btn:hover{background:#B8841A;}
        .cta-note{font-size:11px;color:#888;margin-top:4px;}

        /* EMPTY STATE */
        .empty-state{text-align:center;padding:32px 20px;color:#AAA;font-size:13px;}

        /* LOADING */
        .skeleton{background:linear-gradient(90deg,#F0EDE8 25%,#E8E4DD 50%,#F0EDE8 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:10px;}
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}

        /* FOOTER */
        .site-footer{background:#111;color:#888;text-align:center;font-size:12px;padding:20px;}
        .site-footer span{color:#C9951A;}
      `}</style>

      {/* HEADER */}
      <header className="site-header">
        <div className="header-inner">
          <a className="logo" href="/">
            <span className="logo-main">TRINDADE</span>
            <span className="logo-dot">·</span>
            <span className="logo-online">ONLINE</span>
          </a>
          <form className="search-wrap" onSubmit={handleSearch}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#AAA" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Empresa, produto, serviço..." value={search} onChange={e => setSearch(e.target.value)} />
            <button type="submit" className="search-btn">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </form>

          {/* Mobile */}
          <a className="btn-login-icon" href={session ? (session.user_type === 'company' ? '/painel' : session.user_type === 'admin' ? '/admin' : '/login') : '/login'} title="Entrar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </a>

          {/* Desktop — agrupado à direita */}
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {session ? (
              <a className="btn-painel" href={session.user_type === 'company' ? '/painel' : session.user_type === 'admin' ? '/admin' : '/'}>
                {session.user_type === 'admin' ? 'Admin →' : session.user_type === 'company' ? 'Meu painel →' : `Olá, ${session.name?.split(' ')[0]}`}
              </a>
            ) : (
              <a className="btn-entrar" href="/login">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                Entrar
              </a>
            )}
            <a className="btn-cadastrar" href="/cadastro?tipo=empresa">+ Cadastrar empresa</a>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="hero">
        <h1 className="hero-title">TRINDADE <span>ONLINE</span></h1>
        <p className="hero-sub">Conectando moradores, comércios e serviços do bairro Trindade</p>
        <form className="hero-search" onSubmit={handleSearch}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9951A" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" placeholder="O que você está procurando?" value={search} onChange={e => setSearch(e.target.value)} />
          <button type="submit" className="hero-search-btn">Buscar</button>
        </form>
      </section>

      {/* CONTEÚDO */}
      <div className="main-wrap">

        {/* CATEGORIAS */}
        <div className="sec-hdr"><span className="sec-title">CATEGORIAS</span></div>
        <div className="cat-grid">
          {STATIC_CATEGORIES.map(cat => (
            <div key={cat.id} className="cat-card" onClick={() => window.location.href = `/categoria/${cat.slug}`}>
              <div className="cat-emoji">{cat.emoji}</div>
              <div className="cat-name">{cat.name}</div>
            </div>
          ))}
        </div>

        <div className="divider" />

        {/* EM DESTAQUE */}
        <div className="sec-hdr">
          <span className="sec-title">EM DESTAQUE</span>
          <a className="sec-link" href="/categoria/comercios">Ver todos</a>
        </div>
        {loading ? (
          <div className="dest-grid">
            {[1,2,3,4,5,6].map(i => <div key={i} className="skeleton" style={{height:148,borderRadius:14}}/>)}
          </div>
        ) : destaques.length === 0 ? (
          <div className="empty-state">Nenhuma empresa cadastrada ainda. Seja o primeiro! 🏪</div>
        ) : (
          <div className="dest-grid">
            {destaques.map(d => {
              const cover = getCoverPhoto(d)
              return (
                <a key={d.id} className="dest-card" href={`/empresa/${d.slug}`}>
                  <div className="dest-img">
                    {cover ? <img src={cover} alt={d.name} /> : <span>{d.category?.emoji || '🏪'}</span>}
                  </div>
                  <div className="dest-body">
                    <div className="dest-name">{d.name}</div>
                    <div className="dest-cat">{d.category?.emoji} {d.category?.name || '—'}</div>
                    {(d.avg_rating || 0) > 0 && <div className="dest-stars">★ {(d.avg_rating || 0).toFixed(1)}</div>}
                  </div>
                </a>
              )
            })}
          </div>
        )}

        <div className="divider" />

        {/* RECÉM CADASTRADOS */}
        <div className="sec-hdr">
          <span className="sec-title">RECÉM CADASTRADOS</span>
          <a className="sec-link" href="/categoria/comercios">Ver todos</a>
        </div>
        {loading ? (
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {[1,2,3].map(i => <div key={i} className="skeleton" style={{height:60,borderRadius:10}}/>)}
          </div>
        ) : recentes.length === 0 ? (
          <div className="empty-state">Nenhuma empresa cadastrada ainda.</div>
        ) : (
          <div className="rec-grid">
            {recentes.map(r => {
              const cover = getCoverPhoto(r)
              return (
                <a key={r.id} className="rec-item" href={`/empresa/${r.slug}`}>
                  <div className="rec-icon">
                    {cover ? <img src={cover} alt={r.name} /> : <span>{r.category?.emoji || '🏪'}</span>}
                  </div>
                  <div>
                    <div className="rec-name">{r.name}</div>
                    <div className="rec-cat">{r.category?.emoji} {r.category?.name || '—'}</div>
                    <div className="rec-new">● Novo · Trindade</div>
                  </div>
                </a>
              )
            })}
          </div>
        )}

        {/* CTA */}
        <div className="cta-section">
          <div>
            <div className="cta-title">SEU NEGÓCIO NO <span>TRINDADE ONLINE</span></div>
            <div className="cta-sub">Alcance milhares de moradores do bairro todos os dias</div>
            <div className="cta-note">30 dias grátis · Sem cartão de crédito</div>
          </div>
          <a className="cta-btn" href="/cadastro?tipo=empresa">+ Cadastrar minha empresa</a>
        </div>

      </div>

      <footer className="site-footer">
        © 2026 <span>Trindade Online</span> · trindadeonline.com.br
      </footer>
    </>
  )
}