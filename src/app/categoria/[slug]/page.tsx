'use client'

import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'

type Category    = { id: string; name: string; emoji: string; slug: string }
type Subcategory = { id: string; name: string; emoji: string; slug?: string }
type Highlight   = { id: string; company: { name: string; slug: string; photos?: any[]; category?: any; avg_rating?: number } }
type Company     = {
  id: string; name: string; slug: string
  avg_rating?: number; address?: string
  photos?: any[]; subcategories?: any[]
}

export default function CategoriaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)

  const [category, setCategory]     = useState<Category | null>(null)
  const [subcats, setSubcats]       = useState<Subcategory[]>([])
  const [companies, setCompanies]   = useState<Company[]>([])
  const [filtered, setFiltered]     = useState<Company[]>([])
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
      .select('id, name, slug, avg_rating, address, photos:company_photos(url,order), subcategories:company_subcategories(subcategory:subcategories(id,name,emoji))')
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
      setHighlights(hlData.map((h: any) => ({
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

        .topbar { background: #111; position: sticky; top: 0; z-index: 50; }
        .topbar-inner { max-width: 1200px; margin: 0 auto; padding: 13px 24px; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; }
        .t-logo { font-family: 'Bebas Neue', sans-serif; font-size: 24px; color: #fff; letter-spacing: 2px; text-decoration: none; }
        .t-logo span { color: #C9951A; }
        .t-bc { display: flex; align-items: center; gap: 7px; font-size: 13px; }
        .t-bc a { color: #C9951A; font-weight: 700; text-decoration: none; }
        .t-bc a:hover { text-decoration: underline; }
        .t-bc-sep { color: #444; font-size: 14px; }
        .t-bc-cur { color: #fff; font-weight: 700; }

        .cat-hero { background: #111; padding: 28px 24px 24px; border-bottom: 2px solid #C9951A; }
        .cat-hero-inner { max-width: 1200px; margin: 0 auto; display: flex; align-items: center; gap: 18px; }
        .cat-emoji { font-size: 56px; flex-shrink: 0; }
        .cat-nm { font-family: 'Bebas Neue', sans-serif; font-size: clamp(32px,5vw,48px); color: #fff; letter-spacing: 3px; line-height: 1; margin-bottom: 6px; }
        .cat-cnt { font-size: 13px; color: #666; }
        .cat-cnt span { color: #C9951A; font-weight: 600; }

        .search-bar-wrap { background: #F0EDE8; padding: 0 24px; }
        .search-bar-inner { max-width: 1200px; margin: 0 auto; transform: translateY(-20px); }
        .search-bar { display: flex; align-items: center; gap: 10px; background: #fff; border: 2px solid #C9951A; border-radius: 30px; padding: 13px 20px; box-shadow: 0 4px 20px rgba(0,0,0,.12); }
        .search-bar input { flex: 1; border: none; background: transparent; font-size: 15px; font-family: 'Inter', sans-serif; color: #222; outline: none; }
        .search-bar input::placeholder { color: #BBB; }

        .page { max-width: 1200px; margin: 0 auto; padding: 8px 24px 48px; }

        @media(max-width: 767px) {
          .topbar-inner, .cat-hero-inner, .search-bar-inner, .page { padding-left: 16px; padding-right: 16px; }
          .search-bar-wrap { padding: 0 16px; }
        }

        .sec-label { font-family: 'Bebas Neue', sans-serif; font-size: 11px; color: #AAA; letter-spacing: 1.5px; margin-bottom: 12px; display: flex; align-items: center; gap: 10px; }
        .sec-label::after { content: ''; flex: 1; height: 0.5px; background: #ddd; }

        /* DESTAQUES */
        .dest-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 28px; }
        @media(min-width: 640px)  { .dest-grid { grid-template-columns: repeat(3, 1fr); } }
        @media(min-width: 1024px) { .dest-grid { grid-template-columns: repeat(4, 1fr); } }
        .dest-card { background: #fff; border: 1.5px solid #C9951A; border-radius: 12px; overflow: hidden; text-decoration: none; display: block; transition: all .18s; }
        .dest-card:hover { transform: translateY(-3px); box-shadow: 0 6px 20px rgba(0,0,0,.1); }
        .dest-img { width: 100%; aspect-ratio: 1; background: #FEF3E2; display: flex; align-items: center; justify-content: center; font-size: 36px; overflow: hidden; position: relative; }
        .dest-img img { width: 100%; height: 100%; object-fit: cover; }
        .dest-badge { position: absolute; top: 8px; left: 8px; background: #C9951A; color: #111; font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: 3px; letter-spacing: 0.5px; }
        .dest-body { padding: 10px 12px; }
        .dest-name { font-size: 13px; font-weight: 600; color: #111; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dest-stars { font-size: 11px; color: #C9951A; font-weight: 600; }

        /* SUBCATEGORIAS GRADE */
        .subcat-wrap { background: #fff; border: 1px solid #e0e0e0; border-radius: 12px; padding: 16px 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); margin-bottom: 24px; }
        .subcat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; }
        @media(min-width: 640px)  { .subcat-grid { grid-template-columns: repeat(6, 1fr); } }
        @media(min-width: 1024px) { .subcat-grid { grid-template-columns: repeat(8, 1fr); } }
        .subcat-item { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 12px 6px; border-radius: 8px; cursor: pointer; position: relative; transition: background 0.15s; }
        .subcat-item:hover { background: #fdf6e3; }
        .subcat-item:hover .subcat-label { color: #C9951A; }
        .subcat-item.on { background: #FEF3E2; }
        .subcat-item.on .subcat-label { color: #C9951A; font-weight: 700; }
        .subcat-item.on .subcat-emoji-box { border-color: #C9951A; }
        .subcat-item:not(:last-child)::after { content: ""; position: absolute; right: 0; top: 20%; height: 60%; width: 1px; background: #e8e8e4; }
        .subcat-emoji-box { width: 48px; height: 48px; border-radius: 10px; border: 1.5px solid #e0e0e0; background: #fafafa; display: flex; align-items: center; justify-content: center; font-size: 24px; transition: border-color 0.15s; }
        .subcat-label { font-size: 10.5px; color: #555; text-align: center; line-height: 1.3; font-weight: 500; transition: color 0.15s; }

        .result-cnt { font-size: 13px; color: #AAA; margin-bottom: 16px; }
        .result-cnt span { color: #111; font-weight: 600; }

        /* CARDS QUADRADOS */
        .companies-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
        @media(min-width: 640px)  { .companies-grid { grid-template-columns: repeat(3, 1fr); } }
        @media(min-width: 1024px) { .companies-grid { grid-template-columns: repeat(4, 1fr); } }
        .cc { background: #fff; border-radius: 12px; overflow: hidden; text-decoration: none; display: block; border: 0.5px solid #e8e8e8; transition: all .18s; }
        .cc:hover { transform: translateY(-3px); box-shadow: 0 6px 20px rgba(0,0,0,.08); border-color: #C9951A; }
        .cc-img { width: 100%; aspect-ratio: 1; background: #f5f0e8; display: flex; align-items: center; justify-content: center; font-size: 40px; overflow: hidden; }
        .cc-img img { width: 100%; height: 100%; object-fit: cover; }
        .cc-body { padding: 12px; }
        .cc-name { font-size: 14px; font-weight: 600; color: #111; margin-bottom: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cc-stars { font-size: 12px; color: #C9951A; font-weight: 600; margin-bottom: 3px; }
        .cc-addr { font-size: 11px; color: #BBB; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

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
          <div />
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

        {/* 2. SUBCATEGORIAS GRADE */}
        {subcats.length > 0 && (
          <>
            <div className="sec-label">SUBCATEGORIAS</div>
            <div className="subcat-wrap">
              <div className="subcat-grid">
                {/* Todas */}
                <div
                  className={`subcat-item ${!activeSub ? 'on' : ''}`}
                  onClick={() => filterBySub(null)}
                >
                  <div className="subcat-emoji-box">{category?.emoji || '🏪'}</div>
                  <span className="subcat-label">Todas ({companies.length})</span>
                </div>

                {subcats.map(s => {
                  const cnt = companies.filter(c =>
                    c.subcategories?.some((cs: any) => cs.subcategory?.id === s.id)
                  ).length
                  if (cnt === 0) return null
                  return (
                    <div
                      key={s.id}
                      className={`subcat-item ${activeSub === s.id ? 'on' : ''}`}
                      onClick={() => filterBySub(s.id)}
                    >
                      <div className="subcat-emoji-box">{s.emoji}</div>
                      <span className="subcat-label">{s.name} ({cnt})</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* 3. EMPRESAS */}
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
            {filtered.map(c => {
              const cover = getCover(c.photos)
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
                    {c.address && (
                      <div className="cc-addr">📍 {c.address}</div>
                    )}
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