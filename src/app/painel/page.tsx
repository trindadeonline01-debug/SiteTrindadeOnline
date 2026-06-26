'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

type Company = {
  id: string; name: string; status: string; plan: string
  address: string; phone: string; description: string
  external_link: string; external_link_label: string
  avg_rating: number; total_reviews: number
  views_count: number; whatsapp_clicks: number; link_clicks: number
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
const fmtDate = (s: string) => new Date(s).toLocaleDateString('pt-BR')
const daysLeft = (s: string) => Math.max(0, Math.ceil((new Date(s).getTime() - Date.now()) / 86400000))

export default function PainelPage() {
  const [tab, setTab]             = useState<'painel'|'destaques'|'avaliacoes'|'perfil'|'plano'>('painel')
  const [company, setCompany]     = useState<Company|null>(null)
  const [reviews, setReviews]     = useState<Review[]>([])
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [toast, setToast]         = useState('')
  const [replyId, setReplyId]     = useState<string|null>(null)
  const [replyText, setReplyText] = useState('')

  // Perfil edit state
  const [editNome, setEditNome]         = useState('')
  const [editPhone, setEditPhone]       = useState('')
  const [editAddress, setEditAddress]   = useState('')
  const [editDesc, setEditDesc]         = useState('')
  const [editLinkUrl, setEditLinkUrl]   = useState('')
  const [editLinkLabel, setEditLinkLabel] = useState('Ver cardápio')
  const [editHours, setEditHours]       = useState<{label:string;hours:string}[]>([])
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
      .select('*, category:categories(name,emoji), photos:company_photos(id,url,order), hours:company_hours(id,label,hours,order)')
      .eq('owner_id', userId)
      .single()

    if (comp) {
      setCompany(comp)
      setEditNome(comp.name || '')
      setEditPhone(comp.phone || '')
      setEditAddress(comp.address || '')
      setEditDesc(comp.description || '')
      setEditLinkUrl(comp.external_link || '')
      setEditLinkLabel(comp.external_link_label || 'Ver cardápio')
      setEditHours(comp.hours?.sort((a:any,b:any) => a.order-b.order) || [
        {label:'Seg–Sex',hours:''},{label:'Sábado',hours:''},{label:'Domingo',hours:''},{label:'Feriados',hours:''}
      ])

      const { data: revs } = await supabase
        .from('reviews')
        .select('*, user:profiles(name), response:review_responses(text)')
        .eq('company_id', comp.id)
        .order('created_at', { ascending: false })
      setReviews(revs || [])

      const { data: highs } = await supabase
        .from('highlights')
        .select('*')
        .eq('company_id', comp.id)
        .order('created_at', { ascending: false })
      setHighlights(highs || [])
    } else {
      window.location.href = '/empresa/cadastrar'
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
      external_link: editLinkUrl || null,
      external_link_label: editLinkUrl ? editLinkLabel : null,
    }).eq('id', company.id)

    // Atualiza horários
    await supabase.from('company_hours').delete().eq('company_id', company.id)
    const validH = editHours.filter(h => h.hours.trim())
    if (validH.length > 0) {
      await supabase.from('company_hours').insert(validH.map((h,i) => ({ company_id: company.id, label: h.label, hours: h.hours, order: i })))
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
    const { data: upload } = await supabase.storage.from('company-photos').upload(path, file, { upsert: true })
    if (upload) {
      const { data: url } = supabase.storage.from('company-photos').getPublicUrl(path)
      await supabase.from('company_photos').insert({ company_id: company.id, url: url.publicUrl, order })
      showToast('Foto adicionada!')
      const { data: { session } } = await supabase.auth.getSession()
      if (session) loadData(session.user.id)
    }
  }

  async function removePhoto(photoId: string) {
    await supabase.from('company_photos').delete().eq('id', photoId)
    showToast('Foto removida.')
    const { data: { session } } = await supabase.auth.getSession()
    if (session) loadData(session.user.id)
  }

  async function sendReply(reviewId: string) {
    if (!replyText.trim() || !company) return
    await supabase.from('review_responses').insert({ review_id: reviewId, company_id: company.id, text: replyText })
    setReplyId(null)
    setReplyText('')
    showToast('Resposta publicada!')
    const { data: { session } } = await supabase.auth.getSession()
    if (session) loadData(session.user.id)
  }

  async function flagReview(reviewId: string) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session || !company) return
    await supabase.from('review_flags').insert({ review_id: reviewId, flagged_by: session.user.id, reason: 'Possível avaliação falsa' })
    showToast('Avaliação sinalizada para análise.')
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  if (loading) return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'Inter,sans-serif',color:'#AAA' }}>Carregando...</div>
  if (!company) return null

  const activeHighlights = highlights.filter(h => h.status === 'active')
  const photos = company.photos?.sort((a,b) => a.order-b.order) || []

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; background: #F0EDE8; }

        .painel-wrap { max-width: 480px; margin: 0 auto; background: #fff; min-height: 100vh; position: relative; box-shadow: 0 0 40px rgba(0,0,0,.08); }

        /* TOP HEADER */
        .top-hdr { padding: 16px 16px 12px; background: #111; display: flex; align-items: center; justify-content: space-between; }
        .top-logo { font-family: 'Bebas Neue', sans-serif; font-size: 18px; color: #fff; letter-spacing: 2px; }
        .top-logo span { color: #C9951A; }
        .top-empresa { font-size: 13px; font-weight: 600; color: #C9951A; letter-spacing: 1px; font-family: 'Bebas Neue', sans-serif; }
        .top-status { font-size: 10px; padding: 2px 8px; border-radius: 8px; font-weight: 600; }
        .status-active  { background: rgba(15,128,80,.2); color: #5EE8A0; }
        .status-pending { background: rgba(201,149,26,.2); color: #E8B84B; }

        /* CONTENT */
        .content { padding: 16px 16px 80px; }

        /* STAT CARDS */
        .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
        .stat-card { background: #FAFAF8; border: 0.5px solid #E0DDD8; border-radius: 13px; padding: 14px; }
        .stat-num  { font-family: 'Bebas Neue', sans-serif; font-size: 30px; letter-spacing: 1px; line-height: 1; margin-bottom: 3px; }
        .stat-lbl  { font-size: 11px; color: #AAA; }
        .stat-sub  { font-size: 10px; color: #AAA; margin-top: 4px; }

        /* SECTION */
        .sec-title { font-family: 'Bebas Neue', sans-serif; font-size: 13px; color: #AAA; letter-spacing: 1.5px; margin-bottom: 12px; margin-top: 20px; }

        /* RATING BAR */
        .rating-summary { display: flex; align-items: center; gap: 16px; background: #FAFAF8; border: 0.5px solid #E0DDD8; border-radius: 13px; padding: 14px; margin-bottom: 14px; }
        .rating-big { font-family: 'Bebas Neue', sans-serif; font-size: 48px; color: #C9951A; letter-spacing: 2px; line-height: 1; }
        .rating-bars { flex: 1; }
        .bar-row { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
        .bar-lbl { font-size: 10px; color: #AAA; width: 8px; }
        .bar-bg  { flex: 1; height: 5px; background: #F0EDE8; border-radius: 3px; overflow: hidden; }
        .bar-fill { height: 100%; background: #C9951A; border-radius: 3px; }
        .bar-cnt { font-size: 10px; color: #CCC; width: 16px; text-align: right; }

        /* REVIEW CARD */
        .review-card { background: #FAFAF8; border: 0.5px solid #E0DDD8; border-radius: 12px; padding: 13px; margin-bottom: 10px; }
        .review-top  { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
        .review-av   { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg,#C9951A,#E8B84B); display: flex; align-items: center; justify-content: center; font-family:'Bebas Neue',sans-serif; font-size: 13px; color: #fff; flex-shrink: 0; }
        .review-name { font-size: 12px; font-weight: 600; color: #333; }
        .review-date { font-size: 10px; color: #CCC; margin-left: auto; }
        .review-stars { font-size: 12px; color: #C9951A; margin-bottom: 5px; }
        .review-text  { font-size: 12px; color: #555; line-height: 1.6; margin-bottom: 8px; }
        .review-actions { display: flex; gap: 7px; }
        .btn-reply { flex: 1; padding: 7px; border: 1px solid #C9951A; border-radius: 9px; font-size: 11px; font-weight: 600; color: #C9951A; cursor: pointer; background: #fff; font-family: 'Inter', sans-serif; }
        .btn-flag  { padding: 7px 12px; border: 1px solid #E0DDD8; border-radius: 9px; font-size: 11px; color: #AAA; cursor: pointer; background: #fff; font-family: 'Inter', sans-serif; }
        .reply-existing { background: #FEF3E2; border: 0.5px solid #F5C77A; border-radius: 9px; padding: 9px 11px; margin-top: 8px; }
        .reply-existing-lbl { font-size: 10px; font-weight: 600; color: #854F0B; margin-bottom: 3px; }
        .reply-existing-txt { font-size: 12px; color: #854F0B; line-height: 1.5; }
        .reply-box { margin-top: 8px; border: 1.5px solid #C9951A; border-radius: 9px; overflow: hidden; }
        .reply-input { width: 100%; border: none; padding: 10px 12px; font-size: 12px; font-family: 'Inter', sans-serif; outline: none; resize: none; color: #333; }
        .reply-send  { width: 100%; padding: 9px; background: #C9951A; color: #fff; border: none; font-size: 12px; font-weight: 600; cursor: pointer; font-family: 'Inter', sans-serif; }

        /* PHOTOS GRID */
        .photos-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin-bottom: 8px; }
        .photo-item { height: 90px; border-radius: 10px; overflow: hidden; position: relative; border: 0.5px solid #E0DDD8; }
        .photo-item img { width: 100%; height: 100%; object-fit: cover; }
        .photo-remove { position: absolute; top: 4px; right: 4px; width: 20px; height: 20px; border-radius: 50%; background: rgba(0,0,0,.6); color: #fff; border: none; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .photo-capa { position: absolute; bottom: 4px; left: 4px; background: #C9951A; color: #fff; font-size: 8px; font-weight: 700; padding: 1px 6px; border-radius: 5px; }
        .photo-add { height: 90px; border: 2px dashed #C9951A; border-radius: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; cursor: pointer; background: #FEF3E2; color: #C9951A; font-size: 11px; font-weight: 600; }

        /* FIELDS */
        .field { margin-bottom: 13px; }
        .field label { display: block; font-size: 12px; font-weight: 600; color: #444; margin-bottom: 6px; }
        .field input, .field textarea, .field select { width: 100%; padding: 11px 13px; border: 1.5px solid #E0DDD8; border-radius: 11px; font-size: 13px; font-family: 'Inter', sans-serif; color: #222; background: #FAFAF8; outline: none; transition: border-color .15s; }
        .field input:focus, .field textarea:focus, .field select:focus { border-color: #C9951A; background: #fff; }
        .field textarea { resize: none; }
        .hours-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .hour-box   { background: #FAFAF8; border: 0.5px solid #E0DDD8; border-radius: 9px; padding: 9px 10px; }
        .hour-day   { font-size: 9px; font-weight: 700; color: #999; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }
        .hour-input { width: 100%; border: none; background: transparent; font-size: 12px; color: #444; font-family: 'Inter', sans-serif; outline: none; }

        /* BUTTONS */
        .btn-primary   { width: 100%; padding: 13px; background: #C9951A; color: #fff; border: none; border-radius: 12px; font-size: 14px; font-weight: 600; font-family: 'Inter', sans-serif; cursor: pointer; transition: background .15s; margin-bottom: 10px; }
        .btn-primary:hover:not(:disabled) { background: #B8841A; }
        .btn-primary:disabled { opacity: .6; cursor: not-allowed; }
        .btn-secondary { width: 100%; padding: 11px; background: #fff; color: #888; border: 1.5px solid #E0DDD8; border-radius: 12px; font-size: 13px; font-family: 'Inter', sans-serif; cursor: pointer; }

        /* HIGHLIGHT CARDS */
        .dest-card  { background: #fff; border: 1.5px solid #C9951A; border-radius: 14px; padding: 14px; margin-bottom: 10px; }
        .dest-card.expired { border-color: #E0DDD8; opacity: .7; }
        .dest-hdr   { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .dest-badge { font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 10px; }
        .badge-active  { background: #EDFAF3; color: #0F8050; border: 0.5px solid #A8E6C4; }
        .badge-expired { background: #F7F4EF; color: #AAA; border: 0.5px solid #E0DDD8; }
        .badge-pending { background: #FEF3E2; color: #854F0B; border: 0.5px solid #F5C77A; }
        .dest-stats { display: flex; gap: 14px; }
        .dest-stat-num { font-family: 'Bebas Neue', sans-serif; font-size: 22px; color: #C9951A; letter-spacing: 1px; }
        .dest-stat-lbl { font-size: 9px; color: #AAA; }

        /* PLANO */
        .plan-card  { background: linear-gradient(135deg,#1A1A1A,#333); border-radius: 16px; padding: 20px; margin-bottom: 16px; color: #fff; }
        .plan-name  { font-family: 'Bebas Neue', sans-serif; font-size: 22px; color: #C9951A; letter-spacing: 1px; margin-bottom: 4px; }
        .plan-price { font-size: 26px; font-weight: 700; margin-bottom: 6px; }
        .plan-price span { font-size: 13px; color: #AAA; font-weight: 400; }
        .plan-badge { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; background: rgba(15,128,80,.3); color: #5EE8A0; padding: 4px 10px; border-radius: 10px; font-weight: 600; }
        .feature-item { display: flex; align-items: center; gap: 10px; padding: 11px 0; border-bottom: 0.5px solid #F5F2EC; font-size: 13px; color: #333; }
        .feature-item:last-child { border-bottom: none; }
        .feat-check { width: 20px; height: 20px; border-radius: 50%; background: #C9951A; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #fff; flex-shrink: 0; }

        /* BOTTOM NAV */
        .bottom-nav { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 480px; background: #fff; border-top: 1px solid #F0EDE8; display: flex; z-index: 50; padding: 8px 0 10px; }
        .nav-item   { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; cursor: pointer; padding: 4px 0; }
        .nav-ico    { font-size: 20px; line-height: 1; }
        .nav-lbl    { font-size: 9px; font-weight: 500; color: #BBB; }
        .nav-item.on .nav-lbl { color: #C9951A; font-weight: 700; }
        .nav-badge  { position: absolute; top: -2px; right: -4px; background: #E24B4A; color: #fff; font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 8px; }

        /* TOAST */
        .toast { position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); background: #111; color: #fff; padding: 10px 20px; border-radius: 12px; font-size: 13px; font-weight: 500; z-index: 999; white-space: nowrap; animation: fadein .2s ease; }
        @keyframes fadein { from { opacity:0; transform: translateX(-50%) translateY(8px); } to { opacity:1; transform: translateX(-50%) translateY(0); } }

        /* EMPTY */
        .empty { text-align: center; padding: 40px 20px; color: #AAA; }
        .empty div:first-child { font-size: 36px; margin-bottom: 10px; }

        /* ALERT */
        .alert-pending { background: #FEF3E2; border: 1px solid #F5C77A; border-radius: 12px; padding: 12px 14px; margin-bottom: 16px; font-size: 13px; color: #854F0B; line-height: 1.6; }
      `}</style>

      {toast && <div className="toast">✓ {toast}</div>}

      <div className="painel-wrap">

        {/* TOP HEADER */}
        <div className="top-hdr">
          <div>
            <div className="top-logo">TRINDADE <span>ONLINE</span></div>
            <div className="top-empresa">{company.name}</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <span className={`top-status ${company.status==='active'?'status-active':'status-pending'}`}>
              {company.status==='active'?'● Ativa':'⏳ Pendente'}
            </span>
            <div style={{ marginTop:6 }}>
              <a href="/sair" style={{ fontSize:11, color:'#555', textDecoration:'none' }}>Sair →</a>
            </div>
          </div>
        </div>

        {/* CONTEÚDO */}
        <div className="content">

          {company.status === 'pending' && (
            <div className="alert-pending">
              ⏳ Sua empresa está aguardando aprovação da nossa equipe. Você receberá uma notificação em até 24h.
            </div>
          )}

          {/* ── PAINEL ── */}
          {tab === 'painel' && (
            <>
              <div className="stat-grid">
                <div className="stat-card">
                  <div className="stat-num" style={{color:'#185FA5'}}>{company.views_count || 0}</div>
                  <div className="stat-lbl">Visualizações</div>
                </div>
                <div className="stat-card">
                  <div className="stat-num" style={{color:'#25D366'}}>{company.whatsapp_clicks || 0}</div>
                  <div className="stat-lbl">Cliques WhatsApp</div>
                </div>
                <div className="stat-card">
                  <div className="stat-num" style={{color:'#C9951A'}}>{company.link_clicks || 0}</div>
                  <div className="stat-lbl">Cliques no link</div>
                </div>
                <div className="stat-card">
                  <div className="stat-num" style={{color:'#C9951A'}}>{company.avg_rating > 0 ? `${company.avg_rating}★` : '—'}</div>
                  <div className="stat-lbl">Nota média</div>
                  <div className="stat-sub">{company.total_reviews} avaliações</div>
                </div>
              </div>

              <div className="sec-title">AÇÕES RÁPIDAS</div>
              <button className="btn-primary" onClick={() => setTab('perfil')}>✏️ Editar perfil da empresa</button>
              <button className="btn-primary" style={{background:'#185FA5'}} onClick={() => setTab('destaques')}>⭐ Criar destaque</button>
              {reviews.length > 0 && (
                <button className="btn-secondary" onClick={() => setTab('avaliacoes')}>
                  💬 {reviews.filter(r => !r.response).length > 0 ? `${reviews.filter(r=>!r.response).length} avaliações sem resposta` : 'Ver avaliações'}
                </button>
              )}
            </>
          )}

          {/* ── DESTAQUES ── */}
          {tab === 'destaques' && (
            <>
              {activeHighlights.length > 0 && (
                <>
                  <div className="sec-title">DESTAQUES ATIVOS</div>
                  {activeHighlights.map(h => (
                    <div key={h.id} className="dest-card">
                      <div className="dest-hdr">
                        <span style={{fontSize:12,fontWeight:600,color:'#333'}}>
                          {h.level==='home'?'Destaque Home':h.level==='category'?'Destaque Categoria':'Destaque Subcategoria'}
                          {' · '}{h.duration_days} dias
                        </span>
                        <span className="dest-badge badge-active">● Ativo</span>
                      </div>
                      <div style={{fontSize:11,color:'#AAA',marginBottom:10}}>
                        Vence em {fmtDate(h.expires_at)} · {daysLeft(h.expires_at)} dias restantes · R$ {h.price_paid.toFixed(2)}
                      </div>
                      <div className="dest-stats">
                        <div><div className="dest-stat-num">{h.clicks_count}</div><div className="dest-stat-lbl">Cliques</div></div>
                        <div><div className="dest-stat-num">{h.impressions_count}</div><div className="dest-stat-lbl">Impressões</div></div>
                        <div><div className="dest-stat-num">{h.impressions_count > 0 ? Math.round((h.clicks_count/h.impressions_count)*100) : 0}%</div><div className="dest-stat-lbl">Taxa clique</div></div>
                      </div>
                    </div>
                  ))}
                </>
              )}

              <div className="sec-title">CRIAR NOVO DESTAQUE</div>
              <div style={{background:'#FAFAF8',border:'0.5px solid #E0DDD8',borderRadius:14,padding:16,marginBottom:14}}>
                <div style={{fontSize:13,color:'#555',marginBottom:12,lineHeight:1.6}}>
                  Destaque sua empresa e apareça no topo para mais clientes encontrarem você.
                </div>
                {[
                  { level:'home',     label:'Destaque Home',         desc:'Aparece na página inicial para todos', prices:['R$ 49,90','R$ 89,90','R$ 159,90'] },
                  { level:'category', label:'Destaque Categoria',    desc:'Topo da sua categoria', prices:['R$ 29,90','R$ 54,90','R$ 99,90'] },
                  { level:'subcat',   label:'Destaque Subcategoria', desc:'Topo da sua subcategoria', prices:['R$ 14,90','R$ 27,90','R$ 49,90'] },
                ].map(d => (
                  <div key={d.level} style={{borderBottom:'0.5px solid #F0EDE8',paddingBottom:12,marginBottom:12}}>
                    <div style={{fontWeight:600,fontSize:13,marginBottom:3}}>{d.label}</div>
                    <div style={{fontSize:11,color:'#AAA',marginBottom:6}}>{d.desc}</div>
                    <div style={{display:'flex',gap:7}}>
                      {['7 dias','15 dias','30 dias'].map((dur,i) => (
                        <button key={i} onClick={() => showToast('Em breve: pagamento via Pix')} style={{flex:1,padding:'7px 4px',borderRadius:9,border:'1px solid #E0DDD8',background:'#fff',fontSize:11,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                          <div style={{fontWeight:600,color:'#333'}}>{dur}</div>
                          <div style={{color:'#C9951A',fontWeight:600}}>{d.prices[i]}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <div style={{fontSize:11,color:'#AAA',textAlign:'center'}}>Pagamento via Pix · Ativa na hora</div>
              </div>

              {highlights.filter(h=>h.status==='expired').length > 0 && (
                <>
                  <div className="sec-title">HISTÓRICO</div>
                  {highlights.filter(h=>h.status==='expired').map(h => (
                    <div key={h.id} className="dest-card expired">
                      <div className="dest-hdr">
                        <span style={{fontSize:12,fontWeight:600,color:'#888'}}>
                          {h.level==='home'?'Home':h.level==='category'?'Categoria':'Subcategoria'} · {h.duration_days}d
                        </span>
                        <span className="dest-badge badge-expired">Encerrado</span>
                      </div>
                      <div style={{fontSize:11,color:'#CCC',marginBottom:8}}>{fmtDate(h.starts_at)} – {fmtDate(h.expires_at)}</div>
                      <div className="dest-stats">
                        <div><div className="dest-stat-num" style={{color:'#AAA'}}>{h.clicks_count}</div><div className="dest-stat-lbl">Cliques</div></div>
                        <div><div className="dest-stat-num" style={{color:'#AAA'}}>{h.impressions_count}</div><div className="dest-stat-lbl">Impressões</div></div>
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
                <div className="empty"><div>⭐</div><div>Nenhuma avaliação ainda</div><div style={{fontSize:12,marginTop:8}}>Quando clientes avaliarem sua empresa, aparecem aqui</div></div>
              ) : (
                <>
                  <div className="rating-summary">
                    <div>
                      <div className="rating-big">{company.avg_rating > 0 ? company.avg_rating.toFixed(1) : '—'}</div>
                      <div style={{fontSize:16,color:'#C9951A',margin:'4px 0 2px'}}>{'★'.repeat(Math.round(company.avg_rating))}</div>
                      <div style={{fontSize:11,color:'#AAA'}}>{company.total_reviews} avaliações</div>
                    </div>
                    <div className="rating-bars">
                      {[5,4,3,2,1].map(star => {
                        const cnt = reviews.filter(r=>r.rating===star).length
                        const pct = reviews.length > 0 ? (cnt/reviews.length)*100 : 0
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

                  {reviews.map(r => (
                    <div key={r.id} className="review-card">
                      <div className="review-top">
                        <div className="review-av">{r.user?.name?.[0] || '?'}</div>
                        <div><div className="review-name">{r.user?.name || 'Usuário'}</div></div>
                        <span className="review-date">{fmtDate(r.created_at)}</span>
                      </div>
                      <div className="review-stars">{'★'.repeat(r.rating)}{'☆'.repeat(5-r.rating)}</div>
                      {r.text && <div className="review-text">{r.text}</div>}
                      {r.response ? (
                        <div className="reply-existing">
                          <div className="reply-existing-lbl">Sua resposta:</div>
                          <div className="reply-existing-txt">{r.response.text}</div>
                        </div>
                      ) : (
                        <>
                          {replyId === r.id ? (
                            <div className="reply-box">
                              <textarea className="reply-input" rows={3} placeholder="Escreva sua resposta pública..." value={replyText} onChange={e => setReplyText(e.target.value)} />
                              <button className="reply-send" onClick={() => sendReply(r.id)}>Publicar resposta</button>
                            </div>
                          ) : (
                            <div className="review-actions">
                              <button className="btn-reply" onClick={() => { setReplyId(r.id); setReplyText('') }}>💬 Responder</button>
                              <button className="btn-flag" onClick={() => flagReview(r.id)}>⚑ Sinalizar</button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {/* ── PERFIL ── */}
          {tab === 'perfil' && (
            <>
              <div className="sec-title">FOTOS ({photos.length}/5)</div>
              <div className="photos-grid">
                {photos.map((p,i) => (
                  <div key={p.id} className="photo-item">
                    <img src={p.url} alt={`foto ${i+1}`} />
                    <button className="photo-remove" onClick={() => removePhoto(p.id)}>✕</button>
                    {i===0 && <div className="photo-capa">CAPA</div>}
                  </div>
                ))}
                {photos.length < 5 && (
                  <div className="photo-add" onClick={() => fileRef.current?.click()}>
                    <span style={{fontSize:24}}>📷</span>
                    <span>Adicionar</span>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={addPhoto} />

              <div className="sec-title">DADOS DA EMPRESA</div>
              <div className="field">
                <label>Nome da empresa</label>
                <input type="text" value={editNome} onChange={e => setEditNome(e.target.value.toUpperCase())} style={{textTransform:'uppercase',fontFamily:"'Bebas Neue',sans-serif",letterSpacing:1}} />
              </div>
              <div className="field">
                <label>WhatsApp</label>
                <input type="tel" value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="(21) 9 0000-0000" />
              </div>
              <div className="field">
                <label>Endereço</label>
                <input type="text" value={editAddress} onChange={e => setEditAddress(e.target.value)} placeholder="Rua, número, bairro" />
              </div>
              <div className="field">
                <label>Link externo</label>
                <select value={editLinkLabel} onChange={e => setEditLinkLabel(e.target.value)} style={{marginBottom:8}}>
                  {LINK_LABELS.map(l => <option key={l}>{l}</option>)}
                </select>
                <input type="url" value={editLinkUrl} onChange={e => setEditLinkUrl(e.target.value)} placeholder="https://..." />
              </div>
              <div className="field">
                <label>Descrição</label>
                <textarea rows={4} value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Sobre sua empresa..." />
              </div>
              <div className="field">
                <label>Horários de funcionamento</label>
                <div className="hours-grid">
                  {editHours.map((h,i) => (
                    <div key={i} className="hour-box">
                      <div className="hour-day">{h.label}</div>
                      <input className="hour-input" value={h.hours} placeholder="08:00–18:00" onChange={e => { const n=[...editHours]; n[i]={...n[i],hours:e.target.value}; setEditHours(n) }} />
                    </div>
                  ))}
                </div>
              </div>
              <button className="btn-primary" onClick={saveProfile} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </>
          )}

          {/* ── PLANO ── */}
          {tab === 'plano' && (
            <>
              <div className="plan-card">
                <div className="plan-name">{company.plan==='paid'?'PLANO PAGO':'PLANO GRATUITO'}</div>
                <div className="plan-price">{company.plan==='paid'?<>R$ 29,90 <span>/mês</span></>:<>R$ 0 <span>/ 30 dias grátis</span></>}</div>
                <span className="plan-badge">● {company.status==='active'?'Ativo':'Pendente'}</span>
              </div>

              {company.plan === 'free' && (
                <div style={{background:'#FEF3E2',border:'1px solid #F5C77A',borderRadius:12,padding:14,marginBottom:16}}>
                  <div style={{fontSize:13,fontWeight:600,color:'#854F0B',marginBottom:6}}>Upgrade para o Plano Pago</div>
                  <div style={{fontSize:12,color:'#854F0B',lineHeight:1.6,marginBottom:10}}>
                    WhatsApp clicável · Endereço e mapa · Múltiplas subcategorias · Receber avaliações · Estatísticas completas
                  </div>
                  <button className="btn-primary" onClick={() => showToast('Em breve: pagamento via Pix')}>Assinar por R$ 29,90/mês</button>
                </div>
              )}

              <div className="sec-title">O QUE ESTÁ INCLUÍDO</div>
              {[
                {ok:true,  txt:'Perfil completo com fotos e descrição'},
                {ok:company.plan==='paid', txt:'WhatsApp e link externo clicáveis'},
                {ok:company.plan==='paid', txt:'Endereço e mapa visíveis'},
                {ok:company.plan==='paid', txt:'Múltiplas subcategorias'},
                {ok:company.plan==='paid', txt:'Receber e responder avaliações'},
                {ok:company.plan==='paid', txt:'Estatísticas completas'},
                {ok:true,  txt:'Criar destaques pagos'},
              ].map((f,i) => (
                <div key={i} className="feature-item">
                  <div className="feat-check" style={{background:f.ok?'#C9951A':'#E0DDD8'}}>{f.ok?'✓':'—'}</div>
                  <span style={{color:f.ok?'#333':'#AAA'}}>{f.txt}</span>
                </div>
              ))}
            </>
          )}

        </div>

        {/* BOTTOM NAV */}
        <div className="bottom-nav">
          {[
            { id:'painel',     ico:'📊', lbl:'Painel'     },
            { id:'destaques',  ico:'⭐', lbl:'Destaques'  },
            { id:'avaliacoes', ico:'💬', lbl:'Avaliações' },
            { id:'perfil',     ico:'✏️', lbl:'Perfil'     },
            { id:'plano',      ico:'💳', lbl:'Plano'      },
          ].map(n => (
            <div key={n.id} className={`nav-item ${tab===n.id?'on':''}`} onClick={() => setTab(n.id as any)}>
              <div className="nav-ico">{n.ico}</div>
              <div className="nav-lbl">{n.lbl}</div>
            </div>
          ))}
        </div>

      </div>
    </>
  )
}