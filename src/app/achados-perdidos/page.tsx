import { createServerSupabase } from '@/lib/supabase-server'
import AchadosPerdidosPageClient from '@/components/listings/AchadosPerdidosPageClient'

export default async function AchadosPerdidosPage(){
  const supabaseServer = await createServerSupabase()
  const { data } = await supabaseServer.from('listings')
    .select('id,title,description,price,price_label,address,subtype,created_at,status,user:profiles(name),photos:listing_photos(url,order)')
    .eq('type','achado').eq('status','active').order('created_at',{ascending:false})

  return <AchadosPerdidosPageClient initialListings={data || []} />
}
