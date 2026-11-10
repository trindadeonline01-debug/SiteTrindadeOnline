import type { Metadata } from 'next'
import AcompanharClient from './AcompanharClient'

export const metadata: Metadata = {
  title: 'Acompanhar entrega — Trindade Online',
  robots: { index: false, follow: false },
}

export default async function AcompanharPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <AcompanharClient token={token} />
}
