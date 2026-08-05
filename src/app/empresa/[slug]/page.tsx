'use client'

import { useState, useEffect, use, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import ShareButton from '@/components/ShareButton'
import { compressImage } from '@/lib/compressImage'
import { usePalavraPremiada, PalavraPremiadaModal } from '@/components/PalavraPremiada'

type CompanyHour   = { label: string; hours: string; order: number }
type CompanyPhoto  = { id: string; url: string; order: number }
type CompanySubcat = { subcategory_id?: string; subcategory: { name: string; emoji: string } }
type Company = {
  id: string; name: string; slug: string; status: string; plan: string
  description?: string; address?: string; phone?: string
  external_link?: string; external_link_label?: string
  avg_rating?: number; total_reviews?: number
  views_count?: number; whatsapp_clicks?: number
  owner_id?: string; category_id?: string
  category?: { name: string; emoji: string; slug?: string }
  trial_ends_at?: string
  subcategories?: CompanySubcat[]
  photos?: CompanyPhoto[]
  hours?: CompanyHour[]
}
type SimpleCategory    = { id: string; name: string; emoji: string }
type SimpleSubcategory = { id: string; name: string; emoji: string; category_id: string }
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

/* ── Galeria dinâmica por número de fotos ── */
function Lightbox({ photos, idx, open, setIdx, onClose, isAdmin }: { photos: CompanyPhoto[]; idx: number; open: boolean; setIdx: (v:number|((i:number)=>number)) => void; onClose: () => void; isAdmin?: boolean }) {
  const imgRef = useRef<HTMLImageElement>(null)
  if (!open) return null
  const n = photos.length
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.95)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <button onClick={(e) => { e.stopPropagation(); onClose() }} style={{position:'absolute',top:20,right:20,background:'rgba(0,0,0,0.7)',border:'2px solid #fff',color:'#fff',fontSize:28,width:44,height:44,borderRadius:22,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2}}>×</button>
      {n > 1 && (<>
        <button onClick={(e) => { e.stopPropagation(); setIdx((i:number) => (i - 1 + n) % n) }} style={{position:'absolute',left:20,top:'50%',transform:'translateY(-50%)',background:'rgba(0,0,0,0.7)',border:'2px solid #fff',color:'#fff',fontSize:28,width:50,height:50,borderRadius:25,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2}}>‹</button>
        <button onClick={(e) => { e.stopPropagation(); setIdx((i:number) => (i + 1) % n) }} style={{position:'absolute',right:20,top:'50%',transform:'translateY(-50%)',background:'rgba(0,0,0,0.7)',border:'2px solid #fff',color:'#fff',fontSize:28,width:50,height:50,borderRadius:25,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2}}>›</button>
        <div style={{position:'absolute',bottom:20,left:'50%',transform:'translateX(-50%)',background:'rgba(0,0,0,0.6)',color:'#fff',padding:'6px 16px',borderRadius:20,fontSize:13,fontWeight:600,zIndex:2}}>{idx + 1} / {n}</div>
      </>)}
      <img src={photos[idx]?.url || ''} alt="" onClick={(e) => e.stopPropagation()} style={{maxWidth:'92vw',maxHeight:'92vh',objectFit:'contain',borderRadius:8}} />
    </div>
  )
}

