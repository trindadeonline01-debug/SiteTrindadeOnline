'use client'

import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'

type Category   = { id: string; name: string; emoji: string; slug: string; description?: string }
type Subcategory = { id: string; name: string; emoji: string }
type Company    = {
  id: string; name: string; slug: string; avg_rating?: number; address?: string
  category?: any; photos?: any[]
  subcategories?: { subcategory: { id: string; name: string; emoji: string } }[]
}

export default function CategoriaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)

  const [category, setCategory]     = useState<Category | null>(null)
  const [subcats, setSubcats]       = useState<Subcategory[]>([])
  const [companies, setCompanies]   = useState<Company[]>([])
  const [filtered, setFiltered]     = useState<Company[]>([])
  const [activeSub, setActiveSub]   = useState<string | null>(null)
  const [loading, setLoading]       = useState(true)
  const [notFound, setNotFound]     = useState(false)
  const [search, setSearch]         = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    // Busca a categoria pelo slug
    const { data: cat } = await supabase
      .from('categories')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()

    if (!cat) { setNotFound(true); setLoading(false); return }
    setCategory(cat)

    // Busca subcategorias desta categoria
    const { data: subs } = await supabase
      .from('subcategories')
      .select('id, name, emoji')
      .eq('category_id', cat.id)
      .order('order')
    setSubcats(subs || [])

    // Busca empresas da categoria
    const { data: comps } = await supabase
      .from('companies')
      .select('id, name, slug, avg_rating, address, photos:company_photos(url,order), subcategories:company_subcategories(subcategory:subcategories(id,name,emoji))')
      .eq('status', 'active')
      .eq('category_id', cat.id)
      .order('avg_rating', { ascending: false })
    
    const list = (comps || []) as Company[]
    setCompanies(list)
    setFiltered(list)
    setLoading(false)
  }

  function filterBySub(subId: string | null) {
    setActiveSub(subId)
    setSearch('')
    if (!subId) { setFiltered(companies); return }
    setFiltered(companies.filter(c =>
      c.subcategories?.some(s => s.subcategory.id === subId)
    ))
  }

  function handleSearch(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    setSearch(q)
    setActiveSub(null)
    if (!q.trim()) { setFiltered(companies); return }
    setFiltered(companies.filter(c =>
      c.name.toLowerCase().includes(q.toLowerCase()) ||
      c.address?.toLowerCase().includes(q.toLowerCase())
    ))
  }

  function getCover(c: Company): string | null {
    if (!c.photos || c.photos.length === 0) return null
    return [...c.photos].sort((a,b) => a.order - b.order)[0]?.url || null
  }

  if (notFound) return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'Inter,sans-serif',padding:24,background:'#F0EDE8'}}>
      <div style={{fontSize:56,marginBottom:16}}>📂</div>
      <div style={{fontSize:20,fontWeight:700,marginBottom:8}}>Categoria não encontrada</div>
      <a href="/" style={{background:'#C9951A',color:'#fff',padding:'12px 28px',borderRadius:12,textDecoration:'none',fontWeight:600,marginTop:16}}>← Voltar ao início</a>
    </div>
  )

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'Inter',sans-serif;background:#F0EDE8;}

        /* HEADER */
        .topbar{background:#111;padding:0;position:sticky;top:0;z-index:50;}
        .topbar-inner{max-width:1200px;margin:0 auto;padding:11px 24px;display:flex;align-items:center;gap:14px;}
        .t-logo{font-family:'Bebas Neue',sans-serif;font-size:20px;color:#fff;letter-spacing:2px;text-decoration:none;flex-shrink:0;}
        .t-logo span{color:#C9951A;}
        .t-search{flex:1;display:flex;align-items:center;gap:8px;background:#1A1A1A;border:1.5px solid #333;border-radius:30px;padding:8px 16px;max-width:500px;}
        .t-search input{flex:1;border:none;background:transparent;font-size:13px;font-family:'Inter',sans-serif;color:#fff;outline:none;}
        .t-search input::placeholder{color:#555;}
        .t-back{color:#666;font-size:13px;text-decoration:none;flex-shrink:0;}
        .t-back:hover{color:#fff;}

        /* HERO CATEGORIA */
        .cat-hero{background:linear-gradient(160deg,#111 0%,#1A1A1A 100%);padding:32px 24px 28px;border-bottom:1px solid #222;}
        .cat-hero-inner{max-width:1200px;margin:0 auto;display:flex;align-items:center;gap:16px;}
        .cat-emoji-big{font-size:52px;flex-shrink:0;}
        .cat-hero-name{font-family:'Bebas Neue',sans-serif;font-size:clamp(28px,4vw,42px);color:#fff;letter-spacing:2px;margin-bottom:4px;}
        .cat-hero-count{font-size:13px;color:#888;}
        .cat-hero-count span{color:#C9951A;font-weight:600;}

        /* CONTEÚDO */
        .page{max-width:1200px;margin:0 auto;padding:24px 24px 48px;background:#fff;min-height:100vh;}
        @media(max-width:767px){.page{padding:16px 16px 40px;}}

        /* FILTROS */
        .filters-wrap{margin-bottom:20px;}
        .filters-label{font-family:'Bebas Neue',sans-serif;font-size:11px;color:#AAA;letter-spacing:1.5px;margin-bottom:10px;}
        .filters-row{display:flex;gap:7px;flex-wrap:wrap;}
        .filter-chip{padding:6px 14px;border-radius:20px;font-size:12px;font-weight:500;cursor:pointer;border:1px solid #E0DDD8;background:#FAFAF8;color:#666;transition:all .15s;font-family:'Inter',sans-serif;}
        .filter-chip:hover{border-color:#C9951A;background:#FEF3E2;color:#854F0B;}
        .filter-chip.on{border-color:#C9951A;background:#C9951A;color:#fff;font-weight:600;}

        /* RESULTADO INFO */
        .result-info{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px;}
        .result-count{font-size:13px;color:#AAA;}
        .result-count span{color:#111;font-weight:600;}

        /* GRID */
        .companies-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;}
        @media(min-width:640px){.companies-grid{grid-template-columns:repeat(3,1fr);}}
        @media(min-width:1024px){.companies-grid{grid-template-columns:repeat(4,1fr);}}

        .company-card{background:#fff;border:0.5px solid #E0DDD8;border-radius:14px;overflow:hidden;cursor:pointer;transition:all .18s;text-decoration:none;display:block;}
        .company-card:hover{transform:translateY(-3px);box-shadow:0 6px 20px rgba(0,0,0,.1);border-color:#C9951A;}
        .cc-img{height:110px;background:#FEF3E2;display:flex;align-items:center;justify-content:center;font-size:40px;overflow:hidden;}
        .cc-img img{width:100%;height:100%;object-fit:cover;}
        .cc-body{padding:11px 12px;}
        .cc-name{font-size:13px;font-weight:600;color:#222;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .cc-sub{font-size:10px;color:#AAA;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .cc-stars{font-size:11px;color:#C9951A;font-weight:600;margin-bottom:3px;}
        .cc-addr{font-size:10px;color:#BBB;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}

        /* SKELETON */
        .skeleton{background:linear-gradient(90deg,#F0EDE8 25%,#E8E4DD 50%,#F0EDE8 75%);background-size:200% 100%;animation:sh 1.5s infinite;border-radius:14px;}
        @keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}

        /* EMPTY */
        .empty{text-align:center;padding:48px 20px;color:#AAA;}
        .empty-ico{font-size:48px;margin-bottom:12px;}
        .empty-title{font-size:16px;font-weight:600;color:#555;margin-bottom:6px;}
        .empty-sub{font-size:13px;line-height:1.6;}
        .btn-clear{margin-top:14px;display:inline-block;padding:9px 20px;background:#FEF3E2;color:#C9951A;border:1px solid #C9951A;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;}

        /* BREADCRUMB */
        .breadcrumb{display:flex;align-items:center;gap:6px;font-size:12px;color:#AAA;margin-bottom:20px;}
        .breadcrumb a{color:#C9951A;text-decoration:none;}
        .breadcrumb a:hover{text-decoration:underline;}
      `}</style>

      {/* HEADER */}
      <div className="topbar">
        <div className="topbar-inner">
          <a className="t-logo" href="/">TRINDADE <span>ONLINE</span></a>
          <div className="t-search">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              placeholder={`Buscar em ${category?.name || ''}...`}
              value={search}
              onChange={handleSearch}
            />
          </div>
          <a className="t-back" href="/">← Início</a>
        </div>
      </div>

      {/* HERO */}
      {category && (
        <div className="cat-hero">
          <div className="cat-hero-inner">
            <div className="cat-emoji-big">{category.emoji}</div>
            <div>
              <div className="cat-hero-name">{category.name}</div>
              <div className="cat-hero-count">
                <span>{companies.length}</span> empresa{companies.length !== 1 ? 's' : ''} na Trindade
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="page">

        {/* BREADCRUMB */}
        <div className="breadcrumb">
          <a href="/">Início</a>
          <span>›</span>
          <span>{category?.name || '...'}</span>
        </div>

        {/* FILTROS POR SUBCATEGORIA */}
        {subcats.length > 0 && (
          <div className="filters-wrap">
            <div className="filters-label">FILTRAR POR SUBCATEGORIA</div>
            <div className="filters-row">
              <div
                className={`filter-chip ${!activeSub ? 'on' : ''}`}
                onClick={() => filterBySub(null)}
              >
                Todas ({companies.length})
              </div>
              {subcats.map(s => {
                const cnt = companies.filter(c => c.subcategories?.some(cs => cs.subcategory.id === s.id)).length
                if (cnt === 0) return null
                return (
                  <div
                    key={s.id}
                    className={`filter-chip ${activeSub === s.id ? 'on' : ''}`}
                    onClick={() => filterBySub(s.id)}
                  >
                    {s.emoji} {s.name} ({cnt})
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* CONTAGEM */}
        {!loading && (
          <div className="result-info">
            <div className="result-count">
              Mostrando <span>{filtered.length}</span> empresa{filtered.length !== 1 ? 's' : ''}
              {activeSub && ` · ${subcats.find(s => s.id === activeSub)?.name}`}
              {search && ` · "${search}"`}
            </div>
          </div>
        )}

        {/* LOADING */}
        {loading && (
          <div className="companies-grid">
            {[1,2,3,4,5,6,7,8].map(i => (
              <div key={i} className="skeleton" style={{height:180}}/>
            ))}
          </div>
        )}

        {/* GRID DE EMPRESAS */}
        {!loading && filtered.length > 0 && (
          <div className="companies-grid">
            {filtered.map(c => {
              const cover = getCover(c)
              const mainSub = c.subcategories?.[0]?.subcategory
              return (
                <a key={c.id} className="company-card" href={`/empresa/${c.slug}`}>
                  <div className="cc-img">
                    {cover ? <img src={cover} alt={c.name} /> : <span>{category?.emoji || '🏪'}</span>}
                  </div>
                  <div className="cc-body">
                    <div className="cc-name">{c.name}</div>
                    {mainSub && <div className="cc-sub">{mainSub.emoji} {mainSub.name}</div>}
                    {(c.avg_rating || 0) > 0 && <div className="cc-stars">★ {Number(c.avg_rating).toFixed(1)}</div>}
                    {c.address && <div className="cc-addr">📍 {c.address}</div>}
                  </div>
                </a>
              )
            })}
          </div>
        )}

        {/* VAZIO */}
        {!loading && filtered.length === 0 && (
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