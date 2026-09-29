import type { Metadata } from 'next'
import { createServerSupabase } from '@/lib/supabase-server'
import { buildPecaAgoraGroups } from '@/lib/pecaAgora.server'
import PecaAgoraPageClient from '@/components/pecaAgora/PecaAgoraPageClient'

// Imagem fixa (não muda por request nem por produto) — pedido do Ricardo,
// set/2026, depois da confusão com o preview do cardápio puxando fotos
// erradas/em cache: em vez de tentar puxar foto de produto ou deixar sem
// imagem, o preview desse link sempre mostra o mesmo banner de marca
// (public/og-peca-agora.png, 1200x630), com as 8 categorias na ordem que
// ele pediu. Gerada localmente (fora do fluxo do site) e versionada como
// arquivo estático — não é um opengraph-image.tsx dinâmico de propósito.
const OG_IMAGE = 'https://trindadeonline.com.br/og-peca-agora.png'

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
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: 'Peça Agora — Delivery na Trindade' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Peça Agora — Delivery na Trindade',
    description: 'Peça comida e produtos de todas as empresas com cardápio digital do bairro Trindade.',
    images: [OG_IMAGE],
  },
}

export default async function PecaAgoraPage() {
  const supabaseServer = await createServerSupabase()
  const { data: settings } = await supabaseServer.from('site_settings').select('key,value')
  const enabled = (settings || []).find((s: any) => s.key === 'peca_agora_enabled')?.value === 'true'
  const groups = enabled ? await buildPecaAgoraGroups(supabaseServer) : []
  return <PecaAgoraPageClient groups={groups} />
}
