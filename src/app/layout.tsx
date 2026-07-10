import type { Metadata } from 'next'
import './globals.css'
import BottomNav from '@/components/BottomNav'

export const metadata: Metadata = {
  title: 'Trindade Online — Comércios, Serviços e Moradores do Bairro Trindade',
  description: 'O portal digital do bairro Trindade em São Gonçalo/RJ. Encontre comércios, restaurantes, serviços, empregos, imóveis e muito mais.',
  keywords: ['Trindade', 'São Gonçalo', 'comércio local', 'serviços Trindade', 'empregos São Gonçalo', 'bairro Trindade RJ'],
  openGraph: {
    title: 'Trindade Online — O portal digital do bairro Trindade',
    description: 'Conectando moradores, comércios e serviços do bairro Trindade em São Gonçalo/RJ.',
    url: 'https://trindadeonline.com.br',
    siteName: 'Trindade Online',
    images: [{ url: 'https://trindadeonline.com.br/og-image.png', width: 1200, height: 630, alt: 'Trindade Online' }],
    locale: 'pt_BR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Trindade Online',
    description: 'O portal digital do bairro Trindade em São Gonçalo/RJ.',
    images: ['https://trindadeonline.com.br/og-image.png'],
  },
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://trindadeonline.com.br' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}<BottomNav /></body>
    </html>
  )
}
