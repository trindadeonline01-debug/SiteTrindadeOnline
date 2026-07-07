import type { Metadata } from 'next'
export const metadata: Metadata = {
  title: 'Imóveis na Trindade São Gonçalo — Casas e Apartamentos',
  description: 'Casas e apartamentos para alugar ou comprar no bairro Trindade em São Gonçalo/RJ.',
  openGraph: { title: 'Imóveis na Trindade', description: 'Casas e apartamentos no bairro Trindade em São Gonçalo/RJ.', url: 'https://trindadeonline.com.br/imoveis' }
}
export default function Layout({ children }: { children: React.ReactNode }) { return <>{children}</> }
