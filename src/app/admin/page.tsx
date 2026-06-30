'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

// ── TIPOS ──────────────────────────────────────────────────
type Company = {
  id: string; name: string; status: string; plan: string
  created_at: string; owner_id: string; category_id: string
  address: string; phone: string; description?: string; tags?: string[]; cpf_cnpj?: string; external_link?: string
  category?: { name: string; emoji: string }
  owner?: { name: string }
}
type Profile = {
  id: string; name: string; user_type: string
  neighborhood: string; created_at: string; email?: string
}
type SearchLog  = { query: string; count: number; no_result: number }
type Highlight  = { id: string; company_id: string; scope_type: string; scope_id: string|null; highlight_type: string; active: boolean; expires_at: string|null; display_order: number; company?: any; scope_name?: string }
type CatOpt     = { id: string; name: string; emoji: string; slug: string }
type Report     = { id: string; reason: string; resolved: boolean; created_at: string; listing?: any; reporter?: any }
type SubcatOpt  = { id: string; name: string; emoji: string; slug: string; category_id: string }
type Stats = {
  total_users: number; users_today: number; users_week: number
  total_companies: number; pending: number; active: number
  total_searches: number; searches_today: number
}
type Banner = {
  id: string; title: string; subtitle: string|null; description: string|null
  link_url: string|null; image_url: string|null; image_url_mobile: string|null; active: boolean; display_order: number; created_at: string
}

// ── HELPERS ────────────────────────────────────────────────
const today = () => new Date().toISOString().split('T')[0]
const weekAgo = () => { const d = new Date(); d.setDate(d.getDate()-7); return d.toISOString() }
const fmtDate = (s: string) => new Date(s).toLocaleDateString('pt-BR')
const statusColor = (s: string) => s === 'active' ? '#0F8050' : s === 'pending' ? '#C9951A' : '#E24B4A'
const statusLabel = (s: string) => s === 'active' ? 'Ativa' : s === 'pending' ? 'Pendente' : 'Suspensa'

