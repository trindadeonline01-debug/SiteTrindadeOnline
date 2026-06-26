'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Company = {
  id: string; name: string; slug: string; address?: string; avg_rating?: number
  category?: any; photos?: any[]
  // Campos do RPC buscar_empresas
  category_name?: string; category_emoji?: string; cover_url?: string
}
type Category = { id: string; name: string; emoji: string; slug: string }
type Listing  = { id: string; type: string; title: string; price?: number; address?: string; subtype?: string; created_at: string; photos?: any[] }
type Subcategory = { id: string; name: string; emoji: string }

function BuscaContent() {
  const searchParams = useSearchParams()
  const queryInicial = searchParams.get('q') || ''

  const [input, setInput]         = useState(queryInicial)
  const [query, setQuery]         = useState(queryInicial)
  const [buscou, setBuscou]       = useState(false)
  const [loading, setLoading]     = useState(false)
  const [empresas, setEmpresas]   = useState<Company[]>([])
  const [cats, setCats]           = useState<Category[]>([])
  const [subcats, setSubcats]     = useState<Subcategory[]>([])
  const [desapega, setDesapega]   = useState<Listing[]>([])
  const [empregos, setEmpregos]   = useState<Listing[]>([])
  const [imoveis, setImoveis]     = useState<Listing[]>([])
  const [achados, setAchados]     = useState<Listing[]>([])
  const [total, setTotal]         = useState(0)

  useEffect(() => {
    if (queryInicial.trim()) buscar(queryInicial)
  }, [])

  async function buscar(q: string) {
    if (!q.trim()) return
    setLoading(true)
    setBuscou(true)
    setQuery(q)
    const term = q.trim()

    // 1. Busca empresas via função sem acento (nome + endereço + descrição)
    const { data: empData } = await supabase
      .rpc('buscar_empresas', { termo: term })

    // 2. Busca categorias pelo nome
    const { data: catData } = await supabase
      .from('categories')
      .select('id, name, emoji, slug')
      .ilike('name', `%${term}%`)
      .limit(8)

    // 3. Busca subcategorias pelo nome
    const { data: subcatData } = await supabase
      .from('subcategories')
      .select('id, name, emoji')
      .ilike('name', `%${term}%`)
      .limit(10)

    const emp = (empData || []) as Company[]
    const cat = (catData || []) as Category[]
    const sub = (subcatData || []) as Subcategory[]

    setEmpresas(emp)
    setCats(cat)
    setSubcats(sub)

    // 4. Busca listings por tipo
    const searchListings = async (type: string) => {
      const { data } = await supabase
        .from('listings')
        .select('id, type, title, price, address, subtype, created_at, photos:listing_photos(url,order)')
        .eq('status', 'active')
        .eq('type', type)
        .or(`title.ilike.%${term}%,description.ilike.%${term}%,address.ilike.%${term}%`)
        .order('created_at', { ascending: false })
        .limit(8)
      return (data || []) as Listing[]
    }

    const [desapegaData, empregosData, imoveisData, achadosData] = await Promise.all([
      searchListings('desapega'),
      searchListings('emprego'),
      searchListings('imovel'),
      searchListings('achado'),
    ])
    setDesapega(desapegaData)
    setEmpregos(empregosData)
    setImoveis(imoveisData)
    setAchados(achadosData)

    setTotal(emp.length + cat.length + sub.length + desapegaData.length + empregosData.length + imoveisData.length + achadosData.length)

    // Registra no banco
    await supabase.from('search_logs').insert({
      query: term.toLowerCase(),
      results_count: emp.length + cat.length + sub.length + desapegaData.length + empregosData.length + imoveisData.length + achadosData.length
    })

    setLoading(false)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    buscar(input)
  }

  function getCover(c: any): string | null {
    // Suporte tanto ao formato RPC (cover_url) quanto ao formato join (photos[])
    if (c.cover_url) return c.cover_url
    if (!c.photos || c.photos.length === 0) return null
    return [...c.photos].sort((a:any,b:any) => a.order - b.order)[0]?.url || null
  }

  const SUGGESTIONS = ['Padaria','Barbearia','Restaurante','Mercado','Farmácia','Mecânico','Salão','Eletricista','Igreja','Academia']

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'Inter',sans-serif;background:#F0EDE8;}

        .topbar{background:#111;padding:0;position:sticky;top:0;z-index:50;}
        .topbar-inner{max-width:1200px;margin:0 auto;padding:11px 24px;display:flex;align-items:center;gap:14px;}
        .t-logo{font-family:'Bebas Neue',sans-serif;font-size:20px;color:#fff;letter-spacing:2px;text-decoration:none;flex-shrink:0;}
        .t-logo span{color:#C9951A;}
        .sf{flex:1;display:flex;align-items:center;gap:8px;background:#1A1A1A;border:1.5px solid #C9951A;border-radius:30px;padding:9px 16px;max-width:640px;}
        .sf input{flex:1;border:none;background:transparent;font-size:14px;font-family:'Inter',sans-serif;color:#fff;outline:none;}
        .sf input::placeholder{color:#666;}
        .sf-btn{width:26px;height:26px;border-radius:50%;background:#C9951A;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .t-back{color:#666;font-size:13px;text-decoration:none;flex-shrink:0;}
        .t-back:hover{color:#fff;}

        .page{max-width:1200px;margin:0 auto;background:#fff;min-height:100vh;padding:28px 24px 48px;}

        /* RESULTADO HEADER */
        .result-hdr{margin-bottom:24px;padding-bottom:16px;border-bottom:0.5px solid #F0EDE8;}
        .result-title{font-family:'Bebas Neue',sans-serif;font-size:22px;color:#111;letter-spacing:1px;margin-bottom:4px;}
        .result-title span{color:#C9951A;}
        .result-sub{font-size:12px;color:#AAA;}

        /* SEÇÃO */
        .section{margin-bottom:28px;}
        .sec-hdr{display:flex;align-items:center;gap:10px;margin-bottom:12px;}
        .sec-lbl{font-family:'Bebas Neue',sans-serif;font-size:12px;color:#999;letter-spacing:1.5px;}
        .sec-cnt{font-size:11px;color:#AAA;font-family:'Inter',sans-serif;}
        .sec-line{flex:1;height:0.5px;background:#F0EDE8;}

        /* GRID EMPRESAS */
        .emp-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;}
        @media(min-width:640px){.emp-grid{grid-template-columns:repeat(3,1fr);}}
        @media(min-width:1024px){.emp-grid{grid-template-columns:repeat(4,1fr);}}
        .emp-card{background:#fff;border:0.5px solid #E0DDD8;border-radius:14px;overflow:hidden;cursor:pointer;transition:all .18s;text-decoration:none;display:block;}
        .emp-card:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,.08);border-color:#C9951A;}
        .emp-img{height:100px;background:#FEF3E2;display:flex;align-items:center;justify-content:center;font-size:36px;overflow:hidden;}
        .emp-img img{width:100%;height:100%;object-fit:cover;}
        .emp-body{padding:10px 12px;}
        .emp-name{font-size:12px;font-weight:600;color:#222;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .emp-cat{font-size:10px;color:#AAA;margin-bottom:3px;}
        .emp-stars{font-size:10px;color:#C9951A;font-weight:600;margin-bottom:2px;}
        .emp-addr{font-size:10px;color:#BBB;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}

        /* CATEGORIAS */
        .cats-row{display:flex;gap:8px;flex-wrap:wrap;}
        .cat-chip{display:flex;align-items:center;gap:7px;padding:9px 14px;background:#FAFAF8;border:0.5px solid #E0DDD8;border-radius:11px;cursor:pointer;text-decoration:none;transition:all .15s;}
        .cat-chip:hover{border-color:#C9951A;background:#FEF3E2;}
        .cat-emoji{font-size:20px;}
        .cat-nm{font-size:12px;font-weight:600;color:#222;}
        .cat-sub{font-size:10px;color:#AAA;margin-left:2px;}

        /* SUBCATEGORIAS */
        .sub-row{display:flex;gap:7px;flex-wrap:wrap;}
        .sub-chip{padding:6px 12px;background:#FAFAF8;border:0.5px solid #E0DDD8;border-radius:20px;font-size:11px;font-weight:500;color:#555;cursor:pointer;text-decoration:none;transition:all .15s;}
        .sub-chip:hover{border-color:#C9951A;color:#C9951A;background:#FEF3E2;}

        /* VAZIO */
        .empty-row{display:flex;align-items:center;gap:8px;padding:11px 14px;background:#FAFAF8;border:0.5px solid #F0EDE8;border-radius:10px;font-size:12px;color:#BBB;}

        /* ESTADO INICIAL */
        .initial{padding:32px 0;}
        .sug-title{font-family:'Bebas Neue',sans-serif;font-size:13px;color:#AAA;letter-spacing:1.5px;margin-bottom:14px;}
        .sug-row{display:flex;gap:8px;flex-wrap:wrap;}
        .sug-btn{padding:8px 16px;border-radius:20px;background:#FEF3E2;color:#C9951A;border:1px solid #F5C77A;font-size:13px;font-weight:500;cursor:pointer;font-family:'Inter',sans-serif;transition:all .15s;}
        .sug-btn:hover{background:#C9951A;color:#fff;border-color:#C9951A;}

        /* LOADING */
        .skeleton{background:linear-gradient(90deg,#F0EDE8 25%,#E8E4DD 50%,#F0EDE8 75%);background-size:200% 100%;animation:sh 1.5s infinite;border-radius:12px;}
        @keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}

        .footer{padding:24px 0 0;text-align:center;font-size:12px;color:#AAA;border-top:0.5px solid #F0EDE8;margin-top:16px;}
        .footer a{color:#C9951A;text-decoration:none;}
      `}</style>

      <div className="topbar">
        <div className="topbar-inner">
          <a className="t-logo" href="/">TRINDADE <span>ONLINE</span></a>
          <form className="sf" onSubmit={handleSubmit}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Empresa, produto, endereço, bairro..." value={input} onChange={e => setInput(e.target.value)} autoFocus />
            <button type="submit" className="sf-btn">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </form>
          <a className="t-back" href="/">← Início</a>
        </div>
      </div>

      <div className="page">

        {/* ESTADO INICIAL */}
        {!buscou && !loading && (
          <div className="initial">
            <div className="sug-title">SUGESTÕES</div>
            <div className="sug-row">
              {SUGGESTIONS.map(s => (
                <button key={s} className="sug-btn" onClick={() => { setInput(s); buscar(s) }}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {/* LOADING */}
        {loading && (
          <>
            <div style={{marginBottom:24}}>
              <div className="skeleton" style={{height:26,width:260,marginBottom:8}}/>
              <div className="skeleton" style={{height:14,width:180}}/>
            </div>
            <div className="emp-grid" style={{marginBottom:28}}>
              {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{height:170}}/>)}
            </div>
          </>
        )}

        {/* RESULTADOS */}
        {!loading && buscou && (
          <>
            <div className="result-hdr">
              <div className="result-title">Resultados para <span>"{query}"</span></div>
              <div className="result-sub">
                {total === 0 ? 'Nenhum resultado encontrado' : `${total} resultado${total !== 1 ? 's' : ''} — ${empresas.length} empresa${empresas.length !== 1 ? 's' : ''}${cats.length > 0 ? ` · ${cats.length} categoria${cats.length !== 1 ? 's' : ''}` : ''}${subcats.length > 0 ? ` · ${subcats.length} subcategoria${subcats.length !== 1 ? 's' : ''}` : ''}`}
              </div>
            </div>

            {/* NENHUM RESULTADO */}
            {total === 0 && (
              <div style={{textAlign:'center',padding:'48px 0'}}>
                <div style={{fontSize:52,marginBottom:16}}>🔍</div>
                <div style={{fontSize:18,fontWeight:700,color:'#111',marginBottom:8}}>Nenhum resultado para "{query}"</div>
                <div style={{fontSize:13,color:'#AAA',lineHeight:1.7,marginBottom:24}}>
                  Tente outro termo ou explore por categoria na página inicial.
                </div>
                <a href="/" style={{display:'inline-block',padding:'12px 28px',background:'#C9951A',color:'#fff',borderRadius:12,textDecoration:'none',fontSize:14,fontWeight:600}}>← Voltar ao início</a>
              </div>
            )}

            {/* EMPRESAS */}
            <div className="section">
              <div className="sec-hdr">
                <span className="sec-lbl">EMPRESAS</span>
                <span className="sec-cnt">{empresas.length > 0 ? `${empresas.length} encontrada${empresas.length !== 1 ? 's' : ''}` : 'sem resultados'}</span>
                <div className="sec-line"/>
              </div>
              {empresas.length > 0 ? (
                <div className="emp-grid">
                  {empresas.map(c => {
                    const cover = getCover(c)
                    return (
                      <a key={c.id} className="emp-card" href={`/empresa/${c.slug}`}>
                        <div className="emp-img">
                          {cover ? <img src={cover} alt={c.name} /> : <span>{c.category?.emoji || '🏪'}</span>}
                        </div>
                        <div className="emp-body">
                          <div className="emp-name">{c.name}</div>
                          <div className="emp-cat">{c.category_emoji || c.category?.emoji} {c.category_name || c.category?.name || '—'}</div>
                          {(c.avg_rating || 0) > 0 && <div className="emp-stars">★ {Number(c.avg_rating).toFixed(1)}</div>}
                          {c.address && <div className="emp-addr">📍 {c.address}</div>}
                        </div>
                      </a>
                    )
                  })}
                </div>
              ) : (
                <div className="empty-row">
                  <span>🏪</span> Nenhuma empresa encontrada com esse termo.
                </div>
              )}
            </div>

            {/* CATEGORIAS */}
            <div className="section">
              <div className="sec-hdr">
                <span className="sec-lbl">CATEGORIAS</span>
                <span className="sec-cnt">{cats.length > 0 ? `${cats.length} encontrada${cats.length !== 1 ? 's' : ''}` : 'sem resultados'}</span>
                <div className="sec-line"/>
              </div>
              {cats.length > 0 ? (
                <div className="cats-row">
                  {cats.map(c => (
                    <a key={c.id} className="cat-chip" href={`/categoria/${c.slug}`}>
                      <span className="cat-emoji">{c.emoji}</span>
                      <span className="cat-nm">{c.name}</span>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="empty-row">
                  <span>📂</span> Nenhuma categoria encontrada com esse termo.
                </div>
              )}
            </div>

            {/* SUBCATEGORIAS */}
            <div className="section">
              <div className="sec-hdr">
                <span className="sec-lbl">SUBCATEGORIAS</span>
                <span className="sec-cnt">{subcats.length > 0 ? `${subcats.length} encontrada${subcats.length !== 1 ? 's' : ''}` : 'sem resultados'}</span>
                <div className="sec-line"/>
              </div>
              {subcats.length > 0 ? (
                <div className="sub-row">
                  {subcats.map(s => (
                    <span key={s.id} className="sub-chip">{s.emoji} {s.name}</span>
                  ))}
                </div>
              ) : (
                <div className="empty-row">
                  <span>🏷️</span> Nenhuma subcategoria encontrada com esse termo.
                </div>
              )}
            </div>


            {/* DESAPEGA */}
            <div className="section">
              <div className="sec-hdr">
                <span className="sec-lbl">DESAPEGA</span>
                <span className="sec-cnt">{desapega.length > 0 ? `${desapega.length} encontrado${desapega.length!==1?'s':''}` : 'sem resultados'}</span>
                <div className="sec-line"/>
              </div>
              {desapega.length > 0 ? (
                <div className="results-grid">
                  {desapega.map(l => (
                    <a key={l.id} className="result-card" href={`/anuncio/${l.id}`}>
                      <div className="rc-img">
                        {l.photos?.length ? <img src={[...l.photos].sort((a,b)=>a.order-b.order)[0]?.url} alt={l.title}/> : <span>🏷️</span>}
                      </div>
                      <div className="rc-body">
                        <div className="rc-name">{l.title}</div>
                        <div className="rc-cat">{l.price ? `R$ ${l.price.toLocaleString('pt-BR')}` : 'Grátis'}</div>
                        {l.address && <div className="rc-addr">📍 {l.address}</div>}
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="empty-row"><span>🏷️</span> Nenhum item no Desapega com esse termo.</div>
              )}
            </div>

            {/* EMPREGOS */}
            <div className="section">
              <div className="sec-hdr">
                <span className="sec-lbl">EMPREGOS</span>
                <span className="sec-cnt">{empregos.length > 0 ? `${empregos.length} encontrado${empregos.length!==1?'s':''}` : 'sem resultados'}</span>
                <div className="sec-line"/>
              </div>
              {empregos.length > 0 ? (
                <div className="results-grid">
                  {empregos.map(l => (
                    <a key={l.id} className="result-card" href={`/anuncio/${l.id}`}>
                      <div className="rc-img"><span>💼</span></div>
                      <div className="rc-body">
                        <div className="rc-name">{l.title}</div>
                        <div className="rc-cat">{l.price ? `R$ ${l.price.toLocaleString('pt-BR')}/mês` : 'Ver detalhes'}</div>
                        {l.address && <div className="rc-addr">📍 {l.address}</div>}
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="empty-row"><span>💼</span> Nenhuma vaga encontrada com esse termo.</div>
              )}
            </div>

            {/* IMÓVEIS */}
            <div className="section">
              <div className="sec-hdr">
                <span className="sec-lbl">IMÓVEIS</span>
                <span className="sec-cnt">{imoveis.length > 0 ? `${imoveis.length} encontrado${imoveis.length!==1?'s':''}` : 'sem resultados'}</span>
                <div className="sec-line"/>
              </div>
              {imoveis.length > 0 ? (
                <div className="results-grid">
                  {imoveis.map(l => (
                    <a key={l.id} className="result-card" href={`/anuncio/${l.id}`}>
                      <div className="rc-img">
                        {l.photos?.length ? <img src={[...l.photos].sort((a,b)=>a.order-b.order)[0]?.url} alt={l.title}/> : <span>🏠</span>}
                      </div>
                      <div className="rc-body">
                        <div className="rc-name">{l.title}</div>
                        <div className="rc-cat">{l.price ? `R$ ${l.price.toLocaleString('pt-BR')}${l.subtype==='aluguel'?'/mês':''}` : 'Ver detalhes'}</div>
                        {l.address && <div className="rc-addr">📍 {l.address}</div>}
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="empty-row"><span>🏠</span> Nenhum imóvel encontrado com esse termo.</div>
              )}
            </div>

            {/* ACHADOS & PERDIDOS */}
            <div className="section">
              <div className="sec-hdr">
                <span className="sec-lbl">ACHADOS & PERDIDOS</span>
                <span className="sec-cnt">{achados.length > 0 ? `${achados.length} encontrado${achados.length!==1?'s':''}` : 'sem resultados'}</span>
                <div className="sec-line"/>
              </div>
              {achados.length > 0 ? (
                <div className="results-grid">
                  {achados.map(l => (
                    <a key={l.id} className="result-card" href={`/anuncio/${l.id}`}>
                      <div className="rc-img"><span>{l.subtype==='perdido'?'🔴':'🟢'} 🔍</span></div>
                      <div className="rc-body">
                        <div className="rc-name">{l.title}</div>
                        <div className="rc-cat" style={{color:l.subtype==='perdido'?'#E24B4A':'#0F6E56'}}>{l.subtype==='perdido'?'Perdido':'Achado'}</div>
                        {l.address && <div className="rc-addr">📍 {l.address}</div>}
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="empty-row"><span>🔍</span> Nenhum item encontrado com esse termo.</div>
              )}
            </div>
            <div className="footer">
              <a href="/">← Voltar ao Trindade Online</a>
            </div>
          </>
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