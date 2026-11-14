import type { Metadata } from 'next'
import QuizClient from '@/app/mesa/[token]/quiz/QuizClient'

// Quiz aberto pela página de jogos (sem mesa): vale só para o ranking, nunca para cashback.
export const metadata: Metadata = {
  title: 'Quiz — Trindade Online',
  robots: { index: false, follow: false },
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <QuizClient token={`loja:${slug}`} />
}
