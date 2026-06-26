'use client'

import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'

type CompanyHour   = { label: string; hours: string; order: number }
type CompanyPhoto  = { id: string; url: string; order: number }
type CompanySubcat = { subcategory: { name: string; emoji: string } }
type Company = {
  id: string; name: string; slug: string; status: string; plan: string
  description?: string; address?: string; phone?: string
  external_link?: string; external_link_label?: string
  avg_rating?: number; total_reviews?: number
  views_count?: number; whatsapp_clicks?: number
  category?: { name: string; emoji: string; slug?: string }
  trial_ends_at?: string
  subcategories?: CompanySubcat[]
  photos?: CompanyPhoto[]
  hours?: CompanyHour[]
}
type Review = {
  id: string; rating: number; text?: string; created_at: string
  user?: { name: string }
  response?: { text: string }
}

const fmtDate = (s: string) => new Date(s).toLocaleDateString('pt-BR')

function isOpenNow(hours?: CompanyHour[]): boolean {
  if (!hours || hours.length === 0) return false
  const day = new Date().getDay()
  const map: Record<number,string> = { 1:'Seg',2:'Seg',3:'Seg',4:'Seg',5:'Seg',6:'Sáb',0:'Dom' }
  const entry = hours.find(h => h.label.includes(map[day]))
  if (!entry || !entry.hours || entry.hours.toLowerCase() === 'fechado') return false
  const m = entry.hours.match(/(\d{2}):(\d{2})[–\-](\d{2}):(\d{2})/)
  if (!m) return true
  const cur = new Date().getHours() * 60 + new Date().getMinutes()
  return cur >= parseInt(m[1])*60+parseInt(m[2]) && cur <= parseInt(m[3])*60+parseInt(m[4])
}

