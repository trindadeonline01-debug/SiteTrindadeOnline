'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

type Company = {
  id: string; name: string; status: string; plan: string
  address: string; phone: string; description: string
  external_link: string; external_link_label: string
  avg_rating: number; total_reviews: number
  views_count: number; whatsapp_clicks: number; link_clicks: number
  category_id?: string; trial_ends_at?: string
  category?: { name: string; emoji: string }
  photos?: { id: string; url: string; order: number }[]
  hours?: { id: string; label: string; hours: string; order: number }[]
}
type Review = {
  id: string; rating: number; text: string; created_at: string
  user?: { name: string }
  response?: { text: string }
}
type Highlight = {
  id: string; level: string; duration_days: number; price_paid: number
  starts_at: string; expires_at: string; status: string
  clicks_count: number; impressions_count: number
}

const LINK_LABELS = ['Ver cardápio','Fazer pedido','Acessar site','Ver catálogo','Agendar consulta','Fazer uma visita','Solicitar contato','Personalizado']
const IGREJAS_CATEGORY_ID = '00000000-0000-0000-0000-000000000008'
const DIAS_SEMANA = ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo']
const fmtDate = (s: string) => new Date(s).toLocaleDateString('pt-BR')
const daysLeft = (s: string) => Math.max(0, Math.ceil((new Date(s).getTime() - Date.now()) / 86400000))

