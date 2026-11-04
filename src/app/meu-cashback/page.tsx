import type { Metadata } from 'next'
import MeuCashbackClient from './MeuCashbackClient'

// Área do cliente, depois do código no WhatsApp. Não indexa.
export const metadata: Metadata = {
  title: 'Meu cashback — Trindade Online',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <MeuCashbackClient />
}
