import { cache } from 'react'
import type { Metadata } from 'next'
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
  loja_digital_enabled?: boolean
  subcategories?: CompanySubcat[]
  photos?: CompanyPhoto[]
  hours?: CompanyHour[]
  flexible_hours?: boolean
}
type Review = {
  id: string; rating: number; text?: string; created_at: string
  user?: { name: string }
  response?: { text: string }
}

const COMPANY_SELECT = '*, owner_id, trial_ends_at, loja_digital_enabled, category:categories(name,emoji,slug), subcategories:company_subcategories(subcategory_id, subcategory:subcategories(name,emoji)), photos:company_photos(id,url,order), hours:company_hours(label,hours,order,day_of_week,open_time,close_time,closed)'

// cache() dedupe: generateMetadata e a página em si pedem a mesma empresa
// na mesma requisição — sem isso seria uma consulta a mais no Supabase por visita.
const getCompany = cache(async (slug: string) => {
  const supabaseServer = await createServerSupabase()
  const { data } = await supabaseServer.from('companies').select(COMPANY_SELECT).eq('slug', slug).maybeSingle()
  return data as Company | null
})

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const company = await getCompany(slug)
  if (!company || company.status !== 'active') {
    return { title: 'Empresa não encontrada — Trindade Online' }
  }
  const title = `${company.name} — Trindade Online`
  const description = (company.description || '').trim()
    || `${company.name} no bairro Trindade, São Gonçalo/RJ — horário, avaliações e contato pelo Trindade Online.`
  const url = `https://trindadeonline.com.br/empresa/${slug}`
  const photoUrl = [...(company.photos || [])].sort((a, b) => a.order - b.order)[0]?.url

  // Quando tem foto, usa a URL direto (igual /anuncio/[id] — testado e
  // funcionando) em vez do opengraph-image.tsx gerado por código: o gerador
  // (Satori) depende do sharp pra decodificar as fotos, que hoje quase todas
  // estão em webp (o reparo automático de foto reconverte pra esse formato),
  // e o sharp está quebrando no ambiente serverless da Vercel. Sem foto, cai
  // pro opengraph-image.tsx (fundo com gradiente + nome, sem depender de foto).
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title, description, url, siteName: 'Trindade Online', locale: 'pt_BR', type: 'website',
      ...(photoUrl ? { images: [{ url: photoUrl, width: 1200, height: 630, alt: company.name }] } : {}),
    },
    twitter: {
      card: 'summary_large_image', title, description,
      ...(photoUrl ? { images: [photoUrl] } : {}),
    },
  }
}

export default async function EmpresaPerfilPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  // O login guarda a sessão no localStorage do navegador (não em cookie),
  // então esse cliente de servidor nunca vê quem está logado — serve só
  // pra buscar o dado público da empresa (mesmo pra visitante anônimo).
  // Quem é o usuário (admin, dono, favoritou, já avaliou) é resolvido no
  // navegador pelo EmpresaPerfilClient, igual sempre foi.
  const supabaseServer = await createServerSupabase()

  const company = await getCompany(slug)

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
