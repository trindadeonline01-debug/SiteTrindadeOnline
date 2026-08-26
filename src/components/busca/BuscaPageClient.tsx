'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { usePalavraPremiada, PalavraPremiadaModal } from '@/components/PalavraPremiada'

type Company = {
  id: string; name: string; slug: string; address?: string; avg_rating?: number
  category?: any; photos?: any[]
  category_name?: string; category_emoji?: string; cover_url?: string; is_paid?: boolean
}
type Category = { id: string; name: string; emoji: string; slug: string }
type Listing  = { id: string; type: string; title: string; price?: number; address?: string; subtype?: string; created_at: string; photos?: any[] }
type Subcategory = { id: string; name: string; emoji: string }
type Produto = {
  id: string; name: string; sale_price: number; photo_url: string | null
  promo_type: 'percent' | 'fixed' | null; promo_value: number | null
  promo_starts_at: string | null; promo_ends_at: string | null
  company: { id: string; name: string; slug: string }
}

type InitialResults = {
  empresas: Company[]; cats: Category[]; subcats: Subcategory[]
  desapega: Listing[]; empregos: Listing[]; imoveis: Listing[]; achados: Listing[]
  produtos: Produto[]
  total: number
}

const SUGGESTIONS = ['Padaria','Barbearia','Restaurante','Mercado','Farmácia','Mecânico','Salão','Eletricista','Igreja','Academia']

function produtoPrice(p: Produto): number {
  if (!p.promo_type || !p.promo_value) return p.sale_price
  const now = Date.now()
  if (p.promo_starts_at && now < new Date(p.promo_starts_at).getTime()) return p.sale_price
  if (p.promo_ends_at && now > new Date(p.promo_ends_at).getTime()) return p.sale_price
  return p.promo_type === 'percent' ? p.sale_price * (1 - p.promo_value / 100) : Math.max(0, p.sale_price - p.promo_value)
}

