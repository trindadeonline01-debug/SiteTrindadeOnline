import { createServerSupabase } from '@/lib/supabase-server'
import DesapegaPageClient from '@/components/listings/DesapegaPageClient'

export default async function DesapegaPage(){
  const supabaseServer = await createServerSupabase()
  const { data } = await supabaseServer.from('listings')
    .select('id,title,description,price,price_label,address,subtype,created_at,status,user:profiles(name),photos:listing_photos(url,order)')
    .eq('type','desapega').eq('status','active').order('created_at',{ascending:false})

  return <DesapegaPageClient initialListings={data || []} />
}