export default function PainelPage() {
  const [tab, setTab]               = useState<'painel'|'destaques'|'avaliacoes'|'perfil'|'plano'>('painel')
  const [company, setCompany]       = useState<Company|null>(null)
  const [reviews, setReviews]       = useState<Review[]>([])
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [toast, setToast]           = useState('')
  const [replyId, setReplyId]       = useState<string|null>(null)
  const [replyText, setReplyText]   = useState('')

  const [editNome, setEditNome]           = useState('')
  const [editCategoryId, setEditCategoryId] = useState('')
  const [editSubcatIds, setEditSubcatIds]   = useState<string[]>([])
  const [allCategories, setAllCategories]   = useState<{id:string;name:string;emoji:string}[]>([])
  const [allSubcats, setAllSubcats]         = useState<{id:string;name:string;emoji:string;category_id:string}[]>([])
  const [editPhone, setEditPhone]         = useState('')
  const [editAddress, setEditAddress]     = useState('')
  const [editDesc, setEditDesc]           = useState('')
  const [editLinkUrl, setEditLinkUrl]     = useState('')
  const [editLinkLabel, setEditLinkLabel] = useState('Ver cardápio')
  const [editHours, setEditHours]         = useState<{label:string;hours:string}[]>([])
  const [churchHours, setChurchHours]     = useState<{day:string;manha:string;noite:string}[]>(DIAS_SEMANA.map(day=>({day,manha:'',noite:''})))
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return }
      const { data: profile } = await supabase.from('profiles').select('user_type').eq('id', session.user.id).single()
      if (profile?.user_type === 'admin') { window.location.href = '/admin'; return }
      if (profile?.user_type !== 'company') { window.location.href = '/'; return }
      loadData(session.user.id)
    })
  }, [])

  async function loadData(userId: string) {
    setLoading(true)
    const { data: comp } = await supabase
      .from('companies')
      .select('*, category_id, category:categories(name,emoji), photos:company_photos(id,url,order), hours:company_hours(id,label,hours,order)')
      .eq('owner_id', userId).single()

    if (comp) {
      setCompany(comp)
      // Load categories for selector
      const [{ data: cats }, { data: subs }, { data: compSubs }] = await Promise.all([
        supabase.from('categories').select('id,name,emoji').order('name'),
        supabase.from('subcategories').select('id,name,emoji,category_id').order('name'),
        supabase.from('company_subcategories').select('subcategory_id').eq('company_id', comp.id)
      ])
      setAllCategories(cats || [])
      setAllSubcats(subs || [])
      setEditCategoryId(comp.category_id || '')
      setEditSubcatIds((compSubs || []).map((s:any) => s.subcategory_id))

      setEditNome(comp.name || '')
      setEditPhone(comp.phone || '')
      setEditAddress(comp.address || '')
      setEditDesc(comp.description || '')
      setEditLinkUrl(comp.external_link || '')
      setEditLinkLabel(comp.external_link_label || 'Ver cardápio')
      // Sempre mostra todos os dias — preenche com valores salvos se existirem
      const HOURS_DEFAULT = [
        {label:'Seg–Sex',hours:''},{label:'Sábado',hours:''},{label:'Domingo',hours:''},{label:'Feriados',hours:''}
      ]
      const savedHours = comp.hours?.sort((a:any,b:any)=>a.order-b.order) || []
      const mergedHours = HOURS_DEFAULT.map(def => {
        const saved = savedHours.find((h:any) => h.label === def.label)
        return { label: def.label, hours: saved?.hours || '' }
      })
      // Se tem horários que não são padrão (ex: igrejas), adiciona também
      const extraHours = savedHours.filter((h:any) => !HOURS_DEFAULT.find(d => d.label === h.label))
      setEditHours([...mergedHours, ...extraHours])
      // Inicializa horários de culto se for Igreja
      if (comp.category_id === IGREJAS_CATEGORY_ID) {
        setChurchHours(DIAS_SEMANA.map(day => ({
          day,
          manha: savedHours.find((h:any)=>h.label===`${day} manhã`)?.hours || '',
          noite: savedHours.find((h:any)=>h.label===`${day} noite`)?.hours || '',
        })))
      }
      const { data: revs } = await supabase.from('reviews').select('*, user:profiles(name), response:review_responses(text)').eq('company_id', comp.id).order('created_at',{ascending:false})
      setReviews(revs || [])
      const { data: highs } = await supabase.from('highlights').select('*').eq('company_id', comp.id).order('created_at',{ascending:false})
      setHighlights(highs || [])
    } else {
      // Não redireciona forçado — deixa o painel mostrar tela de boas-vindas
    }
    setLoading(false)
  }

  async function saveProfile() {
    if (!company) return
    setSaving(true)
    await supabase.from('companies').update({
      name: editNome.toUpperCase(),
      phone: editPhone,
      address: editAddress,
      description: editDesc,
      category_id: editCategoryId || null,
      external_link: editLinkUrl || null,
      external_link_label: editLinkUrl ? editLinkLabel : null
    }).eq('id', company.id)
    // Save subcategories
    await supabase.from('company_subcategories').delete().eq('company_id', company.id)
    if (editSubcatIds.length > 0) {
      await supabase.from('company_subcategories').insert(editSubcatIds.map(sid => ({ company_id: company.id, subcategory_id: sid })))
    }
    await supabase.from('company_hours').delete().eq('company_id', company.id)
    const isIgreja = company.category_id === IGREJAS_CATEGORY_ID
    if (isIgreja) {
      const cultosEntries: any[] = []; let order = 0
      churchHours.forEach(({day,manha,noite}) => {
        if (manha.trim()) cultosEntries.push({company_id:company.id,label:`${day} manhã`,hours:manha.trim(),order:order++})
        if (noite.trim()) cultosEntries.push({company_id:company.id,label:`${day} noite`,hours:noite.trim(),order:order++})
      })
      if (cultosEntries.length > 0) await supabase.from('company_hours').insert(cultosEntries)
    } else {
      const validH = editHours.filter(h=>h.hours.trim())
      if (validH.length > 0) await supabase.from('company_hours').insert(validH.map((h,i)=>({company_id:company.id,label:h.label,hours:h.hours,order:i})))
    }
    showToast('Perfil atualizado!')
    setSaving(false)
  }

  async function addPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    if (!company || !e.target.files?.[0]) return
    const file = e.target.files[0]
    const ext = file.name.split('.').pop()
    const order = (company.photos?.length || 0)
    const path = `${company.id}/${order}-${Date.now()}.${ext}`
    const { data: upload } = await supabase.storage.from('company-photos').upload(path, file, {upsert:true})
    if (upload) {
      const { data: url } = supabase.storage.from('company-photos').getPublicUrl(path)
      await supabase.from('company_photos').insert({company_id:company.id, url:url.publicUrl, order})
      showToast('Foto adicionada!')
      const { data:{session} } = await supabase.auth.getSession()
      if (session) loadData(session.user.id)
    }
  }

  async function removePhoto(photoId: string) {
    await supabase.from('company_photos').delete().eq('id', photoId)
    showToast('Foto removida.')
    const { data:{session} } = await supabase.auth.getSession()
    if (session) loadData(session.user.id)
  }

  async function sendReply(reviewId: string) {
    if (!replyText.trim() || !company) return
    await supabase.from('review_responses').insert({review_id:reviewId, company_id:company.id, text:replyText})
    setReplyId(null); setReplyText('')
    showToast('Resposta publicada!')
    const { data:{session} } = await supabase.auth.getSession()
    if (session) loadData(session.user.id)
  }

  async function flagReview(reviewId: string) {
    const { data:{session} } = await supabase.auth.getSession()
    if (!session || !company) return
    await supabase.from('review_flags').insert({review_id:reviewId, flagged_by:session.user.id, reason:'Possível avaliação falsa'})
    showToast('Avaliação sinalizada para análise.')
  }

  function showToast(msg: string) { setToast(msg); setTimeout(()=>setToast(''), 3000) }

  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'Inter,sans-serif',color:'#AAA'}}>Carregando...</div>
  if (!loading && !company) return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'Inter',sans-serif;background:#111;color:#fff;}
      `}</style>
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'100vh',padding:24,textAlign:'center'}}>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,color:'#fff',letterSpacing:2,marginBottom:6}}>TRINDADE <span style={{color:'#C9951A'}}>ONLINE</span></div>
        <div style={{fontSize:48,margin:'24px 0 12px'}}>🏪</div>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:'#fff',letterSpacing:1,marginBottom:8}}>BEM-VINDO!</div>
        <div style={{fontSize:14,color:'#666',maxWidth:380,lineHeight:1.7,marginBottom:28}}>
          Sua conta está pronta. Agora cadastre sua empresa para aparecer no Trindade Online e ser encontrado pelos moradores do bairro.
        </div>
        <a href="/empresa/cadastrar" style={{display:'inline-block',padding:'14px 28px',background:'#C9951A',color:'#fff',borderRadius:12,textDecoration:'none',fontSize:15,fontWeight:700,marginBottom:12}}>
          + Cadastrar minha empresa
        </a>
        <a href="/" style={{fontSize:13,color:'#555',textDecoration:'none'}}>← Voltar ao site</a>
      </div>
    </>
  )

  if (!company) return null

  const activeHighlights = highlights.filter(h=>h.status==='active')
  const photos = company.photos?.sort((a,b)=>a.order-b.order) || []
  const pendingReplies = reviews.filter(r=>!r.response).length

  const tabTitle: Record<string,string> = {
    painel:'Dashboard', destaques:'Destaques', avaliacoes:'Avaliações', perfil:'Editar Perfil', plano:'Meu Plano'
  }

  const navItems = [
    { id:'painel',     ico:'📊', lbl:'Dashboard',  badge:0 },
    { id:'destaques',  ico:'⭐', lbl:'Destaques',  badge:activeHighlights.length },
    { id:'avaliacoes', ico:'💬', lbl:'Avaliações', badge:pendingReplies },
    { id:'perfil',     ico:'✏️', lbl:'Perfil',     badge:0 },
    { id:'plano',      ico:'💳', lbl:'Plano',      badge:0 },
  ]

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'Inter',sans-serif;background:#F0EDE8;}

        /* ── LAYOUT ── */
        .painel-layout{display:flex;min-height:100vh;}

        /* SIDEBAR — desktop only */
        .sidebar{width:220px;background:#111;flex-shrink:0;display:none;flex-direction:column;position:sticky;top:0;height:100vh;}
        @media(min-width:768px){.sidebar{display:flex;}}
        .sb-logo{padding:24px 20px 16px;border-bottom:1px solid #222;}
        .sb-logo-txt{font-family:'Bebas Neue',sans-serif;font-size:20px;color:#fff;letter-spacing:2px;}
        .sb-logo-txt span{color:#C9951A;}
        .sb-empresa{font-family:'Bebas Neue',sans-serif;font-size:14px;color:#C9951A;letter-spacing:1px;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .sb-status{font-size:10px;font-weight:600;padding:2px 8px;border-radius:8px;display:inline-block;margin-top:4px;}
        .sb-status.active{background:rgba(15,128,80,.2);color:#5EE8A0;}
        .sb-status.pending{background:rgba(201,149,26,.2);color:#E8B84B;}
        .sb-nav{padding:12px 0;flex:1;}
        .sb-item{display:flex;align-items:center;gap:10px;padding:12px 20px;cursor:pointer;transition:all .15s;color:#888;font-size:13px;font-weight:500;border-left:3px solid transparent;position:relative;}
        .sb-item:hover{background:#1A1A1A;color:#fff;}
        .sb-item.on{background:#1A1A1A;color:#C9951A;border-left-color:#C9951A;}
        .sb-badge{margin-left:auto;background:#E24B4A;color:#fff;font-size:10px;font-weight:700;padding:1px 7px;border-radius:10px;}
        .sb-footer{padding:16px 20px;border-top:1px solid #222;}
        .sb-footer a{font-size:12px;color:#C9951A;text-decoration:none;display:flex;align-items:center;gap:6px;font-weight:600;}
        .sb-footer a:hover{color:#fff;}

        /* MAIN */
        .painel-main{flex:1;overflow-x:hidden;display:flex;flex-direction:column;}

        /* TOP BAR — desktop */
        .topbar{background:#fff;border-bottom:1px solid #EDE8E0;padding:14px 28px;display:none;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:20;}
        @media(min-width:768px){.topbar{display:flex;}}
        .topbar-title{font-family:'Bebas Neue',sans-serif;font-size:20px;color:#111;letter-spacing:1px;}
        .topbar-right{font-size:12px;color:#AAA;}

        /* MOBILE HEADER */
        .mobile-hdr{background:#111;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;}
        @media(min-width:768px){.mobile-hdr{display:none;}}
        .mhdr-logo{font-family:'Bebas Neue',sans-serif;font-size:18px;color:#fff;letter-spacing:2px;}
        .mhdr-logo span{color:#C9951A;}
        .mhdr-empresa{font-size:11px;color:#C9951A;font-family:'Bebas Neue',sans-serif;letter-spacing:1px;}

        /* CONTENT AREA */
        .content{padding:24px 28px;flex:1;}
        @media(max-width:767px){.content{padding:16px 16px 80px;}}

        /* STATS */
        .stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px;}
        @media(min-width:1024px){.stat-grid{grid-template-columns:repeat(4,1fr);}}
        .stat-card{background:#fff;border:0.5px solid #EDE8E0;border-radius:14px;padding:16px 18px;}
        .stat-num{font-family:'Bebas Neue',sans-serif;font-size:32px;letter-spacing:1px;line-height:1;margin-bottom:4px;}
        .stat-lbl{font-size:11px;color:#AAA;}
        .stat-sub{font-size:10px;color:#AAA;margin-top:4px;}

        /* SECTION CARD */
        .sec-card{background:#fff;border:0.5px solid #EDE8E0;border-radius:14px;margin-bottom:16px;overflow:hidden;}
        .sec-hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:0.5px solid #F0EDE8;}
        .sec-title{font-family:'Bebas Neue',sans-serif;font-size:13px;color:#888;letter-spacing:1.5px;}
        .sec-body{padding:16px 18px;}

        /* SECTION TITLE STANDALONE */
        .section-label{font-family:'Bebas Neue',sans-serif;font-size:13px;color:#888;letter-spacing:1.5px;margin:20px 0 12px;}

        /* QUICK ACTIONS */
        .actions-row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;}
        .action-btn{flex:1;min-width:140px;padding:12px 16px;border:none;border-radius:12px;font-size:13px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;transition:all .15s;display:flex;align-items:center;justify-content:center;gap:8px;}
        .action-btn:hover{opacity:.9;}

        /* RATING */
        .rating-summary{display:flex;align-items:center;gap:16px;background:#FAFAF8;border:0.5px solid #E0DDD8;border-radius:13px;padding:16px;margin-bottom:16px;}
        .rating-big{font-family:'Bebas Neue',sans-serif;font-size:52px;color:#C9951A;letter-spacing:2px;line-height:1;}
        .rating-bars{flex:1;}
        .bar-row{display:flex;align-items:center;gap:6px;margin-bottom:4px;}
        .bar-lbl{font-size:10px;color:#AAA;width:8px;}
        .bar-bg{flex:1;height:6px;background:#F0EDE8;border-radius:3px;overflow:hidden;}
        .bar-fill{height:100%;background:#C9951A;border-radius:3px;}
        .bar-cnt{font-size:10px;color:#CCC;width:20px;text-align:right;}

        /* REVIEW GRID */
        .review-grid{display:grid;grid-template-columns:1fr;gap:12px;}
        @media(min-width:1024px){.review-grid{grid-template-columns:1fr 1fr;}}
        .review-card{background:#FAFAF8;border:0.5px solid #EDE8E0;border-radius:12px;padding:14px;}
        .review-top{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
        .review-av{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#C9951A,#E8B84B);display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:14px;color:#fff;flex-shrink:0;}
        .review-name{font-size:13px;font-weight:600;color:#333;}
        .review-date{font-size:10px;color:#CCC;margin-left:auto;}
        .review-stars{font-size:13px;color:#C9951A;margin-bottom:5px;}
        .review-text{font-size:13px;color:#555;line-height:1.6;margin-bottom:10px;}
        .review-actions{display:flex;gap:8px;}
        .btn-reply{flex:1;padding:8px;border:1px solid #C9951A;border-radius:9px;font-size:12px;font-weight:600;color:#C9951A;cursor:pointer;background:#fff;font-family:'Inter',sans-serif;}
        .btn-flag{padding:8px 14px;border:1px solid #E0DDD8;border-radius:9px;font-size:12px;color:#AAA;cursor:pointer;background:#fff;font-family:'Inter',sans-serif;}
        .reply-existing{background:#FEF3E2;border:0.5px solid #F5C77A;border-radius:9px;padding:10px 12px;margin-top:8px;}
        .reply-lbl{font-size:10px;font-weight:600;color:#854F0B;margin-bottom:3px;}
        .reply-txt{font-size:12px;color:#854F0B;line-height:1.5;}
        .reply-box{margin-top:8px;border:1.5px solid #C9951A;border-radius:9px;overflow:hidden;}
        .reply-input{width:100%;border:none;padding:10px 12px;font-size:12px;font-family:'Inter',sans-serif;outline:none;resize:none;color:#333;}
        .reply-send{width:100%;padding:9px;background:#C9951A;color:#fff;border:none;font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;}

        /* PHOTOS */
        .photos-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:12px;}
        @media(max-width:600px){.photos-grid{grid-template-columns:repeat(3,1fr);}}
        .photo-item{height:100px;border-radius:10px;overflow:hidden;position:relative;border:0.5px solid #E0DDD8;}
        .photo-item img{width:100%;height:100%;object-fit:cover;}
        .photo-rm{position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;border:none;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;}
        .photo-capa{position:absolute;bottom:4px;left:4px;background:#C9951A;color:#fff;font-size:8px;font-weight:700;padding:1px 6px;border-radius:5px;}
        .photo-add{height:100px;border:2px dashed #C9951A;border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;background:#FEF3E2;color:#C9951A;font-size:12px;font-weight:600;}

        /* FORM FIELDS */
        .field{margin-bottom:14px;}
        .field label{display:block;font-size:12px;font-weight:600;color:#444;margin-bottom:6px;}
        .field input,.field textarea,.field select{width:100%;padding:11px 13px;border:1.5px solid #E0DDD8;border-radius:11px;font-size:13px;font-family:'Inter',sans-serif;color:#222;background:#FAFAF8;outline:none;transition:border-color .15s;}
        .field input:focus,.field textarea:focus,.field select:focus{border-color:#C9951A;background:#fff;}
        .field textarea{resize:none;}
        .form-grid{display:grid;grid-template-columns:1fr;gap:14px;}
        @media(min-width:768px){.form-grid{grid-template-columns:1fr 1fr;}}
        .hours-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
        .church-row{display:grid;grid-template-columns:72px 1fr 1fr;gap:8px;align-items:center;padding:8px 10px;background:#1A1A1A;border:0.5px solid #222;border-radius:10px;margin-bottom:6px;}
        .church-day{font-size:12px;font-weight:600;color:#fff;}
        .church-period{display:flex;flex-direction:column;gap:3px;}
        .church-period-lbl{font-size:9px;color:#666;font-weight:700;letter-spacing:.3px;}
        .church-time{width:100%;padding:6px 8px;border:1px solid #333;border-radius:7px;font-size:12px;font-family:'Inter',sans-serif;color:#fff;background:#111;outline:none;}
        .church-time:focus{border-color:#C9951A;}
        .hour-box{background:#FAFAF8;border:0.5px solid #E0DDD8;border-radius:9px;padding:9px 10px;}
        .hour-day{font-size:9px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;}
        .hour-input{width:100%;border:none;background:transparent;font-size:12px;color:#444;font-family:'Inter',sans-serif;outline:none;}

        /* BUTTONS */
        .btn-primary{width:100%;padding:13px;background:#C9951A;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;transition:background .15s;margin-bottom:10px;}
        .btn-primary:hover:not(:disabled){background:#B8841A;}
        .btn-primary:disabled{opacity:.6;cursor:not-allowed;}

        /* HIGHLIGHT */
        .dest-card{background:#fff;border:1.5px solid #C9951A;border-radius:14px;padding:16px;margin-bottom:10px;}
        .dest-card.exp{border-color:#E0DDD8;opacity:.7;}
        .dest-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}
        .dest-badge{font-size:10px;font-weight:700;padding:3px 10px;border-radius:10px;}
        .b-active{background:#EDFAF3;color:#0F8050;border:0.5px solid #A8E6C4;}
        .b-exp{background:#F7F4EF;color:#AAA;border:0.5px solid #E0DDD8;}
        .dest-stats{display:flex;gap:20px;}
        .ds-num{font-family:'Bebas Neue',sans-serif;font-size:24px;color:#C9951A;letter-spacing:1px;}
        .ds-lbl{font-size:9px;color:#AAA;}
        .dest-grid-new{display:grid;grid-template-columns:1fr;gap:12px;}
        @media(min-width:768px){.dest-grid-new{grid-template-columns:repeat(3,1fr);}}

        /* PLANO */
        .plan-card{background:linear-gradient(135deg,#1A1A1A,#333);border-radius:16px;padding:24px;margin-bottom:20px;color:#fff;}
        .plan-nm{font-family:'Bebas Neue',sans-serif;font-size:24px;color:#C9951A;letter-spacing:1px;margin-bottom:4px;}
        .plan-pr{font-size:28px;font-weight:700;margin-bottom:8px;}
        .plan-pr span{font-size:14px;color:#AAA;font-weight:400;}
        .plan-badge{display:inline-flex;align-items:center;gap:5px;font-size:11px;background:rgba(15,128,80,.3);color:#5EE8A0;padding:4px 12px;border-radius:10px;font-weight:600;}
        .features{background:#fff;border:0.5px solid #EDE8E0;border-radius:14px;overflow:hidden;}
        .feat-item{display:flex;align-items:center;gap:12px;padding:13px 18px;border-bottom:0.5px solid #F5F2EC;font-size:13px;color:#333;}
        .feat-item:last-child{border-bottom:none;}
        .feat-chk{width:22px;height:22px;border-radius:50%;background:#C9951A;display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;flex-shrink:0;}
        .feat-chk.off{background:#E0DDD8;}

        /* ALERT */
        .alert-pending{background:#FEF3E2;border:1px solid #F5C77A;border-radius:12px;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#854F0B;line-height:1.6;}

        /* BOTTOM NAV — mobile only */
        .bottom-nav{display:flex;position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid #F0EDE8;z-index:50;padding:8px 0 10px;}
        @media(min-width:768px){.bottom-nav{display:none;}}
        .nav-item{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer;padding:4px 0;position:relative;}
        .nav-ico{font-size:20px;line-height:1;}
        .nav-lbl{font-size:9px;font-weight:500;color:#BBB;}
        .nav-item.on .nav-lbl{color:#C9951A;font-weight:700;}
        .nav-bdg{position:absolute;top:0;right:calc(50% - 18px);background:#E24B4A;color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:8px;}

        /* TOAST */
        .toast{position:fixed;bottom:24px;right:24px;background:#111;color:#fff;padding:12px 20px;border-radius:12px;font-size:13px;font-weight:500;z-index:999;animation:fadein .2s ease;}
        @media(max-width:767px){.toast{bottom:80px;left:50%;right:auto;transform:translateX(-50%);white-space:nowrap;}}
        @keyframes fadein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}

        /* EMPTY */
        .empty{text-align:center;padding:48px 20px;color:#AAA;}
        .empty div:first-child{font-size:40px;margin-bottom:12px;}
      `}</style>

      {toast && <div className="toast">✓ {toast}</div>}

      <div className="painel-layout">

        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sb-logo">
            <div className="sb-logo-txt">TRINDADE <span>ONLINE</span></div>
            <div className="sb-empresa">{company.name}</div>
            <span className={`sb-status ${company.status==='active'?'active':'pending'}`}>
              {company.status==='active'?'● Ativa':'⏳ Pendente'}
            </span>
          </div>
          <nav className="sb-nav">
            {navItems.map(n => (
              <div key={n.id} className={`sb-item ${tab===n.id?'on':''}`} onClick={() => setTab(n.id as any)}>
                <span>{n.ico}</span>
                <span>{n.lbl}</span>
                {n.badge > 0 && <span className="sb-badge">{n.badge}</span>}
              </div>
            ))}
          </nav>
          <div className="sb-footer">
            <a href="/">← Ver site</a>
            <a href="/sair" style={{marginTop:8}}>↩ Sair</a>
          </div>
        </aside>

        {/* MAIN */}
        <main className="painel-main">

          {/* Mobile header */}
          <div className="mobile-hdr">
            <div>
              <div className="mhdr-logo">TRINDADE <span>ONLINE</span></div>
              <div className="mhdr-empresa">{company.name}</div>
            </div>
