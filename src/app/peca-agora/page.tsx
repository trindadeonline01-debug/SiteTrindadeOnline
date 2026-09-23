import type { Metadata } from 'next'
import { createServerSupabase } from '@/lib/supabase-server'
import { buildPecaAgoraGroups } from '@/lib/pecaAgora.server'
import PecaAgoraPageClient from '@/components/pecaAgora/PecaAgoraPageClient'

export const metadata: Metadata = {
  title: 'Peça Agora — Delivery na Trindade | Trindade Online',
  description: 'Peça comida e produtos de todas as empresas com cardápio digital do bairro Trindade, São Gonçalo/RJ — tudo num lugar só.',
  alternates: { canonical: 'https://trindadeonline.com.br/peca-agora' },
  openGraph: {
    title: 'Peça Agora — Delivery na Trindade',
    description: 'Peça comida e produtos de todas as empresas com cardápio digital do bairro Trindade.',
    url: 'https://trindadeonline.com.br/peca-agora',
    siteName: 'Trindade Online',
    locale: 'pt_BR',
    type: 'website',
  },
}

export default async function PecaAgoraPage() {
  const supabaseServer = await createServerSupabase()
  const { data: settings } = await supabaseServer.from('site_settings').select('key,value')
  const enabled = (settings || []).find((s: any) => s.key === 'peca_agora_enabled')?.value === 'true'
  const groups = enabled ? await buildPecaAgoraGroups(supabaseServer) : []
  return <PecaAgoraPageClient groups={groups} />
}
