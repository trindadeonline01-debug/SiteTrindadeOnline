import { createServerSupabase } from '@/lib/supabase-server'
import CategoriaPageClient from '@/components/categoria/CategoriaPageClient'

export default async function CategoriaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabaseServer = await createServerSupabase()

  const { data: category } = await supabaseServer.from('categories').select('*').eq('slug', slug).maybeSingle()

  if (!category) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100vh', fontFamily:'Inter,sans-serif', padding:24, background:'#F0EDE8' }}>
        <div style={{ fontSize:56, marginBottom:16 }}>📂</div>
        <div style={{ fontSize:20, fontWeight:700, marginBottom:8 }}>Categoria não encontrada</div>
        <a href="/" style={{ background:'#C9951A', color:'#fff', padding:'12px 28px', borderRadius:12, textDecoration:'none', fontWeight:600, marginTop:16 }}>← Voltar ao início</a>
      </div>
    )
  }

  const [{ data: subs }, { data: comps }, { data: hlData }] = await Promise.all([
    supabaseServer.from('subcategories').select('id, name, emoji, slug').eq('category_id', category.id).order('name'),
    supabaseServer.from('companies')
      .select('id, name, slug, avg_rating, address, plan, description, tags, photos:company_photos(url,order), subcategories:company_subcategories(subcategory:subcategories(id,name,emoji))')
      .eq('status', 'active').eq('category_id', category.id)
      .order('avg_rating', { ascending: false }),
    supabaseServer.from('highlights')
      .select('id, company_id, company:companies(name,slug,avg_rating,category:categories(name,emoji))')
      .eq('active', true).eq('level', 'category').eq('category_id', category.id)
      .order('display_order'),
  ])

  const companies = comps || []

  let highlights: any[] = []
  if (hlData && hlData.length > 0) {
    const ids = hlData.map((h: any) => h.company_id)
    const { data: photos } = await supabaseServer
      .from('company_photos').select('company_id,url,order').in('company_id', ids).order('order')
    highlights = [...hlData].sort(() => Math.random() - 0.5).map((h: any) => ({
      ...h, company: { ...h.company, photos: photos?.filter((p: any) => p.company_id === h.company_id) || [] }
    }))
  }

  return (
    <CategoriaPageClient
      slug={slug}
      category={category}
      subcats={subs || []}
      companies={companies}
      highlights={highlights}
    />
  )
}
