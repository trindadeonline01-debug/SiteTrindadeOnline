import { createServerSupabase } from '@/lib/supabase-server'
import BuscaPageClient from '@/components/busca/BuscaPageClient'

export default async function BuscaPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  const query = (q || '').trim()
  const supabaseServer = await createServerSupabase()
  const { data: flagRow } = await supabaseServer.from('feature_flags').select('enabled').eq('key', 'busca_produtos_enabled').maybeSingle()
  const produtosEnabled = !!flagRow?.enabled

  if (!query) {
    return <BuscaPageClient initialQuery="" initialResults={null} produtosEnabled={produtosEnabled} />
  }

  const [{ data: empData }, { data: catData }, { data: subcatData }] = await Promise.all([
    supabaseServer.rpc('buscar_empresas', { termo: query }),
    supabaseServer.from('categories').select('id, name, emoji, slug').ilike('name', `%${query}%`).limit(8),
    supabaseServer.from('subcategories').select('id, name, emoji').ilike('name', `%${query}%`).limit(10),
  ])

  const empresas = empData || []
  const cats = catData || []
  const subcats = subcatData || []

  // Índice de produtos — construído, mas fica desligado até ter massa
  // mínima de catálogos cadastrados (ESPECIFICACAO.md §7.4): vitrine com
  // 4 itens queima a ideia. Liga direto no banco (feature_flags,
  // busca_produtos_enabled) quando fizer sentido, sem precisar de deploy.
  let produtos: any[] = []
  if (produtosEnabled) {
    const { data } = await supabaseServer
      .from('loja_produtos')
      .select('id,name,sale_price,photo_url,promo_type,promo_value,promo_starts_at,promo_ends_at,company:companies!inner(id,name,slug,status,loja_digital_enabled)')
      .eq('active', true)
      .not('photo_url', 'is', null)
      .eq('company.status', 'active')
      .eq('company.loja_digital_enabled', true)
      .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
      .limit(12)
    produtos = ((data || []) as any[]).map(p => ({ ...p, company: Array.isArray(p.company) ? p.company[0] : p.company }))
  }

  const searchListings = async (type: string) => {
    const { data } = await supabaseServer
      .from('listings')
      .select('id, type, title, price, address, subtype, created_at, photos:listing_photos(url,order)')
      .eq('status', 'active')
      .eq('type', type)
      .or(`title.ilike.%${query}%,description.ilike.%${query}%,address.ilike.%${query}%`)
      .order('created_at', { ascending: false })
      .limit(8)
    return data || []
  }

  const [desapega, empregos, imoveis, achados] = await Promise.all([
    searchListings('desapega'),
    searchListings('emprego'),
    searchListings('imovel'),
    searchListings('achado'),
  ])

  const total = empresas.length + cats.length + subcats.length + desapega.length + empregos.length + imoveis.length + achados.length + produtos.length

  await supabaseServer.from('search_logs').insert({ query: query.toLowerCase(), results_count: total })

  return (
    <BuscaPageClient
      initialQuery={query}
      initialResults={{ empresas, cats, subcats, desapega, empregos, imoveis, achados, produtos, total }}
      produtosEnabled={produtosEnabled}
    />
  )
}
