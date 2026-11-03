import type { Metadata } from 'next'
import MesaClient from './MesaClient'

// Página pública da mesa (QR). Sem indexação: cada mesa tem o próprio endereço
// e ele só interessa a quem está sentado nela.
export const metadata: Metadata = {
  title: 'Sua mesa — Trindade Online',
  robots: { index: false, follow: false },
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <MesaClient token={token} />
}
