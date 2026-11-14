import type { Metadata } from 'next'
import CacaClient from './CacaClient'

// Caça-Palavras da loja. Sem indexação, igual à página de jogos.
export const metadata: Metadata = {
  title: 'Caça-Palavras — Trindade Online',
  robots: { index: false, follow: false },
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <CacaClient modo="loja" chave={slug} />
}
