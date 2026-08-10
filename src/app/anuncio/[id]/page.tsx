import { createServerSupabase } from '@/lib/supabase-server'
import AnuncioPageClient from '@/components/anuncio/AnuncioPageClient'

export default async function AnuncioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabaseServer = await createServerSupabase()

  const { data: listing } = await supabaseServer.from('listings').select('*,user:profiles(name),photos:listing_photos(url,order)').eq('id', id).maybeSingle()

  if (!listing) {
    return (
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'Inter,sans-serif',padding:24}}>
        <div style={{fontSize:48,marginBottom:12}}>🔍</div>
        <div style={{fontSize:18,fontWeight:700,marginBottom:16}}>Anúncio não encontrado</div>
        <a href="/" style={{color:'#C9951A'}}>← Voltar ao início</a>
      </div>
    )
  }

  return <AnuncioPageClient id={id} initialListing={listing as any} />
}
