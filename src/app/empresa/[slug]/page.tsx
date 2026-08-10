import { createServerSupabase } from '@/lib/supabase-server'
import EmpresaPerfilClient from '@/components/empresa/EmpresaPerfilClient'

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

const COMPANY_SELECT = '*, owner_id, trial_ends_at, category:categories(name,emoji,slug), subcategories:company_subcategories(subcategory_id, subcategory:subcategories(name,emoji)), photos:company_photos(id,url,order), hours:company_hours(label,hours,order)'

export default async function EmpresaPerfilPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabaseServer = await createServerSupabase()

  const [{ data: company }, { data: { session } }] = await Promise.all([
    supabaseServer.from('companies').select(COMPANY_SELECT).eq('slug', slug).maybeSingle(),
    supabaseServer.auth.getSession(),
  ])

  if (!company || company.status !== 'active') {
    return (
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'Inter,sans-serif',padding:24,background:'#F0EDE8'}}>
        <div style={{fontSize:56,marginBottom:16}}>🏪</div>
        <div style={{fontSize:20,fontWeight:700,marginBottom:8}}>Empresa não encontrada</div>
        <div style={{fontSize:13,color:'#AAA',marginBottom:24}}>Esta empresa não existe ou não está ativa.</div>
        <a href="/" style={{background:'#C9951A',color:'#fff',padding:'12px 28px',borderRadius:12,textDecoration:'none',fontWeight:600}}>Voltar ao início</a>
      </div>
    )
  }

  const { data: reviews } = await supabaseServer.from('reviews')
    .select('*, user:profiles(name), response:review_responses(text)')
    .eq('company_id', company.id)
    .order('created_at', { ascending: false })

  let userId: string | null = null
  let isAdmin = false
  let isOwner = false
  let isFav = false
  let alreadyReviewed = false
  let allCategories: SimpleCategory[] = []
  let allSubcats: SimpleSubcategory[] = []

  if (session) {
    userId = session.user.id
    const now = new Date()
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay())
    weekStart.setHours(0, 0, 0, 0)

    // Fav / já-avaliou-essa-semana / perfil não dependem entre si — juntas em paralelo
    const [{ data: fav }, { data: myReview }, { data: prof }] = await Promise.all([
      supabaseServer.from('favorites').select('id').eq('user_id', session.user.id).eq('entity_type', 'company').eq('entity_id', company.id).maybeSingle(),
      supabaseServer.from('reviews').select('id').eq('user_id', session.user.id).eq('company_id', company.id).gte('created_at', weekStart.toISOString()).maybeSingle(),
      supabaseServer.from('profiles').select('user_type').eq('id', session.user.id).single(),
    ])
    isFav = !!fav
    alreadyReviewed = !!myReview
    isAdmin = prof?.user_type === 'admin'
    isOwner = company.owner_id === session.user.id || isAdmin

    if (isAdmin) {
      const [{ data: catsData }, { data: subcatsData }] = await Promise.all([
        supabaseServer.from('categories').select('id,name,emoji').order('name'),
        supabaseServer.from('subcategories').select('id,name,emoji,category_id').eq('active', true).order('order'),
      ])
      allCategories = catsData || []
      allSubcats = subcatsData || []
    }
  }

  return (
    <EmpresaPerfilClient
      slug={slug}
      initialCompany={company as Company}
      initialReviews={(reviews || []) as Review[]}
      initialUserId={userId}
      initialIsAdmin={isAdmin}
      initialIsOwner={isOwner}
      initialIsFav={isFav}
      initialAlreadyReviewed={alreadyReviewed}
      initialAllCategories={allCategories}
      initialAllSubcats={allSubcats}
    />
  )
}