export default function BuscaPageClient({ initialQuery, initialResults, produtosEnabled }: { initialQuery: string; initialResults: InitialResults | null; produtosEnabled: boolean }) {
  const [input, setInput]         = useState(initialQuery)
  const [query, setQuery]         = useState(initialQuery)
  const [buscou, setBuscou]       = useState(!!initialResults)
  const [loading, setLoading]     = useState(false)
  const [empresas, setEmpresas]   = useState<Company[]>(initialResults?.empresas || [])
  const [cats, setCats]           = useState<Category[]>(initialResults?.cats || [])
  const [subcats, setSubcats]     = useState<Subcategory[]>(initialResults?.subcats || [])
  const [desapega, setDesapega]   = useState<Listing[]>(initialResults?.desapega || [])
  const [empregos, setEmpregos]   = useState<Listing[]>(initialResults?.empregos || [])
  const [imoveis, setImoveis]     = useState<Listing[]>(initialResults?.imoveis || [])
  const [achados, setAchados]     = useState<Listing[]>(initialResults?.achados || [])
  const [produtos, setProdutos]   = useState<Produto[]>(initialResults?.produtos || [])
  const [total, setTotal]         = useState(initialResults?.total || 0)
  const { premio, setPremio, checarPalavraPremiada, waResgateUrl } = usePalavraPremiada()

  // A busca inicial (vinda de ?q=) já veio pronta do servidor — só falta
  // conferir a Palavra Premiada, que depende do visitor_id do navegador
  useEffect(() => {
    if (initialQuery.trim()) checarPalavraPremiada(initialQuery)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function buscar(q: string) {
    if (!q.trim()) return
    setLoading(true)
    setBuscou(true)
    setQuery(q)
    const term = q.trim()

    const { data: empData } = await supabase.rpc('buscar_empresas', { termo: term })
    const { data: catData } = await supabase.from('categories').select('id, name, emoji, slug').ilike('name', `%${term}%`).limit(8)
    const { data: subcatData } = await supabase.from('subcategories').select('id, name, emoji').ilike('name', `%${term}%`).limit(10)

    const emp = (empData || []) as Company[]
    const cat = (catData || []) as Category[]
    const sub = (subcatData || []) as Subcategory[]

    setEmpresas(emp)
    setCats(cat)
    setSubcats(sub)

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

    let prod: Produto[] = []
    if (produtosEnabled) {
      const { data } = await supabase
        .from('loja_produtos')
        .select('id,name,sale_price,photo_url,promo_type,promo_value,promo_starts_at,promo_ends_at,company:companies!inner(id,name,slug,status,loja_digital_enabled)')
        .eq('active', true).not('photo_url', 'is', null)
        .eq('company.status', 'active').eq('company.loja_digital_enabled', true)
        .or(`name.ilike.%${term}%,description.ilike.%${term}%`)
        .limit(12)
      prod = ((data || []) as any[]).map(p => ({ ...p, company: Array.isArray(p.company) ? p.company[0] : p.company }))
    }
    setProdutos(prod)

    setTotal(emp.length + cat.length + sub.length + desapegaData.length + empregosData.length + imoveisData.length + achadosData.length + prod.length)

    await supabase.from('search_logs').insert({
      query: term.toLowerCase(),
      results_count: emp.length + cat.length + sub.length + desapegaData.length + empregosData.length + imoveisData.length + achadosData.length + prod.length
    })

    setLoading(false)
    checarPalavraPremiada(term)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // Lê direto do input na hora do submit (não do state) — no Enter logo
    // após digitar rápido no celular, o onChange às vezes ainda não
    // terminou de atualizar o state, e a busca saía com o termo cortado
    const raw = e.currentTarget.querySelector('input')?.value ?? input
    buscar(raw)
  }

  function getCover(c: any): string | null {
    if (c.cover_url) return c.cover_url
    if (!c.photos || c.photos.length === 0) return null
    return [...c.photos].sort((a:any,b:any) => a.order - b.order)[0]?.url || null
  }

  return (
    <>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'Archivo',sans-serif;background:var(--concrete);}

        .topbar{background:var(--ink);padding:0;z-index:50;}
        .topbar-inner{max-width:1200px;margin:0 auto;padding:11px 24px;display:flex;align-items:center;gap:14px;}
        @media(max-width:767px){
          .topbar-inner{ justify-content: center; }
          .topbar-inner .sf { display: none; }
          .mobile-search-bar { display: block; padding: 14px 16px 4px; }
        }
        @media(min-width:768px){ .mobile-search-bar { display: none; } }
        .sf{flex:1;display:flex;align-items:center;gap:8px;background:var(--ink-2);border:1.5px solid var(--sign);border-radius:12px;padding:9px 16px;max-width:640px;}
        .sf input{flex:1;border:none;background:transparent;font-size:14px;font-family:'Archivo',sans-serif;color:#fff;outline:none;}
        .sf input::placeholder{color:#666;}
        .sf-btn{width:26px;height:26px;border-radius:50%;background:var(--sign);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .t-back{color:#666;font-size:13px;text-decoration:none;flex-shrink:0;}
        .t-back:hover{color:#fff;}

        .page{max-width:1200px;margin:0 auto;background:#fff;min-height:100vh;padding:28px 24px 48px;}

        /* RESULTADO HEADER */
        .result-hdr{margin-bottom:24px;padding-bottom:16px;border-bottom:0.5px solid var(--line);}
        .result-title{font-family:'Anton',sans-serif;font-size:22px;color:var(--ink);letter-spacing:.5px;margin-bottom:4px;}
        .result-title span{color:var(--sign-dark);}
        .result-sub{font-size:15px;color:#666;font-weight:600;font-family:'Archivo',sans-serif;}

        /* GRID DE SEÇÕES */
        .sections-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:28px 32px;align-items:start;}

        /* SEÇÃO */
        .section{margin-bottom:0;}
        .sec-hdr{display:flex;align-items:center;gap:10px;margin-bottom:12px;}
        .sec-lbl{font-family:'Anton',sans-serif;font-size:15px;color:#666;letter-spacing:.5px;text-transform:uppercase;}
        .sec-cnt{font-size:13px;color:#888;font-family:'Archivo',sans-serif;}
        .sec-line{flex:1;height:0.5px;background:var(--line);}

        /* GRID EMPRESAS */
        .emp-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;}
        @media(min-width:640px){.emp-grid{grid-template-columns:repeat(3,1fr);}}
        @media(min-width:1024px){.emp-grid{grid-template-columns:repeat(4,1fr);}}
        .emp-card{background:#fff;border:0.5px solid var(--line);border-radius:14px;overflow:hidden;cursor:pointer;transition:all .18s;text-decoration:none;display:block;}
        .emp-card:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,.08);border-color:var(--sign-dark);}
        .emp-img{height:100px;background:var(--concrete-2);display:flex;align-items:center;justify-content:center;font-size:36px;overflow:hidden;position:relative;}
        .emp-img img{width:100%;height:100%;object-fit:cover;}
        .emp-body{padding:10px 12px;}
        .emp-name{font-size:14px;font-weight:600;color:var(--ink);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:'Archivo',sans-serif;}
        .emp-cat{font-size:13px;color:#777;margin-bottom:3px;}
        .emp-stars{font-size:13px;color:var(--sign-dark);font-weight:600;margin-bottom:2px;}
        .emp-addr{font-size:12px;color:#999;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}

        /* CATEGORIAS */
        .cats-row{display:flex;gap:8px;flex-wrap:wrap;}
        .cat-chip{display:flex;align-items:center;gap:7px;padding:9px 14px;background:#FAFAF8;border:0.5px solid var(--line);border-radius:11px;cursor:pointer;text-decoration:none;transition:all .15s;}
        .cat-chip:hover{border-color:var(--sign-dark);background:var(--concrete-2);}
        .cat-emoji{font-size:20px;}
        .cat-nm{font-size:14px;font-weight:600;color:var(--ink);}
        .cat-sub{font-size:13px;color:#888;margin-left:2px;}

        /* SUBCATEGORIAS */
        .sub-row{display:flex;gap:7px;flex-wrap:wrap;}
        .sub-chip{padding:7px 14px;background:#FAFAF8;border:0.5px solid var(--line);border-radius:20px;font-size:13px;font-weight:600;color:#444;cursor:pointer;text-decoration:none;transition:all .15s;}
        .sub-chip:hover{border-color:var(--sign-dark);color:var(--sign-dark);background:var(--concrete-2);}

        /* ESTADO INICIAL */
        .initial{padding:32px 0;}
        .sug-title{font-family:'Anton',sans-serif;font-size:15px;color:#666;letter-spacing:.5px;text-transform:uppercase;margin-bottom:14px;}
        .sug-row{display:flex;gap:8px;flex-wrap:wrap;}
        .sug-btn{padding:9px 18px;border-radius:20px;background:var(--concrete-2);color:var(--sign-dark);border:1px solid var(--sign-dark);font-size:14px;font-weight:600;cursor:pointer;font-family:'Archivo',sans-serif;transition:all .15s;}
        .sug-btn:hover{background:var(--sign);color:var(--ink);border-color:var(--sign);}

        /* LOADING */
        .skeleton{background:linear-gradient(90deg,#F0EDE8 25%,#E8E4DD 50%,#F0EDE8 75%);background-size:200% 100%;animation:sh 1.5s infinite;border-radius:12px;}
        @keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}

        .footer{padding:24px 0 0;text-align:left;font-size:12px;color:#AAA;border-top:0.5px solid var(--line);margin-top:16px;}
        .footer a{color:var(--sign-dark);text-decoration:none;}
        /* RESULTS GRID — Desapega, Empregos, Imóveis */
        .results-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;}
        @media(min-width:640px){.results-grid{grid-template-columns:repeat(3,1fr);}}
        .result-card{display:flex;flex-direction:column;background:#FAFAF8;border:0.5px solid var(--line);border-radius:12px;overflow:hidden;text-decoration:none;transition:all .15s;}
        .result-card:hover{border-color:var(--sign-dark);box-shadow:0 2px 8px rgba(0,0,0,0.08);}
        .rc-img{height:100px;background:var(--concrete-2);display:flex;align-items:center;justify-content:center;font-size:28px;overflow:hidden;flex-shrink:0;position:relative;}
        .rc-img img{width:100%;height:100%;object-fit:cover;}
        .rc-body{padding:8px 10px;}
        .rc-name{font-size:13px;font-weight:600;color:var(--ink);margin-bottom:2px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;font-family:'Archivo',sans-serif;}
        .rc-cat{font-size:12px;color:var(--sign-dark);font-weight:600;margin-bottom:2px;}
        .rc-addr{font-size:11px;color:#999;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .rc-price{font-size:14px;font-weight:800;color:var(--ink);margin-bottom:2px;}
      `}</style>

      {premio && (
        <PalavraPremiadaModal premio={premio} onClose={() => setPremio(null)} waResgateUrl={waResgateUrl} loginRedirect={`/busca?q=${query}`} />
      )}

      <div className="topbar">
        <div className="topbar-inner">
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

      <div className="mobile-search-bar">
        <form className="sf" onSubmit={handleSubmit} style={{maxWidth:'100%'}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" placeholder="Empresa, produto, endereço, bairro..." value={input} onChange={e => setInput(e.target.value)} style={{fontSize:16}}/>
          <button type="submit" className="sf-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </form>
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
                {total === 0 ? 'Nenhum resultado encontrado' : `${total} resultado${total !== 1 ? 's' : ''} — ${produtos.length > 0 ? `${produtos.length} produto${produtos.length !== 1 ? 's' : ''} · ` : ''}${empresas.length} empresa${empresas.length !== 1 ? 's' : ''}${cats.length > 0 ? ` · ${cats.length} categoria${cats.length !== 1 ? 's' : ''}` : ''}${subcats.length > 0 ? ` · ${subcats.length} subcategoria${subcats.length !== 1 ? 's' : ''}` : ''}`}
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
                <a href="/" style={{display:'inline-block',padding:'12px 28px',background:'var(--sign)',color:'var(--ink)',borderRadius:12,textDecoration:'none',fontSize:14,fontWeight:700}}>← Voltar ao início</a>
              </div>
            )}

            <div className="sections-grid">

            {/* PRODUTOS — vem primeiro, foi o que a pessoa digitou; empresa
                vem depois, como contexto (ESPECIFICACAO.md §10.2) */}
            {produtos.length > 0 && (
            <div className="section">
              <div className="sec-hdr">
                <span className="sec-lbl">PRODUTOS</span>
                <span className="sec-cnt">{produtos.length} encontrado{produtos.length !== 1 ? 's' : ''}</span>
                <div className="sec-line"/>
              </div>
              <div className="results-grid">
                {produtos.map(p => (
                  <a key={p.id} className="result-card" href={`/empresa/${p.company.slug}/item/${p.id}`}>
                    <div className="rc-img">
                      {p.photo_url ? <Image unoptimized src={p.photo_url} alt={p.name} fill sizes="(max-width:639px) 50vw, 33vw" style={{objectFit:'cover'}} /> : <span>🍽️</span>}
                    </div>
                    <div className="rc-body">
                      <div className="rc-name">{p.name}</div>
                      <div className="rc-price">R$ {produtoPrice(p).toFixed(2).replace('.', ',')}</div>
                      <div className="rc-addr">{p.company.name}</div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
            )}

            {/* EMPRESAS */}
            {empresas.length > 0 && (
            <div className="section">
              <div className="sec-hdr">
                <span className="sec-lbl">EMPRESAS</span>
                <span className="sec-cnt">{empresas.length} encontrada{empresas.length !== 1 ? 's' : ''}</span>
                <div className="sec-line"/>
              </div>
              <div className="emp-grid">
                {empresas.map(c => {
                  const cover = getCover(c)
                  return (
                    <a key={c.id} className="emp-card" href={`/empresa/${c.slug}`}>
                      <div className="emp-img">
                        {cover ? <Image unoptimized src={cover} alt={c.name} fill sizes="(max-width:639px) 33vw, 200px" style={{objectFit:'cover'}} /> : <span>{c.category?.emoji || '🏪'}</span>}
                      </div>
                      <div className="emp-body">
                        <div className="emp-name">{c.name}</div>
                        <div className="emp-cat">{c.category_emoji || c.category?.emoji} {c.category_name || c.category?.name || '—'}</div>
                        {(c.avg_rating || 0) > 0 && <div className="emp-stars">★ {Number(c.avg_rating).toFixed(1)}</div>}
                        {c.address && (c as any).is_paid && <div className="emp-addr">📍 {c.address}</div>}
                      </div>
                    </a>
                  )
                })}
              </div>
            </div>
            )}

            {/* CATEGORIAS */}
            {cats.length > 0 && (
            <div className="section">
              <div className="sec-hdr">
                <span className="sec-lbl">CATEGORIAS</span>
                <span className="sec-cnt">{cats.length} encontrada{cats.length !== 1 ? 's' : ''}</span>
                <div className="sec-line"/>
              </div>
              <div className="cats-row">
                {cats.map(c => (
                  <a key={c.id} className="cat-chip" href={`/categoria/${c.slug}`}>
                    <span className="cat-emoji">{c.emoji}</span>
                    <span className="cat-nm">{c.name}</span>
                  </a>
                ))}
              </div>
            </div>
            )}

            {/* SUBCATEGORIAS */}
            {subcats.length > 0 && (
            <div className="section">
              <div className="sec-hdr">
                <span className="sec-lbl">SUBCATEGORIAS</span>
                <span className="sec-cnt">{subcats.length} encontrada{subcats.length !== 1 ? 's' : ''}</span>
                <div className="sec-line"/>
              </div>
              <div className="sub-row">
                {subcats.map(s => (
                  <span key={s.id} className="sub-chip">{s.emoji} {s.name}</span>
                ))}
              </div>
            </div>
            )}

            {/* DESAPEGA */}
            {desapega.length > 0 && (
            <div className="section">
              <div className="sec-hdr">
                <span className="sec-lbl">DESAPEGA</span>
                <span className="sec-cnt">{desapega.length} encontrado{desapega.length!==1?'s':''}</span>
                <div className="sec-line"/>
              </div>
              <div className="results-grid">
                {desapega.map(l => (
                  <a key={l.id} className="result-card" href={`/anuncio/${l.id}`}>
                    <div className="rc-img">
                      {l.photos?.length ? <Image unoptimized src={[...l.photos].sort((a,b)=>a.order-b.order)[0]?.url} alt={l.title} fill sizes="(max-width:639px) 50vw, 33vw" style={{objectFit:'cover'}} /> : <span>🏷️</span>}
                    </div>
                    <div className="rc-body">
                      <div className="rc-name">{l.title}</div>
                      <div className="rc-cat">{l.price ? `R$ ${l.price.toLocaleString('pt-BR')}` : 'Grátis'}</div>
                      {l.address && <div className="rc-addr">📍 {l.address}</div>}
                    </div>
                  </a>
                ))}
              </div>
            </div>
            )}

            {/* EMPREGOS */}
            {empregos.length > 0 && (
            <div className="section">
              <div className="sec-hdr">
                <span className="sec-lbl">EMPREGOS</span>
                <span className="sec-cnt">{empregos.length} encontrado{empregos.length!==1?'s':''}</span>
                <div className="sec-line"/>
              </div>
              <div className="results-grid">
                {empregos.map(l => (
                  <a key={l.id} className="result-card" href={`/anuncio/${l.id}`}>
                    <div className="rc-img">
                      {l.photos?.length ? <Image unoptimized src={[...l.photos].sort((a,b)=>a.order-b.order)[0]?.url} alt={l.title} fill sizes="(max-width:639px) 50vw, 33vw" style={{objectFit:'cover'}} /> : <span>💼</span>}
                    </div>
                    <div className="rc-body">
                      <div className="rc-name">{l.title}</div>
                      <div className="rc-cat">{l.price ? `R$ ${l.price.toLocaleString('pt-BR')}/mês` : 'Ver detalhes'}</div>
                      {l.address && <div className="rc-addr">📍 {l.address}</div>}
                    </div>
                  </a>
                ))}
              </div>
            </div>
            )}

            {/* IMÓVEIS */}
            {imoveis.length > 0 && (
            <div className="section">
              <div className="sec-hdr">
                <span className="sec-lbl">IMÓVEIS</span>
                <span className="sec-cnt">{imoveis.length} encontrado{imoveis.length!==1?'s':''}</span>
                <div className="sec-line"/>
              </div>
              <div className="results-grid">
                {imoveis.map(l => (
                  <a key={l.id} className="result-card" href={`/anuncio/${l.id}`}>
                    <div className="rc-img">
                      {l.photos?.length ? <Image unoptimized src={[...l.photos].sort((a,b)=>a.order-b.order)[0]?.url} alt={l.title} fill sizes="(max-width:639px) 50vw, 33vw" style={{objectFit:'cover'}} /> : <span>🏠</span>}
                    </div>
                    <div className="rc-body">
                      <div className="rc-name">{l.title}</div>
                      <div className="rc-cat">{l.price ? `R$ ${l.price.toLocaleString('pt-BR')}${l.subtype==='aluguel'?'/mês':''}` : 'Ver detalhes'}</div>
                      {l.address && <div className="rc-addr">📍 {l.address}</div>}
                    </div>
                  </a>
                ))}
              </div>
            </div>
            )}

            {/* ACHADOS & PERDIDOS */}
            {achados.length > 0 && (
            <div className="section">
              <div className="sec-hdr">
                <span className="sec-lbl">ACHADOS & PERDIDOS</span>
                <span className="sec-cnt">{achados.length} encontrado{achados.length!==1?'s':''}</span>
                <div className="sec-line"/>
              </div>
              <div className="results-grid">
                {achados.map(l => (
                  <a key={l.id} className="result-card" href={`/anuncio/${l.id}`}>
                    <div className="rc-img">
                      {l.photos?.length ? <Image unoptimized src={[...l.photos].sort((a,b)=>a.order-b.order)[0]?.url} alt={l.title} fill sizes="(max-width:639px) 50vw, 33vw" style={{objectFit:'cover'}} /> : <span>{l.subtype==='perdido'?'🔴':'🟢'} 🔍</span>}
                    </div>
                    <div className="rc-body">
                      <div className="rc-name">{l.title}</div>
                      <div className="rc-cat" style={{color:l.subtype==='perdido'?'#E24B4A':'#0F6E56'}}>{l.subtype==='perdido'?'Perdido':'Achado'}</div>
                      {l.address && <div className="rc-addr">📍 {l.address}</div>}
                    </div>
                  </a>
                ))}
              </div>
            </div>
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
