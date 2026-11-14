import type { Metadata } from 'next'
import RankingClient from './RankingClient'

// Ranking dos jogos da loja (pódio + lista). Sem indexação, igual à página de jogos.
export const metadata: Metadata = {
  title: 'Ranking — Trindade Online',
  robots: { index: false, follow: false },
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <RankingClient slug={slug} />
}