function Gallery({ photos, emoji, isAdmin }: { photos: CompanyPhoto[]; emoji: string; isAdmin?: boolean }) {
  const [idx, setIdx] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIdx, setLightboxIdx] = useState(0)
  function openLightbox(i: number) { setLightboxIdx(i); setLightboxOpen(true) }
  useEffect(() => {
    if (!lightboxOpen) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightboxOpen(false)
      if (e.key === 'ArrowRight') setLightboxIdx(i => (i + 1) % photos.length)
      if (e.key === 'ArrowLeft') setLightboxIdx(i => (i - 1 + photos.length) % photos.length)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [lightboxOpen, photos.length])
  const n = photos.length

  const imgStyle: React.CSSProperties = { width:'100%', height:'100%', objectFit:'cover', display:'block', cursor:'pointer' }
  const emptyStyle: React.CSSProperties = { width:'100%', height:'100%', background:'#1a1a1a', display:'flex', alignItems:'center', justifyContent:'center', fontSize:56 }

  function src(i: number) { return photos[i]?.url || '' }

  /* 0 fotos */
  if (n === 0) return (
    <div style={{ width:'100%', height:360, background:'#111', borderRadius:16, display:'flex', alignItems:'center', justifyContent:'center', fontSize:72 }}>
      {emoji}
    </div>
  )

  /* 1 foto */
  if (n === 1) return (
    <>
    <div style={{ width:'100%', height:400, borderRadius:16, overflow:'hidden' }}>
      <img src={src(0)} alt="" onClick={() => openLightbox(0)} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block', cursor:'pointer' }} />
    </div>
    <Lightbox isAdmin={isAdmin} photos={photos} idx={lightboxIdx} open={lightboxOpen} setIdx={setLightboxIdx} onClose={() => setLightboxOpen(false)} />
    </>
  )

  /* 2 fotos */
  if (n === 2) return (
    <>
    <div style={{ width:'100%', height:380, borderRadius:16, overflow:'hidden', display:'grid', gridTemplateColumns:'1fr 1fr', gap:3 }}>
      <img src={src(0)} alt="" style={imgStyle} onClick={() => openLightbox(0)} />
      <img src={src(1)} alt="" style={imgStyle} onClick={() => openLightbox(1)} />
    </div>
    <Lightbox isAdmin={isAdmin} photos={photos} idx={lightboxIdx} open={lightboxOpen} setIdx={setLightboxIdx} onClose={() => setLightboxOpen(false)} />
    </>
  )

  /* 3 fotos */
  if (n === 3) return (
    <>
    <div style={{ width:'100%', height:380, borderRadius:16, overflow:'hidden', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:3 }}>
      <img src={src(0)} alt="" style={imgStyle} onClick={() => openLightbox(0)} />
      <img src={src(1)} alt="" style={imgStyle} onClick={() => openLightbox(1)} />
      <img src={src(2)} alt="" style={imgStyle} onClick={() => openLightbox(2)} />
    </div>
    <Lightbox isAdmin={isAdmin} photos={photos} idx={lightboxIdx} open={lightboxOpen} setIdx={setLightboxIdx} onClose={() => setLightboxOpen(false)} />
    </>
  )

  /* 4 fotos */
  if (n === 4) return (
    <>
    <div style={{ width:'100%', height:380, borderRadius:16, overflow:'hidden', display:'grid', gridTemplateColumns:'2fr 1fr', gridTemplateRows:'1fr 1fr', gap:3 }}>
      <div style={{ gridRow:'1/3', overflow:'hidden' }}><img src={src(idx)} alt="" style={imgStyle} onClick={() => openLightbox(idx)} /></div>
      <div style={{ overflow:'hidden' }}><img src={src(1)} alt="" style={imgStyle} onClick={() => openLightbox(1)} /></div>
      <div style={{ overflow:'hidden' }}><img src={src(2)} alt="" style={imgStyle} onClick={() => openLightbox(2)} /></div>
    </div>
    <Lightbox isAdmin={isAdmin} photos={photos} idx={lightboxIdx} open={lightboxOpen} setIdx={setLightboxIdx} onClose={() => setLightboxOpen(false)} />
    </>
  )

  /* 5+ fotos */
  return (
    <>
    <div style={{ width:'100%', height:380, borderRadius:16, overflow:'hidden', display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gridTemplateRows:'1fr 1fr', gap:3 }}>
      <div style={{ gridRow:'1/3', overflow:'hidden', position:'relative' }}>
        <img src={src(idx)} alt="" style={imgStyle} onClick={() => openLightbox(idx)} />
        <div style={{ position:'absolute', bottom:10, right:10, background:'rgba(0,0,0,.6)', color:'#fff', fontSize:11, fontWeight:500, padding:'3px 10px', borderRadius:12 }}>{idx+1} / {n}</div>
      </div>
      <div style={{ overflow:'hidden' }}><img src={src(1)} alt="" style={imgStyle} onClick={() => openLightbox(1)} /></div>
      <div style={{ overflow:'hidden' }}><img src={src(2)} alt="" style={imgStyle} onClick={() => openLightbox(2)} /></div>
      <div style={{ overflow:'hidden' }}><img src={src(3)} alt="" style={imgStyle} onClick={() => openLightbox(3)} /></div>
      <div style={{ overflow:'hidden', position:'relative' }}>
        <img src={src(4)} alt="" style={imgStyle} onClick={() => openLightbox(4)} />
        {n > 5 && (
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.55)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontFamily:'"Bebas Neue",sans-serif', fontSize:18, letterSpacing:1, cursor:'pointer' }} onClick={() => openLightbox(5)}>
            +{n - 5} fotos
          </div>
        )}
      </div>
    </div>
    <Lightbox isAdmin={isAdmin} photos={photos} idx={lightboxIdx} open={lightboxOpen} setIdx={setLightboxIdx} onClose={() => setLightboxOpen(false)} />
    </>
  )
}