<div style={{display:'flex',gap:12,alignItems:'center'}}>
              <a href="/" style={{fontSize:12,color:'#C9951A',textDecoration:'none',fontWeight:600}}>← Ver site</a>
              <a href="/sair" style={{fontSize:12,color:'#555',textDecoration:'none'}}>Sair</a>
            </div>
          </div>

          {/* Desktop topbar */}
          <div className="topbar">
            <div className="topbar-title">{tabTitle[tab]}</div>
            <div className="topbar-right">{new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})}</div>
          </div>

          <div className="content">

            {company.status === 'pending' && (
              <div className="alert-pending">⏳ Sua empresa está aguardando aprovação da nossa equipe. Você receberá uma notificação em até 24h.</div>
            )}

            {/* ── DASHBOARD ── */}
            {tab === 'painel' && (
              <>
                <div className="stat-grid">
                  <div className="stat-card"><div className="stat-num" style={{color:'#185FA5'}}>{company.views_count||0}</div><div className="stat-lbl">Visualizações</div></div>
                  <div className="stat-card"><div className="stat-num" style={{color:'#25D366'}}>{company.whatsapp_clicks||0}</div><div className="stat-lbl">Cliques WhatsApp</div></div>
                  <div className="stat-card"><div className="stat-num" style={{color:'#C9951A'}}>{company.link_clicks||0}</div><div className="stat-lbl">Cliques no link</div></div>
                  <div className="stat-card"><div className="stat-num" style={{color:'#C9951A'}}>{company.avg_rating>0?`${company.avg_rating}★`:'—'}</div><div className="stat-lbl">Nota média</div><div className="stat-sub">{company.total_reviews} avaliações</div></div>
                </div>

                <div className="section-label">AÇÕES RÁPIDAS</div>
                <div className="actions-row">
                  <button className="action-btn" style={{background:'#C9951A',color:'#fff'}} onClick={()=>setTab('perfil')}>✏️ Editar perfil</button>
                  <button className="action-btn" style={{background:'#185FA5',color:'#fff'}} onClick={()=>setTab('destaques')}>⭐ Criar destaque</button>
                  {pendingReplies > 0 && <button className="action-btn" style={{background:'#FEF3E2',color:'#854F0B',border:'1px solid #F5C77A'}} onClick={()=>setTab('avaliacoes')}>💬 {pendingReplies} sem resposta</button>}
                </div>

                {reviews.length > 0 && (
                  <div className="sec-card">
                    <div className="sec-hdr"><span className="sec-title">AVALIAÇÕES RECENTES</span><span style={{fontSize:12,color:'#C9951A',cursor:'pointer'}} onClick={()=>setTab('avaliacoes')}>Ver todas →</span></div>
                    <div className="sec-body">
                      <div className="review-grid">
                        {reviews.slice(0,4).map(r => (
                          <div key={r.id} className="review-card">
                            <div className="review-top">
                              <div className="review-av">{r.user?.name?.[0]||'?'}</div>
                              <div><div className="review-name">{r.user?.name||'Usuário'}</div></div>
                              <span className="review-date">{fmtDate(r.created_at)}</span>
                            </div>
                            <div className="review-stars">{'★'.repeat(r.rating)}{'☆'.repeat(5-r.rating)}</div>
                            {r.text && <div className="review-text">{r.text}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── DESTAQUES ── */}
            {tab === 'destaques' && (
              <>
                {activeHighlights.length > 0 && (
                  <>
                    <div className="section-label">DESTAQUES ATIVOS</div>
                    {activeHighlights.map(h => (
                      <div key={h.id} className="dest-card">
                        <div className="dest-top">
                          <span style={{fontSize:13,fontWeight:600,color:'#333'}}>{h.level==='home'?'Destaque Home':h.level==='category'?'Destaque Categoria':'Destaque Subcategoria'} · {h.duration_days} dias</span>
                          <span className="dest-badge b-active">● Ativo</span>
                        </div>
                        <div style={{fontSize:12,color:'#AAA',marginBottom:12}}>Vence em {fmtDate(h.expires_at)} · {daysLeft(h.expires_at)} dias restantes · R$ {h.price_paid.toFixed(2)}</div>
                        <div className="dest-stats">
                          <div><div className="ds-num">{h.clicks_count}</div><div className="ds-lbl">Cliques</div></div>
                          <div><div className="ds-num">{h.impressions_count}</div><div className="ds-lbl">Impressões</div></div>
                          <div><div className="ds-num">{h.impressions_count>0?Math.round((h.clicks_count/h.impressions_count)*100):0}%</div><div className="ds-lbl">Taxa de clique</div></div>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                <div className="section-label">CRIAR NOVO DESTAQUE</div>
                <div className="dest-grid-new">
                  {[
                    {level:'home',    label:'Destaque Home',         desc:'Aparece na página inicial', prices:['R$ 49,90','R$ 89,90','R$ 159,90']},
                    {level:'category',label:'Destaque Categoria',    desc:'Topo da sua categoria',     prices:['R$ 29,90','R$ 54,90','R$ 99,90']},
                    {level:'subcat',  label:'Destaque Subcategoria', desc:'Topo da subcategoria',      prices:['R$ 14,90','R$ 27,90','R$ 49,90']},
                  ].map(d => (
                    <div key={d.level} style={{background:'#FAFAF8',border:'0.5px solid #E0DDD8',borderRadius:14,padding:16}}>
                      <div style={{fontWeight:600,fontSize:14,marginBottom:3}}>{d.label}</div>
                      <div style={{fontSize:12,color:'#AAA',marginBottom:12}}>{d.desc}</div>
                      {['7 dias','15 dias','30 dias'].map((dur,i) => (
                        <button key={i} onClick={()=>showToast('Em breve: pagamento via Pix')} style={{width:'100%',padding:'9px',marginBottom:7,borderRadius:9,border:'1px solid #E0DDD8',background:'#fff',fontSize:12,cursor:'pointer',fontFamily:'Inter,sans-serif',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <span style={{fontWeight:500}}>{dur}</span>
                          <span style={{color:'#C9951A',fontWeight:600}}>{d.prices[i]}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
                <div style={{textAlign:'center',fontSize:11,color:'#AAA',marginTop:8}}>Pagamento via Pix · Ativa na hora</div>

                {highlights.filter(h=>h.status==='expired').length > 0 && (
                  <>
                    <div className="section-label">HISTÓRICO</div>
                    {highlights.filter(h=>h.status==='expired').map(h => (
                      <div key={h.id} className="dest-card exp">
                        <div className="dest-top">
                          <span style={{fontSize:13,fontWeight:600,color:'#888'}}>{h.level==='home'?'Home':h.level==='category'?'Categoria':'Subcategoria'} · {h.duration_days}d</span>
                          <span className="dest-badge b-exp">Encerrado</span>
                        </div>
                        <div style={{fontSize:11,color:'#CCC',marginBottom:8}}>{fmtDate(h.starts_at)} – {fmtDate(h.expires_at)}</div>
                        <div className="dest-stats">
                          <div><div className="ds-num" style={{color:'#AAA'}}>{h.clicks_count}</div><div className="ds-lbl">Cliques</div></div>
                          <div><div className="ds-num" style={{color:'#AAA'}}>{h.impressions_count}</div><div className="ds-lbl">Impressões</div></div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}

            {/* ── AVALIAÇÕES ── */}
            {tab === 'avaliacoes' && (
              <>
                {reviews.length === 0 ? (
                  <div className="empty"><div>⭐</div><div>Nenhuma avaliação ainda</div><div style={{fontSize:13,marginTop:8}}>Quando clientes avaliarem sua empresa, aparecem aqui</div></div>
                ) : (
                  <>
                    <div className="rating-summary">
                      <div style={{textAlign:'center'}}>
                        <div className="rating-big">{company.avg_rating>0?company.avg_rating.toFixed(1):'—'}</div>
                        <div style={{fontSize:18,color:'#C9951A',margin:'4px 0 2px'}}>{'★'.repeat(Math.round(company.avg_rating))}</div>
                        <div style={{fontSize:12,color:'#AAA'}}>{company.total_reviews} avaliações</div>
                      </div>
                      <div className="rating-bars">
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
                    <div className="review-grid">
                      {reviews.map(r => (
                        <div key={r.id} className="review-card">
                          <div className="review-top">
                            <div className="review-av">{r.user?.name?.[0]||'?'}</div>
                            <div><div className="review-name">{r.user?.name||'Usuário'}</div></div>
                            <span className="review-date">{fmtDate(r.created_at)}</span>
                          </div>
                          <div className="review-stars">{'★'.repeat(r.rating)}{'☆'.repeat(5-r.rating)}</div>
                          {r.text && <div className="review-text">{r.text}</div>}
                          {r.response ? (
                            <div className="reply-existing"><div className="reply-lbl">Sua resposta:</div><div className="reply-txt">{r.response.text}</div></div>
                          ) : replyId===r.id ? (
                            <div className="reply-box">
                              <textarea className="reply-input" rows={3} placeholder="Escreva sua resposta pública..." value={replyText} onChange={e=>setReplyText(e.target.value)}/>
                              <button className="reply-send" onClick={()=>sendReply(r.id)}>Publicar resposta</button>
                            </div>
                          ) : (
                            <div className="review-actions">
                              <button className="btn-reply" onClick={()=>{setReplyId(r.id);setReplyText('')}}>💬 Responder</button>
                              <button className="btn-flag" onClick={()=>flagReview(r.id)}>⚑ Sinalizar</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            {/* ── PERFIL ── */}
            {tab === 'perfil' && (
              <>
                <div className="sec-card">
                  <div className="sec-hdr"><span className="sec-title">FOTOS ({photos.length}/5)</span></div>
                  <div className="sec-body">
                    <div className="photos-grid">
                      {photos.map((p,i) => (
                        <div key={p.id} className="photo-item">
                          <img src={p.url} alt={`foto ${i+1}`}/>
                          <button className="photo-rm" onClick={()=>removePhoto(p.id)}>✕</button>
                          {i===0 && <div className="photo-capa">CAPA</div>}
                        </div>
                      ))}
                      {photos.length < 5 && <div className="photo-add" onClick={()=>fileRef.current?.click()}><span style={{fontSize:28}}>📷</span><span>Adicionar</span></div>}
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={addPhoto}/>
                  </div>
                </div>

                <div className="sec-card">
                  <div className="sec-hdr"><span className="sec-title">DADOS DA EMPRESA</span></div>
                  <div className="sec-body">
                    <div className="form-grid">
                      <div className="field">
                        <label>Nome da empresa</label>
                        <input type="text" value={editNome} onChange={e=>setEditNome(e.target.value.toUpperCase())} style={{textTransform:'uppercase',fontFamily:"'Bebas Neue',sans-serif",letterSpacing:1}}/>
                      </div>
                      <div className="field">
                        <label>Categoria *</label>
                        <select value={editCategoryId} onChange={e=>{setEditCategoryId(e.target.value);setEditSubcatIds([])}}>
                          <option value="">Selecionar categoria...</option>
                          {allCategories.map(cat=><option key={cat.id} value={cat.id}>{cat.emoji} {cat.name}</option>)}
                        </select>
                      </div>
                      {editCategoryId && allSubcats.filter(s=>s.category_id===editCategoryId).length > 0 && (
                      <div className="field">
                        <label>Subcategorias <span style={{fontSize:11,color:'#666',fontWeight:400}}>(selecione até 3)</span></label>
                        <div style={{display:'flex',flexWrap:'wrap',gap:7,marginTop:4}}>
                          {allSubcats.filter(s=>s.category_id===editCategoryId).map(s=>(
                            <div key={s.id} onClick={()=>setEditSubcatIds(prev=>prev.includes(s.id)?prev.filter(x=>x!==s.id):prev.length<3?[...prev,s.id]:prev)}
                              style={{padding:'5px 12px',borderRadius:20,fontSize:12,cursor:'pointer',border:'1px solid',fontFamily:'Inter,sans-serif',
                                borderColor:editSubcatIds.includes(s.id)?'#C9951A':'#333',
                                background:editSubcatIds.includes(s.id)?'rgba(201,149,26,.15)':'transparent',
                                color:editSubcatIds.includes(s.id)?'#C9951A':'#888'}}>
                              {s.emoji} {s.name}
                            </div>
                          ))}
                        </div>
                      </div>
                      )}
                      <div className="field">
                        <label>WhatsApp</label>
                        <input type="tel" value={editPhone} onChange={e=>setEditPhone(e.target.value)} placeholder="(21) 9 0000-0000"/>
                      </div>
                      <div className="field" style={{gridColumn:'1/-1'}}>
                        <label>Endereço</label>
                        <input type="text" value={editAddress} onChange={e=>setEditAddress(e.target.value)} placeholder="Rua, número, bairro"/>
                      </div>
                      <div className="field">
                        <label>Label do link externo</label>
                        <select value={editLinkLabel} onChange={e=>setEditLinkLabel(e.target.value)}>
                          {LINK_LABELS.map(l=><option key={l}>{l}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>URL do link externo</label>
                        <input type="url" value={editLinkUrl} onChange={e=>setEditLinkUrl(e.target.value)} placeholder="https://..."/>
                      </div>
                      <div className="field" style={{gridColumn:'1/-1'}}>
                        <label>Descrição</label>
                        <textarea rows={4} value={editDesc} onChange={e=>setEditDesc(e.target.value)} placeholder="Sobre sua empresa..."/>
                      </div>
                    </div>
                    <div className="field">
                      <label>{company.category_id === IGREJAS_CATEGORY_ID ? '⛪ Horários de culto' : 'Horários de funcionamento'}</label>
                      {company.category_id === IGREJAS_CATEGORY_ID ? (
                        <div style={{marginTop:8}}>
                          <div style={{fontSize:11,color:'#888',marginBottom:10,padding:'6px 10px',background:'rgba(201,149,26,.1)',borderRadius:8,borderLeft:'3px solid #C9951A'}}>
                            Preencha os horários dos cultos. Deixe em branco os dias sem culto.
                          </div>
                          {churchHours.map((ch,i)=>(
                            <div key={i} className="church-row">
                              <div className="church-day">{ch.day}</div>
                              <div className="church-period">
                                <div className="church-period-lbl">MANHÃ</div>
                                <input type="time" className="church-time" value={ch.manha} onChange={e=>{const n=[...churchHours];n[i]={...n[i],manha:e.target.value};setChurchHours(n)}}/>
                              </div>
                              <div className="church-period">
                                <div className="church-period-lbl">NOITE</div>
                                <input type="time" className="church-time" value={ch.noite} onChange={e=>{const n=[...churchHours];n[i]={...n[i],noite:e.target.value};setChurchHours(n)}}/>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="hours-grid">
                          {editHours.map((h,i)=>(
                            <div key={i} className="hour-box">
                              <div className="hour-day">{h.label}</div>
                              <input className="hour-input" value={h.hours} placeholder="08:00–18:00" onChange={e=>{const n=[...editHours];n[i]={...n[i],hours:e.target.value};setEditHours(n)}}/>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button className="btn-primary" onClick={saveProfile} disabled={saving}>{saving?'Salvando...':'Salvar alterações'}</button>
                  </div>
                </div>
              </>
            )}

            {/* ── PLANO ── */}
            {tab === 'plano' && (
              <>
                <div className="plan-card">
                  <div className="plan-nm">{company.plan==='paid'?'PLANO PAGO':'PLANO GRATUITO'}</div>
                  <div className="plan-pr">{company.plan==='paid'?<>R$ 29,90 <span>/mês</span></>:<>R$ 0 <span>/ 30 dias grátis</span></>}</div>
                  <span className="plan-badge">● {company.status==='active'?'Ativo':'Pendente'}</span>
                </div>

                {company.plan === 'free' && (
                  <div style={{background:'#FEF3E2',border:'1px solid #F5C77A',borderRadius:12,padding:16,marginBottom:20}}>
                    <div style={{fontSize:14,fontWeight:600,color:'#854F0B',marginBottom:6}}>Upgrade para o Plano Pago</div>
                    <div style={{fontSize:13,color:'#854F0B',lineHeight:1.6,marginBottom:12}}>WhatsApp clicável · Endereço e mapa · Múltiplas subcategorias · Receber avaliações · Estatísticas completas</div>
                    <button className="btn-primary" onClick={()=>showToast('Em breve: pagamento via Pix')}>Assinar por R$ 29,90/mês</button>
                  </div>
                )}

                <div className="section-label">O QUE ESTÁ INCLUÍDO</div>
                <div className="features">
                  {[
                    {ok:true,               txt:'Perfil completo com fotos e descrição'},
                    {ok:company.plan==='paid',txt:'WhatsApp e link externo clicáveis'},
                    {ok:company.plan==='paid',txt:'Endereço e mapa visíveis'},
                    {ok:company.plan==='paid',txt:'Múltiplas subcategorias'},
                    {ok:company.plan==='paid',txt:'Receber e responder avaliações'},
                    {ok:company.plan==='paid',txt:'Estatísticas completas'},
                    {ok:true,               txt:'Criar destaques pagos'},
                  ].map((f,i)=>(
                    <div key={i} className="feat-item">
                      <div className={`feat-chk ${f.ok?'':'off'}`}>{f.ok?'✓':'—'}</div>
                      <span style={{color:f.ok?'#333':'#AAA'}}>{f.txt}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

          </div>
        </main>
      </div>

      {/* BOTTOM NAV — mobile */}
      <div className="bottom-nav">
        {navItems.map(n=>(
          <div key={n.id} className={`nav-item ${tab===n.id?'on':''}`} onClick={()=>setTab(n.id as any)}>
            {n.badge > 0 && <span className="nav-bdg">{n.badge}</span>}
            <div className="nav-ico">{n.ico}</div>
            <div className="nav-lbl">{n.lbl}</div>
          </div>
        ))}
      </div>
    </>
  )
}