export default function EmpresaPerfilPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)

  const [company, setCompany]       = useState<Company | null>(null)
  const [reviews, setReviews]       = useState<Review[]>([])
  const [loading, setLoading]       = useState(true)
  const [notFound, setNotFound]     = useState(false)
  const [photoIdx, setPhotoIdx]     = useState(0)
  const [userId, setUserId]         = useState<string | null>(null)
  const [isFav, setIsFav]           = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [myRating, setMyRating]     = useState(0)
  const [myText, setMyText]         = useState('')
  const [reviewSent, setReviewSent] = useState(false)
  const [revLoading, setRevLoad]    = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setUserId(session.user.id)
    })
    loadCompany()
  }, [])

  async function loadCompany() {
    const { data } = await supabase
      .from('companies')
      .select('*, trial_ends_at, category:categories(name,emoji,slug), subcategories:company_subcategories(subcategory:subcategories(name,emoji)), photos:company_photos(id,url,order), hours:company_hours(label,hours,order)')
      .eq('slug', slug)
      .maybeSingle()

    if (!data || data.status !== 'active') { setNotFound(true); setLoading(false); return }
    setCompany(data)
    await supabase.from('page_views').insert({ page: '/empresa', entity_id: data.id })
    await supabase.from('companies').update({ views_count: ((data.views_count as number) || 0) + 1 }).eq('id', data.id)
    const { data: revs } = await supabase.from('reviews').select('*, user:profiles(name), response:review_responses(text)').eq('company_id', data.id).order('created_at', { ascending: false })
    setReviews(revs || [])
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      const { data: fav } = await supabase.from('favorites').select('id').eq('user_id', session.user.id).eq('entity_type', 'company').eq('entity_id', data.id).maybeSingle()
      setIsFav(!!fav)
    }
    setLoading(false)
  }

  async function toggleFav() {
    if (!userId || !company) { window.location.href = '/login'; return }
    if (isFav) {
      await supabase.from('favorites').delete().eq('user_id', userId).eq('entity_type', 'company').eq('entity_id', company.id)
    } else {
      await supabase.from('favorites').insert({ user_id: userId, entity_type: 'company', entity_id: company.id })
    }
    setIsFav(!isFav)
  }

  async function handleWhatsApp() {
    if (!company?.phone) return
    await supabase.from('companies').update({ whatsapp_clicks: ((company.whatsapp_clicks as number) || 0) + 1 }).eq('id', company.id)
    await supabase.from('whatsapp_clicks').insert({ company_id: company.id, user_id: userId })
    window.open(`https://wa.me/55${company.phone.replace(/\D/g,'')}?text=Olá! Vi sua empresa no Trindade Online.`, '_blank')
  }

  async function submitReview() {
    if (!userId) { window.location.href = '/login'; return }
    if (myRating === 0 || !company) return
    setRevLoad(true)
    await supabase.from('reviews').insert({ company_id: company.id, user_id: userId, rating: myRating, text: myText || null })
    setReviewSent(true); setShowReview(false); setMyRating(0); setMyText('')
    loadCompany()
    setRevLoad(false)
  }

  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'Inter,sans-serif',color:'#AAA'}}>Carregando...</div>

  if (notFound) return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'Inter,sans-serif',padding:24,background:'#F0EDE8'}}>
      <div style={{fontSize:56,marginBottom:16}}>🏪</div>
      <div style={{fontSize:20,fontWeight:700,marginBottom:8}}>Empresa não encontrada</div>
      <div style={{fontSize:13,color:'#AAA',marginBottom:24}}>Esta empresa não existe ou não está ativa.</div>
      <a href="/" style={{background:'#C9951A',color:'#fff',padding:'12px 28px',borderRadius:12,textDecoration:'none',fontWeight:600}}>Voltar ao início</a>
    </div>
  )
  if (!company) return null

  const isActive = company.plan === 'paid' || (!!company.trial_ends_at && new Date(company.trial_ends_at) > new Date())
  const trialDaysLeft = company.trial_ends_at ? Math.ceil((new Date(company.trial_ends_at).getTime() - Date.now()) / 86400000) : 0
  const photos = (company.photos || []).sort((a,b) => a.order - b.order)
  const open = isOpenNow(company.hours)
  const avgRating = company.avg_rating || 0

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'Inter',sans-serif;background:#F0EDE8;}

        .topbar{background:#111;position:sticky;top:0;z-index:50;}
        .topbar-inner{max-width:1200px;margin:0 auto;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;}
        .t-logo{font-family:'Bebas Neue',sans-serif;font-size:20px;color:#fff;letter-spacing:2px;text-decoration:none;}
        .t-bc{display:flex;align-items:center;gap:7px;font-size:13px;}
        .t-bc a{color:#C9951A;font-weight:700;text-decoration:none;}
        .t-bc a:hover{text-decoration:underline;}
        .t-bc-sep{color:#444;font-size:14px;}
        .t-bc-cur{color:#fff;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;}
        .t-logo span{color:#C9951A;}
        .t-back{color:#888;font-size:13px;text-decoration:none;display:flex;align-items:center;gap:5px;}
        .t-back:hover{color:#fff;}

        .page{max-width:1100px;margin:0 auto;padding:24px 24px 48px;min-height:100vh;}
        @media(max-width:767px){.page{padding:16px 16px 40px;}}

        /* TOP GRID */
        .top-grid{display:grid;grid-template-columns:1fr 300px;gap:24px;margin-bottom:36px;}
        @media(max-width:767px){.top-grid{grid-template-columns:1fr;gap:0;}}

        /* GALERIA */
        .gallery{border-radius:14px;overflow:hidden;margin-bottom:18px;}
        .gal-wrap{height:300px;background:#111;display:grid;grid-template-columns:2fr 1fr;grid-template-rows:1fr 1fr;gap:3px;}
        @media(max-width:767px){.gal-wrap{height:220px;}}
        .gal-big{grid-row:1/3;overflow:hidden;position:relative;}
        .gal-big img,.gal-sm img{width:100%;height:100%;object-fit:cover;}
        .gal-big-empty{width:100%;height:100%;background:#1a1a1a;display:flex;align-items:center;justify-content:center;font-size:56px;}
        .gal-sm{overflow:hidden;position:relative;}
        .gal-sm-empty{width:100%;height:100%;background:#222;display:flex;align-items:center;justify-content:center;font-size:28px;}
        .gal-ov{position:absolute;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;color:#fff;font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:1px;cursor:pointer;}
        .gal-nav{position:absolute;bottom:10px;right:10px;background:rgba(0,0,0,.6);color:#fff;font-size:11px;font-weight:500;padding:3px 10px;border-radius:12px;}

        /* INFO */
        .empresa-name{font-family:'Bebas Neue',sans-serif;font-size:clamp(26px,4vw,36px);color:#111;letter-spacing:1px;margin-bottom:8px;}
        .tags{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;}
        .tag{font-size:11px;padding:3px 9px;border-radius:7px;font-weight:500;}
        .tag-cat{background:#F0EDE8;color:#666;border:0.5px solid #E0DDD8;}
        .tag-open{background:#EDFAF3;color:#0F6E56;}
        .tag-closed{background:#FEF0F0;color:#E24B4A;}
        .tag-sub{background:#EBF4FF;color:#185FA5;}
        .stars-row{display:flex;align-items:center;gap:7px;margin-bottom:18px;}
        .rating-row{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-top:0.5px solid #F0EDE8;border-bottom:0.5px solid #F0EDE8;margin-bottom:18px;gap:10px;}
        .rating-left{display:flex;align-items:center;gap:7px;flex-wrap:wrap;}
        .st{color:#C9951A;font-size:15px;}
        .rn{font-weight:600;font-size:14px;color:#111;}
        .rc{font-size:12px;color:#AAA;}
        .sec-lbl{font-family:'Bebas Neue',sans-serif;font-size:11px;color:#AAA;letter-spacing:1.5px;margin-bottom:8px;}
        .desc{font-size:14px;color:#555;line-height:1.8;}

        /* COLUNA DIREITA */
        .right-col{display:flex;flex-direction:column;gap:10px;}
        @media(min-width:768px){.right-col{position:sticky;top:60px;max-height:calc(100vh - 80px);overflow-y:auto;}}
        @media(max-width:767px){.right-col{margin-top:20px;}}

        /* CARD CONTATO */
        .contact-card{background:#FAFAF8;border:0.5px solid #EDE8E0;border-radius:14px;overflow:hidden;}
        .c-photo{height:130px;overflow:hidden;display:flex;align-items:center;justify-content:center;}
        .c-photo img{width:100%;height:100%;object-fit:cover;}
        .c-photo-empty{width:100%;height:100%;background:linear-gradient(135deg,#111,#2a2a2a);display:flex;align-items:center;justify-content:center;font-size:44px;}
        .c-body{padding:13px 14px;}
        .c-open-badge{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:600;padding:2px 8px;border-radius:6px;margin-bottom:6px;}
        .c-open-yes{background:#EDFAF3;color:#0F6E56;}
        .c-open-no{background:#FEF0F0;color:#E24B4A;}
        .c-name{font-family:'Bebas Neue',sans-serif;font-size:18px;color:#111;letter-spacing:1px;margin-bottom:2px;}
        .c-cat{font-size:11px;color:#AAA;margin-bottom:10px;}
        .btn-wa{width:100%;padding:10px;background:#25D366;color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;margin-bottom:6px;transition:opacity .15s;}
        .btn-wa:hover{opacity:.9;}
        .btn-ext{width:100%;padding:10px;background:#EBF4FF;color:#185FA5;border:0.5px solid #B5D4F4;border-radius:9px;font-size:13px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;margin-bottom:6px;transition:opacity .15s;}
        .btn-ext:hover{opacity:.9;}
        .btn-fav{width:100%;padding:8px;background:#fff;color:#888;border:0.5px solid #E0DDD8;border-radius:9px;font-size:12px;font-family:'Inter',sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;}
        .btn-fav.on{background:#FEF3E2;color:#C9951A;border-color:#F5C77A;}

        /* ENDEREÇO */
        .addr-box{display:flex;align-items:flex-start;gap:9px;background:#FAFAF8;border:0.5px solid #EDE8E0;border-radius:12px;padding:11px 13px;}
        .addr-txt{font-size:12px;color:#555;line-height:1.6;flex:1;}

        /* MAPA */
        .map-card{background:#FAFAF8;border:0.5px solid #EDE8E0;border-radius:14px;overflow:hidden;}
        .map-preview{height:130px;background:#F0EDE8;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;}
        .map-pin{font-size:28px;z-index:2;position:relative;}
        .map-lbl{position:absolute;bottom:6px;left:0;right:0;text-align:center;font-size:10px;font-weight:500;color:#888;}
        .map-open-btn{width:100%;padding:10px;background:#FAFAF8;border:none;border-top:0.5px solid #EDE8E0;font-size:12px;font-weight:600;color:#185FA5;cursor:pointer;font-family:'Inter',sans-serif;display:flex;align-items:center;justify-content:center;gap:5px;}

        /* AVALIAÇÕES */
        .rv-section{border-top:0.5px solid #F0EDE8;padding-top:28px;}
        .rv-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px;}
        .rv-sum{display:flex;align-items:center;gap:14px;}
        .rv-big{font-family:'Bebas Neue',sans-serif;font-size:48px;color:#C9951A;line-height:1;}
        .rv-info{display:flex;flex-direction:column;gap:2px;}
        .rv-st-big{font-size:15px;color:#C9951A;}
        .rv-cnt{font-size:11px;color:#AAA;}
        .rv-bars{display:flex;flex-direction:column;gap:4px;min-width:120px;}
        .bar-r{display:flex;align-items:center;gap:6px;}
        .bar-bg{flex:1;height:5px;background:#F0EDE8;border-radius:3px;overflow:hidden;}
        .bar-f{height:100%;background:#C9951A;border-radius:3px;}
        .btn-write-rv{padding:7px 14px;background:#FEF3E2;color:#C9951A;border:1.5px solid #C9951A;border-radius:8px;font-size:12px;font-weight:700;font-family:'Inter',sans-serif;cursor:pointer;white-space:nowrap;flex-shrink:0;}

        .rv-form{background:#FAFAF8;border:1.5px solid #C9951A;border-radius:14px;padding:16px;margin-bottom:16px;}
        .star-row{display:flex;gap:8px;margin-bottom:10px;}
        .star-btn{font-size:26px;cursor:pointer;background:none;border:none;line-height:1;transition:transform .1s;}
        .star-btn:hover{transform:scale(1.2);}
        .rv-textarea{width:100%;padding:11px 13px;border:1.5px solid #E0DDD8;border-radius:11px;font-size:13px;font-family:'Inter',sans-serif;outline:none;resize:none;transition:border-color .15s;}
        .rv-textarea:focus{border-color:#C9951A;}
        .btn-rv-submit{width:100%;padding:12px;background:#C9951A;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;margin-top:10px;}
        .btn-rv-submit:disabled{opacity:.6;cursor:not-allowed;}

        .rv-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}
        @media(max-width:900px){.rv-grid{grid-template-columns:repeat(2,1fr);}}
        @media(max-width:600px){.rv-grid{grid-template-columns:1fr;}}

        .rv-card{background:#FAFAF8;border:0.5px solid #EDE8E0;border-radius:12px;padding:14px;}
        .rv-top{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
        .rv-av{width:32px;height:32px;border-radius:50%;background:#C9951A;display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:13px;color:#fff;flex-shrink:0;}
        .rv-name{font-size:13px;font-weight:600;color:#222;}
        .rv-date{font-size:10px;color:#CCC;margin-left:auto;}
        .rv-stars{font-size:12px;color:#C9951A;margin-bottom:5px;}
        .rv-txt{font-size:12px;color:#555;line-height:1.6;}
        .rv-resp{background:#FEF3E2;border:0.5px solid #F5C77A;border-radius:8px;padding:8px 10px;margin-top:8px;}
        .rv-resp-l{font-size:10px;font-weight:600;color:#854F0B;margin-bottom:2px;}
        .rv-resp-t{font-size:11px;color:#854F0B;line-height:1.5;}

        .page-footer{padding:28px 0 8px;text-align:center;font-size:12px;color:#AAA;border-top:0.5px solid #F0EDE8;margin-top:32px;}
        .page-footer a{color:#C9951A;text-decoration:none;}
        .ok-msg{background:#EDFAF3;border:1px solid #A8E6C4;border-radius:10px;padding:10px 14px;font-size:13px;color:#0F5C3A;margin-bottom:14px;}
      `}</style>

      {/* TOPBAR */}
      <div className="topbar">
        <div className="topbar-inner">
          <a className="t-logo" href="/">TRINDADE <span>ONLINE</span></a>
          <div className="t-bc">
            <a href="/">Início</a>
            {company?.category && (
              <>
                <span className="t-bc-sep">›</span>
                <a href={`/categoria/${company.category.slug || ''}`}>{company.category.name}</a>
              </>
            )}
            <span className="t-bc-sep">›</span>
            <span className="t-bc-cur">{company?.name || '...'}</span>
          </div>
          <div/>
        </div>
      </div>

      <div className="page">
        <div className="top-grid">

          {/* COLUNA ESQUERDA */}
          <div>
            {/* GALERIA */}
            <div className="gallery">
              <div className="gal-wrap">
                <div className="gal-big">
                  {photos[0] ? <img src={photos[photoIdx]?.url} alt={company.name} onClick={() => setPhotoIdx(i => (i+1)%photos.length)} style={{cursor:photos.length>1?'pointer':'default'}} /> : <div className="gal-big-empty">{company.category?.emoji || '🏪'}</div>}
                  {photos.length > 1 && <div className="gal-nav">{photoIdx+1} / {photos.length}</div>}
                </div>
                <div className="gal-sm">
                  {photos[1] ? <img src={photos[1].url} alt="" onClick={() => setPhotoIdx(1)} style={{cursor:'pointer'}} /> : <div className="gal-sm-empty">{company.category?.emoji || '🏪'}</div>}
                </div>
                <div className="gal-sm">
                  {photos[2] ? (
                    <>
                      <img src={photos[2].url} alt="" onClick={() => setPhotoIdx(2)} style={{cursor:'pointer'}} />
                      {photos.length > 3 && <div className="gal-ov" onClick={() => setPhotoIdx(3)}>+{photos.length - 3} fotos</div>}
                    </>
                  ) : <div className="gal-sm-empty">{company.category?.emoji || '🏪'}</div>}
                </div>
              </div>
            </div>

            <div className="empresa-name">{company.name}</div>
            <div className="tags">
              {company.category && <span className="tag tag-cat">{company.category.emoji} {company.category.name}</span>}
              {company.hours && company.hours.length > 0 && <span className={`tag ${open ? 'tag-open' : 'tag-closed'}`}>{open ? '● Aberto agora' : '● Fechado'}</span>}
              {company.subcategories?.map((s,i) => <span key={i} className="tag tag-sub">{s.subcategory.emoji} {s.subcategory.name}</span>)}
            </div>
  

            {/* RATING ROW COM BOTÃO AVALIAR */}
            <div className="rating-row">
              <div className="rating-left">
                {avgRating > 0 ? (
                  <>
                    <span className="st">{'★'.repeat(Math.round(avgRating))}{'☆'.repeat(5-Math.round(avgRating))}</span>
                    <span className="rn">{avgRating.toFixed(1)}</span>
                    <span className="rc">({company.total_reviews} avaliação{company.total_reviews !== 1 ? 's' : ''})</span>
                  </>
                ) : (
                  <span className="rc">Sem avaliações ainda</span>
                )}
              </div>
              {!reviewSent && (
                <button className="btn-write-rv" onClick={() => userId ? setShowReview(!showReview) : window.location.href='/login'}>
                  ⭐ {userId ? 'Avaliar' : 'Entrar para avaliar'}
                </button>
              )}
              {reviewSent && <span style={{fontSize:12,color:'#0F6E56',fontWeight:600}}>✓ Avaliação enviada!</span>}
            </div>

            {company.description && (
              <>
                <div className="sec-lbl">SOBRE</div>
                <div className="desc">{company.description}</div>
              </>
            )}
          </div>

          {/* COLUNA DIREITA */}
          <div className="right-col">

            {/* CARD CONTATO */}
            <div className="contact-card">
              <div className="c-photo">
                {photos[0] ? <img src={photos[0].url} alt={company.name} /> : <div className="c-photo-empty">{company.category?.emoji || '🏪'}</div>}
              </div>
              <div className="c-body">
                {company.hours && company.hours.length > 0 && (
                  <div className={`c-open-badge ${open ? 'c-open-yes' : 'c-open-no'}`}>{open ? '● Aberto agora' : '● Fechado agora'}</div>
                )}
                {company.plan !== 'paid' && company.trial_ends_at && trialDaysLeft > 0 && (
                  <div style={{fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:6,background:'#FEF3E2',color:'#854F0B',marginBottom:6,display:'inline-block'}}>
                    🕐 Trial: {trialDaysLeft} dia{trialDaysLeft!==1?'s':''} restante{trialDaysLeft!==1?'s':''}
                  </div>
                )}
                <div className="c-name">{company.name}</div>
                <div className="c-cat">{company.category?.emoji} {company.category?.name}{company.subcategories?.[0] ? ` · ${company.subcategories[0].subcategory.name}` : ''}</div>

                {isActive && company.phone && (
                  <button className="btn-wa" onClick={handleWhatsApp}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                    Falar no WhatsApp
                  </button>
                )}
                {isActive && company.external_link && (
                  <button className="btn-ext" onClick={() => window.open(company.external_link!, '_blank')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    {company.external_link_label || 'Acessar site'}
                  </button>
                )}
                <button className={`btn-fav ${isFav ? 'on' : ''}`} onClick={toggleFav}>
                  {isFav ? '❤️' : '🤍'} {isFav ? 'Salvo nos favoritos' : 'Salvar nos favoritos'}
                </button>
              </div>
            </div>

            {/* ENDEREÇO */}
            {company.address && (
              <div className="addr-box">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#C9951A" strokeWidth="2" strokeLinecap="round" style={{flexShrink:0,marginTop:2}}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <div className="addr-txt">{company.address}</div>
              </div>
            )}

            {/* MAPA */}
            {company.address && (
              <div className="map-card">
                <div className="map-preview">
                  <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',opacity:.12}} viewBox="0 0 300 130" xmlns="http://www.w3.org/2000/svg">
                    <defs><pattern id="gr" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M 18 0 L 0 0 0 18" fill="none" stroke="#111" strokeWidth="0.5"/></pattern></defs>
                    <rect width="300" height="130" fill="url(#gr)"/>
                    <rect x="20" y="15" width="55" height="25" rx="2" fill="#888" opacity=".5"/>
                    <rect x="100" y="35" width="70" height="35" rx="2" fill="#888" opacity=".4"/>
                    <rect x="200" y="10" width="45" height="22" rx="2" fill="#888" opacity=".5"/>
                    <rect x="20" y="70" width="80" height="40" rx="2" fill="#888" opacity=".3"/>
                    <rect x="135" y="80" width="60" height="40" rx="2" fill="#888" opacity=".4"/>
                    <line x1="0" y1="55" x2="300" y2="55" stroke="#C9951A" strokeWidth="2" opacity=".5"/>
                    <line x1="95" y1="0" x2="95" y2="130" stroke="#C9951A" strokeWidth="2" opacity=".5"/>
                  </svg>
                  <span className="map-pin">📍</span>
                  <div className="map-lbl">{company.address}</div>
                </div>
                <button className="map-open-btn" onClick={() => window.open(`https://maps.google.com?q=${encodeURIComponent(company.address || '')}`, '_blank')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  Abrir no Google Maps
                </button>
              </div>
            )}
          </div>
        </div>

        {/* AVALIAÇÕES — LARGURA TOTAL */}
        {isActive && (
          <div className="rv-section">
            <div style={{marginBottom:16}}>
              <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:12,color:'#AAA',letterSpacing:'1.5px'}}>
                AVALIAÇÕES ({company.total_reviews || 0})
              </span>
            </div>

            {reviewSent && <div className="ok-msg">✓ Sua avaliação foi enviada!</div>}

            {showReview && (
              <div className="rv-form">
                <div style={{fontSize:13,fontWeight:600,color:'#333',marginBottom:8}}>Sua avaliação</div>
                <div className="star-row">
                  {[1,2,3,4,5].map(s => (
                    <button key={s} className="star-btn" onClick={() => setMyRating(s)}>{s <= myRating ? '★' : '☆'}</button>
                  ))}
                  {myRating > 0 && <span style={{fontSize:12,color:'#AAA',alignSelf:'center',marginLeft:4}}>{['','Ruim','Regular','Bom','Muito bom','Excelente'][myRating]}</span>}
                </div>
                <textarea className="rv-textarea" rows={3} placeholder="Conte sua experiência (opcional)" value={myText} onChange={e => setMyText(e.target.value)} />
                <button className="btn-rv-submit" onClick={submitReview} disabled={myRating === 0 || revLoading}>
                  {revLoading ? 'Enviando...' : 'Publicar avaliação'}
                </button>
              </div>
            )}

            {reviews.length === 0 && !showReview && (
              <div style={{textAlign:'center',padding:'32px 0',color:'#AAA',fontSize:13}}>
                Nenhuma avaliação ainda. Seja o primeiro! ⭐
              </div>
            )}

            {reviews.length > 0 && (
              <div className="rv-grid">
                {reviews.map(r => (
                  <div key={r.id} className="rv-card">
                    <div className="rv-top">
                      <div className="rv-av" style={{background:['#C9951A','#185FA5','#0F6E56','#854F0B','#E24B4A'][r.rating % 5]}}>{r.user?.name?.[0] || '?'}</div>
                      <div className="rv-name">{r.user?.name || 'Usuário'}</div>
                      <span className="rv-date">{fmtDate(r.created_at)}</span>
                    </div>
                    <div className="rv-stars">{'★'.repeat(r.rating)}{'☆'.repeat(5-r.rating)}</div>
                    {r.text && <div className="rv-txt">{r.text}</div>}
                    {r.response && (
                      <div className="rv-resp">
                        <div className="rv-resp-l">Resposta da empresa:</div>
                        <div className="rv-resp-t">{r.response.text}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="page-footer">
          <a href="/">← Voltar ao Trindade Online</a>
        </div>
      </div>
    </>
  )
}