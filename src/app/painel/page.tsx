'use client'

import { compressImage } from '@/lib/compressImage'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import PhotoManager from '@/components/PhotoManager'

type Company = {
  id: string; name: string; status: string; plan: string
  address: string; phone: string; description: string
  external_link: string; external_link_label: string
  avg_rating: number; total_reviews: number
  views_count: number; whatsapp_clicks: number; link_clicks: number
  category_id?: string; trial_ends_at?: string; plan_ends_at?: string; cpf_cnpj?: string
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
  const [tab, setTab]               = useState<'painel'|'destaques'|'banners'|'avaliacoes'|'perfil'|'plano'|'cupons'>('painel')
  const [myCoupons, setMyCoupons]   = useState<any[]>([])
  const [couponForm, setCouponForm] = useState({title:'',discount_type:'fixed',discount_value:'',total_qty:'',qty_per_person:'1',expires_at:''})
  const [savingCoupon, setSavingCoupon] = useState(false)
  const [validateCode, setValidateCode] = useState('')
  const [validateResult, setValidateResult] = useState<any>(null)
  const [validating, setValidating] = useState(false)
  const [company, setCompany]       = useState<Company|null>(null)

  useEffect(() => {
    if (tab === 'cupons' && company?.id) {
      supabase.from('coupons')
        .select('*, redemptions:coupon_redemptions(count)')
        .eq('company_id', company.id)
        .eq('active', true)
        .order('created_at', { ascending: false })
        .then(({ data }) => setMyCoupons(data || []))
    }
  }, [tab, company?.id])
  const [companies, setCompanies]   = useState<Company[]>([])
  const [reviews, setReviews]       = useState<Review[]>([])
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [toast, setToast]           = useState('')
  const [replyId, setReplyId]       = useState<string|null>(null)
  const [replyText, setReplyText]   = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [ownerName, setOwnerName]   = useState('')
  const [bannerModal, setBannerModal] = useState({ open:false, dias:0, valor:0, step:'escolha' as 'escolha'|'upload'|'ia'|'pix'|'confirmado', fileDesktop:null as File|null, fileMobile:null as File|null, descricaoIA:'', paymentId:null as string|null, qrCode:null as string|null, pixCode:null as string|null, copied:false })
  const bannerDesktopRef = useRef<HTMLInputElement>(null)
  const bannerMobileRef  = useRef<HTMLInputElement>(null)

  const [hlModal, setHlModal] = useState({ open:false, loading:false, level:'', days:0, value:0, qr_code_image:null as string|null, pix_copy_paste:null as string|null, payment_id:null as string|null, copied:false, confirmed:false })

  const [featureFlags, setFeatureFlags] = useState<Record<string,boolean>>({})
  const [availablePlans, setAvailablePlans] = useState<any[]>([])
  const [bannerRequests, setBannerRequests] = useState<any[]>([])
  const [mobileTab, setMobileTab] = useState<string | null>(null)
  const [interesses, setInteresses] = useState<any[]>([])

  const [pixModal, setPixModal] = useState({ open:false, loading:false, plan:'', planNome:'', value:0, qr_code_image:null as string|null, pix_copy_paste:null as string|null, payment_id:null as string|null, copied:false, confirmed:false })

  const [editNome, setEditNome]               = useState('')
  const [editCategoryId, setEditCategoryId]   = useState('')
  const [editSubcatIds, setEditSubcatIds]     = useState<string[]>([])
  const [painelSubcatSugestao, setPainelSubcatSugestao] = useState('')
  const [painelSubcatSugestoes, setPainelSubcatSugestoes] = useState<string[]>([])
  const [allCategories, setAllCategories]     = useState<{id:string;name:string;emoji:string}[]>([])
  const [allSubcats, setAllSubcats]           = useState<{id:string;name:string;emoji:string;category_id:string}[]>([])
  const [editPhone, setEditPhone]             = useState('')
  const [editAddress, setEditAddress]         = useState('')
  const [editDesc, setEditDesc]               = useState('')
  const [editLinkUrl, setEditLinkUrl]         = useState('')
  const [editLinkLabel, setEditLinkLabel]     = useState('Ver cardápio')
  const [subcatSearch, setSubcatSearch]         = useState('')
  const [editTags, setEditTags]                 = useState<string[]>([])
  const [tagInput, setTagInput]                 = useState('')
  const [editCpfCnpj, setEditCpfCnpj]         = useState('')
  const [editHours, setEditHours]             = useState<{label:string;hours:string}[]>([])
  const [churchHours, setChurchHours]         = useState<{day:string;manha:string;noite:string}[]>(DIAS_SEMANA.map(day=>({day,manha:'',noite:''})))
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!company?.id) return
    const channel = supabase.channel(`interesses-${company.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'contact_requests',
        filter: `company_id=eq.${company.id}`
      }, (payload) => {
        setInteresses(prev => [payload.new, ...prev])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [company?.id])

  useEffect(() => {
    supabase.from('plans').select('*').eq('active', true).order('display_order').then(({ data }) => {
      setAvailablePlans(data || [])
    })
    supabase.from('feature_flags').select('key,enabled').then(({ data }) => {
      if (data) setFeatureFlags(Object.fromEntries(data.map((f:any) => [f.key, f.enabled])))
    })
    supabase.from('plans').select('*').eq('active', true).order('display_order').then(({ data }) => {
      setAvailablePlans(data || [])
    })
    supabase.from('feature_flags').select('key,enabled').then(({ data }) => {
      if (data) setFeatureFlags(Object.fromEntries(data.map((f:any) => [f.key, f.enabled])))
    })
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return }
      const { data: profile } = await supabase.from('profiles').select('user_type, name').eq('id', session.user.id).single()
      if (profile?.user_type === 'admin') { window.location.href = '/admin'; return }
      setOwnerEmail(session.user.email || '')
      setOwnerName(profile?.name || '')
      if (profile?.user_type !== 'company') { window.location.href = '/'; return }
      loadData(session.user.id)
    })
  }, [])

  async function loadData(userId: string) {
    setLoading(true)
    const { data: comps } = await supabase
      .from('companies')
      .select('*, category_id, category:categories(name,emoji), photos:company_photos(id,url,order), hours:company_hours(id,label,hours,order)')
      .eq('owner_id', userId)
      .order('created_at', {ascending: true})
    
    const comp = comps?.[0] || null
    setCompanies((comps || []) as any)

    if (comp) {
      setCompany(comp)
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
      setEditCpfCnpj(comp.cpf_cnpj || '')
      setEditTags(comp.tags || [])
      const HOURS_DEFAULT = [
        {label:'Seg–Sex',hours:''},{label:'Sábado',hours:''},{label:'Domingo',hours:''},{label:'Feriados',hours:''}
      ]
      const savedHours = comp.hours?.sort((a:any,b:any)=>a.order-b.order) || []
      const mergedHours = HOURS_DEFAULT.map(def => {
        const saved = savedHours.find((h:any) => h.label === def.label)
        return { label: def.label, hours: saved?.hours || '' }
      })
      const extraHours = savedHours.filter((h:any) => !HOURS_DEFAULT.find(d => d.label === h.label))
      setEditHours([...mergedHours, ...extraHours])
      const { data: bReqs } = await supabase.from('banner_requests').select('*').eq('company_id', comp.id).order('created_at', {ascending: false})
      setBannerRequests(bReqs || [])
      const { data: intReqs } = await supabase.from('contact_requests').select('*').eq('company_id', comp.id).order('created_at', {ascending: false}).limit(50)
      setInteresses(intReqs || [])
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
    }
    setLoading(false)
  }

  function abrirBanner(dias: number, valor: number) {
    setBannerModal({ open:true, dias, valor, step:'escolha', fileDesktop:null, fileMobile:null, descricaoIA:'', paymentId:null, qrCode:null, pixCode:null, copied:false })
  }

  async function pagarBanner(tipo: 'upload'|'ia') {
    if (!company) return
    const valorTotal = tipo === 'upload' ? bannerModal.valor : bannerModal.valor + 40
    setBannerModal(p => ({ ...p, step:'pix' }))
    try {
      const res = await fetch('/api/mp/create-charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: `banner_${bannerModal.dias}d_${tipo}`, company_id: company.id, owner_email: ownerEmail, _valor_override: valorTotal })
      })
      const data = await res.json()
      if (data.error) { showToast('Erro: ' + data.error); setBannerModal(p => ({ ...p, step: tipo })); return }
      // Upload dos arquivos se for upload
      let fileDesktopUrl = null
      let fileMobileUrl = null
      if (tipo === 'upload' && bannerModal.fileDesktop) {
        const ext = bannerModal.fileDesktop.name.split('.').pop()
        const pathD = `${company.id}/${Date.now()}-desktop.${ext}`
        const compressedD = await compressImage(bannerModal.fileDesktop, 1.5, 1920)
        const { data: upD } = await supabase.storage.from('banner-uploads').upload(pathD, compressedD, {upsert:true})
        if (upD) {
          const { data: urlD } = supabase.storage.from('banner-uploads').getPublicUrl(pathD)
          fileDesktopUrl = urlD.publicUrl
        }
        if (bannerModal.fileMobile) {
          const extM = bannerModal.fileMobile.name.split('.').pop()
          const pathM = `${company.id}/${Date.now()}-mobile.${extM}`
          const compressedM = await compressImage(bannerModal.fileMobile, 1.0, 1200)
          const { data: upM } = await supabase.storage.from('banner-uploads').upload(pathM, compressedM, {upsert:true})
          if (upM) {
            const { data: urlM } = supabase.storage.from('banner-uploads').getPublicUrl(pathM)
            fileMobileUrl = urlM.publicUrl
          }
        }
      }
      // Salvar pedido de banner
      const { error: bannerErr } = await supabase.from('banner_requests').insert({
        company_id: company.id,
        tipo,
        dias: bannerModal.dias,
        value: valorTotal,
        descricao_ia: tipo === 'ia' ? bannerModal.descricaoIA : null,
        file_desktop_url: fileDesktopUrl,
        file_mobile_url: fileMobileUrl,
        payment_id: String(data.payment_id),
        status: 'pending',
      })
      setBannerModal(p => ({ ...p, paymentId: data.payment_id, qrCode: data.qr_code_image, pixCode: data.pix_copy_paste }))
      // Polling a cada 4s
      const pollInterval = setInterval(async () => {
        try {
          const res2 = await fetch('/api/mp/check-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payment_id: data.payment_id, company_id: company.id })
          })
          const result = await res2.json()
          if (result.paid) {
            clearInterval(pollInterval)
            setBannerModal(p => ({ ...p, step: 'confirmado' }))
          }
        } catch {}
      }, 4000)
      setTimeout(() => clearInterval(pollInterval), 600000)
    } catch { showToast('Erro ao gerar Pix'); setBannerModal(p => ({ ...p, step: tipo })) }
  }

  async function assinarDestaque(level: string, days: number, valor?: number, nome?: string) {
    if (!company) return
    setHlModal(p => ({ ...p, open: true, loading: true, level, days, copied: false, qr_code_image: null, pix_copy_paste: null, confirmed: false }))
    try {
      const res = await fetch('/api/mp/create-highlight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, days, company_id: company.id, owner_email: ownerEmail, valor_override: valor, nome_plano: nome })
      })
      const data = await res.json()
      if (data.error) { showToast('Erro: ' + data.error); setHlModal(p => ({ ...p, open: false, loading: false })); return }
      setHlModal(p => ({ ...p, loading: false, value: data.value, qr_code_image: data.qr_code_image, pix_copy_paste: data.pix_copy_paste, payment_id: data.payment_id }))
      // Polling
      const pollInterval = setInterval(async () => {
        try {
          const { data: hls } = await supabase.from('highlights').select('id').eq('company_id', company.id).eq('status','active').order('created_at',{ascending:false}).limit(1)
          if (hls && hls.length > 0) {
            clearInterval(pollInterval)
            setHlModal(p => ({ ...p, confirmed: true }))
          }
        } catch {}
      }, 4000)
      setTimeout(() => clearInterval(pollInterval), 600000)
    } catch { showToast('Erro ao gerar Pix'); setHlModal(p => ({ ...p, open: false, loading: false })) }
  }

  function copiarPixHL() {
    if (!hlModal.pix_copy_paste) return
    navigator.clipboard.writeText(hlModal.pix_copy_paste)
    setHlModal(p => ({ ...p, copied: true }))
    setTimeout(() => setHlModal(p => ({ ...p, copied: false })), 3000)
  }

  async function assinar(plan: string, valor?: number, dias?: number, nome?: string) {
    if (!company) return
    setPixModal(p => ({ ...p, open: true, loading: true, plan, planNome: nome||plan, copied: false, qr_code_image: null, pix_copy_paste: null }))
    try {
      const res = await fetch('/api/mp/create-charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, company_id: company.id, owner_email: ownerEmail, valor_override: valor, dias_override: dias, nome_plano: nome })
      })
      const data = await res.json()
      if (data.error) { showToast('Erro: ' + data.error); setPixModal(p => ({ ...p, open: false, loading: false })); return }
      setPixModal(p => ({ ...p, loading: false, value: data.value, qr_code_image: data.qr_code_image, pix_copy_paste: data.pix_copy_paste, payment_id: data.payment_id }))
      // Polling: verifica pagamento a cada 4s direto na API do MP
      const pollInterval = setInterval(async () => {
        try {
          const res = await fetch('/api/mp/check-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payment_id: data.payment_id, company_id: company.id })
          })
          const result = await res.json()
          if (result.paid) {
            clearInterval(pollInterval)
            setPixModal(p => ({ ...p, confirmed: true }))
            setCompany(prev => prev ? { ...prev, plan: 'paid', plan_ends_at: result.plan_ends_at } : prev)
          }
        } catch {}
      }, 4000)
      // Para o polling após 10 minutos
      setTimeout(() => clearInterval(pollInterval), 600000)
    } catch { showToast('Erro ao gerar Pix'); setPixModal(p => ({ ...p, open: false, loading: false })) }
  }

  async function verificarPagamento() {
    if (!company || !pixModal.payment_id) return
    try {
      const res = await fetch('/api/mp/check-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: pixModal.payment_id, company_id: company.id })
      })
      const data = await res.json()
      if (data.paid) {
        setPixModal(p => ({ ...p, confirmed: true }))
        setCompany(prev => prev ? { ...prev, plan: 'paid', plan_ends_at: data.plan_ends_at } : prev)
      } else {
        showToast('Pagamento ainda não confirmado. Aguarde alguns segundos.')
      }
    } catch {
      const { data: comp } = await supabase.from('companies').select('plan, plan_ends_at').eq('id', company.id).single()
      if (comp?.plan === 'paid') {
        setPixModal(p => ({ ...p, confirmed: true }))
        setCompany(prev => prev ? { ...prev, plan: 'paid', plan_ends_at: comp.plan_ends_at } : prev)
      } else {
        showToast('Pagamento ainda não confirmado. Aguarde alguns segundos.')
      }
    }
  }

  function copiarPix() {
    if (!pixModal.pix_copy_paste) return
    navigator.clipboard.writeText(pixModal.pix_copy_paste)
    setPixModal(p => ({ ...p, copied: true }))
    setTimeout(() => setPixModal(p => ({ ...p, copied: false })), 3000)
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
      external_link_label: editLinkUrl ? editLinkLabel : null,
      cpf_cnpj: editCpfCnpj || null,
      tags: editTags
    }).eq('id', company.id)
    await supabase.from('company_subcategories').delete().eq('company_id', company.id)
    if (painelSubcatSugestoes.length > 0) {
      await supabase.from('subcategory_suggestions').insert(painelSubcatSugestoes.map(s => ({ company_id: company.id, suggestion: s })))
      setPainelSubcatSugestoes([])
    }
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
    const compressed = await compressImage(file)
    const { data: upload } = await supabase.storage.from('company-photos').upload(path, compressed, {upsert:true})
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

  if (!loading && company && company.status === 'suspended') return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'Inter',sans-serif;background:#111;color:#fff;}
      `}</style>
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'100vh',padding:24,textAlign:'center'}}>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,color:'#fff',letterSpacing:2,marginBottom:6}}>TRINDADE <span style={{color:'#C9951A'}}>ONLINE</span></div>
        <div style={{fontSize:48,margin:'24px 0 12px'}}>⚠️</div>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:'#fff',letterSpacing:1,marginBottom:8}}>EMPRESA SUSPENSA</div>
        <div style={{fontSize:14,color:'#666',maxWidth:380,lineHeight:1.7,marginBottom:28}}>
          Sua empresa <strong style={{color:'#fff'}}>{company.name}</strong> está suspensa. Entre em contato com o Trindade Online para mais informações ou cadastre uma nova empresa.
        </div>
        <a href="https://wa.me/55219XXXXXXXX" target="_blank" style={{display:'inline-block',padding:'14px 28px',background:'#25D366',color:'#fff',borderRadius:12,textDecoration:'none',fontSize:15,fontWeight:700,marginBottom:12}}>
          💬 Falar com o suporte
        </a>
        <a href="/empresa/cadastrar" style={{display:'inline-block',padding:'12px 24px',background:'#C9951A',color:'#fff',borderRadius:12,textDecoration:'none',fontSize:14,fontWeight:700,marginBottom:12}}>
          + Cadastrar nova empresa
        </a>
        <a href="/" style={{fontSize:13,color:'#555',textDecoration:'none'}}>← Voltar ao site</a>
      </div>
    </>
  )
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
    painel:'Dashboard', destaques:'Destaques', banners:'Banners', avaliacoes:'Avaliações', perfil:'Editar Perfil', plano:'Meu Plano'
  }

  const navItems = [
    { id:'painel',     ico:'📊', lbl:'Dashboard',  badge:0 },
    { id:'destaques',  ico:'⭐', lbl:'Destaques',  badge:activeHighlights.length },
    { id:'banners',    ico:'📢', lbl:'Banners',    badge:0 },
    { id:'avaliacoes', ico:'💬', lbl:'Avaliações', badge:pendingReplies },
    { id:'perfil',     ico:'✏️', lbl:'Perfil',     badge:0 },
    { id:'plano',      ico:'💳', lbl:'Plano',      badge:0 },
    { id:'cupons',     ico:'🎟️', lbl:'Cupons',     badge:0 },
  ]

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'Inter',sans-serif;background:#F0EDE8;}

        .painel-layout{display:flex;min-height:100vh;}
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
        .sb-actions{display:flex;gap:6px;}
        .sb-btn{flex:1;padding:10px 8px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none;text-align:center;transition:all .15s;display:flex;align-items:center;justify-content:center;gap:4px;}
        .sb-btn-gold{background:#C9951A;color:#fff !important;}
        .sb-btn-gold:hover{background:#B8841A;color:#fff !important;}
        .sb-btn-gray{background:transparent;color:#888 !important;border:1.5px solid #333;}
        .sb-btn-gray:hover{background:#1A1A1A;color:#C9951A !important;border-color:#C9951A;}
        .mobile-hdr-new{background:#111;padding:16px 20px;text-align:center;}
        @media(min-width:768px){.mobile-hdr-new{display:none;}}
        .mobile-hdr-new .mhdr-logo{font-family:'Bebas Neue',sans-serif;font-size:22px;color:#fff;letter-spacing:2px;}
        .mobile-hdr-new .mhdr-logo span{color:#C9951A;}
        .mobile-hdr-new .mhdr-empresa{font-size:11px;color:#999;margin-top:6px;font-weight:600;letter-spacing:1px;text-transform:uppercase;}
        .mobile-actions{background:#F5F0E8;padding:12px 16px;display:flex;gap:8px;align-items:stretch;}
        @media(min-width:768px){.mobile-actions{display:none;}}
        .m-action-btn{flex:1;min-width:0;width:0;padding:12px 10px;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none;text-align:center;transition:all .15s;display:flex;align-items:center;justify-content:center;gap:6px;}
        .m-action-gold{background:#C9951A;color:#fff;}
        .m-action-gold:hover{background:#B8841A;}
        .m-action-gray{background:transparent;color:#666;border:1.5px solid #DDD;}
        .m-action-gray:hover{background:#EDE8E0;color:#111;}
        .m-action-select{flex:1;min-width:0;width:0;padding:0 10px;border-radius:10px;border:1.5px solid #DDD;font-size:12px;font-weight:600;color:#333;background:#fff;font-family:'Inter',sans-serif;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;}

        .painel-main{flex:1;overflow-x:hidden;display:flex;flex-direction:column;min-width:0;}
        .topbar{background:#fff;border-bottom:1px solid #EDE8E0;padding:14px 28px;display:none;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:20;}
        @media(min-width:768px){.topbar{display:flex;}}
        .topbar-title{font-family:'Bebas Neue',sans-serif;font-size:20px;color:#111;letter-spacing:1px;}
        .topbar-right{font-size:12px;color:#AAA;}
        .mobile-hdr{background:#111;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;}
        @media(min-width:768px){.mobile-hdr{display:none;}}
        .mhdr-logo{font-family:'Bebas Neue',sans-serif;font-size:18px;color:#fff;letter-spacing:2px;}
        .mhdr-logo span{color:#C9951A;}
        .mhdr-empresa{font-size:11px;color:#C9951A;font-family:'Bebas Neue',sans-serif;letter-spacing:1px;}

        /* CONTENT — padding padrão para abas normais */
        .content{padding:24px 28px;flex:1;}
        @media(max-width:767px){.content{padding:16px 16px 80px;}}

        /* CONTENT PLANO — centralizado com max-width */
        .content-plano{padding:24px 28px;flex:1;}
        @media(max-width:767px){.content-plano{padding:16px 16px 80px;}}
        .plano-inner{max-width:780px;margin:0 auto;}

        .stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px;}
        @media(min-width:1024px){.stat-grid{grid-template-columns:repeat(4,1fr);}}
        .stat-card{background:#fff;border:0.5px solid #EDE8E0;border-radius:14px;padding:16px 18px;}
        .stat-num{font-family:'Bebas Neue',sans-serif;font-size:32px;letter-spacing:1px;line-height:1;margin-bottom:4px;}
        .stat-lbl{font-size:11px;color:#AAA;}
        .stat-sub{font-size:10px;color:#AAA;margin-top:4px;}

        .sec-card{background:#fff;border:0.5px solid #EDE8E0;border-radius:14px;margin-bottom:16px;overflow:hidden;}
        .sec-hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:0.5px solid #F0EDE8;}
        .sec-title{font-family:'Bebas Neue',sans-serif;font-size:13px;color:#888;letter-spacing:1.5px;}
        .sec-body{padding:16px 18px;}
        .section-label{font-family:'Bebas Neue',sans-serif;font-size:13px;color:#888;letter-spacing:1.5px;margin:20px 0 12px;}
        .actions-row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;}
        .action-btn{flex:1;min-width:140px;padding:12px 16px;border:none;border-radius:12px;font-size:13px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;transition:all .15s;display:flex;align-items:center;justify-content:center;gap:8px;}
        .action-btn:hover{opacity:.9;}

        .rating-summary{display:flex;align-items:center;gap:16px;background:#FAFAF8;border:0.5px solid #E0DDD8;border-radius:13px;padding:16px;margin-bottom:16px;}
        .rating-big{font-family:'Bebas Neue',sans-serif;font-size:52px;color:#C9951A;letter-spacing:2px;line-height:1;}
        .rating-bars{flex:1;}
        .bar-row{display:flex;align-items:center;gap:6px;margin-bottom:4px;}
        .bar-lbl{font-size:10px;color:#AAA;width:8px;}
        .bar-bg{flex:1;height:6px;background:#F0EDE8;border-radius:3px;overflow:hidden;}
        .bar-fill{height:100%;background:#C9951A;border-radius:3px;}
        .bar-cnt{font-size:10px;color:#CCC;width:20px;text-align:right;}

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

        .photos-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:12px;}
        @media(max-width:600px){.photos-grid{grid-template-columns:repeat(3,1fr);}}
        .photo-item{height:100px;border-radius:10px;overflow:hidden;position:relative;border:0.5px solid #E0DDD8;}
        .photo-item img{width:100%;height:100%;object-fit:cover;}
        .photo-rm{position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;border:none;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;}
        .photo-capa{position:absolute;bottom:4px;left:4px;background:#C9951A;color:#fff;font-size:8px;font-weight:700;padding:1px 6px;border-radius:5px;}
        .photo-add{height:100px;border:2px dashed #C9951A;border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;background:#FEF3E2;color:#C9951A;font-size:12px;font-weight:600;}

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
        .btn-primary{width:100%;padding:13px;background:#C9951A;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;transition:background .15s;margin-bottom:10px;}
        .btn-primary:hover:not(:disabled){background:#B8841A;}
        .btn-primary:disabled{opacity:.6;cursor:not-allowed;}

        .hl-card{background:#fff;border:1.5px solid #C9951A;border-radius:14px;padding:16px;margin-bottom:10px;}
        .hl-card.exp{border-color:#E0DDD8;opacity:.7;}
        .hl-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}
        .hl-badge{font-size:10px;font-weight:700;padding:3px 10px;border-radius:10px;}
        .b-active{background:#EDFAF3;color:#0F8050;border:0.5px solid #A8E6C4;}
        .b-exp{background:#F7F4EF;color:#AAA;border:0.5px solid #E0DDD8;}
        .hl-stats{display:flex;gap:20px;}
        .hs-num{font-family:'Bebas Neue',sans-serif;font-size:24px;color:#C9951A;letter-spacing:1px;}
        .hs-lbl{font-size:9px;color:#AAA;}

        .alert-pending{background:#FEF3E2;border:1px solid #F5C77A;border-radius:12px;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#854F0B;line-height:1.6;}
        .empty{text-align:center;padding:48px 20px;color:#AAA;}
        .empty div:first-child{font-size:40px;margin-bottom:12px;}

        .bottom-nav{display:flex;position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid #F0EDE8;z-index:50;padding:8px 0 10px;}
        @media(min-width:768px){.bottom-nav{display:none;}}
        .nav-item{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer;padding:4px 0;position:relative;}
        .nav-ico{font-size:20px;line-height:1;}
        .nav-lbl{font-size:9px;font-weight:500;color:#BBB;}
        .nav-item.on .nav-lbl{color:#C9951A;font-weight:700;}
        .nav-bdg{position:absolute;top:0;right:calc(50% - 18px);background:#E24B4A;color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:8px;}

        .toast{position:fixed;bottom:24px;right:24px;background:#111;color:#fff;padding:12px 20px;border-radius:12px;font-size:13px;font-weight:500;z-index:999;animation:fadein .2s ease;}
        @media(max-width:767px){.toast{bottom:80px;left:50%;right:auto;transform:translateX(-50%);white-space:nowrap;}}
        @keyframes fadein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}

        /* ── ABA PLANO ── */
        .pt-sec-lbl{font-family:'Bebas Neue',sans-serif;font-size:14px;color:#888;letter-spacing:1.5px;display:flex;align-items:center;gap:10px;margin:28px 0 6px;}
        .pt-sec-lbl:first-child{margin-top:0;}
        .pt-sec-lbl::after{content:'';flex:1;height:0.5px;background:#E0DDD8;}
        .pt-sec-sub{font-size:13px;color:#999;margin-bottom:16px;}

        .pt-status{background:linear-gradient(135deg,#1a1a1a,#2e2e2e);border-radius:14px;padding:22px 24px;}
        .pt-status-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;}
        .pt-status-name{font-family:'Bebas Neue',sans-serif;font-size:24px;color:#C9951A;letter-spacing:1px;}
        .pt-status-badge{font-size:11px;font-weight:700;padding:4px 12px;border-radius:10px;background:rgba(15,128,80,.3);color:#5EE8A0;}
        .pt-status-badge.pending{background:rgba(201,149,26,.2);color:#E8B84B;}
        .pt-trial-label{display:flex;justify-content:space-between;font-size:12px;color:#888;margin-bottom:6px;}
        .pt-trial-bar{height:6px;background:#333;border-radius:3px;overflow:hidden;}
        .pt-trial-fill{height:100%;background:#C9951A;border-radius:3px;}

        .pt-plan-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;}
        @media(max-width:500px){.pt-plan-grid{grid-template-columns:1fr;}}
        .pt-plan-opt{background:#fff;border:1.5px solid #E0DDD8;border-radius:14px;padding:22px 16px;text-align:center;position:relative;}
        .pt-plan-opt.popular{border-color:#C9951A;}
        .pt-popular-badge{position:absolute;top:-11px;left:50%;transform:translateX(-50%);background:#C9951A;color:#111;font-size:9px;font-weight:700;padding:3px 12px;border-radius:20px;white-space:nowrap;}
        .pt-plan-period{font-size:13px;font-weight:700;color:#111;margin-bottom:10px;letter-spacing:0.5px;}
        .pt-plan-parcela{font-family:'Bebas Neue',sans-serif;font-size:38px;color:#111;line-height:1;margin-bottom:2px;}
        .pt-plan-parcela-label{font-size:12px;color:#888;margin-bottom:6px;}
        .pt-plan-total{display:inline-block;background:#FEF3E2;color:#854F0B;font-size:12px;font-weight:700;padding:4px 12px;border-radius:6px;margin-top:8px;margin-bottom:8px;}
        /* PLANOS COM HIERARQUIA BRONZE/PRATA/OURO */
        .npg-wrap{margin-bottom:20px;}
        .npg-title{font-family:'Bebas Neue',sans-serif;font-size:28px;color:#111;letter-spacing:2px;text-align:center;margin-bottom:6px;}
        .npg-title span{color:#C9951A;}
        .npg-sub{font-size:13px;color:#666;text-align:center;margin-bottom:24px;}
        /* DESKTOP grid 3 planos */
        .npg-desktop{display:none;}
        @media(min-width:768px){.npg-desktop{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;padding-top:14px;align-items:start;}}
        .npg-plan-wrap{border-radius:20px;position:relative;}
        .npg-plan-wrap.ouro{transform:scale(1.04);box-shadow:0 16px 40px rgba(201,149,26,0.35);}
        .npg-plan-wrap.prata{box-shadow:0 8px 24px rgba(160,160,160,0.25);}
        .npg-plan-wrap.bronze{box-shadow:0 8px 24px rgba(184,115,51,0.2);}
        .npg-card{border-radius:20px 20px 0 0;padding:22px 20px 16px;color:#fff;text-align:center;}
        .npg-card.ouro{background:linear-gradient(135deg,#F5C540 0%,#C9951A 100%);}
        .npg-card.prata{background:linear-gradient(135deg,#C0C0C0 0%,#909090 100%);color:#1a1a1a;}
        .npg-card.bronze{background:linear-gradient(135deg,#B87333 0%,#8B5A2B 100%);}
        .npg-badge-top{position:absolute;top:-13px;left:50%;transform:translateX(-50%);background:#4ADE80;color:#0F5232;font-size:10px;font-weight:800;padding:5px 14px;border-radius:20px;letter-spacing:1px;z-index:3;white-space:nowrap;}
        .npg-name{font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;opacity:0.95;margin-bottom:10px;}
        .npg-price-original{font-size:13px;text-decoration:line-through;font-weight:600;margin-bottom:2px;opacity:0.65;}
        .npg-price{font-family:'Bebas Neue',sans-serif;font-size:48px;line-height:1;margin:0 0 4px;}
        .npg-price small{font-size:20px;}
        .npg-period{font-size:11px;opacity:0.9;margin-bottom:12px;font-weight:600;}
        .npg-economy{display:inline-block;background:#4ADE80;color:#0F5232;padding:6px 10px;border-radius:6px;font-size:10px;font-weight:800;}
        .npg-benefits{background:#1A1A1A;border-radius:0 0 20px 20px;padding:14px 18px 16px;border-top:1px solid rgba(255,255,255,0.08);}
        .npg-benefits-title{font-size:10px;font-weight:700;color:#888;letter-spacing:1px;margin-bottom:8px;text-align:center;}
        .npg-benefit{display:flex;align-items:center;gap:8px;font-size:12px;color:#ccc;padding:3px 0;}
        .npg-benefit .check{color:#4ADE80;font-size:14px;font-weight:700;}
        .npg-pix{display:flex;align-items:center;justify-content:center;gap:8px;margin:12px 0;}
        .npg-pix-text{color:#4ADE80;font-size:11px;font-weight:800;letter-spacing:0.5px;}
        .npg-btn{width:100%;border:none;padding:12px;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;letter-spacing:0.3px;margin-top:4px;font-family:'Inter',sans-serif;}
        .npg-btn.ouro{background:#F5C540;color:#111;}
        .npg-btn.prata{background:#C0C0C0;color:#1a1a1a;}
        .npg-btn.bronze{background:#B87333;color:#fff;}
        /* MOBILE */
        .npg-mobile{display:block;}
        @media(min-width:768px){.npg-mobile{display:none;}}
        .npg-tabs{background:rgba(0,0,0,0.05);border:1px solid rgba(0,0,0,0.1);border-radius:100px;padding:5px;display:flex;gap:3px;margin-bottom:20px;}
        .npg-tab{flex:1;padding:12px 6px;border-radius:100px;text-align:center;font-size:13px;font-weight:700;cursor:pointer;color:#666;transition:all .15s;position:relative;border:none;background:transparent;font-family:'Inter',sans-serif;}
        .npg-tab.on{background:#C9951A;color:#fff;}
        .npg-tab .disc{position:absolute;top:-8px;right:4px;background:#4ADE80;color:#111;font-size:9px;font-weight:800;padding:2px 6px;border-radius:8px;letter-spacing:0.5px;}
        .npg-tab.on .disc{background:#fff;color:#C9951A;}
        .npg-mob-card{background:linear-gradient(135deg,#F5C540 0%,#C9951A 100%);border-radius:20px 20px 0 0;padding:22px 20px 16px;color:#fff;text-align:center;}
        .npg-mob-card.ouro{background:linear-gradient(135deg,#F5C540 0%,#C9951A 100%);color:#fff;}
        .npg-mob-card.prata{background:linear-gradient(135deg,#C0C0C0 0%,#909090 100%);color:#1a1a1a;}
        .npg-mob-card.bronze{background:linear-gradient(135deg,#B87333 0%,#8B5A2B 100%);color:#fff;}
        .npg-tab.on.ouro{background:#C9951A;color:#fff;}
        .npg-tab.on.prata{background:#909090;color:#fff;}
        .npg-tab.on.bronze{background:#B87333;color:#fff;}
        .npg-tab.on.ouro .disc{background:#fff;color:#C9951A;}
        .npg-tab.on.prata .disc{background:#fff;color:#666;}
        .npg-tab.on.bronze .disc{background:#fff;color:#8B5A2B;}
        .npg-mob-badge{position:absolute;top:-13px;left:50%;transform:translateX(-50%);background:#4ADE80;color:#0F5232;font-size:10px;font-weight:800;padding:5px 14px;border-radius:20px;letter-spacing:1px;z-index:3;white-space:nowrap;}
        .subcat-selected-wrap{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;}
        .subcat-tag{display:inline-flex;align-items:center;gap:6px;background:#FEF3E2;color:#854F0B;border:1px solid #F5C77A;padding:6px 4px 6px 12px;border-radius:20px;font-size:13px;font-weight:600;transition:all .15s;}
        .subcat-tag:hover{background:#FCE8C4;border-color:#E5A83A;}
        .subcat-tag button{background:transparent;border:none;color:#B87A00;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:16px;line-height:1;padding:0;margin-left:2px;transition:all .15s;}
        .subcat-tag button:hover{background:#E24B4A;color:#fff;}
        .pt-plan-economy{font-size:11px;color:#0F8050;font-weight:600;margin-top:5px;}
        .pt-btn-assinar{width:100%;padding:11px;margin-top:14px;background:#C9951A;color:#111;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;}
        .pt-btn-assinar.off{background:#F0EDE8;color:#888;}
        .pt-ben-label{font-size:12px;color:#AAA;font-weight:600;margin-bottom:10px;}
        .pt-beneficios{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;}
        @media(max-width:600px){.pt-beneficios{grid-template-columns:repeat(3,1fr);}}
        .pt-ben-card{background:#fff;border:0.5px solid #E0DDD8;border-radius:12px;padding:16px 8px;text-align:center;}
        .pt-ben-ico{font-size:26px;margin-bottom:8px;}
        .pt-ben-title{font-size:11px;font-weight:700;color:#111;margin-bottom:4px;line-height:1.3;}
        .pt-ben-desc{font-size:10px;color:#999;line-height:1.4;}

        .pt-banner-card{background:#fff;border:0.5px solid #E0DDD8;border-radius:14px;overflow:hidden;}
        .banner-hist-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;margin-bottom:16px;}
        .banner-hist-card{background:#fff;border:0.5px solid #EDE8E0;border-radius:12px;padding:16px;}
        .banner-hist-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px;}
        .banner-hist-title{font-size:14px;font-weight:700;color:#111;margin-bottom:3px;}
        .banner-hist-meta{font-size:11px;color:#888;}
        .banner-hist-status{font-size:11px;font-weight:600;padding:4px 10px;border-radius:6px;border:1px solid;white-space:nowrap;}
        .banner-hist-prazo{font-size:11px;font-weight:600;margin-top:6px;}
        .banner-hist-ia{background:#FEF3E2;border:1px solid #F5C77A;border-radius:8px;padding:8px 12px;margin-top:10px;font-size:12px;color:#854F0B;}
        .banner-hist-imgs{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;}
        .banner-hist-imgs img{width:120px;height:36px;object-fit:cover;border-radius:6px;border:1px solid #EDE8E0;cursor:pointer;}
        .pt-banner-visual{background:linear-gradient(160deg,#0f0f0f,#2a1800);padding:32px 28px;display:flex;align-items:center;gap:28px;}
        @media(max-width:500px){.pt-banner-visual{flex-direction:column;}}
        .pt-banner-visual-left{flex:1;}
        .pt-banner-ico{font-size:48px;margin-bottom:12px;}
        .pt-banner-badge{background:#C9951A;color:#111;font-family:'Bebas Neue',sans-serif;font-size:13px;letter-spacing:1px;padding:4px 14px;border-radius:20px;display:inline-block;margin-bottom:12px;}
        .pt-banner-pos-title{font-size:18px;font-weight:700;color:#fff;margin-bottom:6px;}
        .pt-banner-pos-desc{font-size:13px;color:rgba(255,255,255,0.6);line-height:1.6;}
        .pt-banner-visual-right{width:200px;flex-shrink:0;}
        @media(max-width:500px){.pt-banner-visual-right{width:100%;}}
        .pt-bv-site{background:#F0EDE8;border-radius:8px;overflow:hidden;border:1px solid #333;}
        .pt-bv-nav{background:#111;height:16px;display:flex;align-items:center;padding:0 8px;gap:3px;}
        .pt-bv-dot{width:4px;height:4px;border-radius:50%;background:#444;}
        .pt-bv-logo{font-family:'Bebas Neue',sans-serif;font-size:7px;color:#fff;margin-left:4px;letter-spacing:1px;}
        .pt-bv-logo span{color:#C9951A;}
        .pt-bv-banner{background:#C9951A;height:32px;display:flex;align-items:center;justify-content:center;}
        .pt-bv-banner-txt{font-family:'Bebas Neue',sans-serif;font-size:11px;color:#111;letter-spacing:1px;}
        .pt-bv-rest{padding:6px;display:flex;flex-direction:column;gap:3px;}
        .pt-bv-row{height:6px;background:#ddd;border-radius:2px;}
        .pt-banner-info{padding:20px 24px;display:grid;grid-template-columns:repeat(3,1fr);gap:10px;border-top:0.5px solid #eee;}
        @media(max-width:500px){.pt-banner-info{grid-template-columns:1fr;}}
        .pt-b-opt{border:1.5px solid #E0DDD8;border-radius:10px;padding:14px 12px;cursor:pointer;transition:border-color .15s;background:#fff;font-family:'Inter',sans-serif;text-align:center;width:100%;}
        .pt-b-opt:hover{border-color:#C9951A;}
        .pt-b-days{font-size:13px;font-weight:600;color:#333;margin-bottom:6px;}
        .pt-b-price{font-size:18px;font-weight:700;color:#C9951A;}

        .pt-dest-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}
        @media(max-width:600px){.pt-dest-grid{grid-template-columns:1fr;}}
        .pt-dest-card{background:#fff;border:0.5px solid #E0DDD8;border-radius:14px;overflow:hidden;}
        .pt-dest-visual{padding:24px 16px 20px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;border-bottom:0.5px solid #eee;}
        .pt-dest-visual.home{background:linear-gradient(160deg,#1a1a1a,#2e2e2e);}
        .pt-dest-visual.cat{background:linear-gradient(160deg,#0c3260,#185FA5);}
        .pt-dest-visual.sub{background:linear-gradient(160deg,#3b1f00,#7a4500);}
        .pt-dest-ico{font-size:40px;}
        .pt-dest-badge-gold{background:#C9951A;color:#111;font-family:'Bebas Neue',sans-serif;font-size:13px;letter-spacing:1px;padding:4px 14px;border-radius:20px;}
        .pt-dest-position{font-size:13px;color:rgba(255,255,255,0.7);line-height:1.5;}
        .pt-dest-position strong{color:#fff;display:block;font-size:15px;margin-bottom:2px;}
        .pt-rank-row{display:flex;align-items:center;gap:6px;}
        .pt-rank-item{height:32px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;}
        .pt-rank-item.you{background:#C9951A;color:#111;padding:0 12px;font-size:11px;white-space:nowrap;}
        .pt-rank-item.other{background:rgba(255,255,255,0.12);width:32px;}
        .pt-dest-info{padding:16px;}
        .pt-dest-info-title{font-size:15px;font-weight:700;color:#111;margin-bottom:4px;}
        .pt-dest-info-desc{font-size:12px;color:#777;line-height:1.6;margin-bottom:14px;}
        .pt-dest-opts{display:flex;flex-direction:column;gap:7px;}
        .pt-d-opt{display:flex;justify-content:space-between;align-items:center;border:1.5px solid #E0DDD8;border-radius:9px;padding:10px 14px;cursor:pointer;transition:border-color .15s;background:#fff;font-family:'Inter',sans-serif;width:100%;}
        .pt-d-opt.popular{border-color:#C9951A;background:#FEF9F0;}
        .pt-d-opt:hover{border-color:#C9951A;}
        .pt-d-day{font-size:13px;font-weight:500;color:#333;}
        .pt-d-price{font-size:14px;font-weight:700;color:#C9951A;}
        .pt-footer-note{text-align:center;font-size:12px;color:#BBB;margin-top:24px;padding-bottom:8px;}
      `}</style>

      {bannerModal.open && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16,overflowY:'auto'}}>
          <div style={{background:'#fff',borderRadius:20,padding:28,maxWidth:440,width:'100%'}}>

            {bannerModal.step === 'escolha' && (
              <>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:'#111',letterSpacing:1,marginBottom:4}}>BANNER DA HOME</div>
                <div style={{fontSize:13,color:'#888',marginBottom:20}}>{bannerModal.dias} dias · R$ {bannerModal.valor.toFixed(2)}</div>
                <div style={{fontSize:15,fontWeight:600,color:'#111',marginBottom:6}}>Você já tem o banner pronto?</div>
                <div style={{fontSize:13,color:'#888',marginBottom:20}}>Faça o upload ou contrate a criação com inteligência artificial.</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                  <button onClick={()=>setBannerModal(p=>({...p,step:'upload'}))}
                    style={{border:'2px solid #C9951A',borderRadius:12,padding:16,cursor:'pointer',background:'#FEF3E2',textAlign:'left'}}>
                    <div style={{fontSize:22,marginBottom:8}}>📤</div>
                    <div style={{fontSize:13,fontWeight:600,color:'#854F0B',marginBottom:4}}>Tenho meu banner</div>
                    <div style={{fontSize:11,color:'#AAA'}}>Faço upload e pago</div>
                  </button>
                  <button onClick={()=>setBannerModal(p=>({...p,step:'ia'}))}
                    style={{border:'1px solid #E0DDD8',borderRadius:12,padding:16,cursor:'pointer',background:'#fff',textAlign:'left'}}>
                    <div style={{fontSize:22,marginBottom:8}}>✨</div>
                    <div style={{fontSize:13,fontWeight:600,color:'#111',marginBottom:4}}>Criar com IA</div>
                    <div style={{fontSize:11,color:'#AAA'}}>+R$ 40 (desktop+mobile)</div>
                  </button>
                </div>
                <button onClick={()=>setBannerModal(p=>({...p,open:false}))} style={{width:'100%',padding:10,background:'transparent',color:'#AAA',border:'1px solid #ddd',borderRadius:12,fontSize:13,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>Fechar</button>
              </>
            )}

            {bannerModal.step === 'upload' && (
              <>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:'#111',letterSpacing:1,marginBottom:4}}>FAZER UPLOAD DO BANNER</div>
                <div style={{fontSize:13,color:'#888',marginBottom:20}}>{bannerModal.dias} dias · R$ {bannerModal.valor.toFixed(2)}</div>
                <div style={{background:'#FAFAF8',border:'0.5px solid #E0DDD8',borderRadius:10,padding:14,marginBottom:12}}>
                  <div style={{fontSize:12,fontWeight:600,color:'#111',marginBottom:6}}>Desktop <span style={{fontWeight:400,color:'#AAA'}}>· 1200×255px · JPG ou PNG</span></div>
                  <div onClick={()=>bannerDesktopRef.current?.click()} style={{border:'1.5px dashed #C9951A',borderRadius:8,padding:14,textAlign:'center',cursor:'pointer',color:'#AAA',fontSize:12}}>
                    {bannerModal.fileDesktop ? <span style={{color:'#0F8050',fontWeight:600}}>✓ {bannerModal.fileDesktop.name}</span> : '📷 Clique para enviar'}
                  </div>
                  <input ref={bannerDesktopRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>setBannerModal(p=>({...p,fileDesktop:e.target.files?.[0]||null}))}/>
                </div>
                <div style={{background:'#FAFAF8',border:'0.5px solid #E0DDD8',borderRadius:10,padding:14,marginBottom:12}}>
                  <div style={{fontSize:12,fontWeight:600,color:'#111',marginBottom:6}}>Mobile <span style={{fontWeight:400,color:'#AAA'}}>· 750×500px · JPG ou PNG · opcional</span></div>
                  <div onClick={()=>bannerMobileRef.current?.click()} style={{border:'1.5px dashed #E0DDD8',borderRadius:8,padding:14,textAlign:'center',cursor:'pointer',color:'#AAA',fontSize:12}}>
                    {bannerModal.fileMobile ? <span style={{color:'#0F8050',fontWeight:600}}>✓ {bannerModal.fileMobile.name}</span> : '📷 Clique para enviar (opcional)'}
                  </div>
                  <input ref={bannerMobileRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>setBannerModal(p=>({...p,fileMobile:e.target.files?.[0]||null}))}/>
                </div>
                <div style={{fontSize:11,color:'#AAA',marginBottom:14}}>O mobile é opcional — se não enviado, usamos o desktop.</div>
                <button onClick={()=>pagarBanner('upload')} disabled={!bannerModal.fileDesktop}
                  style={{width:'100%',padding:12,background:bannerModal.fileDesktop?'#C9951A':'#E0DDD8',color:bannerModal.fileDesktop?'#fff':'#AAA',border:'none',borderRadius:12,fontSize:13,fontWeight:600,cursor:bannerModal.fileDesktop?'pointer':'not-allowed',fontFamily:'Inter,sans-serif',marginBottom:8}}>
                  Pagar R$ {bannerModal.valor.toFixed(2)} via Pix
                </button>
                <button onClick={()=>setBannerModal(p=>({...p,step:'escolha'}))} style={{width:'100%',padding:10,background:'transparent',color:'#AAA',border:'1px solid #ddd',borderRadius:12,fontSize:13,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>← Voltar</button>
              </>
            )}

            {bannerModal.step === 'ia' && (
              <>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:'#111',letterSpacing:1,marginBottom:4}}>CRIAR BANNER COM IA</div>
                <div style={{fontSize:13,color:'#888',marginBottom:16}}>Desktop (1200×255px) + Mobile (750×500px)</div>
                <div style={{background:'#FEF3E2',border:'1px solid #C9951A',borderRadius:10,padding:12,marginBottom:16,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:13,color:'#854F0B',fontWeight:600}}>Banner da Home ({bannerModal.dias} dias) + Criação IA</span>
                  <span style={{fontSize:16,fontWeight:700,color:'#C9951A'}}>R$ {(bannerModal.valor+40).toFixed(2)}</span>
                </div>
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:12,fontWeight:600,color:'#111',marginBottom:6}}>Descreva seu negócio para a IA</div>
                  <textarea rows={3} value={bannerModal.descricaoIA} onChange={e=>setBannerModal(p=>({...p,descricaoIA:e.target.value}))}
                    placeholder="Ex: Burger artesanal, ingredientes frescos, entrega em Trindade..."
                    style={{width:'100%',padding:'10px 12px',border:'1.5px solid #E0DDD8',borderRadius:10,fontSize:12,fontFamily:'Inter,sans-serif',resize:'none',outline:'none'}}/>
                </div>
                <div style={{fontSize:11,color:'#AAA',marginBottom:14}}>Entregamos os banners em até 24h. Após o pagamento você receberá por email.</div>
                <button onClick={()=>pagarBanner('ia')} disabled={!bannerModal.descricaoIA.trim()}
                  style={{width:'100%',padding:12,background:bannerModal.descricaoIA.trim()?'#C9951A':'#E0DDD8',color:bannerModal.descricaoIA.trim()?'#fff':'#AAA',border:'none',borderRadius:12,fontSize:13,fontWeight:600,cursor:bannerModal.descricaoIA.trim()?'pointer':'not-allowed',fontFamily:'Inter,sans-serif',marginBottom:8}}>
                  Pagar R$ {(bannerModal.valor+40).toFixed(2)} via Pix
                </button>
                <button onClick={()=>setBannerModal(p=>({...p,step:'escolha'}))} style={{width:'100%',padding:10,background:'transparent',color:'#AAA',border:'1px solid #ddd',borderRadius:12,fontSize:13,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>← Voltar</button>
              </>
            )}

            {bannerModal.step === 'confirmado' && (
              <>
                <div style={{fontSize:56,marginBottom:12,textAlign:'center'}}>🎉</div>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,color:'#0F8050',letterSpacing:1,marginBottom:8,textAlign:'center'}}>PAGAMENTO CONFIRMADO!</div>
                <div style={{fontSize:14,color:'#555',marginBottom:20,lineHeight:1.6,textAlign:'center'}}>Recebemos seu pedido de banner.<br/>Nossa equipe entrará em contato em até 24h.</div>
                <button onClick={() => { setBannerModal(p => ({ ...p, open: false })) }}
                  style={{width:'100%',padding:'13px',background:'#C9951A',color:'#fff',border:'none',borderRadius:12,fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                  Fechar
                </button>
              </>
            )}

            {bannerModal.step === 'pix' && (
              <>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:'#111',letterSpacing:1,marginBottom:4}}>PAGUE VIA PIX</div>
                <div style={{background:'#FEF3E2',border:'1.5px solid #C9951A',borderRadius:12,padding:'10px 16px',marginBottom:16,display:'flex',alignItems:'center',gap:10}}>
                  <span style={{fontSize:20}}>✅</span>
                  <div>
                    <div style={{fontSize:10,color:'#854F0B',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.5px'}}>Favorecido</div>
                    <div style={{fontSize:13,color:'#111',fontWeight:600}}>Flávia Andrade Faria Grion</div>
                  </div>
                </div>
                {!bannerModal.qrCode ? (
                  <div style={{padding:'40px 0',color:'#AAA',fontSize:13,textAlign:'center'}}>Gerando QR Code...</div>
                ) : (
                  <>
                    {bannerModal.qrCode && <img src={`data:image/png;base64,${bannerModal.qrCode}`} alt="QR Code" style={{width:200,height:200,margin:'0 auto 12px',display:'block',borderRadius:12,border:'1px solid #eee'}}/>}
                    <button onClick={()=>{navigator.clipboard.writeText(bannerModal.pixCode||'');setBannerModal(p=>({...p,copied:true}));setTimeout(()=>setBannerModal(p=>({...p,copied:false})),3000)}}
                      style={{width:'100%',padding:12,background:bannerModal.copied?'#0F8050':'#111',color:'#fff',border:'none',borderRadius:12,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'Inter,sans-serif',marginBottom:8}}>
                      {bannerModal.copied?'✓ Código copiado!':'📋 Copiar código Pix'}
                    </button>
                    <div style={{background:'#F5F5F5',borderRadius:10,padding:'10px 14px',marginBottom:8,display:'flex',alignItems:'center',gap:8,justifyContent:'center'}}>
                      <div style={{width:8,height:8,borderRadius:'50%',background:'#C9951A'}}/>
                      <div style={{fontSize:12,color:'#666'}}>Aguardando pagamento...</div>
                    </div>
                    <div style={{fontSize:11,color:'#AAA',marginBottom:12}}>Após o pagamento nossa equipe entrará em contato para finalizar seu banner.</div>
                    <button onClick={async () => {
                      const res2 = await fetch('/api/mp/check-payment', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ payment_id: bannerModal.paymentId, company_id: company!.id })
                      })
                      const result = await res2.json()
                      if (result.paid) {
                        setBannerModal(p => ({ ...p, step: 'confirmado' }))
                      } else {
                        showToast('Pagamento ainda não confirmado. Aguarde.')
                      }
                    }} style={{width:'100%',padding:'12px',background:'#0F8050',color:'#fff',border:'none',borderRadius:12,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'Inter,sans-serif',marginBottom:8}}>
                      ✓ Já paguei — verificar agora
                    </button>
                  </>
                )}
                <button onClick={()=>setBannerModal(p=>({...p,open:false}))} style={{width:'100%',padding:10,background:'transparent',color:'#AAA',border:'1px solid #ddd',borderRadius:12,fontSize:13,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>Fechar</button>
              </>
            )}

          </div>
        </div>
      )}

      {hlModal.open && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'#fff',borderRadius:20,padding:28,maxWidth:400,width:'100%',textAlign:'center'}}>
            {hlModal.confirmed ? (
              <>
                <div style={{fontSize:56,marginBottom:12}}>🎉</div>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,color:'#0F8050',letterSpacing:1,marginBottom:8}}>DESTAQUE ATIVADO!</div>
                <div style={{fontSize:14,color:'#555',marginBottom:20,lineHeight:1.6}}>Seu destaque foi ativado com sucesso!</div>
                <button onClick={() => { setHlModal(p => ({ ...p, open: false })); window.location.reload() }}
                  style={{width:'100%',padding:'13px',background:'#C9951A',color:'#fff',border:'none',borderRadius:12,fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                  Ver meus destaques →
                </button>
              </>
            ) : (
              <>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:'#111',letterSpacing:1,marginBottom:4}}>PAGUE VIA PIX</div>
                <div style={{fontSize:13,color:'#888',marginBottom:16}}>Destaque {hlModal.level === 'home' ? 'Home' : hlModal.level === 'category' ? 'Categoria' : 'Subcategoria'} — {hlModal.days} dias — R$ {hlModal.value?.toFixed(2)}</div>
                <div style={{background:'#FEF3E2',border:'1.5px solid #C9951A',borderRadius:12,padding:'10px 16px',marginBottom:16,display:'flex',alignItems:'center',gap:10,textAlign:'left'}}>
                  <span style={{fontSize:20}}>✅</span>
                  <div>
                    <div style={{fontSize:10,color:'#854F0B',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.5px'}}>Favorecido</div>
                    <div style={{fontSize:13,color:'#111',fontWeight:600}}>Flávia Andrade Faria Grion</div>
                  </div>
                </div>
                {hlModal.loading ? (
                  <div style={{padding:'40px 0',color:'#AAA',fontSize:13}}>Gerando QR Code...</div>
                ) : (
                  <>
                    {hlModal.qr_code_image && <img src={`data:image/png;base64,${hlModal.qr_code_image}`} alt="QR Code" style={{width:200,height:200,margin:'0 auto 12px',display:'block',borderRadius:12,border:'1px solid #eee'}} />}
                    <button onClick={copiarPixHL} style={{width:'100%',padding:'12px',background:hlModal.copied?'#0F8050':'#111',color:'#fff',border:'none',borderRadius:12,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'Inter,sans-serif',marginBottom:8}}>
                      {hlModal.copied ? '✓ Copiado!' : '📋 Copiar código Pix'}
                    </button>
                    <div style={{background:'#F5F5F5',borderRadius:10,padding:'10px 14px',marginBottom:8,display:'flex',alignItems:'center',gap:8,justifyContent:'center'}}>
                      <div style={{width:8,height:8,borderRadius:'50%',background:'#C9951A'}}/>
                      <div style={{fontSize:12,color:'#666'}}>Aguardando pagamento...</div>
                    </div>
                    <button onClick={async () => {
                      const { data: hls } = await supabase.from('highlights').select('id').eq('company_id', company!.id).eq('status','active').order('created_at',{ascending:false}).limit(1)
                      if (hls && hls.length > 0) {
                        setHlModal(p => ({ ...p, confirmed: true }))
                      } else {
                        showToast('Pagamento ainda não confirmado. Aguarde.')
                      }
                    }} style={{width:'100%',padding:'12px',background:'#0F8050',color:'#fff',border:'none',borderRadius:12,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'Inter,sans-serif',marginBottom:8}}>
                      ✓ Já paguei — verificar agora
                    </button>
                  </>
                )}
                <button onClick={() => setHlModal(p => ({ ...p, open: false }))} style={{width:'100%',padding:'10px',background:'transparent',color:'#AAA',border:'1px solid #ddd',borderRadius:12,fontSize:13,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>Fechar</button>
              </>
            )}
          </div>
        </div>
      )}

      {pixModal.open && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'#fff',borderRadius:20,padding:28,maxWidth:400,width:'100%',textAlign:'center'}}>

            {pixModal.confirmed ? (
              <>
                <div style={{fontSize:56,marginBottom:12}}>🎉</div>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,color:'#0F8050',letterSpacing:1,marginBottom:8}}>PAGAMENTO CONFIRMADO!</div>
                <div style={{fontSize:14,color:'#555',marginBottom:20,lineHeight:1.6}}>Seu plano foi ativado com sucesso.<br/>Aproveite todas as funcionalidades!</div>
                <button onClick={() => { setPixModal(p => ({ ...p, open: false })); window.location.reload() }}
                  style={{width:'100%',padding:'13px',background:'#C9951A',color:'#fff',border:'none',borderRadius:12,fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                  Acessar meu painel →
                </button>
              </>
            ) : (
              <>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:'#111',letterSpacing:1,marginBottom:4}}>PAGUE VIA PIX</div>
                <div style={{fontSize:13,color:'#888',marginBottom:16}}>{pixModal.planNome || pixModal.plan} — R$ {pixModal.value?.toFixed(2)}</div>

                <div style={{background:'#FEF3E2',border:'1.5px solid #C9951A',borderRadius:12,padding:'10px 16px',marginBottom:16,display:'flex',alignItems:'center',gap:10,textAlign:'left'}}>
                  <span style={{fontSize:20}}>✅</span>
                  <div>
                    <div style={{fontSize:10,color:'#854F0B',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.5px'}}>Favorecido</div>
                    <div style={{fontSize:13,color:'#111',fontWeight:600}}>Flávia Andrade Faria Grion</div>
                  </div>
                </div>

                {pixModal.loading ? (
                  <div style={{padding:'40px 0',color:'#AAA',fontSize:13}}>Gerando QR Code...</div>
                ) : (
                  <>
                    {pixModal.qr_code_image && (
                      <img src={`data:image/png;base64,${pixModal.qr_code_image}`} alt="QR Code Pix" style={{width:200,height:200,margin:'0 auto 12px',display:'block',borderRadius:12,border:'1px solid #eee'}} />
                    )}
                    <div style={{fontSize:12,color:'#888',marginBottom:8}}>Ou copie o código Pix:</div>
                    <button onClick={copiarPix} style={{width:'100%',padding:'12px',background: pixModal.copied ? '#0F8050' : '#111',color:'#fff',border:'none',borderRadius:12,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'Inter,sans-serif',marginBottom:12,transition:'background .2s'}}>
                      {pixModal.copied ? '✓ Código copiado!' : '📋 Copiar código Pix'}
                    </button>
                    <div style={{background:'#F5F5F5',borderRadius:10,padding:'10px 14px',marginBottom:12,display:'flex',alignItems:'center',gap:8,justifyContent:'center'}}>
                      <div style={{width:8,height:8,borderRadius:'50%',background:'#C9951A'}}/>
                      <div style={{fontSize:12,color:'#666'}}>Aguardando pagamento...</div>
                    </div>
                    <div style={{fontSize:11,color:'#AAA',marginBottom:16}}>O plano será ativado automaticamente após o pagamento</div>
                  </>
                )}
                <button onClick={verificarPagamento} style={{width:'100%',padding:'12px',background:'#0F8050',color:'#fff',border:'none',borderRadius:12,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'Inter,sans-serif',marginBottom:8}}>✓ Já paguei — verificar agora</button>
                <button onClick={() => setPixModal(p => ({ ...p, open: false }))} style={{width:'100%',padding:'10px',background:'transparent',color:'#AAA',border:'1px solid #ddd',borderRadius:12,fontSize:13,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>Fechar</button>
              </>
            )}
          </div>
        </div>
      )}
      {toast && <div className="toast">✓ {toast}</div>}

      <div className="painel-layout">

        {/* SIDEBAR — fixa na esquerda */}
        <aside className="sidebar">
          <div className="sb-logo">
            <div className="sb-logo-txt">TRINDADE <span>ONLINE</span></div>
            <div className="sb-empresa">{company.name}</div>
            <span className={`sb-status ${company.status==='active'?'active':'pending'}`}>
              {company.status==='active'?'● Ativa':'⏳ Pendente'}
            </span>
          </div>
          {companies.length >= 1 && (
            <div style={{padding:'8px 12px',borderBottom:'1px solid #222'}}>
              <div style={{fontSize:10,color:'#555',fontWeight:700,letterSpacing:1,marginBottom:6}}>EMPRESAS</div>
              {companies.map(c => (
                <div key={c.id} onClick={() => { setCompany(c); setTab('painel') }}
                  style={{padding:'7px 10px',borderRadius:8,cursor:'pointer',marginBottom:3,fontSize:12,fontWeight:600,
                    background: company?.id === c.id ? 'rgba(201,149,26,.15)' : 'transparent',
                    color: company?.id === c.id ? '#C9951A' : '#888',
                    border: company?.id === c.id ? '1px solid rgba(201,149,26,.3)' : '1px solid transparent'
                  }}>
                  {c.name}
                </div>
              ))}
              <a href="/empresa/cadastrar" style={{display:'block',padding:'7px 10px',fontSize:11,color:'#555',textDecoration:'none',marginTop:4}}>+ Nova empresa</a>
            </div>
          )}
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
            <div className="sb-actions">
              <a href="/" className="sb-btn sb-btn-gold">🌐 Ver site</a>
              <a href="/sair" className="sb-btn sb-btn-gray">🚪 Sair</a>
            </div>
          </div>
        </aside>

        {/* MAIN — área direita */}
        <main className="painel-main">
          <div className="mobile-hdr-new">
            <div className="mhdr-logo">TRINDADE <span>ONLINE</span></div>
            <div className="mhdr-empresa">{company.name}</div>
          </div>
          <div className="mobile-actions">
            <a href="/" className="m-action-btn m-action-gold">🌐 Ver site</a>
            {companies.length > 1 && (
              <select value={company?.id} onChange={e => setCompany(companies.find(c => c.id === e.target.value) || null)} className="m-action-select">
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <a href="/sair" className="m-action-btn m-action-gray">🚪 Sair</a>
          </div>

          <div className="topbar">
            <div className="topbar-title">{tabTitle[tab]}</div>
            <div className="topbar-right">{new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})}</div>
          </div>

          {/* ── CONTEÚDO DAS ABAS ── */}

          {/* DASHBOARD */}
          {tab === 'painel' && (
            <div className="content">
              {company.status === 'pending' && (
                <div className="alert-pending">⏳ Sua empresa está aguardando aprovação da nossa equipe. Você receberá uma notificação em até 24h.</div>
              )}
              <div className="stat-grid">
                <div className="stat-card"><div className="stat-num" style={{color:'#185FA5'}}>{company.views_count||0}</div><div className="stat-lbl">Visualizações</div></div>
                <div className="stat-card"><div className="stat-num" style={{color:'#25D366'}}>{company.whatsapp_clicks||0}</div><div className="stat-lbl">Cliques WhatsApp</div></div>
                <div className="stat-card"><div className="stat-num" style={{color:'#C9951A'}}>{company.link_clicks||0}</div><div className="stat-lbl">Cliques no link</div></div>
                <div className="stat-card"><div className="stat-num" style={{color:'#C9951A'}}>{company.avg_rating>0?`${company.avg_rating}★`:'—'}</div><div className="stat-lbl">Nota média</div><div className="stat-sub">{company.total_reviews} avaliações</div></div>
              </div>
              <div className="section-label">AÇÕES RÁPIDAS</div>
              <div className="actions-row">
                <button className="action-btn" style={{background:'#C9951A',color:'#fff'}} onClick={()=>setTab('perfil')}>✏️ Editar perfil</button>
                <button className="action-btn" style={{background:'#185FA5',color:'#fff'}} onClick={()=>setTab('plano')}>⭐ Criar destaque</button>
                {pendingReplies > 0 && <button className="action-btn" style={{background:'#FEF3E2',color:'#854F0B',border:'1px solid #F5C77A'}} onClick={()=>setTab('avaliacoes')}>💬 {pendingReplies} sem resposta</button>}
              </div>
              {interesses.length > 0 && (
                <div className="sec-card">
                  <div className="sec-hdr">
                    <span className="sec-title">🔔 INTERESSES RECEBIDOS <span style={{background:'#C9951A',color:'#fff',fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:10,marginLeft:6}}>{interesses.length}</span></span>
                  </div>
                  <div className="sec-body">
                    {(company.plan !== 'paid' && (!company.trial_ends_at || new Date(company.trial_ends_at) < new Date())) && (
                      <div style={{background:'#FEF3E2',border:'1px solid #F5C77A',borderRadius:10,padding:'14px 16px',marginBottom:14,display:'flex',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:10}}>
                        <div style={{fontSize:13,color:'#854F0B',fontWeight:600,flex:1,minWidth:180}}>
                          {interesses.length === 1 ? '1 cliente tentou' : `${interesses.length} clientes tentaram`} entrar em contato. Ative um plano para liberar!
                        </div>
                        <button onClick={()=>setTab('plano')} style={{background:'#C9951A',color:'#fff',border:'none',padding:'8px 16px',borderRadius:8,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>Ativar plano →</button>
                      </div>
                    )}
                    <div style={{display:'flex',flexDirection:'column',gap:8}}>
                      {interesses.slice(0,10).map(i => (
                        <div key={i.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',background:'#FAFAF8',borderRadius:8,border:'1px solid #EDE8E0'}}>
                          <div style={{width:32,height:32,borderRadius:16,background:'#C9951A',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,flexShrink:0}}>🔔</div>
                          <div style={{flex:1,fontSize:13,color:'#333',fontWeight:500}}>Cliente demonstrou interesse</div>
                          <div style={{fontSize:11,color:'#888'}}>{fmtDate(i.created_at)}</div>
                        </div>
                      ))}
                    </div>
                    {interesses.length > 10 && (
                      <div style={{fontSize:12,color:'#888',textAlign:'center',marginTop:10}}>e mais {interesses.length - 10} interesses anteriores</div>
                    )}
                  </div>
                </div>
              )}
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
            </div>
          )}

          {/* DESTAQUES */}
          {tab === 'destaques' && (
            <div className="content">
              {activeHighlights.length > 0 && (
                <>
                  <div className="section-label">DESTAQUES ATIVOS</div>
                  {activeHighlights.map(h => (
                    <div key={h.id} className="hl-card">
                      <div className="hl-top">
                        <span style={{fontSize:13,fontWeight:600,color:'#333'}}>{h.level==='home'?'Destaque Home':h.level==='category'?'Destaque Categoria':'Destaque Subcategoria'} · {h.duration_days} dias</span>
                        <span className="hl-badge b-active">● Ativo</span>
                      </div>
                      <div style={{fontSize:12,color:'#AAA',marginBottom:12}}>Vence em {fmtDate(h.expires_at)} · {daysLeft(h.expires_at)} dias restantes · R$ {h.price_paid.toFixed(2)}</div>
                      <div className="hl-stats">
                        <div><div className="hs-num">{h.clicks_count}</div><div className="hs-lbl">Cliques</div></div>
                        <div><div className="hs-num">{h.impressions_count}</div><div className="hs-lbl">Impressões</div></div>
                        <div><div className="hs-num">{h.impressions_count>0?Math.round((h.clicks_count/h.impressions_count)*100):0}%</div><div className="hs-lbl">Taxa de clique</div></div>
                      </div>
                    </div>
                  ))}
                </>
              )}
              <div className="section-label">CRIAR NOVO DESTAQUE</div>
              {(() => {
                const hlPlans = availablePlans.filter(p => p.type === 'highlight')
                const groups = [
                  {level:'home',     label:'Destaque Home',         desc:'Aparece na página inicial'},
                  {level:'category', label:'Destaque Categoria',    desc:'Topo da sua categoria'},
                  {level:'subcat',   label:'Destaque Subcategoria', desc:'Topo da subcategoria'},
                ]
                return (
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
                    {groups.map(g => {
                      const gPlans = hlPlans.filter(p => p.name.toLowerCase().includes(g.level === 'home' ? 'home' : g.level === 'category' ? 'categoria' : 'subcat'))
                      const disabled = !featureFlags['destaques'] || gPlans.length === 0
                      return (
                        <div key={g.level} style={{background:disabled?'#F5F5F5':'#FAFAF8',border:'0.5px solid #E0DDD8',borderRadius:14,padding:16,opacity:disabled?0.6:1}}>
                          <div style={{fontWeight:600,fontSize:14,marginBottom:3,color:disabled?'#AAA':'#111'}}>{g.label}</div>
                          <div style={{fontSize:12,color:'#AAA',marginBottom:12}}>{disabled && gPlans.length === 0 ? 'Em breve' : g.desc}</div>
                          {gPlans.map((plan: any) => (
                            <button key={plan.id} onClick={()=>!disabled && assinarDestaque(g.level, plan.days, Number(plan.value), plan.name)}
                              disabled={disabled}
                              style={{width:'100%',padding:'9px',marginBottom:7,borderRadius:9,border:'1px solid #E0DDD8',background:'#fff',fontSize:12,cursor:disabled?'not-allowed':'pointer',fontFamily:'Inter,sans-serif',display:'flex',justifyContent:'space-between',alignItems:'center',opacity:disabled?0.5:1}}>
                              <span style={{fontWeight:500}}>{plan.days} dias</span>
                              <span style={{color:'#C9951A',fontWeight:600}}>R$ {Number(plan.value).toFixed(2)}</span>
                            </button>
                          ))}
                          {gPlans.length === 0 && <div style={{fontSize:11,color:'#CCC',textAlign:'center',padding:'8px 0'}}>Em breve</div>}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
              <div style={{textAlign:'center',fontSize:11,color:'#AAA',marginTop:8}}>Pagamento via Pix · Ativa na hora</div>
              {highlights.filter(h=>h.status==='expired').length > 0 && (
                <>
                  <div className="section-label">HISTÓRICO</div>
                  {highlights.filter(h=>h.status==='expired').map(h => (
                    <div key={h.id} className="hl-card exp">
                      <div className="hl-top">
                        <span style={{fontSize:13,fontWeight:600,color:'#888'}}>{h.level==='home'?'Home':h.level==='category'?'Categoria':'Subcategoria'} · {h.duration_days}d</span>
                        <span className="hl-badge b-exp">Encerrado</span>
                      </div>
                      <div style={{fontSize:11,color:'#CCC',marginBottom:8}}>{fmtDate(h.starts_at)} – {fmtDate(h.expires_at)}</div>
                      <div className="hl-stats">
                        <div><div className="hs-num" style={{color:'#AAA'}}>{h.clicks_count}</div><div className="hs-lbl">Cliques</div></div>
                        <div><div className="hs-num" style={{color:'#AAA'}}>{h.impressions_count}</div><div className="hs-lbl">Impressões</div></div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* AVALIAÇÕES */}
          {tab === 'avaliacoes' && (
            <div className="content">
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
            </div>
          )}

          {/* PERFIL */}
          {tab === 'perfil' && (
            <div className="content">
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
                        <label>Subcategorias <span style={{fontSize:11,color:'#666',fontWeight:400}}>(selecione até 5)</span></label>
                        <div className="subcat-search-wrap">
                          <input
                            type="text"
                            placeholder="🔍 Buscar ou escolha da lista..."
                            value={subcatSearch}
                            onChange={e => setSubcatSearch(e.target.value)}
                            onFocus={() => setSubcatSearch(subcatSearch || ' ')}
                            onBlur={() => setTimeout(() => setSubcatSearch(''), 200)}
                            style={{width:'100%',padding:'10px 12px',border:'1.5px solid #E0DDD8',borderRadius:11,fontSize:13,fontFamily:"'Inter',sans-serif",outline:'none'}}
                          />
                          {subcatSearch && (
                            <div className="subcat-dropdown">
                              {allSubcats
                                .filter(s => s.category_id === editCategoryId && s.name.toLowerCase().includes(subcatSearch.trim().toLowerCase()))
                                .map(s => {
                                  const selected = editSubcatIds.includes(s.id)
                                  const maxed = editSubcatIds.length >= 5 && !selected
                                  return (
                                    <div key={s.id} className="subcat-option" style={{color: maxed ? '#CCC' : '#333', cursor: maxed ? 'not-allowed' : 'pointer', background: selected ? '#FEF3E2' : undefined}}
                                      onMouseDown={() => { if (!maxed) { setEditSubcatIds(prev => prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id]) } }}>
                                      <span>{s.emoji} {s.name}</span>
                                      {selected ? <span style={{color:'#C9951A',fontWeight:700}}>✓ Selecionado</span> : !maxed ? <span style={{color:'#AAA',fontSize:11}}>+ Adicionar</span> : <span style={{fontSize:11,color:'#CCC'}}>máx. 5</span>}
                                    </div>
                                  )
                              })}
                              {allSubcats.filter(s => s.category_id === editCategoryId && s.name.toLowerCase().includes(subcatSearch.trim().toLowerCase())).length === 0 && (
                                <div style={{padding:'12px 14px',fontSize:13,color:'#AAA'}}>Nenhuma subcategoria encontrada</div>
                              )}
                            </div>
                          )}
                          {editSubcatIds.length > 0 && (
                            <div className="subcat-selected-wrap">
                              {editSubcatIds.map(sid => {
                                const s = allSubcats.find(x => x.id === sid)
                                if (!s) return null
                                return (
                                  <div key={sid} className="subcat-tag">
                                    {s.emoji} {s.name}
                                    <button onClick={() => setEditSubcatIds(prev => prev.filter(x => x !== sid))}>×</button>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                        <div style={{marginTop:8}}>
                          <label style={{fontSize:11,color:'#888',display:'block',marginBottom:6}}>Não encontrou sua subcategoria? Sugira aqui</label>
                          <div style={{display:'flex',gap:8}}>
                            <input type="text" placeholder="Ex: Barbearia infantil" value={painelSubcatSugestao}
                              onChange={e=>setPainelSubcatSugestao(e.target.value)}
                              onKeyDown={e=>{if(e.key==='Enter'&&painelSubcatSugestao.trim()){e.preventDefault();setPainelSubcatSugestoes(s=>[...s,painelSubcatSugestao.trim()]);setPainelSubcatSugestao('')}}}
                              style={{flex:1,padding:'8px 12px',border:'1.5px solid #E0DDD8',borderRadius:8,fontSize:13,fontFamily:'Inter,sans-serif',outline:'none'}}/>
                            <button type="button" onClick={()=>{if(painelSubcatSugestao.trim()){setPainelSubcatSugestoes(s=>[...s,painelSubcatSugestao.trim()]);setPainelSubcatSugestao('')}}}
                              style={{padding:'8px 14px',background:'#F5F2EC',border:'1.5px solid #E0DDD8',borderRadius:8,fontSize:12,cursor:'pointer',fontWeight:600,color:'#555'}}>+ Add</button>
                          </div>
                          {painelSubcatSugestoes.length > 0 && (
                            <div style={{display:'flex',gap:5,flexWrap:'wrap',marginTop:6}}>
                              {painelSubcatSugestoes.map((s,i)=>(
                                <span key={i} style={{background:'#FEF3E2',border:'1px solid #F5C77A',borderRadius:20,padding:'3px 10px',fontSize:11,color:'#854F0B',display:'flex',alignItems:'center',gap:4}}>
                                  {s}<button type="button" onClick={()=>setPainelSubcatSugestoes(ss=>ss.filter((_,j)=>j!==i))} style={{background:'none',border:'none',cursor:'pointer',color:'#C9951A',fontSize:13,lineHeight:1,padding:0}}>×</button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="field">
                      <label>WhatsApp</label>
                      <input type="tel" value={editPhone} onChange={e=>setEditPhone(e.target.value)} placeholder="(21) 9 0000-0000"/>
                    </div>
                    <div className="field">
                      <label>CPF / CNPJ <span style={{fontSize:11,color:'#C9951A',fontWeight:400}}>* necessário para pagamento via Pix</span></label>
                      <input type="text" value={editCpfCnpj} onChange={e=>setEditCpfCnpj(e.target.value)} placeholder="000.000.000-00 ou 00.000.000/0001-00"/>
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
                    <div className="field" style={{gridColumn:'1/-1'}}>
                      <label>📸 Fotos da empresa</label>
                      {company?.id && <PhotoManager companyId={company.id} />}
                    </div>
                    <div className="field">
                      <label>Tags <span style={{fontSize:11,color:'#AAA',fontWeight:400}}>Digite e pressione Enter para adicionar</span></label>
                      <div style={{border:'1.5px solid #E0DDD8',borderRadius:11,padding:'8px 10px',background:'#FAFAF8',display:'flex',flexWrap:'wrap',gap:6,alignItems:'center'}}>
                        {editTags.map((tag,i) => (
                          <div key={i} style={{display:'flex',alignItems:'center',gap:4,padding:'3px 10px',background:'#FEF3E2',border:'1px solid #C9951A',borderRadius:20,fontSize:12,color:'#854F0B',fontWeight:600}}>
                            #{tag}
                            <button onClick={() => setEditTags(prev => prev.filter((_,j) => j !== i))} style={{background:'none',border:'none',cursor:'pointer',fontSize:14,color:'#C9951A',padding:0,lineHeight:1}}>×</button>
                          </div>
                        ))}
                        <input
                          type="text"
                          value={tagInput}
                          onChange={e => setTagInput(e.target.value)}
                          onKeyDown={e => {
                            if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
                              e.preventDefault()
                              const tag = tagInput.trim().toLowerCase().replace(/[^a-z0-9àáâãéêíóôõúç ]/g, '')
                              if (tag && !editTags.includes(tag) && true) {
                                setEditTags(prev => [...prev, tag])
                              }
                              setTagInput('')
                            }
                          }}
                          placeholder={editTags.length === 0 ? "ex: pizza, delivery, hambúrguer..." : ""}
                          style={{border:'none',background:'transparent',outline:'none',fontSize:13,fontFamily:"'Inter',sans-serif",minWidth:120,flex:1}}
                        />
                      </div>
                      <div style={{fontSize:11,color:'#AAA',marginTop:4}}>{editTags.length} tags · {company?.plan === 'paid' ? '✓ Aparece nas buscas' : '⚠ Ative o plano pago para aparecer nas buscas'}</div>
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
            </div>
          )}

          {/* BANNERS — gerenciar banners contratados */}
          {tab === 'banners' && (
            <div className="content-plano">
              <div className="plano-inner">
                <div className="pt-sec-lbl">MEUS BANNERS</div>
                <p className="pt-sec-sub">Histórico de banners contratados pela sua empresa</p>
                {bannerRequests.length === 0 ? (
                  <div style={{background:'#fff',border:'0.5px solid #EDE8E0',borderRadius:14,padding:'32px 20px',textAlign:'center',color:'#AAA',fontSize:13,marginBottom:32}}>
                    Você ainda não contratou nenhum banner. Contrate abaixo.
                  </div>
                ) : (
                  <div className="banner-hist-grid">
                    {bannerRequests.map((b:any) => {
                      const now = Date.now()
                      const expires = b.expires_at ? new Date(b.expires_at).getTime() : null
                      const daysLeft = expires ? Math.ceil((expires - now) / 86400000) : null
                      const statusColor = b.status === 'delivered' ? '#0F8050' : b.status === 'in_progress' ? '#C9951A' : '#888'
                      const statusLabel = b.status === 'delivered' ? '✓ Entregue' : b.status === 'in_progress' ? '⏳ Em produção' : '⏳ Pendente'
                      return (
                        <div key={b.id} className="banner-hist-card">
                          <div className="banner-hist-hdr">
                            <div>
                              <div className="banner-hist-title">Banner {b.dias} dias</div>
                              <div className="banner-hist-meta">{b.tipo === 'ia' ? '✨ Criação por IA' : '📤 Upload próprio'} · R$ {Number(b.value).toFixed(2).replace('.',',')}</div>
                            </div>
                            <div className="banner-hist-status" style={{color:statusColor,borderColor:statusColor}}>{statusLabel}</div>
                          </div>
                          {b.expires_at && (
                            <div className="banner-hist-prazo" style={{color: daysLeft! <= 0 ? '#E24B4A' : daysLeft! <= 3 ? '#C9951A' : '#0F8050'}}>
                              {daysLeft! <= 0 ? '🔴 Expirado' : `${daysLeft} dias restantes`} · {new Date(b.starts_at).toLocaleDateString('pt-BR')} → {new Date(b.expires_at).toLocaleDateString('pt-BR')}
                            </div>
                          )}
                          {!b.expires_at && b.status !== 'delivered' && (
                            <div className="banner-hist-prazo" style={{color:'#888'}}>Aguardando ativação após entrega</div>
                          )}
                          {b.descricao_ia && (
                            <div className="banner-hist-ia">
                              <strong>IA:</strong> {b.descricao_ia}
                            </div>
                          )}
                          {(b.file_desktop_url || b.file_mobile_url) && (
                            <div className="banner-hist-imgs">
                              {b.file_desktop_url && <a href={b.file_desktop_url} target="_blank" rel="noopener noreferrer"><img src={b.file_desktop_url} alt="desktop" title="Ver desktop"/></a>}
                              {b.file_mobile_url && <a href={b.file_mobile_url} target="_blank" rel="noopener noreferrer"><img src={b.file_mobile_url} alt="mobile" title="Ver mobile" style={{maxWidth:80}}/></a>}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="pt-sec-lbl" style={{marginTop:32}}>CONTRATAR NOVO BANNER</div>
                <p className="pt-sec-sub">O espaço mais visto do site — sua empresa antes de tudo</p>
                <div className="pt-banner-card">
                  <div className="pt-banner-visual">
                    <div className="pt-banner-visual-left">
                      <div className="pt-banner-ico">📢</div>
                      <div className="pt-banner-badge">★ POSIÇÃO #1 DO SITE</div>
                      <div className="pt-banner-pos-title">Topo da página inicial</div>
                      <div className="pt-banner-pos-desc">Aparece antes de tudo — antes das categorias, antes das empresas, antes de qualquer conteúdo. Todo morador que abre o Trindade Online vê seu anúncio primeiro.</div>
                    </div>
                    <div className="pt-banner-visual-right">
                      <div style={{fontSize:9,color:'rgba(255,255,255,0.4)',marginBottom:6,textAlign:'center'}}>como aparece no site</div>
                      <div className="pt-bv-site">
                        <div className="pt-bv-nav">
                          <div className="pt-bv-dot"/><div className="pt-bv-dot"/><div className="pt-bv-dot"/>
                          <div className="pt-bv-logo">TRINDADE <span>ONLINE</span></div>
                        </div>
                        <div className="pt-bv-banner"><div className="pt-bv-banner-txt">SUA EMPRESA</div></div>
                        <div style={{background:'#fff',margin:'-8px 6px 0',borderRadius:5,padding:4,position:'relative',zIndex:2}}>
                          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:2}}>
                            {[1,2,3,4].map(i=><div key={i} style={{background:'#F0EDE8',borderRadius:2,height:12}}/>)}
                          </div>
                        </div>
                        <div className="pt-bv-rest">
                          <div className="pt-bv-row" style={{width:'60%'}}/>
                          <div className="pt-bv-row"/>
                          <div className="pt-bv-row" style={{width:'80%'}}/>
                          <div className="pt-bv-row" style={{width:'70%'}}/>
                        </div>
                      </div>
                      <div style={{textAlign:'center',marginTop:8}}>
                        <span style={{fontSize:9,color:'#C9951A',fontWeight:700}}>↑ seu banner aqui</span>
                      </div>
                    </div>
                  </div>
                  <div className="pt-banner-info" style={{gridTemplateColumns:`repeat(${Math.min(availablePlans.filter(p=>p.type==='banner').length,3)},1fr)`}}>
                    {availablePlans.filter(p => p.type === 'banner').map((plan: any) => (
                      <button key={plan.id} className="pt-b-opt" onClick={()=>abrirBanner(plan.days, Number(plan.value))}>
                        <div className="pt-b-days">{plan.name}</div>
                        <div className="pt-b-price">R$ {Number(plan.value).toFixed(2)}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* PLANO — conteúdo centralizado com max-width */}
          {tab === 'plano' && (() => { const isPaid = company.plan === 'paid' && !!company.plan_ends_at; const planDaysLeft = isPaid ? daysLeft(company.plan_ends_at!) : 0; const blocked = isPaid && planDaysLeft > 60; return (
            <div className="content-plano">
              <div className="plano-inner">

                {company.status === 'pending' && (
                  <div className="alert-pending">⏳ Sua empresa está aguardando aprovação da nossa equipe. Você receberá uma notificação em até 24h.</div>
                )}

                {/* STATUS */}
                <div className="pt-sec-lbl">STATUS ATUAL</div>
                <div className="pt-status">
                  <div className="pt-status-top">
                    <div className="pt-status-name">{company.plan === 'paid' ? 'PLANO ATIVO' : 'TRIAL GRATUITO'}</div>
                    <div className={`pt-status-badge ${company.status !== 'active' ? 'pending' : ''}`}>
                      {company.status === 'active' ? '● Ativo' : '⏳ Pendente'}
                    </div>
                  </div>
                  {company.plan !== 'paid' && company.trial_ends_at && (
                    <>
                      <div className="pt-trial-label">
                        <span>Trial gratuito</span>
                        <span style={{color:'#C9951A',fontWeight:700}}>{daysLeft(company.trial_ends_at)} dia{daysLeft(company.trial_ends_at)!==1?'s':''} restante{daysLeft(company.trial_ends_at)!==1?'s':''}</span>
                      </div>
                      <div className="pt-trial-bar">
                        <div className="pt-trial-fill" style={{width:`${Math.min(100,Math.max(0,(daysLeft(company.trial_ends_at)/7)*100))}%`}}/>
                      </div>
                    </>
                  )}
                  {company.plan === 'paid' && company.plan_ends_at && (() => {
                    const total = Math.ceil((new Date(company.plan_ends_at).getTime() - new Date(company.plan_ends_at).getTime() + daysLeft(company.plan_ends_at) * 86400000 + 86400000) / 86400000)
                    const remaining = daysLeft(company.plan_ends_at)
                    const pct = Math.min(100, Math.max(0, (remaining / total) * 100))
                    const venceEm = new Date(company.plan_ends_at).toLocaleDateString('pt-BR')
                    return (
                      <>
                        <div className="pt-trial-label">
                          <span style={{color:'#5EE8A0'}}>✓ Plano ativo</span>
                          <span style={{color:'#C9951A',fontWeight:700}}>{remaining} dia{remaining!==1?'s':''} restante{remaining!==1?'s':''}</span>
                        </div>
                        <div className="pt-trial-bar">
                          <div className="pt-trial-fill" style={{width:`${pct}%`, background:'#5EE8A0'}}/>
                        </div>
                        <div style={{fontSize:11,color:'#555',marginTop:6}}>Vence em: {venceEm}</div>
                      </>
                    )
                  })()}
                </div>

                {blocked && (
                  <div style={{textAlign:'center',padding:'40px 20px'}}>
                    <div style={{fontSize:56,marginBottom:14}}>🎉</div>
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:'#111',letterSpacing:2,marginBottom:8}}>
                      PLANO <span style={{color:'#C9951A'}}>ATIVO</span>
                    </div>
                    <div style={{fontSize:14,color:'#666',marginBottom:24}}>Seu plano está ativo e todas as funcionalidades liberadas</div>
                    <div style={{background:'linear-gradient(135deg, #C9951A 0%, #B8841A 100%)',borderRadius:20,padding:'24px 22px',color:'#fff',marginBottom:16,boxShadow:'0 10px 30px rgba(201,149,26,0.2)',maxWidth:380,margin:'0 auto 16px'}}>
                      <div style={{fontSize:12,fontWeight:700,letterSpacing:1,opacity:0.9,marginBottom:6}}>✓ VÁLIDO ATÉ</div>
                      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:30,marginBottom:6}}>
                        {new Date(company.plan_ends_at!).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </div>
                      <div style={{fontSize:13,fontWeight:600,opacity:0.9}}>{planDaysLeft} dias restantes</div>
                    </div>
                    <div style={{background:'#F5F0E8',borderRadius:12,padding:'12px 16px',fontSize:12,color:'#666',lineHeight:1.5,maxWidth:380,margin:'0 auto'}}>
                      💡 A renovação estará disponível quando faltarem <strong style={{color:'#C9951A'}}>60 dias</strong> para o vencimento.
                    </div>
                  </div>
                )}
                {!blocked && isPaid && planDaysLeft <= 60 && (
                  <div style={{background:'#FEF3E2',border:'1.5px solid #F5C77A',borderRadius:12,padding:'14px 18px',marginBottom:20,color:'#854F0B',fontSize:13,fontWeight:600,display:'flex',alignItems:'center',gap:10}}>
                    ⏰ Seu plano vence em {planDaysLeft} dias. Renove agora para não perder o acesso.
                  </div>
                )}
                {!blocked && (<>
                {(() => {
                  const subscriptions = availablePlans.filter((p:any) => p.type === 'subscription')
                  if (subscriptions.length === 0) return null
                  const mensalPlan = subscriptions.find((p:any) => Number(p.days) <= 31)
                  const mensalRef = mensalPlan ? Number(mensalPlan.value) : 0
                  const sorted = [...subscriptions].sort((a:any,b:any) => Number(a.value) - Number(b.value))
                  const tiers = ['bronze','prata','ouro']
                  const currentMobile = mobileTab && sorted.find((p:any) => p.id === mobileTab) ? sorted.find((p:any) => p.id === mobileTab)! : sorted[sorted.length-1]
                  const fmtBRL = (n:number) => n.toFixed(2).replace('.', ',')
                  const calc = (plan:any) => {
                    const months = Math.max(1, Math.round(Number(plan.days)/30))
                    const full = mensalRef * months
                    const val = Number(plan.value)
                    const saved = full - val
                    const percent = full > 0 ? Math.round((saved/full)*100) : 0
                    return { months, full, saved, percent, val }
                  }
                  const period = (months:number) => months === 1 ? 'Cobrado uma vez por mês' : months === 12 ? 'Cobrado uma vez por ano' : `Cobrado a cada ${months} meses`
                  return (
                    <div className="npg-wrap">
                      <div className="npg-title">MEU <span>PLANO</span></div>
                      <div className="npg-sub">Escolha o período e ative todas as funcionalidades</div>
                      {/* DESKTOP */}
                      <div className="npg-desktop">
                        {sorted.map((plan:any, i:number) => {
                          const tier = tiers[i] || 'ouro'
                          const c = calc(plan)
                          const isOuro = tier === 'ouro'
                          return (
                            <div key={plan.id} className={`npg-plan-wrap ${tier}`}>
                              {isOuro && <div className="npg-badge-top">★ MELHOR OFERTA</div>}
                              <div className={`npg-card ${tier}`}>
                                <div className="npg-name">{plan.name}</div>
                                {c.saved > 0 && <div className="npg-price-original">De R$ {fmtBRL(c.full)}</div>}
                                <div className="npg-price">R$ {Math.floor(c.val)}<small>,{c.val.toFixed(2).split('.')[1]}</small></div>
                                <div className="npg-period">{period(c.months)}</div>
                                {c.saved > 0 && <div className="npg-economy">💰 Economia R$ {fmtBRL(c.saved)}</div>}
                              </div>
                              <div className="npg-benefits">
                                <div className="npg-benefits-title">✓ INCLUÍDO</div>
                                <div className="npg-benefit"><span className="check">✓</span> WhatsApp visível</div>
                                <div className="npg-benefit"><span className="check">✓</span> Endereço e mapa</div>
                                <div className="npg-benefit"><span className="check">✓</span> Link externo</div>
                                <div className="npg-pix">
                                  <span style={{fontSize:14}}>💠</span>
                                  <span className="npg-pix-text">PAGAMENTO VIA PIX</span>
                                </div>
                                <button className={`npg-btn ${tier}`} onClick={() => assinar(plan.id, Number(plan.value), Number(plan.days), plan.name)}>
                                  Assinar · R$ {fmtBRL(c.val)}
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      {/* MOBILE */}
                      <div className="npg-mobile">
                        <div className="npg-tabs">
                          {sorted.map((plan:any) => {
                            const c = calc(plan)
                            const active = currentMobile.id === plan.id
                            const d = Number(plan.days)
                            const t = d >= 300 ? 'ouro' : d >= 120 ? 'prata' : 'bronze'
                            return (
                              <button key={plan.id} className={`npg-tab ${active ? 'on' : ''} ${active ? t : ''}`} onClick={() => setMobileTab(plan.id)}>
                                {plan.name}
                                {c.percent > 0 && <span className="disc">-{c.percent}%</span>}
                              </button>
                            )
                          })}
                        </div>
                        {(() => {
                          const c = calc(currentMobile)
                          return (
                            <div>
                              <div style={{position:'relative'}}>
                                {(() => { const d = Number(currentMobile.days); const t = d >= 300 ? 'ouro' : d >= 120 ? 'prata' : 'bronze'; return (
                                <>
                                {t === 'ouro' && <div className="npg-mob-badge">★ MELHOR OFERTA</div>}
                                <div className={`npg-mob-card ${t}`}>
                                  <div className="npg-name">{currentMobile.name}</div>
                                  {c.saved > 0 && <div className="npg-price-original">De R$ {fmtBRL(c.full)}</div>}
                                  <div className="npg-price">R$ {Math.floor(c.val)}<small>,{c.val.toFixed(2).split('.')[1]}</small></div>
                                  <div className="npg-period">{period(c.months)}</div>
                                  {c.saved > 0 && <div className="npg-economy">💰 Economia de R$ {fmtBRL(c.saved)}</div>}
                                </div>
                                </>
                                ) })()}
                              </div>
                              <div className="npg-benefits">
                                <div className="npg-benefits-title">✓ INCLUÍDO</div>
                                <div className="npg-benefit"><span className="check">✓</span> WhatsApp visível</div>
                                <div className="npg-benefit"><span className="check">✓</span> Endereço e mapa</div>
                                <div className="npg-benefit"><span className="check">✓</span> Link externo</div>
                                <div className="npg-pix">
                                  <span style={{fontSize:14}}>💠</span>
                                  <span className="npg-pix-text">PAGAMENTO EXCLUSIVO VIA PIX</span>
                                </div>
                                <button className={`npg-btn ${(() => { const d = Number(currentMobile.days); return d >= 300 ? 'ouro' : d >= 120 ? 'prata' : 'bronze'; })()}`} onClick={() => assinar(currentMobile.id, Number(currentMobile.value), Number(currentMobile.days), currentMobile.name)}>
                                  Assinar · R$ {fmtBRL(c.val)}
                                </button>
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  )
                })()}
                <div className="pt-footer-note">Pagamento via Pix · Ativação imediata após confirmação</div>
                </>)}
              </div>
            </div>
          )})()}

          {tab === 'cupons' && (
            <div style={{padding:'20px',maxWidth:700}}>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:'#111',letterSpacing:1,marginBottom:16}}>CUPONS RELÂMPAGO</div>

              <div style={{background:'#F5F2EC',borderRadius:12,padding:16,marginBottom:20}}>
                <div style={{fontSize:13,fontWeight:600,color:'#111',marginBottom:12}}>➕ Criar novo cupom</div>
                <div style={{display:'flex',flexDirection:'column',gap:10}}>
                  <div>
                    <label style={{fontSize:11,fontWeight:600,color:'#666',display:'block',marginBottom:4}}>DESCRIÇÃO</label>
                    <input value={couponForm.title} onChange={e=>setCouponForm(f=>({...f,title:e.target.value}))} placeholder="Ex: R$ 10 off acima de R$ 40" style={{width:'100%',padding:'9px 12px',border:'1.5px solid #E0DDD8',borderRadius:8,fontSize:13,fontFamily:'Inter,sans-serif',outline:'none'}}/>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                    <div>
                      <label style={{fontSize:11,fontWeight:600,color:'#666',display:'block',marginBottom:4}}>TIPO</label>
                      <select value={couponForm.discount_type} onChange={e=>setCouponForm(f=>({...f,discount_type:e.target.value}))} style={{width:'100%',padding:'9px 12px',border:'1.5px solid #E0DDD8',borderRadius:8,fontSize:13,fontFamily:'Inter,sans-serif',background:'#fff',outline:'none'}}>
                        <option value="fixed">R$ Valor fixo</option>
                        <option value="percent">% Percentual</option>
                      </select>
                    </div>
                    <div>
                      <label style={{fontSize:11,fontWeight:600,color:'#666',display:'block',marginBottom:4}}>VALOR</label>
                      <input type="number" value={couponForm.discount_value} onChange={e=>setCouponForm(f=>({...f,discount_value:e.target.value}))} placeholder="10" style={{width:'100%',padding:'9px 12px',border:'1.5px solid #E0DDD8',borderRadius:8,fontSize:13,fontFamily:'Inter,sans-serif',outline:'none'}}/>
                    </div>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                    <div>
                      <label style={{fontSize:11,fontWeight:600,color:'#666',display:'block',marginBottom:4}}>TOTAL CUPONS</label>
                      <input type="number" value={couponForm.total_qty} onChange={e=>setCouponForm(f=>({...f,total_qty:e.target.value}))} placeholder="10" style={{width:'100%',padding:'9px 12px',border:'1.5px solid #E0DDD8',borderRadius:8,fontSize:13,fontFamily:'Inter,sans-serif',outline:'none'}}/>
                    </div>
                    <div>
                      <label style={{fontSize:11,fontWeight:600,color:'#666',display:'block',marginBottom:4}}>LIMITE/PESSOA</label>
                      <input type="number" value={couponForm.qty_per_person} onChange={e=>setCouponForm(f=>({...f,qty_per_person:e.target.value}))} placeholder="1" style={{width:'100%',padding:'9px 12px',border:'1.5px solid #E0DDD8',borderRadius:8,fontSize:13,fontFamily:'Inter,sans-serif',outline:'none'}}/>
                    </div>
                    <div>
                      <label style={{fontSize:11,fontWeight:600,color:'#666',display:'block',marginBottom:4}}>VALIDADE</label>
                      <input type="datetime-local" value={couponForm.expires_at} onChange={e=>setCouponForm(f=>({...f,expires_at:e.target.value}))} style={{width:'100%',padding:'9px 12px',border:'1.5px solid #E0DDD8',borderRadius:8,fontSize:13,fontFamily:'Inter,sans-serif',outline:'none'}}/>
                    </div>
                  </div>
                  <button disabled={savingCoupon||!couponForm.title||!couponForm.discount_value||!couponForm.total_qty||!couponForm.expires_at}
                    onClick={async()=>{
                      setSavingCoupon(true)
                      await supabase.from('coupons').insert({company_id:company.id,title:couponForm.title,discount_type:couponForm.discount_type,discount_value:Number(couponForm.discount_value),total_qty:Number(couponForm.total_qty),qty_per_person:Number(couponForm.qty_per_person),expires_at:new Date(couponForm.expires_at).toISOString(),active:true})
                      setCouponForm({title:'',discount_type:'fixed',discount_value:'',total_qty:'',qty_per_person:'1',expires_at:''})
                      const {data} = await supabase.from('coupons').select('*').eq('company_id',company.id).order('created_at',{ascending:false})
                      setMyCoupons(data||[])
                      setSavingCoupon(false)
                    }}
                    style={{padding:'11px',background:'#C9951A',color:'#111',border:'none',borderRadius:10,fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                    {savingCoupon?'Publicando...':'Publicar cupom →'}
                  </button>
                </div>
              </div>

              <div style={{background:'#F5F2EC',borderRadius:12,padding:16,marginBottom:20}}>
                <div style={{fontSize:13,fontWeight:600,color:'#111',marginBottom:12}}>🔍 Validar código do cliente</div>
                <div style={{display:'flex',gap:8}}>
                  <input value={validateCode} onChange={e=>setValidateCode(e.target.value.toUpperCase())} placeholder="TRD-XXXX" maxLength={8}
                    style={{flex:1,padding:'10px 12px',border:'2px solid #C9951A',borderRadius:10,fontSize:16,fontWeight:600,letterSpacing:3,fontFamily:'monospace',outline:'none',textAlign:'center'}}/>
                  <button onClick={async()=>{
                    if(!validateCode.trim())return
                    setValidating(true); setValidateResult(null)
                    const {data} = await supabase.from('coupon_redemptions').select('*, user:profiles(name), coupon:coupons(title,discount_type,discount_value)').eq('code',validateCode.trim()).maybeSingle()
                    setValidateResult(data||false); setValidating(false)
                  }} disabled={validating} style={{padding:'10px 16px',background:'#111',color:'#C9951A',border:'none',borderRadius:10,fontSize:13,fontWeight:600,cursor:'pointer'}}>
                    {validating?'...':'Verificar'}
                  </button>
                </div>
                {validateResult && typeof validateResult === 'object' && (
                  <div style={{marginTop:12,background:validateResult.status==='used'?'#FCEBEB':'#EAF3DE',border:`1px solid ${validateResult.status==='used'?'#F7C1C1':'#C0DD97'}`,borderRadius:10,padding:14}}>
                    {validateResult.status==='used' ? (
                      <div style={{color:'#A32D2D',fontWeight:600,fontSize:13}}>❌ Cupom já utilizado</div>
                    ) : (
                      <>
                        <div style={{color:'#3B6D11',fontWeight:600,fontSize:14,marginBottom:4}}>✅ Cupom válido!</div>
                        <div style={{fontSize:13,color:'#555',marginBottom:2}}>Cliente: <strong>{validateResult.user?.name}</strong></div>
                        <div style={{fontSize:13,color:'#555',marginBottom:10}}>Cupom: {validateResult.coupon?.title}</div>
                        <button onClick={async()=>{
                          await supabase.from('coupon_redemptions').update({status:'used',used_at:new Date().toISOString()}).eq('id',validateResult.id)
                          setValidateResult({...validateResult,status:'used'})
                          setValidateCode('')
                        }} style={{padding:'8px 16px',background:'#3B6D11',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',width:'100%'}}>
                          ✓ Confirmar uso e dar baixa
                        </button>
                      </>
                    )}
                  </div>
                )}
                {validateResult === false && (
                  <div style={{marginTop:12,background:'#FCEBEB',border:'1px solid #F7C1C1',borderRadius:10,padding:14,color:'#A32D2D',fontWeight:600,fontSize:13}}>❌ Código não encontrado</div>
                )}
              </div>

              <div style={{fontSize:13,fontWeight:600,color:'#111',marginBottom:10}}>📋 Meus cupons</div>
              {myCoupons.length === 0 ? (
                <div style={{textAlign:'center',padding:20,color:'#AAA',fontSize:13}}>Nenhum cupom criado ainda</div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {myCoupons.map((c:any)=>(
                    <div key={c.id} style={{background:'#fff',border:'0.5px solid #E0DDD8',borderRadius:10,padding:'12px 14px',display:'flex',alignItems:'center',gap:12}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:500,color:'#111',marginBottom:2}}>{c.title}</div>
                        <div style={{fontSize:11,color:'#888'}}>{c.discount_type==='fixed'?`R$ ${c.discount_value} off`:`${c.discount_value}% off`} · Vence: {new Date(c.expires_at).toLocaleDateString('pt-BR')}</div>
                      </div>
                      <div style={{textAlign:'center',minWidth:40}}>
                        <div style={{fontSize:18,fontWeight:600,color:'#C9951A'}}>{c.total_qty}</div>
                        <div style={{fontSize:9,color:'#888'}}>cupons</div>
                      </div>
                      <button onClick={async()=>{await supabase.from('coupons').update({active:false}).eq('id',c.id);setMyCoupons((p:any)=>p.filter((x:any)=>x.id!==c.id))}}
                        style={{padding:'5px 10px',background:'#FCEBEB',color:'#E24B4A',border:'none',borderRadius:7,fontSize:11,cursor:'pointer'}}>Desativar</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* BOTTOM NAV */}
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