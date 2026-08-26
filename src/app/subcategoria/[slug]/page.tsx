import { cache } from 'react'
import type { Metadata } from 'next'
import { createServerSupabase } from '@/lib/supabase-server'
import SubcategoriaPageClient from '@/components/categoria/SubcategoriaPageClient'

const getSubcat = cache(async (slug: string) => {
  const supabaseServer = await createServerSupabase()
  const { data } = await supabaseServer
    .from('subcategories')
    .select('*, category:categories(id,name,emoji,slug)')
    .eq('slug', slug)
    .maybeSingle()
  return data
})

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const subcat = await getSubcat(slug)
  if (!subcat) return { title: 'Subcategoria não encontrada — Trindade Online' }
  const title = `${subcat.name} na Trindade — Trindade Online`
  const description = `Negócios de ${subcat.name} no bairro Trindade, São Gonçalo/RJ.`
  const url = `https://trindadeonline.com.br/subcategoria/${slug}`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: 'Trindade Online', locale: 'pt_BR', type: 'website' },
    twitter: { card: 'summary', title, description },
  }
}

export default async function SubcategoriaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabaseServer = await createServerSupabase()

  const subcat = await getSubcat(slug)

  if (!subcat) {
    return (
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'Archivo,sans-serif',padding:24,background:'var(--concrete)'}}>
        <div style={{fontSize:56,marginBottom:16}}>📂</div>
        <div style={{fontSize:20,fontWeight:700,marginBottom:8}}>Subcategoria não encontrada</div>
        <a href="/" style={{background:'var(--sign)',color:'var(--ink)',padding:'12px 28px',borderRadius:12,textDecoration:'none',fontWeight:600,marginTop:16}}>← Voltar ao início</a>
      </div>
    )
  }

  const { data: links } = await supabaseServer.from('company_subcategories').select('company_id').eq('subcategory_id', subcat.id)
  const companyIds = links?.map((r: any) => r.company_id) || []

  const { data: comps } = await supabaseServer
    .from('companies')
    .select('id, name, slug, avg_rating, address, photos:company_photos(url,order)')
    .eq('status', 'active')
    .in('id', companyIds)
    .order('avg_rating', { ascending: false })

  return <SubcategoriaPageClient subcat={subcat as any} companies={comps || []} />
}
