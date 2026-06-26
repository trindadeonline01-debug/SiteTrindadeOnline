'use client'

import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'

type Category    = { id: string; name: string; emoji: string; slug: string }
type Subcategory = { id: string; name: string; emoji: string }
type Highlight   = { id: string; company: { name: string; slug: string; photos?: any[]; category?: any } }
type Company     = {
  id: string; name: string; slug: string
  avg_rating?: number; address?: string
  photos?: any[]; subcategories?: any[]
}

export default function CategoriaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)

  const [category, setCategory]   = useState<Category | null>(null)
  const [subcats, setSubcats]     = useState<Subcategory[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [filtered, setFiltered]   = useState<Company[]>([])
  const [activeSub, setActiveSub] = useState<string | null>(null)
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [loading, setLoading]     = useState(true)
  const [notFound, setNotFound]   = useState(false)
  const [search, setSearch]       = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: cat } = await supabase
      .from('categories').select('*').eq('slug', slug).maybeSingle()
    if (!cat) { setNotFound(true); setLoading(false); return }
    setCategory(cat)

    const { data: subs } = await supabase
      .from('subcategories').select('id, name, emoji')
      .eq('category_id', cat.id).order('order')
    setSubcats(subs || [])

    const { data: comps } = await supabase
      .from('companies')
      .select('id, name, slug, avg_rating, address, photos:company_photos(url,order), subcategories:company_subcategories(subcategory:subcategories(id,name,emoji))')
      .eq('status', 'active').eq('category_id', cat.id)
      .order('avg_rating', { ascending: false })

    const list = (comps || []) as Company[]
    setCompanies(list); setFiltered(list); setLoading(false)
  }

  function filterBySub(subId: string | null) {
    setActiveSub(subId); setSearch('')
    setFiltered(!subId ? companies : companies.filter(c =>
      c.subcategories?.some((s: any) => s.subcategory?.id === subId)
    ))
  }

  function handleSearch(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value; setSearch(q); setActiveSub(null)
    setFiltered(!q.trim() ? companies : companies.filter(c =>
      c.name.toLowerCase().includes(q.toLowerCase()) ||
      c.address?.toLowerCase().includes(q.toLowerCase())
    ))
  }

  function getCover(c: Company): string | null {
    if (!c.photos?.length) return null
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

        .topbar{background:#111;position:sticky;top:0;z-index:50;}
        .topbar-inner{max-width:1200px;margin:0 auto;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;}
        .t-logo{font-family:'Bebas Neue',sans-serif;font-size:24px;color:#fff;letter-spacing:2px;text-decoration:none;}
        .t-logo span{color:#C9951A;}
        .t-back{color:#888;font-size:13px;font-weight:500;text-decoration:none;display:flex;align-items:center;gap:5px;transition:color .15s;}
        .t-back:hover{color:#fff;}

        .cat-hero{background:#111;padding:28px 24px 24px;border-bottom:2px solid #C9951A;}
        .cat-hero-inner{max-width:1200px;margin:0 auto;display:flex;align-items:center;gap:18px;}
        .cat-emoji{font-size:56px;flex-shrink:0;}
        .cat-nm{font-family:'Bebas Neue',sans-serif;font-size:clamp(32px,5vw,48px);color:#fff;letter-spacing:3px;line-height:1;margin-bottom:6px;}
        .cat-cnt{font-size:13px;color:#666;}
        .cat-cnt span{color:#C9951A;font-weight:600;}

        .search-bar-wrap{background:#F0EDE8;padding:0 24px;}
        .search-bar-inner{max-width:1200px;margin:0 auto;padding:0;transform:translateY(-20px);}
        .search-bar{display:flex;align-items:center;gap:10px;background:#fff;border:2px solid #C9951A;border-radius:30px;padding:13px 20px;box-shadow:0 4px 20px rgba(0,0,0,.12);}
        .search-bar input{flex:1;border:none;background:transparent;font-size:15px;font-family:'Inter',sans-serif;color:#222;outline:none;}
        .search-bar input::placeholder{color:#BBB;}

        .page{max-width:1200px;margin:0 auto;padding:8px 24px 48px;background:#fff;min-height:100vh;}
        @media(max-width:767px){
          .topbar-inner,.cat-hero-inner,.search-bar-inner,.page{padding-left:16px;padding-right:16px;}
          .search-bar-wrap{padding:0 16px;}
        }

        .breadcrumb{display:flex;align-items:center;gap:6px;font-size:12px;color:#AAA;margin-bottom:20px;}
        .breadcrumb a{color:#C9951A;text-decoration:none;}
        .breadcrumb a:hover{text-decoration:underline;}

        .filters-lbl{font-family:'Bebas Neue',sans-serif;font-size:11px;color:#AAA;letter-spacing:1.5px;margin-bottom:10px;}
        .filters-row{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:20px;}
        .chip{padding:7px 14px;border-radius:20px;font-size:12px;font-weight:500;cursor:pointer;border:1px solid #E0DDD8;background:#FAFAF8;color:#666;transition:all .15s;font-family:'Inter',sans-serif;}
        .chip:hover{border-color:#C9951A;background:#FEF3E2;color:#854F0B;}
        .chip.on{border-color:#C9951A;background:#C9951A;color:#fff;font-weight:600;}
        @media(min-width:640px){.hl-grid{grid-template-columns:repeat(3,1fr) !important;}}
        @media(min-width:1024px){.hl-grid{grid-template-columns:repeat(4,1fr) !important;}}

        .result-cnt{font-size:13px;color:#AAA;margin-bottom:16px;}
        .result-cnt span{color:#111;font-weight:600;}

        .companies-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;}
        @media(min-width:640px){.companies-grid{grid-template-columns:repeat(3,1fr);}}
        @media(min-width:1024px){.companies-grid{grid-template-columns:repeat(4,1fr);}}

        .cc{background:#fff;border:0.5px solid #E0DDD8;border-radius:14px;overflow:hidden;text-decoration:none;display:block;transition:all .18s;}
        .cc:hover{transform:translateY(-3px);box-shadow:0 6px 20px rgba(0,0,0,.1);border-color:#C9951A;}
        .cc-img{height:110px;background:#FEF3E2;display:flex;align-items:center;justify-content:center;font-size:40px;overflow:hidden;}
        .cc-img img{width:100%;height:100%;object-fit:cover;}
        .cc-body{padding:11px 12px;}
        .cc-name{font-size:13px;font-weight:600;color:#222;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .cc-sub{font-size:10px;color:#AAA;margin-bottom:4px;}
        .cc-stars{font-size:11px;color:#C9951A;font-weight:600;margin-bottom:3px;}
        .cc-addr{font-size:10px;color:#BBB;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}

        .sk{background:linear-gradient(90deg,#F0EDE8 25%,#E8E4DD 50%,#F0EDE8 75%);background-size:200% 100%;animation:sh 1.5s infinite;border-radius:14px;}
        @keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}

        .empty{text-align:center;padding:56px 20px;color:#AAA;}
        .empty-ico{font-size:48px;margin-bottom:14px;}
        .empty-title{font-size:16px;font-weight:600;color:#555;margin-bottom:6px;}
        .empty-sub{font-size:13px;line-height:1.7;}
        .btn-clear{margin-top:16px;display:inline-block;padding:9px 22px;background:#FEF3E2;color:#C9951A;border:1px solid #C9951A;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;}
      `}</style>

      {/* TOPBAR */}
      <div className="topbar">
        <div className="topbar-inner">
          <a className="t-logo" href="/">TRINDADE <span>ONLINE</span></a>
          <a className="t-back" href="/">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            Início
          </a>
        </div>
      </div>

      {/* HERO */}
      {category && (
        <div className="cat-hero">
          <div className="cat-hero-inner">
            <div className="cat-emoji">{category.emoji}</div>
            <div>
              <div className="cat-nm">{category.name}</div>
              <div className="cat-cnt">
                <span>{companies.length}</span> empresa{companies.length !== 1 ? 's' : ''} cadastrada{companies.length !== 1 ? 's' : ''} na Trindade
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BUSCA FLUTUANTE */}
      <div className="search-bar-wrap">
        <div className="search-bar-inner">
          <div className="search-bar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9951A" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              placeholder={`Buscar dentro de ${category?.name || 'categoria'}...`}
              value={search}
              onChange={handleSearch}
            />
            {search && (
              <button onClick={() => { setSearch(''); setFiltered(companies) }} style={{background:'none',border:'none',cursor:'pointer',color:'#AAA',fontSize:18,lineHeight:1}}>✕</button>
            )}
          </div>
        </div>
      </div>

      {/* CONTEÚDO */}
      <div className="page">
        <div className="breadcrumb">
          <a href="/">Início</a>
          <span>›</span>
          <span>{category?.name || '...'}</span>
        </div>


        {/* DESTAQUES */}
        {highlights.length > 0 && (
          <div style={{marginBottom:28}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
              <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:12,color:'#AAA',letterSpacing:'1.5px'}}>EM DESTAQUE</span>
              <div style={{flex:1,height:'0.5px',background:'#F0EDE8'}}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:10}}>
              {highlights.map(h => {
                const cover = h.company.photos?.length
                  ? [...h.company.photos].sort((a:any,b:any)=>a.order-b.order)[0]?.url
                  : null
                return (
                  <a key={h.id} href={`/empresa/${h.company.slug}`}
                    style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'#FEF8EC',border:'1.5px solid #C9951A',borderRadius:12,textDecoration:'none',transition:'all .15s'}}>
                    <div style={{width:48,height:48,borderRadius:10,overflow:'hidden',flexShrink:0,background:'#FEF3E2',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22}}>
                      {cover ? <img src={cover} alt={h.company.name} style={{width:'100%',height:'100%',objectFit:'cover'}}/> : <span>{h.company.category?.emoji||'🏪'}</span>}
                    </div>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:700,color:'#111',marginBottom:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{h.company.name}</div>
                      <div style={{fontSize:10,color:'#C9951A',fontWeight:600}}>⭐ Destaque</div>
                    </div>
                  </a>
                )
              })}
            </div>
          </div>
        )}

        {subcats.length > 0 && (
          <>
            <div className="filters-lbl">FILTRAR POR SUBCATEGORIA</div>
            <div className="filters-row">
              <div className={`chip ${!activeSub?'on':''}`} onClick={() => filterBySub(null)}>
                Todas ({companies.length})
              </div>
              {subcats.map(s => {
                const cnt = companies.filter(c => c.subcategories?.some((cs:any) => cs.subcategory?.id === s.id)).length
                if (cnt === 0) return null
                return (
                  <div key={s.id} className={`chip ${activeSub===s.id?'on':''}`} onClick={() => filterBySub(s.id)}>
                    {s.emoji} {s.name} ({cnt})
                  </div>
                )
              })}
            </div>
          </>
        )}

        {!loading && (
          <div className="result-cnt">
            Mostrando <span>{filtered.length}</span> empresa{filtered.length !== 1 ? 's' : ''}
            {activeSub && ` em ${subcats.find(s=>s.id===activeSub)?.name}`}
            {search && ` para "${search}"`}
          </div>
        )}

        {loading && (
          <div className="companies-grid">
            {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="sk" style={{height:190}}/>)}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="companies-grid">
            {filtered.map(c => {
              const cover = getCover(c)
              const mainSub = c.subcategories?.[0]?.subcategory
              return (
                <a key={c.id} className="cc" href={`/empresa/${c.slug}`}>
                  <div className="cc-img">
                    {cover ? <img src={cover} alt={c.name}/> : <span>{category?.emoji||'🏪'}</span>}
                  </div>
                  <div className="cc-body">
                    <div className="cc-name">{c.name}</div>
                    {mainSub && <div className="cc-sub">{mainSub.emoji} {mainSub.name}</div>}
                    {(c.avg_rating||0)>0 && <div className="cc-stars">★ {Number(c.avg_rating).toFixed(1)}</div>}
                    {c.address && <div className="cc-addr">📍 {c.address}</div>}
                  </div>
                </a>
              )
            })}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="empty">
            <div className="empty-ico">🔍</div>
            <div className="empty-title">
              {search ? `Nenhum resultado para "${search}"` : 'Nenhuma empresa nesta categoria ainda'}
            </div>
            <div className="empty-sub">
              {search ? 'Tente outro termo ou remova o filtro.' : 'Em breve novos estabelecimentos serão cadastrados aqui.'}
            </div>
            {(search||activeSub) && (
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