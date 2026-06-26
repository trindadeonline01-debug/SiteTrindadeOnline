import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Trindade Online',
  description: 'O portal digital do bairro Trindade, São Gonçalo/RJ',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}