'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import ShareButton from '@/components/ShareButton'
import { compressImage } from '@/lib/compressImage'
import { usePalavraPremiada, PalavraPremiadaModal, getVisitorId } from '@/components/PalavraPremiada'
import { isOpenNow } from '@/lib/businessHours'

type CompanyHour   = { label: string | null; hours: string | null; order: number; day_of_week: number | null; open_time: string | null; close_time: string | null; closed: boolean }
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
  flexible_hours?: boolean
  loja_digital_enabled?: boolean
}
type SimpleCategory    = { id: string; name: string; emoji: string }
type SimpleSubcategory = { id: string; name: string; emoji: string; category_id: string }
type Review = {
  id: string; rating: number; text?: string; created_at: string
  user?: { name: string }
  response?: { text: string }
}

type Props = {
  slug: string
  initialCompany: Company
  initialReviews: Review[]
}

const fmtDate = (s: string) => new Date(s).toLocaleDateString('pt-BR')

const PALAVRA_ERRO_MSGS = ['❌ Ainda não é essa... tenta de novo!', '😅 Quase! Mas não é essa palavra.', '🔍 Não foi dessa vez, continua tentando!']

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
      <div onClick={(e) => e.stopPropagation()} style={{position:'relative',width:'92vw',height:'92vh'}}>
        <Image src={photos[idx]?.url || ''} alt="" fill sizes="92vw" unoptimized style={{objectFit:'contain',borderRadius:8}} />
      </div>
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

  function src(i: number) { return photos[i]?.url || '' }

  /* 0 fotos */
  if (n === 0) return (
    <div style={{ width:'100%', aspectRatio:'1 / 1', background:'#111', borderRadius:16, display:'flex', alignItems:'center', justifyContent:'center', fontSize:72 }}>
      {emoji}
    </div>
  )

  /* Foto principal (capa) + miniaturas embaixo pra trocar — em vez de
     espremer todas as fotos lado a lado, o que cortava as imagens.
     Container sempre quadrado (padrão em toda página de empresa) — a
     foto preenche 100% via object-fit:cover, sem faixa nenhuma sobrando */
  return (
    <>
    <div className="gallery-flex">
      <div className="gallery-main">
        <Image src={src(idx)} alt="" onClick={() => openLightbox(idx)} fill sizes="(max-width:767px) 100vw, 700px" priority unoptimized style={{ objectFit:'cover', cursor:'pointer' }} />
        {n > 1 && <div className="gallery-badge">{idx+1} / {n}</div>}
      </div>
      {n > 1 && (
        <div className="gallery-thumbs">
          {photos.map((p, i) => (
            <div key={p.id} className={`gallery-thumb ${i===idx ? 'active' : ''}`} onClick={() => setIdx(i)}>
              <Image src={p.url} alt="" fill sizes="92px" unoptimized style={{ objectFit:'cover' }} />
            </div>
          ))}
        </div>
      )}
    </div>
    <Lightbox isAdmin={isAdmin} photos={photos} idx={lightboxIdx} open={lightboxOpen} setIdx={setLightboxIdx} onClose={() => setLightboxOpen(false)} />
    </>
  )
}

const COMPANY_SELECT = '*, owner_id, trial_ends_at, category:categories(name,emoji,slug), subcategories:company_subcategories(subcategory_id, subcategory:subcategories(name,emoji)), photos:company_photos(id,url,order), hours:company_hours(label,hours,order,day_of_week,open_time,close_time,closed)'

