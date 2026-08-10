import { createServerSupabase } from '@/lib/supabase-server'
import ImoveisPageClient from '@/components/listings/ImoveisPageClient'

export default async function ImoveisPage(){
  const supabaseServer = await createServerSupabase()
  const { data } = await supabaseServer.from('listings')
    .select('id,title,description,price,price_label,address,subtype,created_at,status,user:profiles(name),photos:listing_photos(url,order)')
    .eq('type','imovel').eq('status','active').order('created_at',{ascending:false})

  return <ImoveisPageClient initialListings={data || []} />
}
