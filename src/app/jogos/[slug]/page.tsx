import type { Metadata } from 'next'
import JogosClient from './JogosClient'

// Página de jogos da loja. Sem indexação: é um endereço para quem já é cliente da loja.
export const metadata: Metadata = {
  title: 'Jogos — Trindade Online',
  robots: { index: false, follow: false },
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <JogosClient slug={slug} />
}
