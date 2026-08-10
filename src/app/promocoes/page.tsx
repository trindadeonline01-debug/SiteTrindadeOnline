import { createServerSupabase } from '@/lib/supabase-server'
import PromocoesPageClient from '@/components/promocoes/PromocoesPageClient'

export default async function PromocoesPage() {
  const supabaseServer = await createServerSupabase()
  const { data } = await supabaseServer.from('promotions')
    .select('id,title,image_url,starts_at,expires_at,company:companies(id,name,slug,category:categories(name,emoji))')
    .eq('status', 'active')
    .lte('starts_at', new Date().toISOString())
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  return <PromocoesPageClient initialPromos={(data as any) || []} />
}
