'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

type Company = {
  id: string; name: string; slug: string; status: string; plan: string
  description: string; address: string; phone: string
  external_link: string; external_link_label: string
  avg_rating: number; total_reviews: number
  views_count: number; whatsapp_clicks: number
  category?: { name: string; emoji: string }
  subcategories?: { subcategory: { name: string; emoji: string } }[]
  photos?: { id: string; url: string; order: number }[]
  hours?: { label: string; hours: string; order: number }[]
}
type Review = {
  id: string; rating: number; text: string; created_at: string
  user?: { name: string }
  response?: { text: string }
}

const fmtDate = (s: string) => new Date(s).toLocaleDateString('pt-BR')

function isOpenNow(hours: { label: string; hours: string }[] | undefined): boolean {
  if (!hours || hours.length === 0) return false
  const now = new Date()
  const day = now.getDay()
  const dayMap: Record<number, string[]> = {
    1: ['Seg–Sex'], 2: ['Seg–Sex'], 3: ['Seg–Sex'], 4: ['Seg–Sex'], 5: ['Seg–Sex'],
    6: ['Sábado'], 0: ['Domingo']
  }
  const labels = dayMap[day] || []
  const entry = hours.find(h => labels.some(l => h.label.includes(l.split('–')[0])))
  if (!entry || entry.hours.toLowerCase() === 'fechado') return false
  const match = entry.hours.match(/(\d{2}):(\d{2})[–-](\d{2}):(\d{2})/)
  if (!match) return true
  const [,sh,sm,eh,em] = match.map(Number)
  const current = now.getHours() * 60 + now.getMinutes()
  return current >= sh*60+sm && current <= eh*60+em
}

