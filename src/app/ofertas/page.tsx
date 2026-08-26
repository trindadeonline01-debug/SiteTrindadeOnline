import type { Metadata } from 'next'
import OfertasPageClient from '@/components/ofertas/OfertasPageClient'

export const metadata: Metadata = {
  title: 'Ofertas — Cupons Relâmpago | Trindade Online',
  description: 'Cupons relâmpago dos comércios e serviços do bairro Trindade, São Gonçalo/RJ.',
  alternates: { canonical: 'https://trindadeonline.com.br/ofertas' },
  openGraph: {
    title: 'Ofertas — Cupons Relâmpago | Trindade Online',
    description: 'Cupons relâmpago dos comércios e serviços do bairro Trindade, São Gonçalo/RJ.',
    url: 'https://trindadeonline.com.br/ofertas',
    siteName: 'Trindade Online',
    locale: 'pt_BR',
    type: 'website',
  },
}

// Promoções da Semana desligada daqui a pedido do Ricardo (set/2026) —
// desativado até segunda ordem, sem formato visual bom ainda. Ver
// comentário em OfertasPageClient.tsx pra religar quando tiver aprovado.
export default function OfertasPage() {
  return <OfertasPageClient />
}
