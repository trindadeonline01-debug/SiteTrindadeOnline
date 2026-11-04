import type { Metadata } from 'next'
import QuizClient from './QuizClient'

// Quiz Pesca Premiada (jogo na mesa). Sem indexação: o endereço só interessa a quem está na mesa.
export const metadata: Metadata = {
  title: 'Quiz — Trindade Online',
  robots: { index: false, follow: false },
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <QuizClient token={token} />
}
