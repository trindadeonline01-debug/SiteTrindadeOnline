import type { Metadata } from 'next'
export const metadata: Metadata = {
  title: 'Empregos na Trindade — Vagas em São Gonçalo',
  description: 'Vagas de emprego no bairro Trindade e região de São Gonçalo/RJ.',
  openGraph: { title: 'Empregos na Trindade', description: 'Vagas de emprego no bairro Trindade em São Gonçalo/RJ.', url: 'https://trindadeonline.com.br/empregos' }
}
export default function Layout({ children }: { children: React.ReactNode }) { return <>{children}</> }
