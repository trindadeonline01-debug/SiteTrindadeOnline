'use client'

import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'

type Subcategory = { id: string; name: string; emoji: string; slug: string; category: { id: string; name: string; emoji: string; slug: string } }
type Company     = { id: string; name: string; slug: string; avg_rating?: number; address?: string; photos?: any[] }

export default function SubcategoriaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)

  const [subcat, setSubcat]       = useState<Subcategory | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [filtered, setFiltered]   = useState<Company[]>([])
  const [loading, setLoading]     = useState(true)
  const [notFound, setNotFound]   = useState(false)
  const [search, setSearch]       = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: sub } = await supabase
      .from('subcategories')
      .select('*, category:categories(id,name,emoji,slug)')
      .eq('slug', slug)
      .maybeSingle()

    if (!sub) { setNotFound(true); setLoading(false); return }
    setSubcat(sub as Subcategory)

    // Busca empresas que têm essa subcategoria
    const { data: comps } = await supabase
      .from('companies')
      .select('id, name, slug, avg_rating, address, photos:company_photos(url,order)')
      .eq('status', 'active')
      .in('id', 
        (await supabase.from('company_subcategories').select('company_id').eq('subcategory_id', sub.id))
          .data?.map((r: any) => r.company_id) || []
      )
      .order('avg_rating', { ascending: false })

    const list = (comps || []) as Company[]
    setCompanies(list); setFiltered(list); setLoading(false)
  }

  function handleSearch(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value; setSearch(q)
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
      <div style={{fontSize:20,fontWeight:700,marginBottom:8}}>Subcategoria não encontrada</div>
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

        .hero{background:#111;padding:28px 24px 24px;border-bottom:2px solid #C9951A;}
        .hero-inner{max-width:1200px;margin:0 auto;}
        .bc-hero{display:flex;align-items:center;gap:6px;font-size:11px;color:#555;margin-bottom:12px;}
        .bc-hero a{color:#C9951A;text-decoration:none;transition:opacity .15s;}
        .bc-hero a:hover{opacity:.8;}
        .hero-row{display:flex;align-items:center;gap:18px;}
        .hero-emoji{font-size:52px;flex-shrink:0;}
        .hero-cat-badge{display:inline-flex;align-items:center;gap:5px;background:rgba(201,149,26,.15);border:1px solid rgba(201,149,26,.3);border-radius:8px;padding:3px 10px;font-size:11px;color:#C9951A;font-weight:600;margin-bottom:6px;}
        .hero-nm{font-family:'Bebas Neue',sans-serif;font-size:clamp(30px,5vw,46px);color:#fff;letter-spacing:3px;line-height:1;margin-bottom:6px;}
        .hero-cnt{font-size:13px;color:#666;}
        .hero-cnt span{color:#C9951A;font-weight:600;}

        .search-wrap{background:#F0EDE8;padding:0 24px;}
        .search-inner{max-width:1200px;margin:0 auto;transform:translateY(-20px);}
        .search-box{display:flex;align-items:center;gap:10px;background:#fff;border:2px solid #C9951A;border-radius:30px;padding:13px 20px;box-shadow:0 4px 20px rgba(0,0,0,.12);}
        .search-box input{flex:1;border:none;background:transparent;font-size:15px;font-family:'Inter',sans-serif;color:#222;outline:none;}
        .search-box input::placeholder{color:#BBB;}

        .page{max-width:1200px;margin:0 auto;padding:8px 24px 48px;background:#fff;min-height:100vh;}
        @media(max-width:767px){
          .topbar-inner,.hero-inner,.search-inner,.page{padding-left:16px;padding-right:16px;}
          .search-wrap{padding:0 16px;}
        }

        .result-cnt{font-size:13px;color:#AAA;margin-bottom:16px;}
        .result-cnt span{color:#111;font-weight:600;}

        .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;}
        @media(min-width:640px){.grid{grid-template-columns:repeat(3,1fr);}}
        @media(min-width:1024px){.grid{grid-template-columns:repeat(4,1fr);}}

        .cc{background:#fff;border:0.5px solid #E0DDD8;border-radius:14px;overflow:hidden;text-decoration:none;display:block;transition:all .18s;}
        .cc:hover{transform:translateY(-3px);box-shadow:0 6px 20px rgba(0,0,0,.1);border-color:#C9951A;}
        .cc-img{height:110px;background:#FEF3E2;display:flex;align-items:center;justify-content:center;font-size:40px;overflow:hidden;}
        .cc-img img{width:100%;height:100%;object-fit:cover;}
        .cc-body{padding:11px 12px;}
        .cc-name{font-size:13px;font-weight:600;color:#222;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .cc-stars{font-size:11px;color:#C9951A;font-weight:600;margin-bottom:3px;}
        .cc-addr{font-size:10px;color:#BBB;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}

        .sk{background:linear-gradient(90deg,#F0EDE8 25%,#E8E4DD 50%,#F0EDE8 75%);background-size:200% 100%;animation:sh 1.5s infinite;border-radius:14px;}
        @keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}

        .empty{text-align:center;padding:56px 20px;color:#AAA;}
        .empty-ico{font-size:48px;margin-bottom:14px;}
        .empty-title{font-size:16px;font-weight:600;color:#555;margin-bottom:6px;}
        .empty-sub{font-size:13px;line-height:1.7;margin-bottom:16px;}
        .btn-clear{display:inline-block;padding:9px 22px;background:#FEF3E2;color:#C9951A;border:1px solid #C9951A;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;}
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
      {subcat && (
        <div className="hero">
          <div className="hero-inner">
            <div className="bc-hero">
              <a href="/">Início</a>
              <span>›</span>
              <a href={`/categoria/${subcat.category.slug}`}>{subcat.category.name}</a>
              <span>›</span>
              <span style={{color:'#888'}}>{subcat.name}</span>
            </div>
            <div className="hero-row">
              <div className="hero-emoji">{subcat.emoji}</div>
              <div>
                <div className="hero-cat-badge">
                  {subcat.category.emoji} {subcat.category.name}
                </div>
                <div className="hero-nm">{subcat.name}</div>
                <div className="hero-cnt">
                  <span>{companies.length}</span> estabelecimento{companies.length !== 1 ? 's' : ''} na Trindade
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BUSCA */}
      <div className="search-wrap">
        <div className="search-inner">
          <div className="search-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9951A" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              placeholder={`Buscar ${subcat?.name || ''}...`}
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

        {!loading && (
          <div className="result-cnt">
            Mostrando <span>{filtered.length}</span> estabelecimento{filtered.length !== 1 ? 's' : ''}
            {search && ` para "${search}"`}
          </div>
        )}

        {loading && (
          <div className="grid">
            {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="sk" style={{height:190}}/>)}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="grid">
            {filtered.map(c => {
              const cover = getCover(c)
              return (
                <a key={c.id} className="cc" href={`/empresa/${c.slug}`}>
                  <div className="cc-img">
                    {cover ? <img src={cover} alt={c.name}/> : <span>{subcat?.emoji||'🏪'}</span>}
                  </div>
                  <div className="cc-body">
                    <div className="cc-name">{c.name}</div>
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
            <div className="empty-ico">{subcat?.emoji || '🔍'}</div>
            <div className="empty-title">
              {search ? `Nenhum resultado para "${search}"` : `Nenhum estabelecimento em ${subcat?.name} ainda`}
            </div>
            <div className="empty-sub">
              {search ? 'Tente outro termo.' : 'Em breve novos estabelecimentos serão cadastrados aqui.'}
            </div>
            {search && (
              <button className="btn-clear" onClick={() => { setSearch(''); setFiltered(companies) }}>
                Limpar busca
              </button>
            )}
            <div style={{marginTop:16}}>
              <a href={`/categoria/${subcat?.category?.slug}`} style={{color:'#C9951A',fontSize:13,textDecoration:'none'}}>
                ← Ver todos em {subcat?.category?.name}
              </a>
            </div>
          </div>
        )}
      </div>
    </>
  )
}