export default function EmpresaPerfilClient({ slug, initialCompany, initialReviews }: Props) {
  const [company, setCompany]       = useState<Company>(initialCompany)
  const [reviews, setReviews]       = useState<Review[]>(initialReviews)
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
  const [premiadaErro, setPremiadaErro]       = useState('')
  const [premiadaCooldown, setPremiadaCooldown] = useState(0)
  const premiadaInputRef = useRef<HTMLInputElement>(null)
  const premiadaErroTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const premiadaCooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const { premio, setPremio, checarPalavraPremiada, waResgateUrl } = usePalavraPremiada()

  // Empresa/avaliações já vieram prontas do servidor (dado público). A
  // sessão do site fica no localStorage do navegador, não em cookie, então
  // quem é o usuário (admin, dono, favoritou, já avaliou) só dá pra saber
  // aqui no cliente — resolvido à parte, sem travar o primeiro parecer da
  // página. Junto, registra a visita (analytics), sem esperar.
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      supabase.from('page_views').insert({ page: '/empresa', entity_id: company.id, session_id: getVisitorId(), user_id: session?.user?.id || null }).then(() => {})
      supabase.from('companies').update({ views_count: ((company.views_count as number) || 0) + 1 }).eq('id', company.id).then(() => {})

      if (!session) return
      setUserId(session.user.id)
      const now = new Date()
      const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay())
      weekStart.setHours(0, 0, 0, 0)

      const [{ data: fav }, { data: myReview }, { data: prof }] = await Promise.all([
        supabase.from('favorites').select('id').eq('user_id', session.user.id).eq('entity_type', 'company').eq('entity_id', company.id).maybeSingle(),
        supabase.from('reviews').select('id').eq('user_id', session.user.id).eq('company_id', company.id).gte('created_at', weekStart.toISOString()).maybeSingle(),
        supabase.from('profiles').select('user_type').eq('id', session.user.id).single(),
      ])
      setIsFav(!!fav)
      setAlreadyReviewed(!!myReview)
      const admin = prof?.user_type === 'admin'
      setIsAdmin(admin)
      setIsOwner(company.owner_id === session.user.id || admin)
      if (admin) {
        const [{ data: catsData }, { data: subcatsData }] = await Promise.all([
          supabase.from('categories').select('id,name,emoji').order('name'),
          supabase.from('subcategories').select('id,name,emoji,category_id').eq('active', true).order('order'),
        ])
        setAllCategories(catsData || [])
        setAllSubcats(subcatsData || [])
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Confere se essa loja tem rodada da Palavra Premiada ativa; se veio de
  // um redirect de login com ?palavra=, já reconfere a palavra na hora
  useEffect(() => {
    fetch(`/api/palavra-premiada?company_id=${company.id}&visitor_id=${encodeURIComponent(getVisitorId())}`)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id])

  function startPremiadaCooldown(seconds: number) {
    if (premiadaCooldownTimer.current) clearInterval(premiadaCooldownTimer.current)
    setPremiadaCooldown(seconds)
    premiadaCooldownTimer.current = setInterval(() => {
      setPremiadaCooldown(s => {
        if (s <= 1) {
          if (premiadaCooldownTimer.current) clearInterval(premiadaCooldownTimer.current)
          return 0
        }
        return s - 1
      })
    }, 1000)
  }

  async function handlePalavraPremiadaSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (premiadaCooldown > 0) return
    const raw = e.currentTarget.querySelector('input')?.value ?? premiadaInput
    if (!raw.trim()) return

    const data = await checarPalavraPremiada(raw.trim(), company.id)

    // Muitas tentativas seguidas: entra em espera (aumenta a cada 3 erradas,
    // zera depois de 1h parado) em vez de deixar tentar palavra atrás de palavra
    if (data?.cooldown) {
      setPremiadaErro('')
      startPremiadaCooldown(data.waitSeconds || 5)
      return
    }

    // Errou: treme o campo, borda fica vermelha e mostra uma mensagem
    // curta que some sozinha — antes disso o campo não dava sinal nenhum.
    // Já limpa e foca o campo, pra pessoa só digitar a próxima em vez de
    // apagar a palavra errada na mão antes de tentar de novo
    if (!data?.match) {
      const el = premiadaInputRef.current
      if (el) {
        el.classList.remove('pw-shake')
        void el.offsetWidth
        el.classList.add('pw-shake', 'pw-error')
        setTimeout(() => el.classList.remove('pw-shake'), 400)
        setTimeout(() => el.classList.remove('pw-error'), 650)
      }
      setPremiadaInput('')
      el?.focus()
      setPremiadaErro(PALAVRA_ERRO_MSGS[Math.floor(Math.random() * PALAVRA_ERRO_MSGS.length)])
      if (premiadaErroTimer.current) clearTimeout(premiadaErroTimer.current)
      premiadaErroTimer.current = setTimeout(() => setPremiadaErro(''), 3200)
    } else {
      setPremiadaErro('')
    }
  }

  // Recarrega os dados da empresa sem contar view nem duplicar log — usado após salvar edições
  async function refreshCompany() {
    const { data } = await supabase.from('companies').select(COMPANY_SELECT).eq('slug', slug).maybeSingle()
    if (data) setCompany(data)
  }

  // Recarrega tudo (empresa + avaliações + estado de sessão) — usado após enviar/excluir avaliação
  async function loadCompany() {
    const [{ data }, { data: { session } }] = await Promise.all([
      supabase.from('companies').select(COMPANY_SELECT).eq('slug', slug).maybeSingle(),
      supabase.auth.getSession(),
    ])
    if (!data) return
    setCompany(data)

    const { data: revs } = await supabase.from('reviews').select('*, user:profiles(name), response:review_responses(text)').eq('company_id', data.id).order('created_at', { ascending: false })
    setReviews(revs || [])
    if (session) {
      const now = new Date()
      const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay())
      weekStart.setHours(0,0,0,0)

      const [{ data: fav }, { data: myReview }, { data: prof }] = await Promise.all([
        supabase.from('favorites').select('id').eq('user_id', session.user.id).eq('entity_type', 'company').eq('entity_id', data.id).maybeSingle(),
        supabase.from('reviews').select('id').eq('user_id', session.user.id).eq('company_id', data.id).gte('created_at', weekStart.toISOString()).maybeSingle(),
        supabase.from('profiles').select('user_type').eq('id', session.user.id).single(),
      ])
      setIsFav(!!fav)
      setAlreadyReviewed(!!myReview)
      const admin = prof?.user_type === 'admin'
      setIsAdmin(admin)
      setIsOwner(data.owner_id === session.user.id || admin)
      if (admin) {
        const [{ data: catsData }, { data: subcatsData }] = await Promise.all([
          supabase.from('categories').select('id,name,emoji').order('name'),
          supabase.from('subcategories').select('id,name,emoji,category_id').eq('active', true).order('order'),
        ])
        setAllCategories(catsData || [])
        setAllSubcats(subcatsData || [])
      }
    }
  }

  async function toggleFav() {
    if (!userId) { window.location.href = '/login'; return }
    if (isFav) {
      await supabase.from('favorites').delete().eq('user_id', userId).eq('entity_type', 'company').eq('entity_id', company.id)
    } else {
      await supabase.from('favorites').insert({ user_id: userId, entity_type: 'company', entity_id: company.id })
    }
    setIsFav(!isFav)
  }

  async function solicitarContato() {
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
    if (!company.phone) return
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
    if (!nameText.trim()) return
    setSavingName(true)
    await supabase.from('companies').update({ name: nameText.trim() }).eq('id', company.id)
    await refreshCompany()
    setEditingName(false)
    setSavingName(false)
  }

  async function saveCategory() {
    if (!categorySelId) return
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
    if (!e.target.files?.[0]) return
    setUploadingPhoto(true)
    const file = e.target.files[0]
    const order = (company.photos?.length || 0)
    try {
      const compressed = await compressImage(file)
      const ext = compressed.type === 'image/webp' ? 'webp' : (file.name.split('.').pop() || 'jpg')
      const path = `${company.id}/${order}-${Date.now()}.${ext}`
      const { data: upload } = await supabase.storage.from('company-photos').upload(path, compressed, { upsert: true })
      if (upload) {
        const { data: url } = supabase.storage.from('company-photos').getPublicUrl(path)
        await supabase.from('company_photos').insert({ company_id: company.id, url: url.publicUrl, order })
        await refreshCompany()
      }
    } catch {
      alert('Não deu pra enviar essa foto. Tenta outra imagem.')
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
    if (myRating === 0) return
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

  const isActive = company.plan === 'paid' || (!!company.trial_ends_at && new Date(company.trial_ends_at) > new Date())
  const trialDaysLeft = company.trial_ends_at ? Math.ceil((new Date(company.trial_ends_at).getTime() - Date.now()) / 86400000) : 0
  const photos = (company.photos || []).sort((a,b) => a.order - b.order)
  const open = isOpenNow(company.hours, company.flexible_hours)
  const avgRating = company.avg_rating || 0
  const mapsUrl = company.address ? `https://maps.google.com/maps?q=${encodeURIComponent(company.address)}&output=embed` : null

  return (
    <>
      <style>{`
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

        /* Mobile: foto quadrada em cima, miniaturas em fileira embaixo (sem mudança). */
        .gallery-flex{display:flex;flex-direction:column;gap:8px;}
        .gallery-main{width:100%;aspect-ratio:1/1;border-radius:16px;overflow:hidden;position:relative;}
        .gallery-badge{position:absolute;bottom:10px;right:10px;background:rgba(0,0,0,.6);color:#fff;font-size:11px;font-weight:500;padding:3px 10px;border-radius:12px;}
        .gallery-thumbs{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px;}
        .gallery-thumb{flex-shrink:0;width:64px;height:64px;border-radius:10px;overflow:hidden;cursor:pointer;position:relative;border:2.5px solid transparent;opacity:.7;transition:opacity .15s,border-color .15s;}
        .gallery-thumb.active{border-color:#C9951A;opacity:1;}
        /* Desktop: foto horizontal + miniaturas quadradas na lateral. */
        @media(min-width:768px){
          .gallery-flex{flex-direction:row;align-items:stretch;}
          .gallery-main{aspect-ratio:21/9;flex:1;min-width:0;}
          .gallery-thumbs{flex-direction:column;width:92px;flex-shrink:0;overflow-x:visible;overflow-y:auto;padding-bottom:0;}
          .gallery-thumb{width:100%;height:auto;aspect-ratio:1/1;}
        }

        /* CONTEÚDO PRINCIPAL */
        .page{max-width:1200px;margin:0 auto;padding:20px 24px 48px;}
        @media(max-width:767px){.page{padding:16px 16px 40px;}}

        /* Mobile: empilhado na mesma ordem de sempre — nome, ações/endereço/mapa, sobre. */
        .content-grid{display:grid;grid-template-columns:1fr;grid-template-areas:"info" "right" "sobre";gap:20px;align-items:start;}
        .ga-info{grid-area:info;}
        .ga-sobre{grid-area:sobre;}
        /* Desktop: sobre sobe pra colar no card do nome, na mesma coluna. */
        @media(min-width:768px){
          .content-grid{grid-template-columns:1fr 300px;grid-template-areas:"info right" "sobre right";}
        }

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
        .right-col{display:flex;flex-direction:column;gap:10px;grid-area:right;}
        @media(min-width:768px){.right-col{position:sticky;top:60px;max-height:calc(100vh - 80px);overflow-y:auto;}}

        .action-card{background:#fff;border:0.5px solid #EDE8E0;border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:8px;}
        .btn-wa{width:100%;height:46px;padding:0 12px;background:#25D366;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:opacity .15s;}
        .btn-wa:hover{opacity:.9;}
        .btn-ext{width:100%;padding:12px;background:#EBF4FF;color:#185FA5;border:0.5px solid #B5D4F4;border-radius:10px;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:opacity .15s;}
        .btn-ext:hover{opacity:.9;}
        .btn-cardapio{width:100%;padding:12px;background:#C9951A;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;transition:opacity .15s;box-sizing:border-box;}
        .btn-cardapio:hover{opacity:.9;}
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

        /* PALAVRA PREMIADA — feedback de erro */
        .pw-input.pw-error{border-color:#E24B4A !important;background:#241213 !important;}
        .pw-input.pw-shake{animation:pwShake .4s;}
        @keyframes pwShake{10%,90%{transform:translateX(-1px);}20%,80%{transform:translateX(2px);}30%,50%,70%{transform:translateX(-4px);}40%,60%{transform:translateX(4px);}}
        @media(prefers-reduced-motion:reduce){.pw-input.pw-shake{animation:none;}}
        .pw-feedback{font-size:12.5px;font-weight:600;color:#FF9B9B;min-height:16px;opacity:0;transform:translateY(-4px);transition:opacity .25s,transform .25s;}
        .pw-feedback.show{opacity:1;transform:translateY(0);}
      `}</style>

      {/* TOPBAR */}
      <div className="topbar">
        <div className="topbar-inner">
          <div className="t-bc">
            <a href="/">Início</a>
            {company.category && (
              <>
                <span className="t-bc-sep">›</span>
                <a href={`/categoria/${company.category.slug || ''}`}>{company.category.name}</a>
              </>
            )}
            <span className="t-bc-sep">›</span>
            <span className="t-bc-cur">{company.name}</span>
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
                ref={premiadaInputRef}
                className="pw-input"
                type="text"
                value={premiadaInput}
                onChange={e => setPremiadaInput(e.target.value)}
                placeholder={premiadaCooldown > 0 ? `Espera ${premiadaCooldown}s...` : 'Digite a palavra premiada...'}
                disabled={premiadaCooldown > 0}
                style={{flex:1,padding:'11px 14px',borderRadius:10,border:'1.5px solid #C9951A',background:'#1A1A1A',color:'#fff',fontSize:14,outline:'none',opacity:premiadaCooldown>0?0.6:1}}
              />
              <button type="submit" disabled={premiadaCooldown > 0} style={{background:premiadaCooldown>0?'#5A4008':'#C9951A',border:'none',borderRadius:10,padding:'0 20px',color:premiadaCooldown>0?'#B8860B':'#111',fontWeight:700,fontSize:14,cursor:premiadaCooldown>0?'not-allowed':'pointer',whiteSpace:'nowrap'}}>
                {premiadaCooldown > 0 ? `⏳ ${premiadaCooldown}s` : 'Enviar'}
              </button>
            </div>
            <div className={`pw-feedback ${(premiadaErro || premiadaCooldown > 0) ? 'show' : ''}`}>
              {premiadaCooldown > 0 ? '⏳ Muitas tentativas seguidas... espera um pouco.' : (premiadaErro || ' ')}
            </div>
          </form>
        )}

        {isAdmin && (
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12,alignItems:'center'}}>
            {photos.map(p => (
              <div key={p.id} style={{position:'relative',width:64,height:64,borderRadius:8,overflow:'hidden',border:'1px solid #E0DDD8',flexShrink:0}}>
                <Image src={p.url} alt="" fill sizes="64px" unoptimized style={{objectFit:'cover'}}/>
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
          <div className="info-card ga-info">
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
              {(company.flexible_hours || (company.hours && company.hours.length > 0)) && (
                <span className={`tag ${open ? 'tag-open' : 'tag-closed'}`}>{company.flexible_hours ? '● Horário flexível' : (open ? '● Aberto agora' : '● Fechado')}</span>
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
              {isActive && company.loja_digital_enabled && (
                <a className="btn-cardapio" href={`/empresa/${company.slug}/cardapio`}>
                  🧾 Ver cardápio
                </a>
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

          {/* SOBRE — mesma coluna do nome, no desktop fica colado embaixo dele */}
          {(company.description || isAdmin) && (
          <div className="info-card ga-sobre">
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
