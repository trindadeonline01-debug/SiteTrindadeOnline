'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Company = {
  id: string; name: string; slug: string
  avg_rating?: number; address?: string
  category?: any; photos?: any[]
}

function BuscaContent() {
  const searchParams  = useSearchParams()
  const queryInicial  = searchParams.get('q') || ''

  const [query, setQuery]       = useState(queryInicial)
  const [input, setInput]       = useState(queryInicial)
  const [results, setResults]   = useState<Company[]>([])
  const [loading, setLoading]   = useState(false)
  const [buscou, setBuscou]     = useState(false)

  useEffect(() => {
    if (queryInicial.trim()) buscar(queryInicial)
  }, [])

  async function buscar(q: string) {
    if (!q.trim()) return
    setLoading(true)
    setBuscou(true)
    setQuery(q)

    // Busca empresas por nome ou categoria
    const { data } = await supabase
      .from('companies')
      .select('id, name, slug, avg_rating, address, category:categories(name,emoji), photos:company_photos(url,order)')
      .eq('status', 'active')
      .or(`name.ilike.%${q}%,description.ilike.%${q}%`)
      .order('avg_rating', { ascending: false })
      .limit(30)

    const res = (data || []) as Company[]
    setResults(res)

    // Registra a busca no banco
    await supabase.from('search_logs').insert({
      query: q.trim().toLowerCase(),
      results_count: res.length
    })

    setLoading(false)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    buscar(input)
  }

  function getCover(c: Company): string | null {
    if (!c.photos || c.photos.length === 0) return null
    return [...c.photos].sort((a,b) => a.order - b.order)[0]?.url || null
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'Inter',sans-serif;background:#F0EDE8;}

        .topbar{background:#111;padding:10px 24px;display:flex;align-items:center;gap:16px;position:sticky;top:0;z-index:50;}
        .t-logo{font-family:'Bebas Neue',sans-serif;font-size:20px;color:#fff;letter-spacing:2px;text-decoration:none;flex-shrink:0;}
        .t-logo span{color:#C9951A;}

        .search-form{flex:1;display:flex;align-items:center;gap:8px;background:#1A1A1A;border:1.5px solid #C9951A;border-radius:30px;padding:9px 16px;max-width:600px;}
        .search-form input{flex:1;border:none;background:transparent;font-size:14px;font-family:'Inter',sans-serif;color:#fff;outline:none;}
        .search-form input::placeholder{color:#666;}
        .search-btn{width:28px;height:28px;border-radius:50%;background:#C9951A;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;}

        .t-back{color:#888;font-size:13px;text-decoration:none;flex-shrink:0;}
        .t-back:hover{color:#fff;}

        .page{max-width:1200px;margin:0 auto;padding:28px 20px 48px;background:#fff;min-height:100vh;}

        /* HEADER RESULTADO */
        .result-hdr{margin-bottom:20px;}
        .result-title{font-family:'Bebas Neue',sans-serif;font-size:22px;color:#111;letter-spacing:1px;margin-bottom:4px;}
        .result-title span{color:#C9951A;}
        .result-sub{font-size:13px;color:#AAA;}

        /* FILTROS RÁPIDOS */
        .filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px;}
        .filter-chip{padding:6px 14px;border-radius:20px;font-size:12px;font-weight:500;cursor:pointer;border:1px solid #E0DDD8;background:#FAFAF8;color:#666;transition:all .15s;font-family:'Inter',sans-serif;}
        .filter-chip:hover,.filter-chip.on{border-color:#C9951A;background:#FEF3E2;color:#854F0B;font-weight:600;}

        /* GRID RESULTADOS */
        .results-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;}
        @media(min-width:640px){.results-grid{grid-template-columns:repeat(3,1fr);}}
        @media(min-width:1024px){.results-grid{grid-template-columns:repeat(4,1fr);}}

        .result-card{background:#fff;border:0.5px solid #E0DDD8;border-radius:14px;overflow:hidden;cursor:pointer;transition:all .18s;text-decoration:none;display:block;}
        .result-card:hover{transform:translateY(-3px);box-shadow:0 6px 20px rgba(0,0,0,.1);border-color:#C9951A;}
        .rc-img{height:120px;background:#FEF3E2;display:flex;align-items:center;justify-content:center;font-size:40px;overflow:hidden;}
        .rc-img img{width:100%;height:100%;object-fit:cover;}
        .rc-body{padding:11px 12px;}
        .rc-name{font-size:13px;font-weight:600;color:#222;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .rc-cat{font-size:11px;color:#AAA;margin-bottom:4px;}
        .rc-addr{font-size:10px;color:#BBB;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .rc-stars{font-size:11px;color:#C9951A;font-weight:600;margin-bottom:3px;}

        /* ESTADOS */
        .loading-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;}
        @media(min-width:640px){.loading-grid{grid-template-columns:repeat(3,1fr);}}
        @media(min-width:1024px){.loading-grid{grid-template-columns:repeat(4,1fr);}}
        .skeleton{background:linear-gradient(90deg,#F0EDE8 25%,#E8E4DD 50%,#F0EDE8 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:14px;}
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}

        .empty-wrap{text-align:center;padding:60px 20px;}
        .empty-emoji{font-size:56px;margin-bottom:16px;}
        .empty-title{font-size:18px;font-weight:700;color:#111;margin-bottom:8px;}
        .empty-sub{font-size:13px;color:#AAA;line-height:1.7;margin-bottom:24px;}
        .btn-voltar{display:inline-block;padding:12px 28px;background:#C9951A;color:#fff;border-radius:12px;text-decoration:none;font-size:14px;font-weight:600;}

        /* INICIAL */
        .initial-wrap{padding:40px 0;}
        .initial-title{font-family:'Bebas Neue',sans-serif;font-size:18px;color:#AAA;letter-spacing:1.5px;margin-bottom:16px;}
        .suggestions{display:flex;gap:8px;flex-wrap:wrap;}
        .sug-btn{padding:8px 16px;border-radius:20px;background:#FEF3E2;color:#C9951A;border:1px solid #F5C77A;font-size:13px;font-weight:500;cursor:pointer;font-family:'Inter',sans-serif;transition:all .15s;}
        .sug-btn:hover{background:#C9951A;color:#fff;border-color:#C9951A;}
      `}</style>

      {/* TOPBAR */}
      <div className="topbar">
        <a className="t-logo" href="/">TRINDADE <span>ONLINE</span></a>
        <form className="search-form" onSubmit={handleSubmit}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#AAA" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            type="text"
            placeholder="Buscar empresa, produto, serviço..."
            value={input}
            onChange={e => setInput(e.target.value)}
            autoFocus
          />
          <button type="submit" className="search-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </form>
        <a className="t-back" href="/">← Início</a>
      </div>

      <div className="page">

        {/* SEM BUSCA AINDA */}
        {!buscou && !loading && (
          <div className="initial-wrap">
            <div className="initial-title">SUGESTÕES DE BUSCA</div>
            <div className="suggestions">
              {['Padaria','Barbearia','Restaurante','Mercado','Farmácia','Academia','Salão de beleza','Mecânico','Eletricista','Pizzaria'].map(s => (
                <button key={s} className="sug-btn" onClick={() => { setInput(s); buscar(s) }}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {/* CARREGANDO */}
        {loading && (
          <>
            <div className="result-hdr">
              <div className="skeleton" style={{height:28,width:280,borderRadius:8,marginBottom:8}}/>
              <div className="skeleton" style={{height:16,width:180,borderRadius:6}}/>
            </div>
            <div className="loading-grid">
              {[1,2,3,4,5,6,7,8].map(i => (
                <div key={i} className="skeleton" style={{height:180}}/>
              ))}
            </div>
          </>
        )}

        {/* RESULTADOS */}
        {!loading && buscou && results.length > 0 && (
          <>
            <div className="result-hdr">
              <div className="result-title">{results.length} resultado{results.length !== 1 ? 's' : ''} para <span>"{query}"</span></div>
              <div className="result-sub">Empresas ativas na Trindade</div>
            </div>
            <div className="results-grid">
              {results.map(c => {
                const cover = getCover(c)
                return (
                  <a key={c.id} className="result-card" href={`/empresa/${c.slug}`}>
                    <div className="rc-img">
                      {cover ? <img src={cover} alt={c.name} /> : <span>{c.category?.emoji || '🏪'}</span>}
                    </div>
                    <div className="rc-body">
                      <div className="rc-name">{c.name}</div>
                      <div className="rc-cat">{c.category?.emoji} {c.category?.name || '—'}</div>
                      {(c.avg_rating || 0) > 0 && <div className="rc-stars">★ {(c.avg_rating || 0).toFixed(1)}</div>}
                      {c.address && <div className="rc-addr">📍 {c.address}</div>}
                    </div>
                  </a>
                )
              })}
            </div>
          </>
        )}

        {/* SEM RESULTADO */}
        {!loading && buscou && results.length === 0 && (
          <div className="empty-wrap">
            <div className="empty-emoji">🔍</div>
            <div className="empty-title">Nenhum resultado para "{query}"</div>
            <div className="empty-sub">
              Não encontramos nenhuma empresa com esse nome na Trindade.<br/>
              Tente buscar por outro termo ou explore por categoria.
            </div>
            <a className="btn-voltar" href="/">← Voltar ao início</a>
          </div>
        )}

      </div>
    </>
  )
}

export default function BuscaPage() {
  return (
    <Suspense fallback={
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'Inter,sans-serif',color:'#AAA'}}>
        Carregando...
      </div>
    }>
      <BuscaContent />
    </Suspense>
  )
}