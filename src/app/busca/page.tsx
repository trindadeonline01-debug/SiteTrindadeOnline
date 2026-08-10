import { createServerSupabase } from '@/lib/supabase-server'
import BuscaPageClient from '@/components/busca/BuscaPageClient'

export default async function BuscaPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  const query = (q || '').trim()

  if (!query) {
    return <BuscaPageClient initialQuery="" initialResults={null} />
  }

  const supabaseServer = await createServerSupabase()

  const [{ data: empData }, { data: catData }, { data: subcatData }] = await Promise.all([
    supabaseServer.rpc('buscar_empresas', { termo: query }),
    supabaseServer.from('categories').select('id, name, emoji, slug').ilike('name', `%${query}%`).limit(8),
    supabaseServer.from('subcategories').select('id, name, emoji').ilike('name', `%${query}%`).limit(10),
  ])

  const empresas = empData || []
  const cats = catData || []
  const subcats = subcatData || []

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

  const total = empresas.length + cats.length + subcats.length + desapega.length + empregos.length + imoveis.length + achados.length

  await supabaseServer.from('search_logs').insert({ query: query.toLowerCase(), results_count: total })

  return (
    <BuscaPageClient
      initialQuery={query}
      initialResults={{ empresas, cats, subcats, desapega, empregos, imoveis, achados, total }}
    />
  )
}
