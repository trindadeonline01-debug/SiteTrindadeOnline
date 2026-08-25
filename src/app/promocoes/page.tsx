import type { Metadata } from 'next'
import { createServerSupabase } from '@/lib/supabase-server'
import PromocoesPageClient from '@/components/promocoes/PromocoesPageClient'

export const metadata: Metadata = {
  title: 'Promoções da Semana — Trindade Online',
  description: 'Promoções ativas dos comércios e serviços do bairro Trindade, São Gonçalo/RJ.',
  alternates: { canonical: 'https://trindadeonline.com.br/promocoes' },
  openGraph: {
    title: 'Promoções da Semana — Trindade Online',
    description: 'Promoções ativas dos comércios e serviços do bairro Trindade, São Gonçalo/RJ.',
    url: 'https://trindadeonline.com.br/promocoes',
    siteName: 'Trindade Online',
    locale: 'pt_BR',
    type: 'website',
  },
}

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
