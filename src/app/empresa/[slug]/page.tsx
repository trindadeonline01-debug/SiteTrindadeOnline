import { createServerSupabase } from '@/lib/supabase-server'
import EmpresaPerfilClient from '@/components/empresa/EmpresaPerfilClient'

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
}
type Review = {
  id: string; rating: number; text?: string; created_at: string
  user?: { name: string }
  response?: { text: string }
}

const COMPANY_SELECT = '*, owner_id, trial_ends_at, category:categories(name,emoji,slug), subcategories:company_subcategories(subcategory_id, subcategory:subcategories(name,emoji)), photos:company_photos(id,url,order), hours:company_hours(label,hours,order,day_of_week,open_time,close_time,closed)'

export default async function EmpresaPerfilPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  // O login guarda a sessão no localStorage do navegador (não em cookie),
  // então esse cliente de servidor nunca vê quem está logado — serve só
  // pra buscar o dado público da empresa (mesmo pra visitante anônimo).
  // Quem é o usuário (admin, dono, favoritou, já avaliou) é resolvido no
  // navegador pelo EmpresaPerfilClient, igual sempre foi.
  const supabaseServer = await createServerSupabase()

  const { data: company } = await supabaseServer.from('companies').select(COMPANY_SELECT).eq('slug', slug).maybeSingle()

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

  return (
    <EmpresaPerfilClient
      slug={slug}
      initialCompany={company as Company}
      initialReviews={(reviews || []) as Review[]}
    />
  )
}
