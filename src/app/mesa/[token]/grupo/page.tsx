import type { Metadata } from 'next'
import GrupoClient from './GrupoClient'

// Quiz em grupo (jogo na mesa). Sem indexação: o endereço só interessa a quem está na mesa.
export const metadata: Metadata = {
  title: 'Quiz em grupo — Trindade Online',
  robots: { index: false, follow: false },
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <GrupoClient token={token} />
}
