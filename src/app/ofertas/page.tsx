import type { Metadata } from 'next'
import { createServerSupabase } from '@/lib/supabase-server'
import OfertasPageClient from '@/components/ofertas/OfertasPageClient'

export const metadata: Metadata = {
  title: 'Ofertas — Cupons e Promoções | Trindade Online',
  description: 'Cupons relâmpago e promoções da semana dos comércios e serviços do bairro Trindade, São Gonçalo/RJ.',
  alternates: { canonical: 'https://trindadeonline.com.br/ofertas' },
  openGraph: {
    title: 'Ofertas — Cupons e Promoções | Trindade Online',
    description: 'Cupons relâmpago e promoções da semana dos comércios e serviços do bairro Trindade, São Gonçalo/RJ.',
    url: 'https://trindadeonline.com.br/ofertas',
    siteName: 'Trindade Online',
    locale: 'pt_BR',
    type: 'website',
  },
}

export default async function OfertasPage() {
  const supabaseServer = await createServerSupabase()
  const { data } = await supabaseServer.from('promotions')
    .select('id,title,image_url,starts_at,expires_at,company:companies(id,name,slug,category:categories(name,emoji))')
    .eq('status', 'active')
    .lte('starts_at', new Date().toISOString())
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  return <OfertasPageClient initialPromos={(data as any) || []} />
}