export default function EmpresaPerfilPage({ params }: { params: { slug: string } }) {
  const [company, setCompany]       = useState<Company|null>(null)
  const [reviews, setReviews]       = useState<Review[]>([])
  const [loading, setLoading]       = useState(true)
  const [notFound, setNotFound]     = useState(false)
  const [photoIdx, setPhotoIdx]     = useState(0)
  const [userId, setUserId]         = useState<string|null>(null)
  const [isFav, setIsFav]           = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [myRating, setMyRating]     = useState(0)
  const [myText, setMyText]         = useState('')
  const [reviewSent, setReviewSent] = useState(false)
  const [reviewLoading, setRevLoad] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setUserId(session.user.id)
    })
    loadCompany()
  }, [])

  async function loadCompany() {
    const { data: comp } = await supabase
      .from('companies')
      .select(`
        *,
        category:categories(name,emoji),
        subcategories:company_subcategories(subcategory:subcategories(name,emoji)),
        photos:company_photos(id,url,order),
        hours:company_hours(label,hours,order)
      `)
      .eq('slug', params.slug)
      .eq('status', 'active')
      .single()

    if (!comp) { setNotFound(true); setLoading(false); return }

    setCompany(comp)

    // Registra visualização
    await supabase.from('page_views').insert({ page: '/empresa', entity_id: comp.id })
    await supabase.from('companies').update({ views_count: (comp.views_count||0)+1 }).eq('id', comp.id)

    // Carrega avaliações
    const { data: revs } = await supabase
      .from('reviews')
      .select('*, user:profiles(name), response:review_responses(text)')
      .eq('company_id', comp.id)
      .eq('is_latest', true)
      .order('created_at', { ascending: false })
    setReviews(revs || [])

    // Verifica favorito
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      const { data: fav } = await supabase.from('favorites').select('id').eq('user_id', session.user.id).eq('entity_type', 'company').eq('entity_id', comp.id).single()
      setIsFav(!!fav)
    }
    setLoading(false)
  }

  async function toggleFav() {
    if (!userId || !company) { window.location.href = '/login'; return }
    if (isFav) {
      await supabase.from('favorites').delete().eq('user_id', userId).eq('entity_type', 'company').eq('entity_id', company.id)
      setIsFav(false)
    } else {
      await supabase.from('favorites').insert({ user_id: userId, entity_type: 'company', entity_id: company.id })
      setIsFav(true)
    }
  }

  async function handleWhatsApp() {
    if (!company?.phone) return
    await supabase.from('companies').update({ whatsapp_clicks: (company.whatsapp_clicks||0)+1 }).eq('id', company.id)
    await supabase.from('whatsapp_clicks').insert({ company_id: company.id, user_id: userId })
    const phone = company.phone.replace(/\D/g,'')
    window.open(`https://wa.me/55${phone}?text=Olá! Vi sua empresa no Trindade Online.`, '_blank')
  }

  async function handleLink() {
    if (!company?.external_link) return
    await supabase.from('companies').update({ link_clicks: (company.link_clicks||0)+1 }).eq('id', company.id)
    window.open(company.external_link, '_blank')
  }

  async function submitReview() {
    if (!userId) { window.location.href = '/login'; return }
    if (myRating === 0 || !company) return
    setRevLoad(true)
    await supabase.from('reviews').insert({ company_id: company.id, user_id: userId, rating: myRating, text: myText || null })
    setReviewSent(true)
    setShowReview(false)
    setMyRating(0)
    setMyText('')
    loadCompany()
    setRevLoad(false)
  }

  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'Inter,sans-serif',color:'#AAA'}}>Carregando...</div>

  if (notFound) return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'Inter,sans-serif',padding:24}}>
      <div style={{fontSize:48,marginBottom:16}}>🏪</div>
      <div style={{fontSize:20,fontWeight:700,marginBottom:8}}>Empresa não encontrada</div>
      <div style={{fontSize:13,color:'#AAA',marginBottom:24}}>Esta empresa não existe ou não está ativa.</div>
      <a href="/" style={{background:'#C9951A',color:'#fff',padding:'12px 24px',borderRadius:12,textDecoration:'none',fontWeight:600}}>Voltar ao início</a>
    </div>
  )

  if (!company) return null

  const photos = company.photos?.sort((a,b)=>a.order-b.order) || []
  const open = isOpenNow(company.hours)

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'Inter',sans-serif;background:#F0EDE8;}

        .page-wrap{max-width:800px;margin:0 auto;background:#fff;min-height:100vh;box-shadow:0 0 40px rgba(0,0,0,.08);}

        /* GALLERY */
        .gallery{position:relative;height:280px;background:#F0EDE8;overflow:hidden;}
        @media(min-width:768px){.gallery{height:400px;}}
        .gallery img{width:100%;height:100%;object-fit:cover;}
        .gallery-empty{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:64px;}
        .gal-prev,.gal-next{position:absolute;top:50%;transform:translateY(-50%);width:36px;height:36px;background:rgba(0,0,0,.5);color:#fff;border:none;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;}
        .gal-prev{left:12px;} .gal-next{right:12px;}
        .gal-dots{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);display:flex;gap:6px;}
        .gal-dot{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.5);cursor:pointer;}
        .gal-dot.on{background:#fff;width:20px;border-radius:4px;}
        .gal-count{position:absolute;top:12px;right:12px;background:rgba(0,0,0,.5);color:#fff;font-size:11px;padding:3px 10px;border-radius:10px;}
        .back-btn{position:absolute;top:12px;left:12px;display:flex;align-items:center;gap:5px;background:rgba(0,0,0,.5);color:#fff;padding:7px 12px 7px 10px;border-radius:20px;cursor:pointer;font-size:13px;font-weight:500;text-decoration:none;}

        /* HEADER */
        .empresa-hdr{padding:20px 20px 16px;border-bottom:0.5px solid #F0EDE8;}
        .empresa-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px;}
        .empresa-name{font-family:'Bebas Neue',sans-serif;font-size:clamp(22px,4vw,32px);color:#111;letter-spacing:1px;line-height:1.1;}
        .empresa-actions-top{display:flex;gap:8px;flex-shrink:0;}
        .icon-btn{width:38px;height:38px;border-radius:50%;border:1.5px solid #E0DDD8;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .15s;font-size:16px;}
        .icon-btn:hover{border-color:#C9951A;background:#FEF3E2;}
        .icon-btn.fav{border-color:#C9951A;background:#FEF3E2;}
        .empresa-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;}
        .cat-tag{font-size:12px;background:#F0EDE8;color:#666;padding:3px 10px;border-radius:10px;}
        .rating-tag{font-size:13px;color:#C9951A;font-weight:600;}
        .reviews-tag{font-size:12px;color:#AAA;}
        .open-tag{font-size:11px;font-weight:600;padding:3px 10px;border-radius:10px;}
        .open-yes{background:#EDFAF3;color:#0F8050;}
        .open-no{background:#FEF0F0;color:#E24B4A;}
        .subcats-row{display:flex;gap:6px;flex-wrap:wrap;}
        .subcat-tag{font-size:11px;padding:3px 9px;border-radius:8px;background:#F5F2EC;color:#666;border:0.5px solid #E0DDD8;}

        /* ACTION BUTTONS */
        .action-btns{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:16px 20px;border-bottom:0.5px solid #F0EDE8;}
        .action-btns.single{grid-template-columns:1fr;}
        .btn-wa{padding:13px;background:#25D366;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:background .15s;}
        .btn-wa:hover{background:#22c55e;}
        .btn-link{padding:13px;background:#185FA5;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:background .15s;}
        .btn-link:hover{background:#1d4ed8;}
        .btn-contact{padding:13px;background:#F5F2EC;color:#555;border:1.5px solid #E0DDD8;border-radius:12px;font-size:14px;font-weight:500;font-family:'Inter',sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;}

        /* SECTIONS */
        .section{padding:18px 20px;border-bottom:0.5px solid #F0EDE8;}
        .sec-lbl{font-family:'Bebas Neue',sans-serif;font-size:13px;color:#888;letter-spacing:1.5px;margin-bottom:12px;}
        .desc-text{font-size:14px;color:#555;line-height:1.8;}

        /* HOURS */
        .hours-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
        @media(min-width:600px){.hours-grid{grid-template-columns:repeat(4,1fr);}}
        .hour-box{background:#FAFAF8;border:0.5px solid #E0DDD8;border-radius:10px;padding:10px 12px;}
        .hour-day{font-size:10px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;}
        .hour-val{font-size:12px;color:#333;font-weight:500;}

        /* ADDRESS */
        .address-box{display:flex;align-items:flex-start;gap:10px;background:#FAFAF8;border:0.5px solid #E0DDD8;border-radius:12px;padding:14px;}
        .address-text{font-size:13px;color:#333;line-height:1.6;flex:1;}
        .map-btn{padding:8px 14px;background:#C9951A;color:#fff;border:none;border-radius:9px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;white-space:nowrap;flex-shrink:0;}

        /* REVIEWS */
        .rating-summary{display:flex;align-items:center;gap:16px;background:#FAFAF8;border:0.5px solid #E0DDD8;border-radius:13px;padding:16px;margin-bottom:16px;}
        .rating-big{font-family:'Bebas Neue',sans-serif;font-size:52px;color:#C9951A;letter-spacing:2px;line-height:1;text-align:center;}
        .rating-stars-big{font-size:18px;color:#C9951A;margin:'4px 0 2px';}
        .rating-total{font-size:12px;color:#AAA;}
        .bar-row{display:flex;align-items:center;gap:6px;margin-bottom:4px;}
        .bar-lbl{font-size:10px;color:#AAA;width:8px;}
        .bar-bg{flex:1;height:6px;background:#F0EDE8;border-radius:3px;overflow:hidden;}
        .bar-fill{height:100%;background:#C9951A;border-radius:3px;}
        .bar-cnt{font-size:10px;color:#CCC;width:20px;text-align:right;}
        .review-card{background:#FAFAF8;border:0.5px solid #EDE8E0;border-radius:12px;padding:14px;margin-bottom:10px;}
        .rv-top{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
        .rv-av{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#C9951A,#E8B84B);display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:14px;color:#fff;flex-shrink:0;}
        .rv-name{font-size:13px;font-weight:600;color:#333;}
        .rv-date{font-size:11px;color:#CCC;margin-left:auto;}
        .rv-stars{font-size:13px;color:#C9951A;margin-bottom:6px;}
        .rv-text{font-size:13px;color:#555;line-height:1.6;margin-bottom:8px;}
        .rv-resp{background:#FEF3E2;border:0.5px solid #F5C77A;border-radius:9px;padding:10px 12px;margin-top:8px;}
        .rv-resp-lbl{font-size:10px;font-weight:600;color:#854F0B;margin-bottom:3px;}
        .rv-resp-txt{font-size:12px;color:#854F0B;line-height:1.5;}

        /* WRITE REVIEW */
        .review-form{background:#FAFAF8;border:1.5px solid #C9951A;border-radius:14px;padding:16px;margin-bottom:12px;}
        .star-select{display:flex;gap:8px;margin-bottom:12px;}
        .star-btn{font-size:24px;cursor:pointer;transition:transform .1s;background:none;border:none;line-height:1;}
        .star-btn:hover{transform:scale(1.2);}
        .review-textarea{width:100%;padding:11px 13px;border:1.5px solid #E0DDD8;border-radius:11px;font-size:13px;font-family:'Inter',sans-serif;color:#222;background:#fff;outline:none;resize:none;transition:border-color .15s;}
        .review-textarea:focus{border-color:#C9951A;}
        .btn-submit-review{width:100%;padding:12px;background:#C9951A;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;margin-top:10px;}
        .btn-submit-review:disabled{opacity:.6;cursor:not-allowed;}
        .btn-write-review{width:100%;padding:12px;background:#FEF3E2;color:#C9951A;border:1.5px solid #C9951A;border-radius:12px;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;margin-bottom:14px;}

        /* FREE PLAN */
        .free-notice{background:#F7F4EF;border:1px solid #E0DDD8;border-radius:12px;padding:14px;text-align:center;font-size:13px;color:#888;line-height:1.6;}

        /* FOOTER */
        .page-footer{padding:24px 20px;text-align:center;font-size:12px;color:#AAA;}
        .page-footer a{color:#C9951A;text-decoration:none;}
      `}</style>

      <div className="page-wrap">

        {/* GALLERY */}
        <div className="gallery">
          <a className="back-btn" href="javascript:history.back()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            Voltar
          </a>

          {photos.length > 0 ? (
            <>
              <img src={photos[photoIdx]?.url} alt={company.name} />
              {photos.length > 1 && (
                <>
                  <button className="gal-prev" onClick={() => setPhotoIdx(i => (i-1+photos.length)%photos.length)}>‹</button>
                  <button className="gal-next" onClick={() => setPhotoIdx(i => (i+1)%photos.length)}>›</button>
                  <div className="gal-dots">{photos.map((_,i) => <div key={i} className={`gal-dot ${i===photoIdx?'on':''}`} onClick={()=>setPhotoIdx(i)}/>)}</div>
                  <div className="gal-count">{photoIdx+1} / {photos.length}</div>
                </>
              )}
            </>
          ) : (
            <div className="gallery-empty">{company.category?.emoji || '🏪'}</div>
          )}
        </div>

        {/* HEADER */}
        <div className="empresa-hdr">
          <div className="empresa-top">
            <div className="empresa-name">{company.name}</div>
            <div className="empresa-actions-top">
              <div className={`icon-btn ${isFav?'fav':''}`} onClick={toggleFav} title={isFav?'Remover favorito':'Favoritar'}>
                {isFav ? '❤️' : '🤍'}
              </div>
              <div className="icon-btn" onClick={() => { navigator.share?.({ title: company.name, url: window.location.href }) || navigator.clipboard?.writeText(window.location.href) }} title="Compartilhar">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              </div>
            </div>
          </div>

          <div className="empresa-meta">
            {company.category && <span className="cat-tag">{company.category.emoji} {company.category.name}</span>}
            {company.avg_rating > 0 && <span className="rating-tag">★ {company.avg_rating.toFixed(1)}</span>}
            {company.total_reviews > 0 && <span className="reviews-tag">({company.total_reviews} avaliações)</span>}
            {company.hours && company.hours.length > 0 && (
              <span className={`open-tag ${open?'open-yes':'open-no'}`}>{open?'● Aberto agora':'● Fechado'}</span>
            )}
          </div>

          {company.subcategories && company.subcategories.length > 0 && (
            <div className="subcats-row">
              {company.subcategories.map((s,i) => (
                <span key={i} className="subcat-tag">{s.subcategory.emoji} {s.subcategory.name}</span>
              ))}
            </div>
          )}
        </div>

        {/* ACTION BUTTONS */}
        {company.plan === 'paid' ? (
          <div className={`action-btns ${!company.external_link?'single':''}`}>
            {company.phone && (
              <button className="btn-wa" onClick={handleWhatsApp}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                Falar no WhatsApp
              </button>
            )}
            {company.external_link && (
              <button className="btn-link" onClick={handleLink}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                {company.external_link_label || 'Acessar site'}
              </button>
            )}
          </div>
        ) : (
          <div className="action-btns single">
            <div className="free-notice">
              Este estabelecimento ainda não possui plano ativo.<br/>
              <span style={{fontSize:12}}>Entre em contato pelo endereço abaixo.</span>
            </div>
          </div>
        )}

        {/* DESCRIÇÃO */}
        {company.description && (
          <div className="section">
            <div className="sec-lbl">SOBRE</div>
            <div className="desc-text">{company.description}</div>
          </div>
        )}

        {/* HORÁRIOS */}
        {company.hours && company.hours.length > 0 && (
          <div className="section">
            <div className="sec-lbl">HORÁRIO DE FUNCIONAMENTO</div>
            <div className="hours-grid">
              {company.hours.sort((a,b)=>a.order-b.order).map((h,i) => (
                <div key={i} className="hour-box">
                  <div className="hour-day">{h.label}</div>
                  <div className="hour-val" style={{color:h.hours.toLowerCase()==='fechado'?'#E24B4A':'#333'}}>{h.hours || '—'}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ENDEREÇO */}
        {company.address && (
          <div className="section">
            <div className="sec-lbl">ENDEREÇO</div>
            <div className="address-box">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9951A" strokeWidth="2" strokeLinecap="round" style={{flexShrink:0,marginTop:2}}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <div className="address-text">{company.address}</div>
              <button className="map-btn" onClick={() => window.open(`https://maps.google.com?q=${encodeURIComponent(company.address)}`, '_blank')}>
                Ver no mapa
              </button>
            </div>
          </div>
        )}

        {/* AVALIAÇÕES */}
        <div className="section">
          <div className="sec-lbl">AVALIAÇÕES {company.total_reviews > 0 && `(${company.total_reviews})`}</div>

          {company.plan === 'paid' && (
            <>
              {company.total_reviews > 0 && (
                <div className="rating-summary">
                  <div style={{textAlign:'center'}}>
                    <div className="rating-big">{company.avg_rating.toFixed(1)}</div>
                    <div className="rating-stars-big">{'★'.repeat(Math.round(company.avg_rating))}</div>
                    <div className="rating-total">{company.total_reviews} avaliações</div>
                  </div>
                  <div style={{flex:1}}>
                    {[5,4,3,2,1].map(star => {
                      const cnt = reviews.filter(r=>r.rating===star).length
                      const pct = reviews.length>0?(cnt/reviews.length)*100:0
                      return (
                        <div key={star} className="bar-row">
                          <span className="bar-lbl">{star}</span>
                          <div className="bar-bg"><div className="bar-fill" style={{width:`${pct}%`}}/></div>
                          <span className="bar-cnt">{cnt}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {reviewSent && <div style={{background:'#EDFAF3',border:'1px solid #A8E6C4',borderRadius:10,padding:'10px 14px',marginBottom:12,fontSize:13,color:'#0F5C3A'}}>✓ Sua avaliação foi enviada!</div>}

              {!reviewSent && !showReview && (
                <button className="btn-write-review" onClick={() => userId ? setShowReview(true) : window.location.href='/login'}>
                  ⭐ {userId ? 'Avaliar esta empresa' : 'Faça login para avaliar'}
                </button>
              )}

              {showReview && (
                <div className="review-form">
                  <div style={{fontSize:13,fontWeight:600,color:'#333',marginBottom:8}}>Sua avaliação</div>
                  <div className="star-select">
                    {[1,2,3,4,5].map(s => (
                      <button key={s} className="star-btn" onClick={() => setMyRating(s)}>
                        {s <= myRating ? '★' : '☆'}
                      </button>
                    ))}
                    {myRating > 0 && <span style={{fontSize:12,color:'#AAA',alignSelf:'center',marginLeft:4}}>{['','Ruim','Regular','Bom','Muito bom','Excelente'][myRating]}</span>}
                  </div>
                  <textarea className="review-textarea" rows={3} placeholder="Conte sua experiência (opcional)" value={myText} onChange={e=>setMyText(e.target.value)} />
                  <button className="btn-submit-review" onClick={submitReview} disabled={myRating===0||reviewLoading}>
                    {reviewLoading ? 'Enviando...' : 'Publicar avaliação'}
                  </button>
                </div>
              )}

              {reviews.map(r => (
                <div key={r.id} className="review-card">
                  <div className="rv-top">
                    <div className="rv-av">{r.user?.name?.[0]||'?'}</div>
                    <div><div className="rv-name">{r.user?.name||'Usuário'}</div></div>
                    <span className="rv-date">{fmtDate(r.created_at)}</span>
                  </div>
                  <div className="rv-stars">{'★'.repeat(r.rating)}{'☆'.repeat(5-r.rating)}</div>
                  {r.text && <div className="rv-text">{r.text}</div>}
                  {r.response && (
                    <div className="rv-resp">
                      <div className="rv-resp-lbl">Resposta da empresa:</div>
                      <div className="rv-resp-txt">{r.response.text}</div>
                    </div>
                  )}
                </div>
              ))}

              {reviews.length === 0 && !showReview && (
                <div style={{textAlign:'center',padding:'24px 0',color:'#AAA',fontSize:13}}>
                  Nenhuma avaliação ainda. Seja o primeiro! ⭐
                </div>
              )}
            </>
          )}

          {company.plan !== 'paid' && (
            <div style={{textAlign:'center',padding:'20px 0',color:'#AAA',fontSize:13}}>
              Avaliações disponíveis no plano pago.
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="page-footer">
          <a href="/">← Voltar ao Trindade Online</a>
          <br/><br/>
          <span style={{fontSize:11}}>Algo errado? <span style={{color:'#E24B4A',cursor:'pointer'}}>Denunciar esta empresa</span></span>
        </div>

      </div>
    </>
  )
}