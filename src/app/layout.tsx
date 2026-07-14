import type { Metadata } from 'next'
import './globals.css'
import Script from 'next/script'
import BottomNav from '@/components/BottomNav'
import TopNav from '@/components/TopNav'

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

const GTM_ID = 'GTM-P3889L2G'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <Script
          id="gtm-head"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`
          }}
        />
      </head>
      <body>
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            height="0"
            width="0"
            style={{display:'none',visibility:'hidden'}}
          />
        </noscript>
        <TopNav />
        {children}
        <BottomNav />
        <Script src='https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js' strategy='afterInteractive'/>
      </body>
    </html>
  )
}