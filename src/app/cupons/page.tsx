import type { Metadata } from 'next'
import CuponsPageClient from '@/components/cupons/CuponsPageClient'

export const metadata: Metadata = {
  title: 'Cupons Relâmpago — Trindade Online',
  description: 'Descontos exclusivos das empresas do bairro Trindade, São Gonçalo/RJ — quantidade limitada.',
  alternates: { canonical: 'https://trindadeonline.com.br/cupons' },
  openGraph: {
    title: 'Cupons Relâmpago — Trindade Online',
    description: 'Descontos exclusivos das empresas do bairro Trindade, São Gonçalo/RJ — quantidade limitada.',
    url: 'https://trindadeonline.com.br/cupons',
    siteName: 'Trindade Online',
    locale: 'pt_BR',
    type: 'website',
  },
}

export default function CuponsPage() {
  return <CuponsPageClient />
}
