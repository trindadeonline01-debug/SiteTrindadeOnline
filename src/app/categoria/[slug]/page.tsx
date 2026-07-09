'use client'

import React, { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'

type Category    = { id: string; name: string; emoji: string; slug: string }
type Subcategory = { id: string; name: string; emoji: string; slug?: string }
type Highlight   = { id: string; company: { name: string; slug: string; photos?: any[]; category?: any; avg_rating?: number } }
type Company     = {
  id: string; name: string; slug: string
  avg_rating?: number; address?: string; plan?: string
  photos?: any[]; subcategories?: any[]
}

/* ── SVG por slug de categoria (mesmo estilo da home) ── */
function CategorySVG({ slug, size = 56, color = '#C9951A' }: { slug: string; size?: number; color?: string }) {
  const s = { width: size, height: size, stroke: color, strokeWidth: 0.8, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, flexShrink: 0 }
  const paths: Record<string, React.ReactElement> = {
    comercios: (
      <svg viewBox="0 0 24 24" style={s}>
        <path d="M3 9l1-5h16l1 5"/>
        <path d="M3 9a2 2 0 0 0 2 2 2 2 0 0 0 2-2 2 2 0 0 0 2 2 2 2 0 0 0 2-2 2 2 0 0 0 2 2 2 2 0 0 0 2-2"/>
        <path d="M5 20v-9"/><path d="M19 20v-9"/>
        <rect x="9" y="14" width="6" height="6"/>
        <path d="M3 20h18"/>
      </svg>
    ),
    servicos: (
      <svg viewBox="0 0 24 24" style={s}>
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
      </svg>
    ),
    gastronomia: (
      <svg viewBox="0 0 24 24" style={s}>
        <path d="M12 2 L22 20 Q12 23 2 20 Z"/>
        <path d="M5.5 18.5 Q12 22 18.5 18.5"/>
        <circle cx="12" cy="10" r="1"/>
        <circle cx="9" cy="14" r="0.8"/>
        <circle cx="15" cy="14" r="0.8"/>
      </svg>
    ),
    empregos: (
      <svg viewBox="0 0 24 24" style={s}>
        <rect x="2" y="7" width="20" height="14" rx="2"/>
        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
        <path d="M2 12h20"/>
      </svg>
    ),
    imoveis: (
      <svg viewBox="0 0 24 24" style={s}>
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/>
        <path d="M9 21V12h6v9"/>
      </svg>
    ),
    desapega: (
      <svg viewBox="0 0 24 24" style={s}>
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
        <line x1="7" y1="7" x2="7.01" y2="7"/>
      </svg>
    ),
    'achados-perdidos': (
      <svg viewBox="0 0 24 24" style={s}>
        <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/>
        <circle cx="12" cy="10" r="3"/>
      </svg>
    ),
    igrejas: (
      <svg viewBox="0 0 24 24" style={s}>
        <path d="M12 2v4M10 4h4"/>
        <path d="M5 10l7-4 7 4v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V10z"/>
        <path d="M10 21v-7h4v7"/>
      </svg>
    ),
  }
  return paths[slug] || (
    <svg viewBox="0 0 24 24" style={s}>
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M3 9h18M9 21V9"/>
    </svg>
  )
}

export default function CategoriaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)

  const [category, setCategory]     = useState<Category | null>(null)
  const [subcats, setSubcats]       = useState<Subcategory[]>([])
  const [companies, setCompanies]   = useState<Company[]>([])
  const [filtered, setFiltered]     = useState<Company[]>([])
  const [sortOrder, setSortOrder]     = useState<'az'|'rating'|'recent'>('az')
  const [activeSub, setActiveSub]   = useState<string | null>(null)
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [loading, setLoading]       = useState(true)
  const [notFound, setNotFound]     = useState(false)
  const [search, setSearch]         = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: cat } = await supabase
      .from('categories').select('*').eq('slug', slug).maybeSingle()
    if (!cat) { setNotFound(true); setLoading(false); return }
    setCategory(cat)

    const { data: subs } = await supabase
      .from('subcategories').select('id, name, emoji, slug')
      .eq('category_id', cat.id).order('order')
    setSubcats(subs || [])

    const { data: comps } = await supabase
      .from('companies')
      .select('id, name, slug, avg_rating, address, plan, photos:company_photos(url,order), subcategories:company_subcategories(subcategory:subcategories(id,name,emoji))')
      .eq('status', 'active').eq('category_id', cat.id)
      .order('avg_rating', { ascending: false })
    const list = (comps || []) as Company[]
    setCompanies(list); setFiltered(list)

    const { data: hlData } = await supabase
      .from('highlights')
      .select('id, company_id, company:companies(name,slug,avg_rating,category:categories(name,emoji))')
      .eq('active', true)
      .eq('level', 'category')
      .eq('category_id', cat.id)
      .order('display_order')

    if (hlData && hlData.length > 0) {
      const ids = hlData.map((h: any) => h.company_id)
      const { data: photos } = await supabase
        .from('company_photos').select('company_id,url,order').in('company_id', ids).order('order')
      setHighlights([...hlData].sort(() => Math.random() - 0.5).map((h: any) => ({
        ...h, company: { ...h.company, photos: photos?.filter((p: any) => p.company_id === h.company_id) || [] }
      })) as Highlight[])
    }

    setLoading(false)
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

  function getCover(photos?: any[]): string | null {
    if (!photos?.length) return null
    return [...photos].sort((a, b) => a.order - b.order)[0]?.url || null
  }

  if (notFound) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100vh', fontFamily:'Inter,sans-serif', padding:24, background:'#F0EDE8' }}>
      <div style={{ fontSize:56, marginBottom:16 }}>📂</div>
      <div style={{ fontSize:20, fontWeight:700, marginBottom:8 }}>Categoria não encontrada</div>
      <a href="/" style={{ background:'#C9951A', color:'#fff', padding:'12px 28px', borderRadius:12, textDecoration:'none', fontWeight:600, marginTop:16 }}>← Voltar ao início</a>
    </div>
  )

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; background: #F0EDE8; }

        /* ── TOPBAR ── */
        .topbar { background: #111; position: sticky; top: 0; z-index: 50; }
        .topbar-inner { max-width: 1200px; margin: 0 auto; padding: 13px 24px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .t-logo { font-family: 'Bebas Neue', sans-serif; font-size: 24px; color: #fff; letter-spacing: 2px; text-decoration: none; flex-shrink: 0; }
        .t-logo span { color: #C9951A; }
        .t-bc { display: flex; align-items: center; gap: 7px; font-size: 13px; }
        .t-bc a { color: #C9951A; font-weight: 700; text-decoration: none; }
        .t-bc a:hover { text-decoration: underline; }
        .t-bc-sep { color: #444; font-size: 14px; }
        .t-bc-cur { color: #fff; font-weight: 700; }
        .t-actions { display: none; align-items: center; gap: 8px; }
        @media(min-width: 768px) { .t-actions { display: flex; } }
        .t-btn-entrar { color: #C9951A; font-size: 13px; font-weight: 600; border: 1.5px solid #C9951A; border-radius: 10px; padding: 7px 14px; text-decoration: none; }
        .t-btn-cad { background: #C9951A; color: #fff; font-size: 13px; font-weight: 600; border-radius: 10px; padding: 8px 14px; text-decoration: none; }

        /* ── HERO centralizado ── */
        .cat-hero { background: #111; padding: 32px 24px 28px; border-bottom: 2px solid #C9951A; }
        .cat-hero-inner { display: flex; align-items: center; justify-content: center; gap: 18px; }
        .cat-nm { font-family: 'Bebas Neue', sans-serif; font-size: clamp(32px,5vw,48px); color: #fff; letter-spacing: 3px; line-height: 1; margin-bottom: 6px; }
        .cat-cnt { font-size: 13px; color: #666; }
        .cat-cnt span { color: #C9951A; font-weight: 600; }

        /* ── BUSCA ── */
        .search-bar-wrap { background: #F0EDE8; padding: 0 24px; }
        .search-bar-inner { max-width: 640px; margin: 0 auto; transform: translateY(-20px); }
        .search-bar { display: flex; align-items: center; gap: 10px; background: #fff; border: 2px solid #C9951A; border-radius: 30px; padding: 13px 20px; box-shadow: 0 4px 20px rgba(0,0,0,.12); }
        .search-bar input { flex: 1; border: none; background: transparent; font-size: 15px; font-family: 'Inter', sans-serif; color: #222; outline: none; }
        .search-bar input::placeholder { color: #BBB; }

        .page { max-width: 1200px; margin: 0 auto; padding: 8px 24px 48px; }

        @media(max-width: 767px) {
          .topbar-inner, .page { padding-left: 16px; padding-right: 16px; }
          .search-bar-wrap { padding: 0 16px; }
          .search-bar-inner { max-width: 100%; }
        }

        .sec-label { font-family: 'Bebas Neue', sans-serif; font-size: 20px; color: #AAA; letter-spacing: 1.5px; margin-bottom: 12px; display: flex; align-items: center; gap: 10px; }
        .sec-label::after { content: ''; flex: 1; height: 0.5px; background: #ddd; }

        /* DESTAQUES — carrossel */
        .dest-grid { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 8px; scrollbar-width: none; margin-bottom: 28px; }
        .dest-grid::-webkit-scrollbar { display: none; }
        .dest-card { flex-shrink: 0; width: 140px; background: #fff; border: 1.5px solid #C9951A; border-radius: 12px; overflow: hidden; text-decoration: none; display: block; transition: all .18s; }
        .dest-card:hover { transform: translateY(-3px); box-shadow: 0 6px 20px rgba(0,0,0,.1); }
        @media(min-width: 768px) { .dest-card { width: 180px; } }
        .dest-img { width: 100%; height: 117px; background: #FEF3E2; display: flex; align-items: center; justify-content: center; font-size: 32px; overflow: hidden; position: relative; }
        .dest-img img { width: 100%; height: 100%; object-fit: cover; }
        .dest-badge { position: absolute; top: 6px; left: 6px; background: #C9951A; color: #111; font-size: 8px; font-weight: 700; padding: 2px 6px; border-radius: 3px; letter-spacing: 0.5px; }
        .dest-body { padding: 8px 10px; }
        .dest-name { font-size: 11px; font-weight: 600; color: #111; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dest-stars { font-size: 10px; color: #C9951A; font-weight: 600; }

        /* SUBCATEGORIAS */
        .subcat-wrap { background: #fff; border: 1px solid #e0e0e0; border-radius: 12px; padding: 16px 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); margin-bottom: 24px; }
        .subcat-pills { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 20px; }
        .subcat-pill { display: inline-flex; align-items: center; gap: 5px; padding: 5px 12px; border-radius: 20px; border: 0.5px solid #E0DDD8; background: #fff; font-size: 12px; font-weight: 500; color: #555; cursor: pointer; white-space: nowrap; transition: all .15s; }
        .subcat-pill:hover { border-color: #C9951A; color: #854F0B; background: #FEF3E2; }
        .subcat-pill.on { background: #FEF3E2; border-color: #F5C77A; color: #854F0B; font-weight: 600; }
        .subcat-emoji-box { width: 48px; height: 48px; border-radius: 10px; border: 1.5px solid #e0e0e0; background: #fafafa; display: flex; align-items: center; justify-content: center; font-size: 24px; transition: border-color 0.15s; }
        .subcat-label { font-size: 10.5px; color: #555; text-align: center; line-height: 1.3; font-weight: 500; transition: color 0.15s; }

        .result-cnt { font-size: 13px; color: #AAA; margin-bottom: 16px; }
        .result-cnt span { color: #111; font-weight: 600; }

        /* EMPRESAS EM LISTA */
        .companies-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 10px; }
        @media(min-width: 640px) { .companies-grid { grid-template-columns: repeat(3,1fr); } }
        @media(min-width: 1024px) { .companies-grid { grid-template-columns: repeat(4,1fr); } }
        .cc { background: #fff; border: 0.5px solid #E0DDD8; border-radius: 12px; overflow: hidden; text-decoration: none; transition: all .18s; display: block; }
        .cc:hover { transform: translateY(-2px); border-color: #C9951A; }
        .cc-img { height: 90px; background: #FEF3E2; display: flex; align-items: center; justify-content: center; font-size: 32px; overflow: hidden; }
        .cc-img img { width: 100%; height: 100%; object-fit: cover; }
        .cc-body { padding: 10px 12px; }
        .cc-name { font-size: 13px; font-weight: 600; color: #111; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cc-stars { font-size: 11px; color: #C9951A; font-weight: 600; margin-bottom: 3px; }
        .cc-subs { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
        .cc-sub { font-size: 10px; background: #F5F2EC; color: #666; padding: 2px 7px; border-radius: 10px; }
        .cc-addr { font-size: 11px; color: #BBB; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cc-arrow { flex-shrink: 0; color: #CCC; }

        .sk { background: linear-gradient(90deg,#F0EDE8 25%,#E8E4DD 50%,#F0EDE8 75%); background-size: 200% 100%; animation: sh 1.5s infinite; border-radius: 12px; }
        @keyframes sh { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

        .empty { text-align: center; padding: 56px 20px; color: #AAA; }
        .empty-ico { font-size: 48px; margin-bottom: 14px; }
        .empty-title { font-size: 16px; font-weight: 600; color: #555; margin-bottom: 6px; }
        .empty-sub { font-size: 13px; line-height: 1.7; }
        .btn-clear { margin-top: 16px; display: inline-block; padding: 9px 22px; background: #FEF3E2; color: #C9951A; border: 1px solid #C9951A; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: 'Inter', sans-serif; }
      `}</style>

      {/* TOPBAR */}
      <div className="topbar">
        <div className="topbar-inner">
          <a className="t-logo" href="/">TRINDADE <span>ONLINE</span></a>
          <div className="t-bc">
            <a href="/">Início</a>
            <span className="t-bc-sep">›</span>
            <span className="t-bc-cur">{category?.name || '...'}</span>
          </div>
          <div className="t-actions">
            <a className="t-btn-entrar" href="/login">Entrar</a>
            <a className="t-btn-cad" href="/empresa/cadastrar">+ Cadastrar empresa</a>
          </div>
        </div>
      </div>

      {/* HERO centralizado com SVG */}
      {category && (
        <div className="cat-hero">
          <div className="cat-hero-inner">
            <CategorySVG slug={slug} size={56} color="#C9951A" />
            <div>
              <div className="cat-nm">{category.name}</div>
              <div className="cat-cnt">
                <span>{companies.length}</span> empresa{companies.length !== 1 ? 's' : ''} cadastrada{companies.length !== 1 ? 's' : ''} na Trindade
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BUSCA centralizada */}
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
              <button onClick={() => { setSearch(''); setFiltered(companies) }} style={{ background:'none', border:'none', cursor:'pointer', color:'#AAA', fontSize:18, lineHeight:1 }}>✕</button>
            )}
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
                        ? <img src={cover} alt={h.company.name} />
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
            <div className="subcat-pills">
              <div className={`subcat-pill ${!activeSub ? 'on' : ''}`} onClick={() => filterBySub(null)}>
                Todas ({companies.length})
              </div>
              {subcats.map(s => {
                const cnt = companies.filter(c => c.subcategories?.some((cs: any) => cs.subcategory?.id === s.id)).length
                if (cnt === 0) return null
                return (
                  <div key={s.id} className={`subcat-pill ${activeSub === s.id ? 'on' : ''}`} onClick={() => filterBySub(s.id)}>
                    {s.emoji} {s.name} ({cnt})
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* 3. EMPRESAS */}
        {!loading && filtered.length > 0 && (
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,flexWrap:'wrap',gap:8}}>
            <div/>
            <div style={{display:'flex',gap:6,alignItems:'center'}}>
              <span style={{fontSize:11,color:'#999'}}>Ordenar:</span>
              {([['az','A–Z'],['rating','Melhor avaliado'],['recent','Mais recente']] as const).map(([v,l])=>(
                <button key={v} onClick={()=>setSortOrder(v)}
                  style={{padding:'5px 12px',borderRadius:8,border:'0.5px solid',borderColor:sortOrder===v?'#888':'#E0DDD8',background:sortOrder===v?'#F5F2EC':'#fff',color:sortOrder===v?'#111':'#888',fontSize:11,fontWeight:500,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}
        {!loading && (
          <div className="result-cnt">
            Mostrando <span>{filtered.length}</span> empresa{filtered.length !== 1 ? 's' : ''}
            {activeSub && ` em ${subcats.find(s => s.id === activeSub)?.name}`}
            {search && ` para "${search}"`}
          </div>
        )}

        {loading && (
          <div className="companies-grid">
            {[1,2,3,4,5,6,7,8].map(i => (
              <div key={i} className="sk" style={{ aspectRatio: '1' }} />
            ))}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="companies-grid">
            {[...filtered].sort((a,b)=>{
              if(sortOrder==='az') return a.name.localeCompare(b.name,'pt')
              if(sortOrder==='rating') return (b.avg_rating||0)-(a.avg_rating||0)
              return 0
            }).map(c => {
              const cover = getCover(c.photos)
              const subs = c.subcategories?.map((s:any)=>s.subcategory).filter(Boolean).slice(0,2) || []
              return (
                <a key={c.id} className="cc" href={`/empresa/${c.slug}`}>
                  <div className="cc-img">
                    {cover
                      ? <img src={cover} alt={c.name} />
                      : <span>{category?.emoji || '🏪'}</span>
                    }
                  </div>
                  <div className="cc-body">
                    <div className="cc-name">{c.name}</div>
                    {(c.avg_rating || 0) > 0 && (
                      <div className="cc-stars">★ {Number(c.avg_rating).toFixed(1)}</div>
                    )}
                    {subs.length > 0 && (
                      <div className="cc-subs">{subs.map((s:any,i:number)=><span key={i} className="cc-sub">{s.emoji} {s.name}</span>)}</div>
                    )}
                    {c.address && c.plan === 'paid' && (
                      <div className="cc-addr">📍 {c.address}</div>
                    )}
                  </div>
                  <svg className="cc-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
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