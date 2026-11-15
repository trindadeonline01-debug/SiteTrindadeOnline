import type { Metadata } from 'next'
import QuizClient from '@/app/mesa/[token]/quiz/QuizClient'

// Quiz pelo link do WhatsApp depois de um pedido de delivery pago: vale cashback na hora (src/lib/jogoPedido.ts).
export const metadata: Metadata = {
  title: 'Quiz Pesca Premiada — Trindade Online',
  robots: { index: false, follow: false },
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <QuizClient token={`pedido:${token}`} />
}