export default function AdminPage() {
  const [tab, setTab]               = useState<'dashboard'|'empresas'|'destaques'|'denuncias'|'usuarios'|'buscas'|'atividade'|'banners'|'pedidos-banner'|'configuracoes'>('dashboard')
  const [stats, setStats]           = useState<Stats|null>(null)
  const [companies, setCompanies]   = useState<Company[]>([])
  const [users, setUsers]           = useState<Profile[]>([])
  const [searches, setSearches]     = useState<SearchLog[]>([])
  const [filterStatus, setFilter]   = useState('all')
  const [loading, setLoading]       = useState(true)
  const [toast, setToast]           = useState('')
  const [authorized, setAuthorized] = useState<boolean|null>(null)
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [catOpts, setCatOpts]       = useState<CatOpt[]>([])
  const [subcatOpts, setSubcatOpts] = useState<SubcatOpt[]>([])
  const [hlForm, setHlForm]         = useState({ company_id:'', scope_type:'category', scope_id:'', highlight_type:'manual', expires_at:'' })
  const [hlFormOpen, setHlFormOpen] = useState(false)
  const [hlLoading, setHlLoading]   = useState(false)
  const [reports, setReports]       = useState<Report[]>([])
  const [repCount, setRepCount]     = useState(0)
  const [planStats, setPlanStats]   = useState<{paid:number;trial:number;expired:number;expiring:number}>({paid:0,trial:0,expired:0,expiring:0})

  // ── BANNERS ──
  const [banners, setBanners]             = useState<Banner[]>([])
  const [bannerFormOpen, setBannerFormOpen] = useState(false)
  const [editingBannerId, setEditingBannerId] = useState<string|null>(null)
  const [bannerLoading, setBannerLoading] = useState(false)
  const [bannerForm, setBannerForm]       = useState({ title:'', subtitle:'', description:'', link_url:'', display_order:0 })
  const [bannerImageFile, setBannerImageFile]       = useState<File|null>(null)
  const [bannerImagePreview, setBannerImagePreview] = useState<string|null>(null)
  const [bannerCurrentImage, setBannerCurrentImage] = useState<string|null>(null)
  const [bannerImageFileMobile, setBannerImageFileMobile] = useState<File|null>(null)
  const [bannerImagePreviewMobile, setBannerImagePreviewMobile] = useState<string|null>(null)
  const [bannerCurrentImageMobile, setBannerCurrentImageMobile] = useState<string|null>(null)
  const [uploadProgress, setUploadProgress]         = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [bannerRequests, setBannerRequests] = useState<any[]>([])
  const [editCompanyModal, setEditCompanyModal] = useState<{open:boolean; company:any}>({open:false, company:null})
  const [editUserModal, setEditUserModal] = useState<{open:boolean; user:any}>({open:false, user:null})
  const [allCategories, setAllCategories] = useState<CatOpt[]>([])
  const [allSubcats, setAllSubcats] = useState<SubcatOpt[]>([])
  const [companySubcatIds, setCompanySubcatIds] = useState<string[]>([])
  const [savingEdit, setSavingEdit] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [adminSubcatSearch, setAdminSubcatSearch] = useState('')
  const [bannerFilter, setBannerFilter] = useState<'all'|'pending'|'in_progress'|'delivered'>('all')
  const [bannerSort, setBannerSort] = useState<'recent'|'urgent'|'far'>('recent')
  const [mpToken, setMpToken] = useState('')
  const [mpTokenSaving, setMpTokenSaving] = useState(false)
  const [mpTokenLoaded, setMpTokenLoaded] = useState(false)
  const [mpSecret, setMpSecret] = useState('')
  const fileInputRefMobile = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return }
      const { data } = await supabase.from('profiles').select('user_type').eq('id', session.user.id).single()
      if (data?.user_type !== 'admin') { setAuthorized(false); return }
      setAuthorized(true)
      loadAll()
    })
  }, [])

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadStats(), loadCompanies(), loadUsers(), loadSearches(), loadHighlights(), loadReports(), loadBanners(), loadSettings(), loadBannerRequests()])

    // Realtime — atualiza automaticamente
    const channel = supabase
      .channel('admin-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'companies' }, () => {
        loadStats(); loadCompanies()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
        loadStats()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'listing_reports' }, () => {
        loadReports()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'highlights' }, () => {
        loadHighlights()
      })
      .subscribe()

    setLoading(false)
  }

  async function loadStats() {
    const [
      { count: total_users },
      { count: users_today },
      { count: users_week },
      { count: total_companies },
      { count: pending },
      { count: active },
      { count: total_searches },
      { count: searches_today },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', today()),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo()),
      supabase.from('companies').select('*', { count: 'exact', head: true }),
      supabase.from('companies').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('companies').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('search_logs').select('*', { count: 'exact', head: true }),
      supabase.from('search_logs').select('*', { count: 'exact', head: true }).gte('created_at', today()),
    ])
    const now = new Date().toISOString()
    const in3days = new Date(Date.now() + 3*86400000).toISOString()
    const [
      {count: paidCount},
      {count: trialCount},
      {count: expiredCount},
      {count: expiringCount}
    ] = await Promise.all([
      supabase.from('companies').select('*',{count:'exact',head:true}).eq('status','active').eq('plan','paid'),
      supabase.from('companies').select('*',{count:'exact',head:true}).eq('status','active').neq('plan','paid').gt('trial_ends_at',now),
      supabase.from('companies').select('*',{count:'exact',head:true}).eq('status','active').neq('plan','paid').lt('trial_ends_at',now),
      supabase.from('companies').select('*',{count:'exact',head:true}).eq('status','active').neq('plan','paid').gt('trial_ends_at',now).lt('trial_ends_at',in3days),
    ])
    setPlanStats({paid:paidCount||0,trial:trialCount||0,expired:expiredCount||0,expiring:expiringCount||0})
    setStats({
      total_users: total_users||0, users_today: users_today||0, users_week: users_week||0,
      total_companies: total_companies||0, pending: pending||0, active: active||0,
      total_searches: total_searches||0, searches_today: searches_today||0
    })
  }

  async function loadCompanies() {
    const { data } = await supabase
      .from('companies')
      .select('*, category:categories(name,emoji), owner:profiles(name)')
      .order('created_at', { ascending: false })
      .limit(100)
    setCompanies(data || [])
  }

  async function loadUsers() {
    try {
      const res = await fetch('/api/admin/list-users')
      const data = await res.json()
      setUsers(data.users || [])
    } catch {
      const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(100)
      setUsers(data || [])
    }
  }

  async function loadSearches() {
    const { data } = await supabase
      .from('search_logs')
      .select('query, results_count')
      .order('created_at', { ascending: false })
      .limit(500)
    if (!data) return
    const map: Record<string, { count: number; no_result: number }> = {}
    data.forEach(r => {
      const q = r.query.toLowerCase().trim()
      if (!map[q]) map[q] = { count: 0, no_result: 0 }
      map[q].count++
      if (r.results_count === 0) map[q].no_result++
    })
    const sorted = Object.entries(map)
      .map(([query, v]) => ({ query, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50)
    setSearches(sorted)
  }

  async function loadHighlights() {
    const { data: hl } = await supabase
      .from('highlights')
      .select('*, company:companies(name,category:categories(name,emoji))')
      .eq('active', true)
      .order('display_order')
    const { data: cats } = await supabase.from('categories').select('id,name,emoji,slug').order('name')
    const { data: subs } = await supabase.from('subcategories').select('id,name,emoji,slug,category_id').order('name')
    setHighlights((hl || []) as Highlight[])
    setCatOpts((cats || []) as CatOpt[])
    setSubcatOpts((subs || []) as SubcatOpt[])
  }

  async function loadReports() {
    const { data } = await supabase
      .from('listing_reports')
      .select('id, reason, resolved, created_at, listing:listings(id,title,type,status), reporter:profiles(name)')
      .order('created_at', { ascending: false })
    const r = (data || []) as Report[]
    setReports(r)
    setRepCount(r.filter(x => !x.resolved).length)
  }

  async function loadBannerRequests() {
    const { data } = await supabase
      .from('banner_requests')
      .select('*, company:companies(name)')
      .order('created_at', {ascending: false})
    setBannerRequests((data || []) as any[])
  }

  async function loadSettings() {
    const { data } = await supabase.from('settings').select('key,value')
    if (data) {
      const mp = data.find((s: any) => s.key === 'mp_access_token')
      if (mp) { setMpToken(mp.value || ''); setMpTokenLoaded(true) }
      const sec = data.find((s: any) => s.key === 'mp_webhook_secret')
      if (sec) setMpSecret(sec.value || '')
    }
  }

  async function saveMpToken() {
    setMpTokenSaving(true)
    await Promise.all([
      supabase.from('settings').upsert({ key: 'mp_access_token', value: mpToken, updated_at: new Date().toISOString() }, { onConflict: 'key' }),
      supabase.from('settings').upsert({ key: 'mp_webhook_secret', value: mpSecret, updated_at: new Date().toISOString() }, { onConflict: 'key' }),
    ])
    showToast('Configurações salvas!')
    setMpTokenSaving(false)
  }

  async function loadBanners() {
    const { data } = await supabase
      .from('banners')
      .select('*')
      .order('display_order')
    setBanners((data || []) as Banner[])
  }

  function openNewBanner() {
    setEditingBannerId(null)
    setBannerForm({ title:'', subtitle:'', description:'', link_url:'', display_order: banners.length })
    setBannerImageFile(null)
    setBannerImagePreview(null)
    setBannerCurrentImage(null)
    setBannerImageFileMobile(null)
    setBannerImagePreviewMobile(null)
    setBannerCurrentImageMobile(null)
    setBannerFormOpen(true)
  }

  function openEditBanner(b: Banner) {
    setEditingBannerId(b.id)
    setBannerForm({
      title: b.title,
      subtitle: b.subtitle || '',
      description: b.description || '',
      link_url: b.link_url || '',
      display_order: b.display_order,
    })
    setBannerImageFile(null)
    setBannerImagePreview(null)
    setBannerCurrentImage(b.image_url || null)
    setBannerImageFileMobile(null)
    setBannerImagePreviewMobile(null)
    setBannerCurrentImageMobile(b.image_url_mobile || null)
    setBannerFormOpen(true)
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { showToast('Imagem muito grande. Máximo 5MB.'); return }
    setBannerImageFile(file)
    const reader = new FileReader()
    reader.onload = ev => setBannerImagePreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function uploadBannerImage(file: File): Promise<string | null> {
    const ext = file.name.split('.').pop()
    const fileName = `banners/${Date.now()}.${ext}`
    setUploadProgress(30)
    const { error } = await supabase.storage.from('company-photos').upload(fileName, file, { upsert: true })
    if (error) { showToast('Erro no upload: ' + error.message); setUploadProgress(0); return null }
    setUploadProgress(80)
    const { data: { publicUrl } } = supabase.storage.from('company-photos').getPublicUrl(fileName)
    setUploadProgress(100)
    setTimeout(() => setUploadProgress(0), 1000)
    return publicUrl
  }

  async function saveBanner() {
    if (!bannerCurrentImage && !bannerImageFile) { showToast("Adicione uma imagem para o banner."); return }
    setBannerLoading(true)
    let imageUrl = bannerCurrentImage
    if (bannerImageFile) {
      const uploaded = await uploadBannerImage(bannerImageFile)
      if (!uploaded) { setBannerLoading(false); return }
      imageUrl = uploaded
    }
    let imageUrlMobile = bannerCurrentImageMobile
    if (bannerImageFileMobile) {
      const uploadedMobile = await uploadBannerImage(bannerImageFileMobile)
      if (!uploadedMobile) { setBannerLoading(false); return }
      imageUrlMobile = uploadedMobile
    }
    const payload = {
      title: bannerForm.title.trim(),
      subtitle: bannerForm.subtitle.trim() || null,
      description: bannerForm.description.trim() || null,
      link_url: bannerForm.link_url.trim() || null,
      image_url: imageUrl,
      image_url_mobile: imageUrlMobile || null,
      display_order: bannerForm.display_order,
    }
    if (editingBannerId) {
      const { error } = await supabase.from('banners').update(payload).eq('id', editingBannerId)
      if (error) { showToast('Erro ao salvar: ' + error.message); setBannerLoading(false); return }
    } else {
      const { error } = await supabase.from('banners').insert({ ...payload, active: true })
      if (error) { showToast('Erro ao criar: ' + error.message); setBannerLoading(false); return }
    }
    await loadBanners()
    setBannerFormOpen(false)
    setEditingBannerId(null)
    setBannerForm({ title:'', subtitle:'', description:'', link_url:'', display_order:0 })
    setBannerImageFile(null)
    setBannerImagePreview(null)
    setBannerCurrentImage(null)
    setBannerImageFileMobile(null)
    setBannerImagePreviewMobile(null)
    setBannerCurrentImageMobile(null)
    showToast(editingBannerId ? 'Banner atualizado!' : 'Banner criado!')
    setBannerLoading(false)
  }

  async function toggleBanner(id: string, current: boolean) {
    await supabase.from('banners').update({ active: !current }).eq('id', id)
    await loadBanners()
    showToast(current ? 'Banner desativado.' : 'Banner ativado!')
  }

  async function deleteBanner(id: string) {
    if (!confirm('Excluir este banner permanentemente?')) return
    await supabase.from('banners').delete().eq('id', id)
    setBanners(prev => prev.filter(b => b.id !== id))
    showToast('Banner excluído.')
  }

  async function saveHighlight() {
    if (!hlForm.company_id) return
    setHlLoading(true)
    const levelMap: Record<string,string> = { global:'home', category:'category', subcategory:'subcategory' }
    const durationDays = parseInt(hlForm.expires_at) || 0
    const { error: hlErr } = await supabase.from('highlights').insert({
      company_id:    hlForm.company_id,
      level:         levelMap[hlForm.scope_type] || 'home',
      category_id:   hlForm.scope_type === 'category'    ? hlForm.scope_id || null : null,
      subcategory_id:hlForm.scope_type === 'subcategory' ? hlForm.scope_id || null : null,
      scope_type:    hlForm.scope_type,
      scope_id:      hlForm.scope_id || null,
      highlight_type:hlForm.highlight_type,
      duration_days: durationDays,
      price_paid:    0,
      active:        true,
      status:        'active',
      starts_at:     new Date().toISOString(),
      expires_at:    durationDays > 0 ? new Date(Date.now() + durationDays * 86400000).toISOString() : null,
    })
    if (hlErr) { showToast('Erro: ' + hlErr.message); setHlLoading(false); return }
    setHlFormOpen(false)
    setHlForm({ company_id:'', scope_type:'category', scope_id:'', highlight_type:'manual', expires_at:'' })
    await loadHighlights()
    showToast('Destaque salvo!')
    setHlLoading(false)
  }

  async function resolveReport(reportId: string) {
    await supabase.from('listing_reports').update({ resolved: true }).eq('id', reportId)
    await loadReports()
    showToast('Denúncia ignorada.')
  }

  async function deleteListingFromReport(listingId: string, reportId: string) {
    await supabase.from('listings').update({ status: 'deleted' }).eq('id', listingId)
    await supabase.from('listing_reports').update({ resolved: true }).eq('id', reportId)
    await loadReports()
    showToast('Anúncio excluído.')
  }

  async function removeHighlight(id: string) {
    await supabase.from('highlights').update({ active: false }).eq('id', id)
    await loadHighlights()
    showToast('Destaque removido.')
  }

  async function approveCompany(id: string) {
    await supabase.from('companies').update({ status: 'active', approved_at: new Date().toISOString() }).eq('id', id)
    const { data: { session } } = await supabase.auth.getSession()
    if (session) await supabase.from('admin_logs').insert({ admin_id: session.user.id, action: 'approve_company', entity_type: 'company', entity_id: id })
    showToast('Empresa aprovada!')
    loadCompanies(); loadStats()
  }

  async function suspendCompany(id: string) {
    await supabase.from('companies').update({ status: 'suspended' }).eq('id', id)
    showToast('Empresa suspensa.')
    loadCompanies(); loadStats()
  }

  async function openEditCompany(c: any) {
    if (allCategories.length === 0) {
      const { data: cats } = await supabase.from('categories').select('id,name,emoji,slug').order('name')
      setAllCategories((cats || []) as CatOpt[])
    }
    if (allSubcats.length === 0) {
      const { data: subs } = await supabase.from('subcategories').select('id,name,emoji,slug,category_id').order('name')
      setAllSubcats((subs || []) as SubcatOpt[])
    }
    const { data: compSubs } = await supabase.from('company_subcategories').select('subcategory_id').eq('company_id', c.id)
    setCompanySubcatIds((compSubs || []).map((s: any) => s.subcategory_id))
    setEditCompanyModal({ open: true, company: { ...c } })
  }

  async function saveCompanyEdit() {
    const c = editCompanyModal.company
    setSavingEdit(true)
    const res = await fetch('/api/admin/update-company', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: c.id,
        updates: {
          name: c.name, category_id: c.category_id, address: c.address, phone: c.phone,
          description: c.description || null, cpf_cnpj: c.cpf_cnpj || null, external_link: c.external_link || null,
          tags: c.tags || [], status: c.status, plan: c.plan,
        },
        subcategory_ids: companySubcatIds,
      })
    })
    const data = await res.json()
    setSavingEdit(false)
    if (data.error) { showToast('Erro: ' + data.error); return }
    showToast('Empresa atualizada!')
    setEditCompanyModal({ open: false, company: null })
    loadCompanies()
  }

  function openEditUser(u: any) {
    setNewPassword('')
    setEditUserModal({ open: true, user: { ...u } })
  }

  async function saveUserEdit() {
    const u = editUserModal.user
    setSavingEdit(true)
    const res = await fetch('/api/admin/update-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: u.id, updates: { name: u.name, neighborhood: u.neighborhood }, new_email: u.email || null })
    })
    const data = await res.json()
    setSavingEdit(false)
    if (data.error) { showToast('Erro: ' + data.error); return }
    showToast('Usuário atualizado!')
    setEditUserModal({ open: false, user: null })
    loadUsers()
  }

  async function sendResetLink() {
    const u = editUserModal.user
    if (!u.email) { showToast('Usuário sem email cadastrado'); return }
    const res = await fetch('/api/admin/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ send_reset_link: true, email: u.email })
    })
    const data = await res.json()
    if (data.error) { showToast('Erro: ' + data.error); return }
    showToast('Link de redefinição enviado!')
  }

  async function setNewPasswordDirect() {
    if (!newPassword.trim() || newPassword.length < 6) { showToast('Senha deve ter no mínimo 6 caracteres'); return }
    const u = editUserModal.user
    const res = await fetch('/api/admin/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: u.id, new_password: newPassword })
    })
    const data = await res.json()
    if (data.error) { showToast('Erro: ' + data.error); return }
    showToast('Senha atualizada!')
    setNewPassword('')
  }

  async function handleSair() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  if (authorized === null) return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'Inter,sans-serif',color:'#AAA' }}>Verificando acesso...</div>
  if (authorized === false) return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'Inter,sans-serif' }}><div style={{ textAlign:'center' }}><div style={{ fontSize:48,marginBottom:16 }}>🚫</div><div style={{ fontSize:20,fontWeight:700 }}>Acesso negado</div><div style={{ color:'#AAA',marginTop:8 }}>Você não tem permissão para acessar esta página.</div></div></div>

  const filteredCompanies = filterStatus === 'all' ? companies : companies.filter(c => c.status === filterStatus)

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; background: #F0EDE8; }

        .admin-layout { display: flex; min-height: 100vh; }

        .sidebar {
          width: 220px; background: #111; flex-shrink: 0;
          display: flex; flex-direction: column;
          position: sticky; top: 0; height: 100vh;
        }
        .sidebar-logo {
          padding: 24px 20px 20px;
          font-family: 'Bebas Neue', sans-serif;
          font-size: 20px; letter-spacing: 2px; color: #fff;
          border-bottom: 1px solid #222;
        }
        .sidebar-logo span { color: #C9951A; }
        .sidebar-badge {
          font-size: 10px; background: #C9951A; color: #fff;
          padding: 2px 8px; border-radius: 8px;
          font-family: 'Inter', sans-serif; font-weight: 600;
          display: inline-block; margin-top: 4px;
        }
        .nav-item {
          display: flex; align-items: center; gap: 10px;
          padding: 12px 20px; cursor: pointer; transition: all .15s;
          color: #888; font-size: 13px; font-weight: 500;
          border-left: 3px solid transparent;
        }
        .nav-item:hover { background: #1A1A1A; color: #fff; }
        .nav-item.on { background: #1A1A1A; color: #C9951A; border-left-color: #C9951A; }
        .nav-badge {
          margin-left: auto; background: #E24B4A; color: #fff;
          font-size: 10px; font-weight: 700; padding: 1px 7px; border-radius: 10px;
        }
        .sidebar-footer {
          margin-top: auto; padding: 16px 20px;
          border-top: 1px solid #222;
          display: flex; flex-direction: column; gap: 8px;
        }
        .sidebar-footer a {
          font-size: 12px; color: #555; text-decoration: none;
          display: flex; align-items: center; gap: 6px;
        }
        .sidebar-footer a:hover { color: #888; }
        .btn-sair-sidebar {
          font-size: 12px; color: #E24B4A; background: none; border: none;
          cursor: pointer; font-family: 'Inter', sans-serif;
          display: flex; align-items: center; gap: 6px; padding: 0;
        }
        .btn-sair-sidebar:hover { color: #ff6b6b; }

        .admin-main { flex: 1; overflow-x: hidden; }
        .admin-topbar {
          background: #fff; border-bottom: 1px solid #EDE8E0;
          padding: 14px 28px; display: flex; align-items: center;
          justify-content: space-between; position: sticky; top: 0; z-index: 20;
        }
        .topbar-title { font-family: 'Bebas Neue', sans-serif; font-size: 20px; color: #111; letter-spacing: 1px; }
        .topbar-date { font-size: 12px; color: #AAA; }
        .admin-body { padding: 28px; }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 14px; margin-bottom: 28px;
        }
        @media (min-width: 1024px) { .stats-grid { grid-template-columns: repeat(4, 1fr); } }
        .stat-card {
          background: #fff; border-radius: 14px;
          padding: 18px 20px; border: 0.5px solid #EDE8E0;
        }
        .stat-label { font-size: 11px; color: #AAA; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 8px; }
        .stat-num   { font-family: 'Bebas Neue', sans-serif; font-size: 36px; letter-spacing: 1px; line-height: 1; margin-bottom: 4px; }
        .stat-sub   { font-size: 11px; color: #AAA; }
        .stat-up    { color: #0F8050; }
        .stat-warn  { color: #C9951A; }
        .stat-danger{ color: #E24B4A; }

        .section-card { background: #fff; border-radius: 14px; border: 0.5px solid #EDE8E0; margin-bottom: 20px; overflow: hidden; }
        .section-hdr  { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 0.5px solid #F0EDE8; }
        .section-title{ font-family: 'Bebas Neue', sans-serif; font-size: 14px; color: #888; letter-spacing: 1.5px; }

        .filter-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .filter-btn { padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 500; cursor: pointer; border: 1px solid #E0DDD8; background: #FAFAF8; color: #666; transition: all .15s; font-family: 'Inter', sans-serif; }
        .filter-btn.on { border-color: #C9951A; background: #FEF3E2; color: #854F0B; font-weight: 600; }

        .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .data-table th { text-align: left; padding: 10px 16px; font-size: 11px; font-weight: 600; color: #AAA; text-transform: uppercase; letter-spacing: .04em; background: #FAFAF8; border-bottom: 0.5px solid #F0EDE8; }
        .data-table td { padding: 12px 16px; border-bottom: 0.5px solid #F5F2EC; color: #333; vertical-align: middle; }
        .data-table tr:last-child td { border-bottom: none; }
        .data-table tr:hover td { background: #FAFAF8; }
        .status-badge { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 10px; }
        .action-btn { padding: 5px 12px; border-radius: 8px; font-size: 11px; font-weight: 600; cursor: pointer; border: none; font-family: 'Inter', sans-serif; margin-right: 4px; transition: opacity .15s; }
        .action-btn:hover { opacity: .8; }
        .btn-approve  { background: #EDFAF3; color: #0F8050; }
        .btn-suspend  { background: #FEF0F0; color: #E24B4A; }
        .btn-view     { background: #F0F4FF; color: #185FA5; }

        .search-bar-wrap { display: flex; align-items: center; gap: 8px; background: #F5F2EC; border: 1.5px solid #C9951A; border-radius: 10px; padding: 8px 14px; }
        .search-bar-wrap input { flex: 1; border: none; background: transparent; font-size: 13px; font-family: 'Inter', sans-serif; outline: none; }
        .rank-num { font-family: 'Bebas Neue', sans-serif; font-size: 20px; color: #DDD; width: 30px; }
        .rank-1 { color: #C9951A; }
        .rank-2 { color: #888; }
        .rank-3 { color: #B87333; }
        .progress-bar { height: 6px; background: #F0EDE8; border-radius: 3px; overflow: hidden; flex: 1; }
        .progress-fill { height: 100%; background: #C9951A; border-radius: 3px; }
        .no-result-badge { font-size: 10px; background: #FEF0F0; color: #E24B4A; padding: 2px 7px; border-radius: 6px; font-weight: 600; }

        .toast {
          position: fixed; bottom: 24px; right: 24px;
          background: #111; color: #fff; padding: 12px 20px; border-radius: 12px;
          font-size: 13px; font-weight: 500; z-index: 999;
          animation: fadein .2s ease;
        }
        @keyframes fadein { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform: translateY(0); } }

        .empty-state { text-align: center; padding: 48px 20px; color: #AAA; }
        .empty-state div:first-child { font-size: 40px; margin-bottom: 12px; }

        .user-type-badge { font-size: 10px; padding: 2px 8px; border-radius: 8px; font-weight: 600; }
        .type-user    { background: #EBF4FF; color: #185FA5; }
        .type-company { background: #FEF3E2; color: #854F0B; }
        .type-admin   { background: #111; color: #C9951A; }

        .banner-form-input { width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px; font-family: 'Inter', sans-serif; outline: none; }
        .banner-form-input:focus { border-color: #C9951A; }
        .banner-form-label { font-size: 11px; color: #888; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; display: block; margin-bottom: 5px; }
        .upload-area { border: 2px dashed #ddd; border-radius: 10px; padding: 24px; text-align: center; cursor: pointer; transition: all .15s; background: #fafafa; }
        .upload-area:hover { border-color: #C9951A; background: #fffdf5; }
        .upload-area-filled { border: 2px solid #C9951A; border-radius: 10px; overflow: hidden; cursor: pointer; }
      `}</style>

      {editCompanyModal.open && editCompanyModal.company && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16,overflowY:'auto'}}>
          <div style={{background:'#fff',borderRadius:20,padding:28,maxWidth:560,width:'100%',maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:'#111',letterSpacing:1,marginBottom:20}}>EDITAR EMPRESA</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
              <div style={{gridColumn:'1/-1'}}>
                <label style={{fontSize:12,fontWeight:600,color:'#444',marginBottom:6,display:'block'}}>Nome</label>
                <input value={editCompanyModal.company.name||''} onChange={e=>setEditCompanyModal(p=>({...p,company:{...p.company,name:e.target.value}}))}
                  style={{width:'100%',padding:'10px 12px',border:'1.5px solid #E0DDD8',borderRadius:10,fontSize:13,fontFamily:'Inter,sans-serif'}}/>
              </div>
              <div>
                <label style={{fontSize:12,fontWeight:600,color:'#444',marginBottom:6,display:'block'}}>Categoria</label>
                <select value={editCompanyModal.company.category_id||''} onChange={e=>setEditCompanyModal(p=>({...p,company:{...p.company,category_id:e.target.value}}))}
                  style={{width:'100%',padding:'10px 12px',border:'1.5px solid #E0DDD8',borderRadius:10,fontSize:13,fontFamily:'Inter,sans-serif'}}>
                  <option value="">Selecionar...</option>
                  {allCategories.map(c=><option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{fontSize:12,fontWeight:600,color:'#444',marginBottom:6,display:'block'}}>Status</label>
                <select value={editCompanyModal.company.status||''} onChange={e=>setEditCompanyModal(p=>({...p,company:{...p.company,status:e.target.value}}))}
                  style={{width:'100%',padding:'10px 12px',border:'1.5px solid #E0DDD8',borderRadius:10,fontSize:13,fontFamily:'Inter,sans-serif'}}>
                  <option value="pending">Pendente</option>
                  <option value="active">Ativa</option>
                  <option value="suspended">Suspensa</option>
                </select>
              </div>
              <div style={{gridColumn:'1/-1',position:'relative'}}>
                <label style={{fontSize:12,fontWeight:600,color:'#444',marginBottom:6,display:'block'}}>Subcategorias <span style={{fontSize:11,color:'#AAA',fontWeight:400}}>(máx. 3)</span></label>
                <input type="text" placeholder="🔍 Buscar ou escolha da lista..." value={adminSubcatSearch}
                  onChange={e=>setAdminSubcatSearch(e.target.value)}
                  onFocus={()=>{ if(!adminSubcatSearch) setAdminSubcatSearch(' ') }}
                  onBlur={()=>setTimeout(()=>setAdminSubcatSearch(''),200)}
                  style={{width:'100%',padding:'10px 12px',border:'1.5px solid #E0DDD8',borderRadius:10,fontSize:13,fontFamily:'Inter,sans-serif'}}/>
                {adminSubcatSearch && (
                  <div style={{position:'absolute',top:68,left:0,right:0,background:'#fff',border:'1.5px solid #C9951A',borderRadius:10,maxHeight:180,overflowY:'auto',zIndex:50,boxShadow:'0 4px 16px rgba(0,0,0,.08)'}}>
                    {allSubcats.filter(s=>s.category_id===editCompanyModal.company.category_id && s.name.toLowerCase().includes(adminSubcatSearch.trim().toLowerCase())).map(s=>{
                      const selected = companySubcatIds.includes(s.id)
                      const maxed = companySubcatIds.length >= 3 && !selected
                      return (
                        <div key={s.id} onMouseDown={()=>{ if(!maxed) setCompanySubcatIds(prev=>prev.includes(s.id)?prev.filter(x=>x!==s.id):[...prev,s.id]) }}
                          style={{padding:'10px 14px',fontSize:13,cursor:maxed?'not-allowed':'pointer',display:'flex',justifyContent:'space-between',background:selected?'#FEF3E2':undefined,color:maxed?'#CCC':'#333'}}>
                          <span>{s.emoji} {s.name}</span>
                          {selected ? <span style={{color:'#C9951A',fontWeight:700}}>✓</span> : !maxed ? <span style={{color:'#AAA',fontSize:11}}>+ Adicionar</span> : <span style={{fontSize:11,color:'#CCC'}}>máx. 3</span>}
                        </div>
                      )
                    })}
                  </div>
                )}
                {companySubcatIds.length > 0 && (
                  <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:8}}>
                    {companySubcatIds.map(sid=>{
                      const s = allSubcats.find(x=>x.id===sid)
                      if(!s) return null
                      return <div key={sid} style={{display:'flex',alignItems:'center',gap:4,padding:'4px 10px',background:'#FEF3E2',border:'1px solid #C9951A',borderRadius:20,fontSize:12,color:'#854F0B',fontWeight:600}}>{s.emoji} {s.name}<button onClick={()=>setCompanySubcatIds(prev=>prev.filter(x=>x!==sid))} style={{background:'none',border:'none',cursor:'pointer',fontSize:14,color:'#C9951A',padding:0}}>×</button></div>
                    })}
                  </div>
                )}
              </div>
              <div>
                <label style={{fontSize:12,fontWeight:600,color:'#444',marginBottom:6,display:'block'}}>WhatsApp</label>
                <input value={editCompanyModal.company.phone||''} onChange={e=>setEditCompanyModal(p=>({...p,company:{...p.company,phone:e.target.value}}))}
                  style={{width:'100%',padding:'10px 12px',border:'1.5px solid #E0DDD8',borderRadius:10,fontSize:13,fontFamily:'Inter,sans-serif'}}/>
              </div>
              <div>
                <label style={{fontSize:12,fontWeight:600,color:'#444',marginBottom:6,display:'block'}}>CPF/CNPJ</label>
                <input value={editCompanyModal.company.cpf_cnpj||''} onChange={e=>setEditCompanyModal(p=>({...p,company:{...p.company,cpf_cnpj:e.target.value}}))}
                  style={{width:'100%',padding:'10px 12px',border:'1.5px solid #E0DDD8',borderRadius:10,fontSize:13,fontFamily:'Inter,sans-serif'}}/>
              </div>
              <div style={{gridColumn:'1/-1'}}>
                <label style={{fontSize:12,fontWeight:600,color:'#444',marginBottom:6,display:'block'}}>Endereço</label>
                <input value={editCompanyModal.company.address||''} onChange={e=>setEditCompanyModal(p=>({...p,company:{...p.company,address:e.target.value}}))}
                  style={{width:'100%',padding:'10px 12px',border:'1.5px solid #E0DDD8',borderRadius:10,fontSize:13,fontFamily:'Inter,sans-serif'}}/>
              </div>
              <div style={{gridColumn:'1/-1'}}>
                <label style={{fontSize:12,fontWeight:600,color:'#444',marginBottom:6,display:'block'}}>Link externo</label>
                <input value={editCompanyModal.company.external_link||''} onChange={e=>setEditCompanyModal(p=>({...p,company:{...p.company,external_link:e.target.value}}))}
                  style={{width:'100%',padding:'10px 12px',border:'1.5px solid #E0DDD8',borderRadius:10,fontSize:13,fontFamily:'Inter,sans-serif'}}/>
              </div>
              <div style={{gridColumn:'1/-1'}}>
                <label style={{fontSize:12,fontWeight:600,color:'#444',marginBottom:6,display:'block'}}>Descrição</label>
                <textarea rows={3} value={editCompanyModal.company.description||''} onChange={e=>setEditCompanyModal(p=>({...p,company:{...p.company,description:e.target.value}}))}
                  style={{width:'100%',padding:'10px 12px',border:'1.5px solid #E0DDD8',borderRadius:10,fontSize:13,fontFamily:'Inter,sans-serif',resize:'none'}}/>
              </div>
              <div>
                <label style={{fontSize:12,fontWeight:600,color:'#444',marginBottom:6,display:'block'}}>Plano</label>
                <select value={editCompanyModal.company.plan||''} onChange={e=>setEditCompanyModal(p=>({...p,company:{...p.company,plan:e.target.value}}))}
                  style={{width:'100%',padding:'10px 12px',border:'1.5px solid #E0DDD8',borderRadius:10,fontSize:13,fontFamily:'Inter,sans-serif'}}>
                  <option value="free">Grátis</option>
                  <option value="paid">Pago</option>
                </select>
              </div>
            </div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={saveCompanyEdit} disabled={savingEdit} style={{flex:1,padding:'12px',background:'#C9951A',color:'#fff',border:'none',borderRadius:10,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                {savingEdit?'Salvando...':'Salvar alterações'}
              </button>
              <button onClick={()=>setEditCompanyModal({open:false,company:null})} style={{padding:'12px 20px',background:'transparent',color:'#AAA',border:'1px solid #ddd',borderRadius:10,fontSize:13,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {editUserModal.open && editUserModal.user && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16,overflowY:'auto'}}>
          <div style={{background:'#fff',borderRadius:20,padding:28,maxWidth:440,width:'100%'}}>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:'#111',letterSpacing:1,marginBottom:20}}>EDITAR USUÁRIO</div>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:12,fontWeight:600,color:'#444',marginBottom:6,display:'block'}}>Nome</label>
              <input value={editUserModal.user.name||''} onChange={e=>setEditUserModal(p=>({...p,user:{...p.user,name:e.target.value}}))}
                style={{width:'100%',padding:'10px 12px',border:'1.5px solid #E0DDD8',borderRadius:10,fontSize:13,fontFamily:'Inter,sans-serif'}}/>
            </div>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:12,fontWeight:600,color:'#444',marginBottom:6,display:'block'}}>Email</label>
              <input value={editUserModal.user.email||''} onChange={e=>setEditUserModal(p=>({...p,user:{...p.user,email:e.target.value}}))}
                style={{width:'100%',padding:'10px 12px',border:'1.5px solid #E0DDD8',borderRadius:10,fontSize:13,fontFamily:'Inter,sans-serif'}}/>
            </div>
            <div style={{marginBottom:20}}>
              <label style={{fontSize:12,fontWeight:600,color:'#444',marginBottom:6,display:'block'}}>Bairro</label>
              <input value={editUserModal.user.neighborhood||''} onChange={e=>setEditUserModal(p=>({...p,user:{...p.user,neighborhood:e.target.value}}))}
                style={{width:'100%',padding:'10px 12px',border:'1.5px solid #E0DDD8',borderRadius:10,fontSize:13,fontFamily:'Inter,sans-serif'}}/>
            </div>
            <button onClick={saveUserEdit} disabled={savingEdit} style={{width:'100%',padding:'12px',background:'#C9951A',color:'#fff',border:'none',borderRadius:10,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'Inter,sans-serif',marginBottom:16}}>
              {savingEdit?'Salvando...':'Salvar alterações'}
            </button>

            <div style={{borderTop:'1px solid #EDE8E0',paddingTop:16}}>
              <div style={{fontSize:12,fontWeight:700,color:'#888',letterSpacing:1,marginBottom:10}}>SENHA</div>
              <button onClick={sendResetLink} style={{width:'100%',padding:'10px',background:'#FEF3E2',color:'#854F0B',border:'1px solid #F5C77A',borderRadius:10,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'Inter,sans-serif',marginBottom:10}}>
                ✉️ Enviar link de redefinição
              </button>
              <div style={{display:'flex',gap:8}}>
                <input type="text" placeholder="Nova senha (mín. 6 caracteres)" value={newPassword} onChange={e=>setNewPassword(e.target.value)}
                  style={{flex:1,padding:'10px 12px',border:'1.5px solid #E0DDD8',borderRadius:10,fontSize:13,fontFamily:'Inter,sans-serif'}}/>
                <button onClick={setNewPasswordDirect} style={{padding:'10px 16px',background:'#111',color:'#fff',border:'none',borderRadius:10,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>Definir</button>
              </div>
            </div>

            <button onClick={()=>setEditUserModal({open:false,user:null})} style={{width:'100%',padding:'10px',background:'transparent',color:'#AAA',border:'1px solid #ddd',borderRadius:10,fontSize:13,cursor:'pointer',fontFamily:'Inter,sans-serif',marginTop:16}}>Fechar</button>
          </div>
        </div>
      )}

      {toast && <div className="toast">✓ {toast}</div>}

      <div className="admin-layout">

        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-logo">
            TRINDADE <span>ONLINE</span>
            <br/>
            <span className="sidebar-badge">ADMIN</span>
          </div>

          {[
            { id: 'dashboard', icon: '📊', label: 'Dashboard' },
            { id: 'empresas',  icon: '🏪', label: 'Empresas', badge: stats?.pending || 0 },
            { id: 'destaques', icon: '⭐', label: 'Destaques' },
            { id: 'banners',   icon: '📢', label: 'Banners' },
            { id: 'denuncias', icon: '🚩', label: 'Denúncias', badge: repCount },
            { id: 'usuarios',  icon: '👥', label: 'Usuários' },
            { id: 'buscas',    icon: '🔍', label: 'Buscas' },
            { id: 'atividade', icon: '⚡', label: 'Atividade' },
    { id: 'pedidos-banner', icon: '🖼️', label: 'Ped. Banner' },
    { id: 'configuracoes', icon: '⚙️', label: 'Configurações' },
          ].map(n => (
            <div
              key={n.id}
              className={`nav-item ${tab === n.id ? 'on' : ''}`}
              onClick={() => setTab(n.id as any)}
            >
              <span>{n.icon}</span>
              <span>{n.label}</span>
              {!!n.badge && <span className="nav-badge">{n.badge}</span>}
            </div>
          ))}

          <div className="sidebar-footer">
            <a href="/">← Ver site</a>
            <button className="btn-sair-sidebar" onClick={handleSair}>↪ Sair</button>
          </div>
        </aside>

        {/* MAIN */}
        <main className="admin-main">
          <div className="admin-topbar">
            <div className="topbar-title">
              {tab === 'dashboard' && 'Dashboard'}
              {tab === 'empresas'  && 'Gestão de Empresas'}
              {tab === 'usuarios'  && 'Usuários Cadastrados'}
              {tab === 'buscas'    && 'Analytics de Buscas'}
              {tab === 'atividade' && 'Atividade Recente'}
              {tab === 'destaques' && 'Destaques'}
              {tab === 'denuncias' && 'Denúncias'}
              {tab === 'banners'   && 'Banners da Home'}
              {tab === 'pedidos-banner' && 'Pedidos de Banner'}
              {tab === 'configuracoes' && 'Configurações'}
            </div>
            <div className="topbar-date">{new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</div>
          </div>

          <div className="admin-body">
            {loading && <div style={{ textAlign:'center', padding:'60px', color:'#AAA' }}>Carregando dados...</div>}

            {/* ── DASHBOARD ── */}
            {!loading && tab === 'dashboard' && (
              <>
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-label">Total de Usuários</div>
                    <div className="stat-num stat-up">{stats?.total_users || 0}</div>
                    <div className="stat-sub">+{stats?.users_today || 0} hoje · +{stats?.users_week || 0} essa semana</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Empresas Cadastradas</div>
                    <div className="stat-num stat-warn">{stats?.total_companies || 0}</div>
                    <div className="stat-sub">{stats?.active || 0} ativas · {stats?.pending || 0} aguardando aprovação</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Total de Buscas</div>
                    <div className="stat-num" style={{ color:'#185FA5' }}>{stats?.total_searches || 0}</div>
                    <div className="stat-sub">{stats?.searches_today || 0} hoje</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Pendentes de Aprovação</div>
                    <div className={`stat-num ${stats?.pending ? 'stat-danger' : 'stat-up'}`}>{stats?.pending || 0}</div>
                    <div className="stat-sub">{stats?.pending ? 'Requer atenção' : 'Tudo em dia ✓'}</div>
                  </div>
                </div>

                {(stats?.pending || 0) > 0 && (
                  <div className="section-card">
                    <div className="section-hdr">
                      <span className="section-title">⚠️ EMPRESAS AGUARDANDO APROVAÇÃO</span>
                      <button className="filter-btn on" onClick={() => setTab('empresas')}>Ver todas →</button>
                    </div>
                    <table className="data-table">
                      <thead><tr><th>Empresa</th><th>Responsável</th><th>Categoria</th><th>Data</th><th>Ação</th></tr></thead>
                      <tbody>
                        {companies.filter(c => c.status === 'pending').slice(0,5).map(c => (
                          <tr key={c.id}>
                            <td><strong>{c.name}</strong></td>
                            <td>{c.owner?.name || '—'}</td>
                            <td>{c.category?.emoji} {c.category?.name || '—'}</td>
                            <td>{fmtDate(c.created_at)}</td>
                            <td>
                              <button className="action-btn btn-approve" onClick={() => approveCompany(c.id)}>✓ Aprovar</button>
                              <button className="action-btn btn-suspend" onClick={() => suspendCompany(c.id)}>✗ Recusar</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="section-card">
                  <div className="section-hdr"><span className="section-title">🔍 TOP 10 BUSCAS</span></div>
                  {searches.length === 0
                    ? <div className="empty-state"><div>🔍</div><div>Nenhuma busca registrada ainda</div></div>
                    : <table className="data-table">
                        <thead><tr><th>#</th><th>Termo</th><th>Buscas</th><th>Sem resultado</th></tr></thead>
                        <tbody>
                          {searches.slice(0,10).map((s,i) => (
                            <tr key={s.query}>
                              <td><span className={`rank-num ${i===0?'rank-1':i===1?'rank-2':i===2?'rank-3':''}`}>{i+1}</span></td>
                              <td><strong>{s.query}</strong></td>
                              <td>{s.count}</td>
                              <td>{s.no_result > 0 ? <span className="no-result-badge">{s.no_result} sem resultado</span> : <span style={{color:'#AAA'}}>—</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                  }
                </div>
              </>
            )}

            {/* ── EMPRESAS ── */}
            {!loading && tab === 'empresas' && (
              <div className="section-card">
                <div className="section-hdr">
                  <span className="section-title">EMPRESAS ({filteredCompanies.length})</span>
                  <div className="filter-row">
                    {['all','pending','active','suspended'].map(f => (
                      <button key={f} className={`filter-btn ${filterStatus===f?'on':''}`} onClick={() => setFilter(f)}>
                        {f==='all'?'Todas':f==='pending'?'Pendentes':f==='active'?'Ativas':'Suspensas'}
                        {f==='pending' && stats?.pending ? ` (${stats.pending})` : ''}
                      </button>
                    ))}
                  </div>
                </div>
                {filteredCompanies.length === 0
                  ? <div className="empty-state"><div>🏪</div><div>Nenhuma empresa encontrada</div></div>
                  : <div style={{ overflowX:'auto' }}>
                      <table className="data-table">
                        <thead><tr><th>Nome</th><th>Responsável</th><th>Categoria</th><th>Plano</th><th>Status</th><th>Data</th><th>Ações</th></tr></thead>
                        <tbody>
                          {filteredCompanies.map(c => (
                            <tr key={c.id}>
                              <td><strong>{c.name}</strong><br/><span style={{fontSize:11,color:'#AAA'}}>{c.address || '—'}</span></td>
                              <td>{c.owner?.name || '—'}</td>
                              <td>{c.category?.emoji} {c.category?.name || '—'}</td>
                              <td><span style={{fontSize:11,fontWeight:600,color:c.plan==='paid'?'#0F8050':'#AAA'}}>{c.plan==='paid'?'Pago':'Grátis'}</span></td>
                              <td>
                                <span className="status-badge" style={{ background: statusColor(c.status)+'22', color: statusColor(c.status) }}>
                                  ● {statusLabel(c.status)}
                                </span>
                              </td>
                              <td>{fmtDate(c.created_at)}</td>
                              <td>
                                {c.status === 'pending'   && <button className="action-btn btn-approve" onClick={() => approveCompany(c.id)}>✓ Aprovar</button>}
                                {c.status === 'active'    && <button className="action-btn btn-suspend" onClick={() => suspendCompany(c.id)}>Suspender</button>}
                                {c.status === 'suspended' && <button className="action-btn btn-approve" onClick={() => approveCompany(c.id)}>Reativar</button>}
                                <button className="action-btn btn-view" onClick={() => window.open(`/empresa/${c.id}`)}>Ver</button>
                                <button className="action-btn" style={{background:'#185FA522',color:'#185FA5'}} onClick={() => openEditCompany(c)}>✏️ Editar</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                }
              </div>
            )}

            {/* ── USUÁRIOS ── */}
            {!loading && tab === 'usuarios' && (
              <div className="section-card">
                <div className="section-hdr">
                  <span className="section-title">USUÁRIOS ({users.length})</span>
                </div>
                {users.length === 0
                  ? <div className="empty-state"><div>👥</div><div>Nenhum usuário cadastrado ainda</div></div>
                  : <div style={{ overflowX:'auto' }}>
                      <table className="data-table">
                        <thead><tr><th>Nome</th><th>Tipo</th><th>Bairro</th><th>Cadastro</th><th>Ações</th></tr></thead>
                        <tbody>
                          {users.map(u => (
                            <tr key={u.id}>
                              <td><strong>{u.name}</strong></td>
                              <td>
                                <span className={`user-type-badge type-${u.user_type}`}>
                                  {u.user_type === 'user' ? '👤 Morador' : u.user_type === 'company' ? '🏪 Lojista' : '⭐ Admin'}
                                </span>
                              </td>
                              <td>{u.neighborhood || '—'}</td>
                              <td>{fmtDate(u.created_at)}</td>
                              <td><button className="action-btn" style={{background:'#185FA522',color:'#185FA5'}} onClick={() => openEditUser(u)}>✏️ Editar</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                }
              </div>
            )}

            {/* ── BUSCAS ── */}
            {!loading && tab === 'buscas' && (
              <>
                <div className="stats-grid" style={{ gridTemplateColumns:'repeat(3,1fr)' }}>
                  <div className="stat-card">
                    <div className="stat-label">Total de Buscas</div>
                    <div className="stat-num" style={{color:'#185FA5'}}>{stats?.total_searches || 0}</div>
                    <div className="stat-sub">{stats?.searches_today || 0} hoje</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Termos Únicos</div>
                    <div className="stat-num stat-warn">{searches.length}</div>
                    <div className="stat-sub">palavras distintas buscadas</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Sem Resultado</div>
                    <div className="stat-num stat-danger">{searches.filter(s=>s.no_result>0).length}</div>
                    <div className="stat-sub">termos sem empresa encontrada</div>
                  </div>
                </div>
                <div className="section-card">
                  <div className="section-hdr"><span className="section-title">RANKING DE BUSCAS</span></div>
                  {searches.length === 0
                    ? <div className="empty-state"><div>🔍</div><div>Nenhuma busca registrada ainda</div></div>
                    : <table className="data-table">
                        <thead><tr><th>#</th><th>Termo buscado</th><th>Volume</th><th>Proporção</th><th>Sem resultado</th></tr></thead>
                        <tbody>
                          {searches.map((s,i) => (
                            <tr key={s.query}>
                              <td><span className={`rank-num ${i===0?'rank-1':i===1?'rank-2':i===2?'rank-3':''}`}>{i+1}</span></td>
                              <td><strong>{s.query}</strong></td>
                              <td>{s.count} {s.count===1?'busca':'buscas'}</td>
                              <td>
                                <div style={{display:'flex',alignItems:'center',gap:8}}>
                                  <div className="progress-bar">
                                    <div className="progress-fill" style={{width:`${Math.round((s.count/searches[0].count)*100)}%`}}/>
                                  </div>
                                  <span style={{fontSize:11,color:'#AAA',width:32}}>{Math.round((s.count/searches[0].count)*100)}%</span>
                                </div>
                              </td>
                              <td>{s.no_result > 0 ? <span className="no-result-badge">⚠ {s.no_result} sem resultado</span> : <span style={{color:'#0F8050',fontSize:11}}>✓ Com resultado</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                  }
                </div>
              </>
            )}

            {/* ── DENÚNCIAS ── */}
            {!loading && tab === 'denuncias' && (
              <div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
                  <span className="section-title">DENÚNCIAS ({reports.filter(r=>!r.resolved).length} pendentes)</span>
                </div>
                {reports.length === 0 && (
                  <div style={{textAlign:'center',padding:'40px 0',color:'#555',fontSize:13}}>
                    Nenhuma denúncia registrada. ✅
                  </div>
                )}
                <div style={{display:'flex',flexDirection:'column',gap:10}}>
                  {reports.map(r => (
                    <div key={r.id} style={{display:'flex',alignItems:'flex-start',gap:12,padding:'12px 14px',background: r.resolved ? '#111' : '#1A0A0A',border:`0.5px solid ${r.resolved ? '#222' : '#4A1515'}`,borderRadius:10,opacity:r.resolved?0.5:1}}>
                      <span style={{fontSize:20,flexShrink:0}}>{r.resolved ? '✅' : '🚩'}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,color:'#fff',marginBottom:3}}>
                          {r.listing?.title || 'Anúncio removido'}
                          <span style={{marginLeft:8,fontSize:10,padding:'1px 7px',borderRadius:5,background:'#222',color:'#888'}}>{r.listing?.type||'—'}</span>
                        </div>
                        <div style={{fontSize:12,color:'#E24B4A',marginBottom:4}}>"{r.reason}"</div>
                        <div style={{fontSize:11,color:'#555'}}>
                          Denunciado por: {r.reporter?.name||'—'} · {new Date(r.created_at).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                      {!r.resolved && r.listing?.status === 'active' && (
                        <div style={{display:'flex',gap:6,flexShrink:0}}>
                          <button onClick={() => deleteListingFromReport(r.listing.id, r.id)}
                            style={{padding:'5px 10px',background:'#2A0A0A',color:'#E24B4A',border:'0.5px solid #4A1515',borderRadius:7,fontSize:11,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                            Excluir
                          </button>
                          <button onClick={() => resolveReport(r.id)}
                            style={{padding:'5px 10px',background:'#0A1A0A',color:'#4CAF50',border:'0.5px solid #1A4A1A',borderRadius:7,fontSize:11,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                            Ignorar
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── DESTAQUES ── */}
            {!loading && tab === 'destaques' && (
              <div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
                  <span className="section-title">DESTAQUES ATIVOS ({highlights.length})</span>
                  <button className="filter-btn on" onClick={() => setHlFormOpen(!hlFormOpen)}>
                    {hlFormOpen ? 'Cancelar' : '+ Adicionar destaque'}
                  </button>
                </div>

                {hlFormOpen && (
                  <div style={{background:'#1A1A1A',border:'1px solid #C9951A',borderRadius:12,padding:16,marginBottom:16}}>
                    <div style={{fontSize:12,fontWeight:600,color:'#fff',marginBottom:12}}>Novo destaque</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                      <div>
                        <div style={{fontSize:10,color:'#888',marginBottom:4}}>EMPRESA</div>
                        <select style={{width:'100%',padding:'7px 10px',borderRadius:8,border:'0.5px solid #333',background:'#111',color:'#fff',fontSize:12,fontFamily:'Inter,sans-serif'}}
                          value={hlForm.company_id} onChange={e => setHlForm(f => ({...f,company_id:e.target.value}))}>
                          <option value="">Selecionar empresa...</option>
                          {companies.filter(c=>c.status==='active').map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <div style={{fontSize:10,color:'#888',marginBottom:4}}>TIPO</div>
                        <select style={{width:'100%',padding:'7px 10px',borderRadius:8,border:'0.5px solid #333',background:'#111',color:'#fff',fontSize:12,fontFamily:'Inter,sans-serif'}}
                          value={hlForm.highlight_type} onChange={e => setHlForm(f => ({...f,highlight_type:e.target.value}))}>
                          <option value="manual">Manual (gratuito)</option>
                          <option value="paid">Pago</option>
                        </select>
                      </div>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                      <div>
                        <div style={{fontSize:10,color:'#888',marginBottom:4}}>ONDE APARECE</div>
                        <select style={{width:'100%',padding:'7px 10px',borderRadius:8,border:'0.5px solid #333',background:'#111',color:'#fff',fontSize:12,fontFamily:'Inter,sans-serif'}}
                          value={hlForm.scope_type} onChange={e => setHlForm(f => ({...f,scope_type:e.target.value,scope_id:''}))}>
                          <option value="global">Em toda a home</option>
                          <option value="category">Em uma categoria</option>
                          <option value="subcategory">Em uma subcategoria</option>
                        </select>
                      </div>
                      <div>
                        <div style={{fontSize:10,color:'#888',marginBottom:4}}>
                          {hlForm.scope_type === 'category' ? 'CATEGORIA' : hlForm.scope_type === 'subcategory' ? 'SUBCATEGORIA' : 'ESCOPO'}
                        </div>
                        {hlForm.scope_type === 'category' && (
                          <select style={{width:'100%',padding:'7px 10px',borderRadius:8,border:'0.5px solid #333',background:'#111',color:'#fff',fontSize:12,fontFamily:'Inter,sans-serif'}}
                            value={hlForm.scope_id} onChange={e => setHlForm(f => ({...f,scope_id:e.target.value}))}>
                            <option value="">Selecionar...</option>
                            {catOpts.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                          </select>
                        )}
                        {hlForm.scope_type === 'subcategory' && (
                          <select style={{width:'100%',padding:'7px 10px',borderRadius:8,border:'0.5px solid #333',background:'#111',color:'#fff',fontSize:12,fontFamily:'Inter,sans-serif'}}
                            value={hlForm.scope_id} onChange={e => setHlForm(f => ({...f,scope_id:e.target.value}))}>
                            <option value="">Selecionar...</option>
                            {subcatOpts.map(s => <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}
                          </select>
                        )}
                        {hlForm.scope_type === 'global' && (
                          <div style={{padding:'7px 10px',borderRadius:8,border:'0.5px solid #333',background:'#111',color:'#555',fontSize:12}}>Aparece na home</div>
                        )}
                      </div>
                    </div>
                    <div style={{marginBottom:12}}>
                      <div style={{fontSize:10,color:'#888',marginBottom:4}}>EXPIRAÇÃO</div>
                      <select style={{padding:'7px 10px',borderRadius:8,border:'0.5px solid #333',background:'#111',color:'#fff',fontSize:12,fontFamily:'Inter,sans-serif'}}
                        value={hlForm.expires_at} onChange={e => setHlForm(f => ({...f,expires_at:e.target.value}))}>
                        <option value="">Sem expiração</option>
                        <option value="1">1 dia</option>
                        <option value="3">3 dias</option>
                        <option value="5">5 dias</option>
                        <option value="7">7 dias</option>
                        <option value="10">10 dias</option>
                        <option value="15">15 dias</option>
                        <option value="30">30 dias</option>
                        <option value="60">60 dias</option>
                        <option value="90">90 dias</option>
                      </select>
                    </div>
                    <button onClick={saveHighlight} disabled={hlLoading || !hlForm.company_id}
                      style={{padding:'9px 20px',background:'#C9951A',color:'#fff',border:'none',borderRadius:9,fontSize:13,fontWeight:600,fontFamily:'Inter,sans-serif',cursor:'pointer',opacity:(!hlForm.company_id||hlLoading)?0.6:1}}>
                      {hlLoading ? 'Salvando...' : 'Salvar destaque'}
                    </button>
                  </div>
                )}

                {highlights.length === 0 && (
                  <div style={{textAlign:'center',padding:'40px 0',color:'#555',fontSize:13}}>
                    Nenhum destaque ativo. Adicione o primeiro!
                  </div>
                )}

                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {highlights.map(h => {
                    const scopeLabel = h.scope_type === 'global' ? 'Home' :
                      h.scope_type === 'category' ? `Categoria: ${catOpts.find(c=>c.id===h.scope_id)?.name||'—'}` :
                      `Subcategoria: ${subcatOpts.find(s=>s.id===h.scope_id)?.name||'—'}`
                    return (
                      <div key={h.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',background:'#111',border:'0.5px solid #222',borderRadius:10}}>
                        <span style={{fontSize:22}}>{h.company?.category?.emoji||'🏪'}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,color:'#fff',marginBottom:3}}>{h.company?.name||'—'}</div>
                          <div style={{fontSize:11,color:'#666',display:'flex',gap:6,flexWrap:'wrap'}}>
                            <span style={{background:h.highlight_type==='paid'?'#1A3A1A':'#2A1F0A',color:h.highlight_type==='paid'?'#4CAF50':'#C9951A',padding:'1px 8px',borderRadius:5,fontWeight:600,fontSize:10}}>
                              {h.highlight_type==='paid'?'Pago':'Manual'}
                            </span>
                            <span style={{background:'#1A1F2A',color:'#7aacf0',padding:'1px 8px',borderRadius:5,fontSize:10}}>{scopeLabel}</span>
                            {h.expires_at && <span style={{color:'#555',fontSize:10}}>Expira: {new Date(h.expires_at).toLocaleDateString('pt-BR')}</span>}
                          </div>
                        </div>
                        <button onClick={() => removeHighlight(h.id)}
                          style={{padding:'5px 10px',background:'#2A0A0A',color:'#E24B4A',border:'0.5px solid #4A1515',borderRadius:7,fontSize:11,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                          Remover
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── BANNERS ── */}
            {!loading && tab === 'banners' && (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  style={{ display: 'none' }}
                />
                <input
                  ref={fileInputRefMobile}
                  type="file"
                  accept="image/*"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    if (file.size > 5 * 1024 * 1024) { showToast('Imagem muito grande. Máximo 5MB.'); return }
                    setBannerImageFileMobile(file)
                    const reader = new FileReader()
                    reader.onload = ev => setBannerImagePreviewMobile(ev.target?.result as string)
                    reader.readAsDataURL(file)
                  }}
                  style={{ display: 'none' }}
                />

                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
                  <span className="section-title">BANNERS DA HOME ({banners.length})</span>
                  <button className="filter-btn on" onClick={() => {
                    if (bannerFormOpen) {
                      setBannerFormOpen(false)
                      setEditingBannerId(null)
                      setBannerForm({ title:'', subtitle:'', description:'', link_url:'', display_order: banners.length })
                      setBannerImageFile(null)
                      setBannerImagePreview(null)
                      setBannerCurrentImage(null)
                    } else {
                      openNewBanner()
                    }
                  }}>
                    {bannerFormOpen ? 'Cancelar' : '+ Novo banner'}
                  </button>
                </div>

                {bannerFormOpen && (
                  <div style={{background:'#fff',border:'1px solid #e0e0e0',borderRadius:12,padding:20,marginBottom:20,boxShadow:'0 2px 8px rgba(0,0,0,0.06)'}}>
                    <div style={{fontSize:14,fontWeight:600,color:'#111',marginBottom:16}}>
                      {editingBannerId ? 'Editar Banner' : 'Novo Banner'}
                    </div>

                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:16}}>
                      <div>
                      <label className="banner-form-label">Imagem Desktop (1200 × 359px)</label>
                      {(bannerImagePreview || bannerCurrentImage) ? (
                        <div className="upload-area-filled" onClick={() => fileInputRef.current?.click()}>
                          <img
                            src={bannerImagePreview || bannerCurrentImage!}
                            alt="Preview"
                            style={{width:'100%',height:160,objectFit:'cover',display:'block'}}
                          />
                        </div>
                      ) : (
                        <div className="upload-area" onClick={() => fileInputRef.current?.click()}>
                          <div style={{fontSize:32,marginBottom:8}}>🖼️</div>
                          <div style={{fontSize:13,color:'#666',fontWeight:500}}>Clique para fazer upload da imagem</div>
                          <div style={{fontSize:11,color:'#aaa',marginTop:4}}>JPG, PNG ou WebP · Máximo 5MB · 1200×359px</div>
                        </div>
                      )}
                      {(bannerImagePreview || bannerCurrentImage) && (
                        <div style={{display:'flex',gap:8,marginTop:8}}>
                          <button onClick={() => fileInputRef.current?.click()}
                            style={{fontSize:11,color:'#185FA5',background:'#f0f4ff',border:'none',padding:'5px 10px',borderRadius:5,cursor:'pointer',fontFamily:'Inter,sans-serif',fontWeight:600}}>
                            Trocar imagem
                          </button>
                          <button onClick={() => { setBannerImageFile(null); setBannerImagePreview(null); setBannerCurrentImage(null) }}
                            style={{fontSize:11,color:'#dc2626',background:'#fef2f2',border:'none',padding:'5px 10px',borderRadius:5,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                            Remover imagem
                          </button>
                        </div>
                      )}
                      {uploadProgress > 0 && uploadProgress < 100 && (
                        <div style={{marginTop:8,background:'#f0f0f0',borderRadius:4,overflow:'hidden',height:4}}>
                          <div style={{height:'100%',background:'#C9951A',width:`${uploadProgress}%`,transition:'width 0.3s'}} />
                        </div>
                      )}
                      </div>
                      <div>
                      <label className="banner-form-label">Imagem Mobile (opcional)</label>
                      {(bannerImagePreviewMobile || bannerCurrentImageMobile) ? (
                        <div className="upload-area-filled" onClick={() => fileInputRefMobile.current?.click()}>
                          <img src={bannerImagePreviewMobile || bannerCurrentImageMobile!} alt="Preview mobile" style={{width:'100%',height:120,objectFit:'cover',display:'block'}} />
                        </div>
                      ) : (
                        <div className="upload-area" onClick={() => fileInputRefMobile.current?.click()} style={{height:120,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                          <div style={{fontSize:24,marginBottom:6}}>📱</div>
                          <div style={{fontSize:12,color:'#666',fontWeight:500}}>Upload imagem mobile</div>
                          <div style={{fontSize:10,color:'#aaa',marginTop:3}}>Se vazio, usa a desktop</div>
                        </div>
                      )}
                      {(bannerImagePreviewMobile || bannerCurrentImageMobile) && (
                        <div style={{display:'flex',gap:8,marginTop:8}}>
                          <button onClick={() => fileInputRefMobile.current?.click()}
                            style={{fontSize:11,color:'#185FA5',background:'#f0f4ff',border:'none',padding:'5px 10px',borderRadius:5,cursor:'pointer',fontFamily:'Inter,sans-serif',fontWeight:600}}>
                            Trocar
                          </button>
                          <button onClick={() => { setBannerImageFileMobile(null); setBannerImagePreviewMobile(null); setBannerCurrentImageMobile(null) }}
                            style={{fontSize:11,color:'#dc2626',background:'#fef2f2',border:'none',padding:'5px 10px',borderRadius:5,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                            Remover
                          </button>
                        </div>
                      )}
                      </div>
                    </div>

                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
                      <div>
                        <label className="banner-form-label">Título *</label>
                        <input className="banner-form-input" type="text" value={bannerForm.title}
                          onChange={e => setBannerForm(p => ({...p, title: e.target.value}))}
                          placeholder="Ex: Anderlu Material de Construção" />
                      </div>
                      <div>
                        <label className="banner-form-label">Subtítulo</label>
                        <input className="banner-form-input" type="text" value={bannerForm.subtitle}
                          onChange={e => setBannerForm(p => ({...p, subtitle: e.target.value}))}
                          placeholder="Ex: Material de Construção" />
                      </div>
                      <div>
                        <label className="banner-form-label">Descrição curta</label>
                        <input className="banner-form-input" type="text" value={bannerForm.description}
                          onChange={e => setBannerForm(p => ({...p, description: e.target.value}))}
                          placeholder="Ex: Tudo para sua obra na Trindade" />
                      </div>
                      <div>
                        <label className="banner-form-label">Link (ao clicar no banner)</label>
                        <input className="banner-form-input" type="text" value={bannerForm.link_url}
                          onChange={e => setBannerForm(p => ({...p, link_url: e.target.value}))}
                          placeholder="Ex: /empresa/anderlu ou https://..." />
                        <div style={{fontSize:10,color:'#aaa',marginTop:4}}>O banner inteiro será clicável e levará para este link</div>
                      </div>
                      <div>
                        <label className="banner-form-label">Ordem de exibição</label>
                        <input className="banner-form-input" type="number" value={bannerForm.display_order}
                          onChange={e => setBannerForm(p => ({...p, display_order: Number(e.target.value)}))}
                          style={{width:100}} />
                        <div style={{fontSize:10,color:'#aaa',marginTop:4}}>Número menor aparece primeiro</div>
                      </div>
                    </div>

                    <div style={{display:'flex',gap:8}}>
                      <button onClick={saveBanner} disabled={bannerLoading || (!bannerCurrentImage && !bannerImageFile)}
                        style={{background:'#C9951A',color:'#111',border:'none',padding:'9px 22px',borderRadius:7,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'Inter,sans-serif',opacity:(bannerLoading||(!bannerCurrentImage&&!bannerImageFile))?0.6:1}}>
                        {bannerLoading ? 'Salvando...' : editingBannerId ? 'Salvar alterações' : 'Criar banner'}
                      </button>
                      <button onClick={() => { setBannerFormOpen(false); setEditingBannerId(null); setBannerForm({ title:'', subtitle:'', description:'', link_url:'', display_order:0 }); setBannerImageFile(null); setBannerImagePreview(null); setBannerCurrentImage(null); setBannerImageFileMobile(null); setBannerImagePreviewMobile(null); setBannerCurrentImageMobile(null) }}
                        style={{background:'transparent',color:'#666',border:'1px solid #ddd',padding:'9px 16px',borderRadius:7,fontSize:13,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {banners.length === 0 ? (
                  <div className="empty-state">
                    <div>📢</div>
                    <div>Nenhum banner cadastrado ainda</div>
                    <div style={{fontSize:12,marginTop:4}}>Adicione o primeiro banner para aparecer na home</div>
                  </div>
                ) : (
                  <div style={{display:'flex',flexDirection:'column',gap:10}}>
                    {banners.map(b => (
                      <div key={b.id} style={{background:'#fff',border:'1px solid #e8e8e8',borderRadius:10,overflow:'hidden',opacity: b.active ? 1 : 0.55}}>
                        {b.image_url && (
                          <div style={{height:80,overflow:'hidden',position:'relative'}}>
                            <img src={b.image_url} alt={b.title} style={{width:'100%',height:'100%',objectFit:'cover'}} />
                            <div style={{position:'absolute',inset:0,background:'linear-gradient(90deg,rgba(0,0,0,0.55),transparent)'}} />
                            <div style={{position:'absolute',left:14,top:'50%',transform:'translateY(-50%)',color:'#fff',fontFamily:'"Bebas Neue",sans-serif',fontSize:20,letterSpacing:1}}>
                              {b.title}
                            </div>
                          </div>
                        )}
                        <div style={{padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                          <div style={{display:'flex',alignItems:'center',gap:12,flex:1,minWidth:0}}>
                            {!b.image_url && (
                              <div style={{width:36,height:36,borderRadius:8,background:'#f5e9c4',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>📢</div>
                            )}
                            <div style={{minWidth:0}}>
                              {!b.image_url && <div style={{fontSize:14,fontWeight:600,color:'#111',marginBottom:2}}>{b.title}</div>}
                              {b.subtitle && <div style={{fontSize:12,color:'#888'}}>{b.subtitle}</div>}
                              {b.link_url && (
                                <div style={{fontSize:11,color:'#C9951A',marginTop:3,display:'flex',alignItems:'center',gap:4}}>
                                  🔗 <span style={{wordBreak:'break-all'}}>{b.link_url}</span>
                                </div>
                              )}
                              {!b.image_url && <div style={{fontSize:11,color:'#f59e0b',marginTop:4,fontWeight:500}}>⚠ Sem imagem — aparecerá com fundo escuro padrão</div>}
                              {b.image_url_mobile && <div style={{fontSize:11,color:'#0F8050',marginTop:3,fontWeight:500}}>📱 Tem versão mobile</div>}
                            </div>
                          </div>
                          <div style={{display:'flex',gap:8,alignItems:'center',flexShrink:0,marginLeft:12}}>
                            <span style={{fontSize:10,fontWeight:600,padding:'2px 10px',borderRadius:10,background: b.active ? '#dcfce7' : '#fee2e2',color: b.active ? '#16a34a' : '#dc2626'}}>
                              {b.active ? 'Ativo' : 'Inativo'}
                            </span>
                            <button onClick={() => { openEditBanner(b); setBannerFormOpen(true) }}
                              style={{fontSize:11,color:'#185FA5',background:'#f0f4ff',border:'none',padding:'5px 10px',borderRadius:5,cursor:'pointer',fontFamily:'Inter,sans-serif',fontWeight:600}}>
                              Editar
                            </button>
                            <button onClick={() => toggleBanner(b.id, b.active)}
                              style={{fontSize:11,color:'#555',background:'#f5f5f5',border:'none',padding:'5px 10px',borderRadius:5,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                              {b.active ? 'Desativar' : 'Ativar'}
                            </button>
                            <button onClick={() => deleteBanner(b.id)}
                              style={{fontSize:11,color:'#dc2626',background:'#fef2f2',border:'none',padding:'5px 10px',borderRadius:5,cursor:'pointer',fontFamily:'Inter,sans-serif',fontWeight:600}}>
                              Excluir
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── PEDIDOS DE BANNER ── */}
            {!loading && tab === 'pedidos-banner' && (
              <div>
                <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
                  <select value={bannerFilter} onChange={e=>setBannerFilter(e.target.value as any)} style={{padding:'8px 12px',borderRadius:8,border:'1px solid #E0DDD8',fontSize:12,fontFamily:'Inter,sans-serif',background:'#fff'}}>
                    <option value="all">Todos os status</option>
                    <option value="pending">⏳ Pendente</option>
                    <option value="in_progress">🔄 Em produção</option>
                    <option value="delivered">✅ Entregue</option>
                  </select>
                  <select value={bannerSort} onChange={e=>setBannerSort(e.target.value as any)} style={{padding:'8px 12px',borderRadius:8,border:'1px solid #E0DDD8',fontSize:12,fontFamily:'Inter,sans-serif',background:'#fff'}}>
                    <option value="recent">Mais recentes primeiro</option>
                    <option value="urgent">Vencendo primeiro</option>
                    <option value="far">Mais tempo restante primeiro</option>
                  </select>
                </div>
                {(() => {
                  let filtered = bannerFilter === 'all' ? bannerRequests : bannerRequests.filter((r:any) => r.status === bannerFilter)
                  filtered = [...filtered].sort((a:any, b:any) => {
                    if (bannerSort === 'recent') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                    const aExp = a.expires_at ? new Date(a.expires_at).getTime() : Infinity
                    const bExp = b.expires_at ? new Date(b.expires_at).getTime() : Infinity
                    return bannerSort === 'urgent' ? aExp - bExp : bExp - aExp
                  })
                  if (filtered.length === 0) return <div style={{textAlign:'center',padding:'48px 20px',color:'#AAA'}}>Nenhum pedido encontrado</div>
                  return (
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:14}}>
                    {filtered.map((req: any) => { return (() => {
                        const now = Date.now()
                        const expires = req.expires_at ? new Date(req.expires_at).getTime() : null
                        const daysRemaining = expires ? Math.ceil((expires - now) / 86400000) : null
                        const borderColor = !expires ? '#EDE8E0' : daysRemaining! <= 0 ? '#E24B4A' : daysRemaining! <= 3 ? '#F5C77A' : '#5EE8A0'
                        const statusBg = !expires ? '#fff' : daysRemaining! <= 0 ? '#FCEBEB' : daysRemaining! <= 3 ? '#FAEEDA' : '#EAF3DE'
                        return (
                        <div key={req.id} style={{background:statusBg,border:`1.5px solid ${borderColor}`,borderRadius:14,padding:16}}>
                          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontWeight:600,fontSize:14,color:'#111'}}>{req.company?.name}</div>
                              <div style={{fontSize:11,color:'#888',marginTop:2}}>
                                {req.tipo === 'ia' ? '✨ IA' : '📤 Upload'} · {req.dias} dias · R$ {Number(req.value).toFixed(2)} · {new Date(req.created_at).toLocaleDateString('pt-BR')}
                              </div>
                              {req.expires_at && (
                                <div style={{fontSize:11,marginTop:3,fontWeight:600,color: daysRemaining! <= 0 ? '#E24B4A' : daysRemaining! <= 3 ? '#854F0B' : '#0F6E56'}}>
                                  {daysRemaining! <= 0 ? '🔴 Vencido' : daysRemaining! <= 3 ? `🟡 Vence em ${daysRemaining} dia(s)` : `🟢 ${daysRemaining} dias restantes`}
                                  {' · '}{new Date(req.starts_at).toLocaleDateString('pt-BR')} → {new Date(req.expires_at).toLocaleDateString('pt-BR')}
                                </div>
                              )}
                              {!req.expires_at && (
                                <div style={{fontSize:11,color:'#AAA',marginTop:2}}>⏳ Aguardando ativação ({req.dias} dias após entrega)</div>
                              )}
                            </div>
                            <select value={req.status} onChange={async (e) => {
                              const newStatus = e.target.value
                              const updates: any = { status: newStatus }
                              if (newStatus === 'delivered' && !req.starts_at) {
                                updates.starts_at = new Date().toISOString()
                                updates.expires_at = new Date(Date.now() + req.dias * 86400000).toISOString()
                              }
                              await supabase.from('banner_requests').update(updates).eq('id', req.id)
                              loadBannerRequests()
                            }} style={{padding:'6px 10px',borderRadius:8,border:'1px solid #E0DDD8',fontSize:11,fontFamily:'Inter,sans-serif',background:'#fff'}}>
                              <option value="pending">⏳ Pendente</option>
                              <option value="in_progress">🔄 Em produção</option>
                              <option value="delivered">✅ Entregue</option>
                            </select>
                          </div>
                          {req.descricao_ia && (
                            <div style={{background:'#FEF3E2',border:'1px solid #F5C77A',borderRadius:8,padding:'8px 12px',marginTop:10,fontSize:12,color:'#854F0B'}}>
                              <strong>IA:</strong> {req.descricao_ia}
                            </div>
                          )}
                          {(req.file_desktop_url || req.file_mobile_url) && (
                            <div style={{display:'flex',gap:10,marginTop:10,flexWrap:'wrap'}}>
                              {req.file_desktop_url && (
                                <div>
                                  <div style={{fontSize:10,color:'#AAA',marginBottom:3}}>DESKTOP</div>
                                  <a href={req.file_desktop_url} target="_blank" rel="noopener noreferrer">
                                    <img src={req.file_desktop_url} style={{width:180,height:45,objectFit:'cover',borderRadius:6,border:'1px solid #EDE8E0',cursor:'pointer'}} alt="desktop" title="Clique para ampliar"/>
                                  </a>
                                  <a href={`/api/download-banner?url=${encodeURIComponent(req.file_desktop_url)}&filename=banner-desktop-${req.company?.name||'empresa'}.png`} style={{display:'block',fontSize:10,color:'#C9951A',fontWeight:600,textDecoration:'none',marginTop:3,textAlign:'center'}}>⬇ Download</a>
                                </div>
                              )}
                              {req.file_mobile_url && (
                                <div>
                                  <div style={{fontSize:10,color:'#AAA',marginBottom:3}}>MOBILE</div>
                                  <a href={req.file_mobile_url} target="_blank" rel="noopener noreferrer">
                                    <img src={req.file_mobile_url} style={{width:68,height:45,objectFit:'cover',borderRadius:6,border:'1px solid #EDE8E0',cursor:'pointer'}} alt="mobile" title="Clique para ampliar"/>
                                  </a>
                                  <a href={`/api/download-banner?url=${encodeURIComponent(req.file_mobile_url)}&filename=banner-mobile-${req.company?.name||'empresa'}.png`} style={{display:'block',fontSize:10,color:'#C9951A',fontWeight:600,textDecoration:'none',marginTop:3,textAlign:'center'}}>⬇ Download</a>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        )
                      })()})}
                  </div>
                  )
                })()}
              </div>
            )}

            {/* ── CONFIGURAÇÕES ── */}
            {!loading && tab === 'configuracoes' && (
              <div style={{maxWidth:600}}>
                <div className="section-card">
                  <div className="section-hdr">
                    <span className="section-title">💳 MERCADO PAGO</span>
                  </div>
                  <div style={{padding:'20px 24px'}}>
                    <div style={{fontSize:13,color:'#666',marginBottom:16,lineHeight:1.6}}>
                      Cole aqui o <strong>Access Token de produção</strong> do Mercado Pago.<br/>
                      Encontre em: <span style={{color:'#C9951A'}}>mercadopago.com.br/developers → Credenciais de produção</span>
                    </div>
                    <div className="field">
                      <label>Access Token</label>
                      <input
                        type="password"
                        value={mpToken}
                        onChange={e => setMpToken(e.target.value)}
                        placeholder="APP_USR-..."
                        style={{fontFamily:'monospace',fontSize:12}}
                      />
                    </div>
                    {mpToken && (
                      <div style={{fontSize:11,color:'#0F8050',marginBottom:12}}>
                        ✓ Token configurado — {mpToken.substring(0,20)}...
                      </div>
                    )}
                    <div className="field" style={{marginTop:8}}>
                      <label>Webhook Secret (assinatura secreta)</label>
                      <input
                        type="password"
                        value={mpSecret}
                        onChange={e => setMpSecret(e.target.value)}
                        placeholder="Cole a assinatura secreta do webhook..."
                        style={{fontFamily:'monospace',fontSize:12}}
                      />
                    </div>
                    {mpSecret && (
                      <div style={{fontSize:11,color:'#0F8050',marginBottom:12}}>
                        ✓ Secret configurado
                      </div>
                    )}
                    <button
                      onClick={saveMpToken}
                      disabled={mpTokenSaving}
                      style={{padding:'10px 24px',background:'#C9951A',color:'#fff',border:'none',borderRadius:10,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'Inter,sans-serif',opacity:mpTokenSaving?0.6:1}}
                    >
                      {mpTokenSaving ? 'Salvando...' : 'Salvar token'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── ATIVIDADE ── */}
            {!loading && tab === 'atividade' && (
              <div className="section-card">
                <div className="section-hdr"><span className="section-title">CADASTROS RECENTES</span></div>
                <table className="data-table">
                  <thead><tr><th>Tipo</th><th>Nome</th><th>Detalhes</th><th>Data</th></tr></thead>
                  <tbody>
                    {[
                      ...companies.slice(0,10).map(c => ({ tipo:'empresa', nome:c.name, detalhe:`${c.category?.emoji||''} ${c.category?.name||'—'} · ${statusLabel(c.status)}`, date:c.created_at })),
                      ...users.filter(u=>u.user_type!=='admin').slice(0,10).map(u => ({ tipo:'usuario', nome:u.name, detalhe:`${u.user_type==='company'?'🏪 Lojista':'👤 Morador'} · ${u.neighborhood||'—'}`, date:u.created_at }))
                    ].sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime()).slice(0,20).map((item,i) => (
                      <tr key={i}>
                        <td><span className={`user-type-badge ${item.tipo==='empresa'?'type-company':'type-user'}`}>{item.tipo==='empresa'?'🏪 Empresa':'👤 Usuário'}</span></td>
                        <td><strong>{item.nome}</strong></td>
                        <td style={{color:'#888',fontSize:12}}>{item.detalhe}</td>
                        <td>{fmtDate(item.date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        </main>
      </div>
    </>
  )
}