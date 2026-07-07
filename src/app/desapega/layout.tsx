import type { Metadata } from 'next'
export const metadata: Metadata = {
  title: 'Desapega Trindade — Compra e Venda no Bairro',
  description: 'Anúncios de compra e venda de produtos usados no bairro Trindade em São Gonçalo/RJ.',
  openGraph: { title: 'Desapega Trindade', description: 'Compra e venda de produtos no bairro Trindade em São Gonçalo/RJ.', url: 'https://trindadeonline.com.br/desapega' }
}
export default function Layout({ children }: { children: React.ReactNode }) { return <>{children}</> }
