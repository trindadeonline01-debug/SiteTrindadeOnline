import type { Metadata } from 'next'
export const metadata: Metadata = {
  title: 'Categorias — Trindade Online',
  description: 'Explore comércios, gastronomia, serviços e igrejas do bairro Trindade em São Gonçalo/RJ.',
}
export default function Layout({ children }: { children: React.ReactNode }) { return <>{children}</> }
