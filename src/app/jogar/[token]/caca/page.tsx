import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CACA_PALAVRAS_ATIVO } from '@/lib/jogosFlags'
import CacaClient from '@/app/jogos/[slug]/caca/CacaClient'

// Caça-Palavras pelo link do WhatsApp depois de um pedido de delivery pago (src/lib/jogoPedido.ts).
export const metadata: Metadata = {
  title: 'Caça-Palavras — Trindade Online',
  robots: { index: false, follow: false },
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  if (!CACA_PALAVRAS_ATIVO) notFound()
  const { token } = await params
  return <CacaClient modo="pedido" chave={token} />
}
