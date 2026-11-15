import type { Metadata } from 'next'
import ConfirmarClient from './ConfirmarClient'

export const metadata: Metadata = {
  title: 'Confirmar cashback — Trindade Online',
  robots: { index: false, follow: false },
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <ConfirmarClient token={token} />
}