export default function EmpresaPerfilPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)

  const [company, setCompany]       = useState<Company | null>(null)
  const [reviews, setReviews]       = useState<Review[]>([])
  const [loading, setLoading]       = useState(true)
  const [notFound, setNotFound]     = useState(false)
  const [userId, setUserId]         = useState<string | null>(null)
  const [isOwner, setIsOwner]       = useState(false)
  const [isFav, setIsFav]           = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [showContato, setShowContato] = useState(false)
  const [contatoSent, setContatoSent]  = useState(false)
  const [sendingContato, setSendingContato] = useState(false)
  const [myRating, setMyRating]     = useState(0)
  const [myText, setMyText]         = useState('')
  const [reviewSent, setReviewSent] = useState(false)
  const [revLoading, setRevLoad]    = useState(false)
  const [alreadyReviewed, setAlreadyReviewed] = useState(false)
  const [isAdmin, setIsAdmin]       = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [descText, setDescText]       = useState('')
  const [savingDesc, setSavingDesc]   = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameText, setNameText]       = useState('')
  const [savingName, setSavingName]   = useState(false)
  const [editingCategory, setEditingCategory] = useState(false)
  const [categorySelId, setCategorySelId]     = useState('')
  const [savingCategory, setSavingCategory]   = useState(false)
  const [editingSubcats, setEditingSubcats]   = useState(false)
  const [subcatSelIds, setSubcatSelIds]       = useState<string[]>([])
  const [savingSubcats, setSavingSubcats]     = useState(false)
  const [allCategories, setAllCategories]     = useState<SimpleCategory[]>([])
  const [allSubcats, setAllSubcats]           = useState<SimpleSubcategory[]>([])
  const [uploadingPhoto, setUploadingPhoto]   = useState(false)
  const [premiadaAtiva, setPremiadaAtiva]     = useState<{ active: boolean; prize_description?: string | null }>({ active: false })
  const [premiadaInput, setPremiadaInput]     = useState('')
  const { premio, setPremio, checarPalavraPremiada, waResgateUrl } = usePalavraPremiada()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setUserId(session.user.id)
    })
    loadCompany()
  }, [])

  // Confere se essa loja tem rodada da Palavra Premiada ativa; se veio de
  // um redirect de login com ?palavra=, já reconfere a palavra na hora
  useEffect(() => {
    if (!company?.id) return
    fetch(`/api/palavra-premiada?company_id=${company.id}`)
      .then(r => r.json())
      .then(data => {
        setPremiadaAtiva(data)
        const palavraPendente = new URLSearchParams(window.location.search).get('palavra')
        if (palavraPendente) {
          setPremiadaInput(palavraPendente)
          checarPalavraPremiada(palavraPendente, company.id)
        }
      })
      .catch(() => {})
  }, [company?.id])

  function handlePalavraPremiadaSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!company?.id) return
    const raw = e.currentTarget.querySelector('input')?.value ?? premiadaInput
    if (raw.trim()) checarPalavraPremiada(raw.trim(), company.id)
  }

  const COMPANY_SELECT = '*, owner_id, trial_ends_at, category:categories(name,emoji,slug), subcategories:company_subcategories(subcategory_id, subcategory:subcategories(name,emoji)), photos:company_photos(id,url,order), hours:company_hours(label,hours,order)'

  // Recarrega os dados da empresa sem contar view nem duplicar log — usado após salvar edições
  async function refreshCompany() {
    const { data } = await supabase.from('companies').select(COMPANY_SELECT).eq('slug', slug).maybeSingle()
    if (data) setCompany(data)
  }

  async function loadCompany() {
    const { data } = await supabase
      .from('companies')
      .select(COMPANY_SELECT)
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
      const now = new Date()
      const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay())
      weekStart.setHours(0,0,0,0)
      const { data: myReview } = await supabase.from('reviews').select('id').eq('user_id', session.user.id).eq('company_id', data.id).gte('created_at', weekStart.toISOString()).maybeSingle()
      setAlreadyReviewed(!!myReview)
      const { data: prof } = await supabase.from('profiles').select('user_type').eq('id', session.user.id).single()
      const admin = prof?.user_type === 'admin'
      setIsAdmin(admin)
      setIsOwner(data.owner_id === session.user.id || admin)
      if (admin) {
        const { data: catsData } = await supabase.from('categories').select('id,name,emoji').order('name')
        setAllCategories(catsData || [])
        const { data: subcatsData } = await supabase.from('subcategories').select('id,name,emoji,category_id').eq('active', true).order('order')
        setAllSubcats(subcatsData || [])
      }
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

  async function solicitarContato() {
    if (!company) return
    setSendingContato(true)
    try {
      await supabase.from('contact_requests').insert({ company_id: company.id })
      await fetch('/api/notificar-interesse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: company.id })
      })
      setContatoSent(true)
    } catch (err) {
      console.error(err)
    }
    setSendingContato(false)
  }

  async function handleWhatsApp() {
    if (!company?.phone) return
    if (!userId) { window.location.href = '/login'; return }
    await supabase.from('companies').update({ whatsapp_clicks: ((company.whatsapp_clicks as number) || 0) + 1 }).eq('id', company.id)
    await supabase.from('whatsapp_clicks').insert({ company_id: company.id, user_id: userId })
    window.open(`https://wa.me/55${company.phone.replace(/\D/g,'')}?text=${encodeURIComponent('Olá, vim pelo site do Trindade Online e quero fazer meu pedido.')}`, '_blank')
  }

  async function deleteReview(reviewId: string) {
    await supabase.from('reviews').delete().eq('id', reviewId)
    loadCompany()
  }

  async function saveName() {
    if (!company || !nameText.trim()) return
    setSavingName(true)
    await supabase.from('companies').update({ name: nameText.trim() }).eq('id', company.id)
    await refreshCompany()
    setEditingName(false)
    setSavingName(false)
  }

  async function saveCategory() {
    if (!company || !categorySelId) return
    setSavingCategory(true)
    await supabase.from('companies').update({ category_id: categorySelId }).eq('id', company.id)
    await refreshCompany()
    setEditingCategory(false)
    setSavingCategory(false)
  }

  function toggleSubcat(id: string) {
    setSubcatSelIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
  }

  async function saveSubcats() {
    if (!company) return
    setSavingSubcats(true)
    await supabase.from('company_subcategories').delete().eq('company_id', company.id)
    if (subcatSelIds.length > 0) {
      await supabase.from('company_subcategories').insert(subcatSelIds.map(id => ({ company_id: company.id, subcategory_id: id })))
    }
    await refreshCompany()
    setEditingSubcats(false)
    setSavingSubcats(false)
  }

  async function addPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    if (!company || !e.target.files?.[0]) return
    setUploadingPhoto(true)
    const file = e.target.files[0]
    const ext = file.name.split('.').pop()
    const order = (company.photos?.length || 0)
    const path = `${company.id}/${order}-${Date.now()}.${ext}`
    const compressed = await compressImage(file)
    const { data: upload } = await supabase.storage.from('company-photos').upload(path, compressed, { upsert: true })
    if (upload) {
      const { data: url } = supabase.storage.from('company-photos').getPublicUrl(path)
      await supabase.from('company_photos').insert({ company_id: company.id, url: url.publicUrl, order })
      await refreshCompany()
    }
    setUploadingPhoto(false)
    e.target.value = ''
  }

  async function deletePhoto(photoId: string) {
    if (!confirm('Remover esta foto?')) return
    await supabase.from('company_photos').delete().eq('id', photoId)
    await refreshCompany()
  }

  async function submitReview() {
    if (!userId) { window.location.href = '/login'; return }
    if (myRating === 0 || !company) return
    setRevLoad(true)
    const { error } = await supabase.from('reviews').insert({ company_id: company.id, user_id: userId, rating: myRating, text: myText || null })
    if (error) {
      if (error.message?.includes('semana')) {
        alert('Você já avaliou esta empresa esta semana. Volte em 7 dias!')
      } else {
        alert('Erro ao enviar avaliação: ' + error.message)
      }
      setRevLoad(false); return
    }
    setAlreadyReviewed(true)
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
  const mapsUrl = company.address ? `https://maps.google.com/maps?q=${encodeURIComponent(company.address)}&output=embed` : null

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'Inter',sans-serif;background:#F0EDE8;}

        .topbar{background:#111;z-index:50;}
        .topbar-inner{max-width:1200px;margin:0 auto;padding:12px 24px;display:flex;align-items:center;justify-content:center;}
        .t-bc{display:flex;align-items:center;gap:7px;font-size:13px;}
        .t-bc a{color:#C9951A;font-weight:700;text-decoration:none;}
        .t-bc a:hover{text-decoration:underline;}
        .t-bc-sep{color:#444;font-size:14px;}
        .t-bc-cur{color:#fff;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;}
        @media(max-width:767px){
          .topbar-inner{padding:10px 16px;}
          .t-bc{justify-content:center;flex-wrap:wrap;width:100%;font-size:12px;}
          .t-bc-cur{max-width:100%;flex:1;min-width:0;text-align:center;}
        }

        /* GALERIA — full width */
        .gallery-wrap{max-width:1200px;margin:0 auto;padding:20px 24px 0;}
        @media(max-width:767px){.gallery-wrap{padding:12px 16px 0;}}

        /* CONTEÚDO PRINCIPAL */
        .page{max-width:1200px;margin:0 auto;padding:20px 24px 48px;}
        @media(max-width:767px){.page{padding:16px 16px 40px;}}

        .content-grid{display:grid;grid-template-columns:1fr 300px;gap:20px;align-items:start;}
        @media(max-width:767px){.content-grid{grid-template-columns:1fr;}}

        /* COLUNA ESQUERDA */
        .info-card{background:#fff;border:0.5px solid #EDE8E0;border-radius:14px;padding:22px;}
        .empresa-name{font-family:'Bebas Neue',sans-serif;font-size:clamp(26px,4vw,36px);color:#111;letter-spacing:1px;margin-bottom:10px;}
        .tags{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;}
        .tag{font-size:11px;padding:3px 9px;border-radius:7px;font-weight:500;}
        .tag-cat{background:#F0EDE8;color:#666;border:0.5px solid #E0DDD8;}
        .tag-open{background:#EDFAF3;color:#0F6E56;}
        .tag-closed{background:#FEF0F0;color:#E24B4A;}
        .tag-sub{background:#EBF4FF;color:#185FA5;}
        .rating-row{display:flex;align-items:center;padding:10px 0;border-top:0.5px solid #F0EDE8;border-bottom:0.5px solid #F0EDE8;margin-bottom:18px;gap:10px;flex-wrap:wrap;}
        .st{color:#C9951A;font-size:15px;}
        .rn{font-weight:600;font-size:14px;color:#111;}
        .rc{font-size:12px;color:#AAA;}
        .sec-lbl{font-family:'Bebas Neue',sans-serif;font-size:11px;color:#AAA;letter-spacing:1.5px;margin-bottom:8px;}
        .desc{font-size:14px;color:#555;line-height:1.8;}
        .btn-write-rv{padding:7px 14px;background:#FEF3E2;color:#C9951A;border:1.5px solid #C9951A;border-radius:8px;font-size:12px;font-weight:700;font-family:'Inter',sans-serif;cursor:pointer;white-space:nowrap;flex-shrink:0;}

        /* COLUNA DIREITA */
        .right-col{display:flex;flex-direction:column;gap:10px;}
        @media(min-width:768px){.right-col{position:sticky;top:60px;max-height:calc(100vh - 80px);overflow-y:auto;}}

        .action-card{background:#fff;border:0.5px solid #EDE8E0;border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:8px;}
        .btn-wa{width:100%;height:46px;padding:0 12px;background:#25D366;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:opacity .15s;}
        .btn-wa:hover{opacity:.9;}
        .btn-ext{width:100%;padding:12px;background:#EBF4FF;color:#185FA5;border:0.5px solid #B5D4F4;border-radius:10px;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:opacity .15s;}
        .btn-ext:hover{opacity:.9;}
        .btn-wa-locked{width:100%;padding:12px;background:#F0EDE8;color:#888;border:1px solid #DDD9D0;border-radius:10px;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .15s;}
        .btn-wa-locked:hover:not(:disabled){background:#E5E1D9;border-color:#C9951A;color:#C9951A;}
        .btn-wa-locked:disabled{cursor:not-allowed;opacity:0.6;}
        .btn-ext-locked{width:100%;padding:12px;background:#F0EDE8;color:#888;border:1px solid #DDD9D0;border-radius:10px;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .15s;}
        .btn-ext-locked:hover:not(:disabled){background:#E5E1D9;border-color:#C9951A;color:#C9951A;}
        .btn-ext-locked:disabled{cursor:not-allowed;opacity:0.6;}
        .btn-solicitar{width:100%;padding:12px;background:#C9951A;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;font-family:'Inter',sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .15s;margin-bottom:8px;}
        .btn-solicitar:hover:not(:disabled){background:#B8841A;}
        .btn-solicitar:disabled{cursor:not-allowed;}
        .btn-solicitar.sent{background:#E8F5E9;color:#2E7D32;border:1.5px solid #A5D6A7;}
        .btn-fav{width:100%;height:46px;padding:0 9px;background:#FEF3E2;color:#854F0B;border:1px solid #F5C77A;border-radius:10px;font-size:13px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;box-sizing:border-box;}
        .btn-fav.on{border-color:#C9951A;}

        .addr-box{display:flex;align-items:flex-start;gap:9px;background:#fff;border:0.5px solid #EDE8E0;border-radius:12px;padding:12px 14px;}
        .addr-txt{font-size:12px;color:#555;line-height:1.6;flex:1;}

        .map-card{background:#fff;border:0.5px solid #EDE8E0;border-radius:14px;overflow:hidden;}
        .map-frame{width:100%;height:150px;border:none;display:block;}
        .map-open-btn{width:100%;padding:10px;background:#fff;border:none;border-top:0.5px solid #EDE8E0;font-size:12px;font-weight:600;color:#185FA5;cursor:pointer;font-family:'Inter',sans-serif;display:flex;align-items:center;justify-content:center;gap:5px;}

        /* AVALIAÇÕES */
        .rv-section{margin-top:24px;border-top:0.5px solid #F0EDE8;padding-top:28px;}
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
        </div>
      </div>

      {premio && (
        <PalavraPremiadaModal premio={premio} onClose={() => setPremio(null)} waResgateUrl={waResgateUrl} loginRedirect={`/empresa/${slug}?palavra=${premiadaInput}`} />
      )}

      {/* GALERIA FULL WIDTH — grid dinâmico */}
      <div className="gallery-wrap">
        <Gallery photos={photos} emoji={company.category?.emoji || '🏪'} isAdmin={isAdmin} />

        {premiadaAtiva.active && (
          <form onSubmit={handlePalavraPremiadaSubmit} style={{marginTop:14,background:'linear-gradient(135deg,#1A0F00,#111111)',borderRadius:14,padding:'16px 18px',display:'flex',flexDirection:'column',gap:10}}>
            <div style={{display:'flex',alignItems:'center',gap:8,color:'#F0EDE8',fontSize:13,fontWeight:700,letterSpacing:0.5}}>
              🎁 PALAVRA PREMIADA DESSA LOJA
            </div>
            <div style={{display:'flex',gap:8}}>
              <input
                type="text"
                value={premiadaInput}
                onChange={e => setPremiadaInput(e.target.value)}
                placeholder="Digite a palavra premiada..."
                style={{flex:1,padding:'11px 14px',borderRadius:10,border:'1.5px solid #C9951A',background:'#1A1A1A',color:'#fff',fontSize:14,outline:'none'}}
              />
              <button type="submit" style={{background:'#C9951A',border:'none',borderRadius:10,padding:'0 20px',color:'#111',fontWeight:700,fontSize:14,cursor:'pointer'}}>Enviar</button>
            </div>
          </form>
        )}

        {isAdmin && (
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12,alignItems:'center'}}>
            {photos.map(p => (
              <div key={p.id} style={{position:'relative',width:64,height:64,borderRadius:8,overflow:'hidden',border:'1px solid #E0DDD8',flexShrink:0}}>
                <img src={p.url} alt="" style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
                <button onClick={()=>deletePhoto(p.id)}
                  style={{position:'absolute',top:2,right:2,background:'rgba(0,0,0,.7)',color:'#fff',border:'none',borderRadius:10,width:18,height:18,fontSize:11,lineHeight:1,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
              </div>
            ))}
            <label style={{width:64,height:64,borderRadius:8,border:'1.5px dashed #C9951A',display:'flex',alignItems:'center',justifyContent:'center',cursor:uploadingPhoto?'wait':'pointer',color:'#C9951A',fontSize:22,flexShrink:0}}>
              {uploadingPhoto ? '…' : '+'}
              <input type="file" accept="image/*" style={{display:'none'}} onChange={addPhoto} disabled={uploadingPhoto}/>
            </label>
          </div>
        )}
      </div>

      {/* CONTEÚDO */}
      <div className="page">
        <div className="content-grid">

          {/* COLUNA ESQUERDA */}
          <div className="info-card">
            <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
              {editingName ? (
                <div style={{display:'flex',gap:8,alignItems:'center',flex:1,minWidth:220}}>
                  <input value={nameText} onChange={e=>setNameText(e.target.value)} autoFocus
                    style={{flex:1,fontSize:20,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:1,padding:'8px 12px',border:'1.5px solid #C9951A',borderRadius:8,outline:'none'}}/>
                  <button onClick={saveName} disabled={savingName || !nameText.trim()}
                    style={{padding:'7px 14px',background:'#C9951A',color:'#fff',border:'none',borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer'}}>
                    {savingName?'...':'Salvar'}
                  </button>
                  <button onClick={()=>setEditingName(false)}
                    style={{padding:'7px 14px',background:'transparent',color:'#AAA',border:'1px solid #ddd',borderRadius:8,fontSize:12,cursor:'pointer'}}>Cancelar</button>
                </div>
              ) : (
                <div className="empresa-name" style={{display:'flex',alignItems:'center',gap:8}}>
                  {company.name}
                  {isAdmin && (
                    <button onClick={()=>{setNameText(company.name);setEditingName(true)}}
                      style={{fontSize:13,background:'none',border:'none',cursor:'pointer',padding:0}}>✏️</button>
                  )}
                </div>
              )}
              {company.plan === 'paid' && (
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2,flexShrink:0}}>
                  <svg width="44" height="44" viewBox="0 0 64 64" fill="none">
                    <circle cx="32" cy="32" r="28" stroke="#C9951A" strokeWidth="5" fill="none"/>
                    <path d="M18 32 L27 42 L46 22" stroke="#C9951A" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span style={{fontSize:8,fontWeight:700,color:'#C9951A',letterSpacing:'.8px',textTransform:'uppercase'}}>Indicado</span>
                </div>
              )}
            </div>
            <div className="tags" style={{alignItems:'center'}}>
              {editingCategory ? (
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  <select value={categorySelId} onChange={e=>setCategorySelId(e.target.value)}
                    style={{fontSize:12,padding:'5px 8px',borderRadius:8,border:'1.5px solid #C9951A',fontFamily:'Inter,sans-serif',outline:'none'}}>
                    {allCategories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                  </select>
                  <button onClick={saveCategory} disabled={savingCategory}
                    style={{padding:'5px 10px',background:'#C9951A',color:'#fff',border:'none',borderRadius:8,fontSize:11,fontWeight:600,cursor:'pointer'}}>
                    {savingCategory?'...':'✓'}
                  </button>
                  <button onClick={()=>setEditingCategory(false)}
                    style={{padding:'5px 10px',background:'transparent',color:'#AAA',border:'1px solid #ddd',borderRadius:8,fontSize:11,cursor:'pointer'}}>✕</button>
                </div>
              ) : (
                company.category && (
                  <span className="tag tag-cat" style={{display:'flex',alignItems:'center',gap:4}}>
                    {company.category.emoji} {company.category.name}
                    {isAdmin && (
                      <button onClick={()=>{setCategorySelId(company.category_id||'');setEditingCategory(true)}}
                        style={{fontSize:10,background:'none',border:'none',cursor:'pointer',padding:0,marginLeft:2}}>✏️</button>
                    )}
                  </span>
                )
              )}
              {company.hours && company.hours.length > 0 && (
                <span className={`tag ${open ? 'tag-open' : 'tag-closed'}`}>{open ? '● Aberto agora' : '● Fechado'}</span>
              )}
              {company.subcategories?.map((s,i) => (
                <span key={i} className="tag tag-sub">{s.subcategory.emoji} {s.subcategory.name}</span>
              ))}
              {isAdmin && !editingSubcats && (
                <button onClick={()=>{setSubcatSelIds((company.subcategories||[]).map(s=>s.subcategory_id).filter(Boolean) as string[]);setEditingSubcats(true)}}
                  style={{fontSize:11,color:'#C9951A',background:'none',border:'none',cursor:'pointer',fontWeight:600,padding:'2px 4px'}}>✏️ Editar subcategorias</button>
              )}
            </div>
            {editingSubcats && (
              <div style={{background:'#FAFAF8',border:'1px solid #E0DDD8',borderRadius:10,padding:12,marginBottom:14}}>
                <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:10}}>
                  {allSubcats.filter(s => s.category_id === company.category_id).map(s => (
                    <label key={s.id} style={{display:'flex',alignItems:'center',gap:5,fontSize:12,background:subcatSelIds.includes(s.id)?'#FEF3E2':'#fff',border:'1px solid '+(subcatSelIds.includes(s.id)?'#C9951A':'#E0DDD8'),borderRadius:8,padding:'5px 9px',cursor:'pointer'}}>
                      <input type="checkbox" checked={subcatSelIds.includes(s.id)} onChange={()=>toggleSubcat(s.id)} style={{margin:0}}/>
                      {s.emoji} {s.name}
                    </label>
                  ))}
                  {allSubcats.filter(s => s.category_id === company.category_id).length === 0 && (
                    <span style={{fontSize:12,color:'#AAA'}}>Nenhuma subcategoria cadastrada para essa categoria.</span>
                  )}
                </div>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={saveSubcats} disabled={savingSubcats}
                    style={{padding:'7px 16px',background:'#C9951A',color:'#fff',border:'none',borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer'}}>
                    {savingSubcats?'Salvando...':'Salvar'}
                  </button>
                  <button onClick={()=>setEditingSubcats(false)}
                    style={{padding:'7px 16px',background:'transparent',color:'#AAA',border:'1px solid #ddd',borderRadius:8,fontSize:12,cursor:'pointer'}}>Cancelar</button>
                </div>
              </div>
            )}

            <div className="rating-row">
              {avgRating > 0 ? (
                <>
                  <span className="st">{'★'.repeat(Math.round(avgRating))}{'☆'.repeat(5-Math.round(avgRating))}</span>
                  <span className="rn">{avgRating.toFixed(1)}</span>
                  <span className="rc">({company.total_reviews} avaliação{company.total_reviews !== 1 ? 's' : ''})</span>
                </>
              ) : (
                <span className="rc">Sem avaliações ainda</span>
              )}
              {reviewSent && <span style={{fontSize:12,color:'#0F6E56',fontWeight:600}}>✓ Avaliação enviada!</span>}
              {!reviewSent && alreadyReviewed && <span style={{fontSize:11,color:'#AAA'}}>✓ Avaliado esta semana</span>}
              {!reviewSent && !alreadyReviewed && (
                <button className="btn-write-rv" onClick={() => userId ? setShowReview(true) : window.location.href='/login'}>
                  ⭐ {userId ? 'Avaliar' : 'Entrar para avaliar'}
                </button>
              )}
            </div>
            {(company.description || isAdmin) && (
              <div style={{borderTop:'0.5px solid #EDE8E0',marginTop:14,paddingTop:14}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                  <div style={{fontSize:11,fontWeight:600,color:'#AAA',letterSpacing:'.6px',textTransform:'uppercase'}}>Sobre</div>
                  {isAdmin && !editingDesc && (
                    <button onClick={()=>{setDescText(company.description||'');setEditingDesc(true)}}
                      style={{fontSize:11,color:'#C9951A',background:'none',border:'none',cursor:'pointer',fontWeight:600,padding:'2px 6px'}}>✏️ Editar</button>
                  )}
                </div>
                {editingDesc ? (
                  <div>
                    <textarea value={descText} onChange={e=>setDescText(e.target.value)} rows={4}
                      style={{width:'100%',padding:'10px 12px',border:'1.5px solid #C9951A',borderRadius:10,fontSize:14,fontFamily:'Inter,sans-serif',resize:'vertical',outline:'none',lineHeight:1.6,marginBottom:8}}/>
                    <div style={{display:'flex',gap:8}}>
                      <button onClick={async()=>{
                        setSavingDesc(true)
                        await supabase.from('companies').update({ description: descText }).eq('id', company.id)
                        await refreshCompany()
                        setEditingDesc(false)
                        setSavingDesc(false)
                      }} disabled={savingDesc}
                        style={{padding:'7px 16px',background:'#C9951A',color:'#fff',border:'none',borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer'}}>
                        {savingDesc?'Salvando...':'Salvar'}
                      </button>
                      <button onClick={()=>setEditingDesc(false)}
                        style={{padding:'7px 16px',background:'transparent',color:'#AAA',border:'1px solid #ddd',borderRadius:8,fontSize:12,cursor:'pointer'}}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div style={{fontSize:14,color:'#555',lineHeight:1.6}}>{company.description || <span style={{color:'#CCC',fontStyle:'italic'}}>Sem descrição ainda</span>}</div>
                )}
              </div>
            )}
          </div>

          {/* COLUNA DIREITA */}
          <div className="right-col">

            {/* Badge trial — só pro dono */}
            {isOwner && company.plan !== 'paid' && company.trial_ends_at && trialDaysLeft > 0 && (
              <div style={{fontSize:11,fontWeight:600,padding:'6px 12px',borderRadius:8,background:'#FEF3E2',color:'#854F0B',border:'0.5px solid #F5C77A',textAlign:'center'}}>
                🕐 Trial: {trialDaysLeft} dia{trialDaysLeft!==1?'s':''} restante{trialDaysLeft!==1?'s':''}
              </div>
            )}

            {/* Botões de ação */}
            <div className="action-card">
              {!isActive && (
                <button className={`btn-solicitar ${contatoSent ? 'sent' : ''}`} onClick={solicitarContato} disabled={contatoSent || sendingContato}>
                  {contatoSent ? '✓ Contato registrado — o lojista foi notificado' : sendingContato ? 'Enviando...' : '🔔 Solicitar contato'}
                </button>
              )}
              {company.phone && isActive && (
                <button className="btn-wa" onClick={handleWhatsApp}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                  Falar no WhatsApp
                </button>
              )}
              {company.phone && !isActive && (
                <button className="btn-wa-locked" onClick={solicitarContato} disabled={contatoSent || sendingContato}>
                  <span style={{fontSize:16}}>🔒</span>
                  Falar no WhatsApp
                </button>
              )}
              {isActive && company.external_link && (
                <button className="btn-ext" onClick={() => window.open(company.external_link!, '_blank')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  {company.external_link_label || 'Acessar site'}
                </button>
              )}
              {company.external_link && !isActive && (
                <button className="btn-ext-locked" onClick={solicitarContato} disabled={contatoSent || sendingContato}>
                  <span style={{fontSize:14}}>🔒</span>
                  {company.external_link_label || 'Acessar site'}
                </button>
              )}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <button className={`btn-fav ${isFav ? 'on' : ''}`} onClick={toggleFav}>
                  {isFav ? '❤️' : '🤍'} {isFav ? 'Salvo' : 'Favoritar'}
                </button>
                <ShareButton title={company.name} text={`Dá uma olhada em ${company.name} no Trindade Online!`} label="Compartilhar" height={46}/>
              </div>
            </div>

            {/* Endereço */}
            {company.address && (
              <div className="addr-box" style={{position:'relative'}}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#C9951A" strokeWidth="2" strokeLinecap="round" style={{flexShrink:0,marginTop:2}}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <div className="addr-txt" style={!isActive ? {filter:'blur(5px)',userSelect:'none'} : {}}>{company.address}</div>
                {!isActive && (
                  <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(255,255,255,0.5)',borderRadius:10,cursor:'pointer'}} onClick={solicitarContato}>
                    <span style={{fontSize:12,fontWeight:700,color:'#C9951A',background:'#fff',padding:'4px 10px',borderRadius:8,border:'1px solid #C9951A'}}>🔒 Solicitar contato</span>
                  </div>
                )}
              </div>
            )}

            {/* Mapa Google Maps real */}
            {company.address && mapsUrl && (
              <div className="map-card" style={{position:'relative'}}>
                <iframe
                  className="map-frame"
                  src={mapsUrl}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title={`Mapa de ${company.name}`}
                  style={!isActive ? {filter:'blur(4px)',pointerEvents:'none'} : {}}
                />
                {!isActive ? (
                  <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}} onClick={solicitarContato}>
                    <span style={{fontSize:13,fontWeight:700,color:'#C9951A',background:'#fff',padding:'8px 16px',borderRadius:10,border:'1.5px solid #C9951A',boxShadow:'0 2px 8px rgba(0,0,0,.1)'}}>🔒 Solicitar contato para ver no mapa</span>
                  </div>
                ) : (
                  <button className="map-open-btn" onClick={() => { window.open(`https://maps.google.com?q=${encodeURIComponent(company.address || '')}`, '_blank'); fetch(`/api/company/${company.id}/track`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'address_click'})}) }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    Abrir no Google Maps
                  </button>
                )}
              </div>
            )}

          </div>
        </div>

        {/* MODAL AVALIAÇÃO */}
        {showReview && (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
            <div style={{background:'#fff',borderRadius:20,padding:28,maxWidth:420,width:'100%',position:'relative'}}>
              <button onClick={()=>{setShowReview(false);setMyRating(0);setMyText('')}} style={{position:'absolute',top:14,right:14,background:'#f0f0f0',border:'none',borderRadius:50,width:30,height:30,cursor:'pointer',fontSize:15,display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:1,color:'#111',marginBottom:4}}>AVALIAR</div>
              <div style={{fontSize:13,color:'#888',marginBottom:20}}>{company.name}</div>
              <div style={{fontSize:12,fontWeight:600,color:'#444',marginBottom:10}}>Sua nota</div>
              <div style={{display:'flex',gap:8,marginBottom:20}}>
                {[1,2,3,4,5].map(s => (
                  <button key={s} onClick={()=>setMyRating(s)}
                    style={{fontSize:28,background:'none',border:'none',cursor:'pointer',color:s<=myRating?'#C9951A':'#DDD',padding:0,lineHeight:1}}>★</button>
                ))}
                {myRating > 0 && <span style={{fontSize:12,color:'#C9951A',fontWeight:600,alignSelf:'center',marginLeft:4}}>{['','Ruim','Regular','Bom','Muito bom','Excelente'][myRating]}</span>}
              </div>
              <div style={{fontSize:12,fontWeight:600,color:'#444',marginBottom:8}}>Comentário <span style={{color:'#AAA',fontWeight:400}}>(opcional)</span></div>
              <textarea rows={3} placeholder="Conte sua experiência..." value={myText} onChange={e=>setMyText(e.target.value)}
                style={{width:'100%',padding:'10px 12px',border:'1.5px solid #E0DDD8',borderRadius:10,fontSize:13,fontFamily:'Inter,sans-serif',resize:'none',outline:'none',marginBottom:16}}/>
              <button onClick={submitReview} disabled={myRating===0||revLoading}
                style={{width:'100%',padding:'12px',background:myRating>0?'#C9951A':'#E0DDD8',color:myRating>0?'#fff':'#AAA',border:'none',borderRadius:10,fontSize:14,fontWeight:600,cursor:myRating>0?'pointer':'not-allowed',fontFamily:'Inter,sans-serif'}}>
                {revLoading?'Enviando...':'Publicar avaliação'}
              </button>
            </div>
          </div>
        )}
        {/* AVALIAÇÕES */}
        {isActive && (
          <div className="rv-section">
            <div style={{marginBottom:16}}>
              <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:12,color:'#AAA',letterSpacing:'1.5px'}}>
                AVALIAÇÕES ({company.total_reviews || 0})
              </span>
            </div>

            {reviewSent && <div className="ok-msg">✓ Sua avaliação foi enviada!</div>}



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
                      {isAdmin && (
                        <button onClick={() => deleteReview(r.id)} style={{marginLeft:'auto',background:'none',border:'none',cursor:'pointer',color:'#E24B4A',fontSize:14,padding:'0 4px'}}>🗑</button>
                      )}
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