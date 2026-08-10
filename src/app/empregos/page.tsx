import { createServerSupabase } from '@/lib/supabase-server'
import EmpregosPageClient from '@/components/listings/EmpregosPageClient'

export default async function EmpregosPage(){
  const supabaseServer = await createServerSupabase()
  const { data } = await supabaseServer.from('listings')
    .select('id,title,description,price,price_label,address,subtype,metadata,created_at,status,user:profiles(name),photos:listing_photos(url,order)')
    .eq('type','emprego').eq('status','active').order('created_at',{ascending:false})

  return <EmpregosPageClient initialListings={data || []} />
}
