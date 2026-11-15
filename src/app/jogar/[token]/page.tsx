import type { Metadata } from 'next'
import { CACA_PALAVRAS_ATIVO } from '@/lib/jogosFlags'
import JogarClient from './JogarClient'

// Entrada do link do WhatsApp depois de um pedido de delivery pago: identifica o cliente e mostra os jogos.
// Vale a primeira jogada (Quiz ou Caça-Palavras). Regras em src/lib/jogoPedido.ts.
export const metadata: Metadata = {
  title: '🎣 Jogue e ganhe cashback',
  description: 'Quiz ou Caça-Palavras: a sua primeira jogada vale cashback para a próxima compra.',
  robots: { index: false, follow: false },
  openGraph: { title: '🎣 Jogue e ganhe cashback', description: 'Quiz ou Caça-Palavras: a sua primeira jogada vale cashback para a próxima compra.', siteName: 'Trindade Online', locale: 'pt_BR', type: 'website' },
  twitter: { card: 'summary_large_image' },
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <JogarClient token={token} caca={CACA_PALAVRAS_ATIVO} />
}
