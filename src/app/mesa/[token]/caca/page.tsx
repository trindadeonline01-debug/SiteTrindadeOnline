import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CACA_PALAVRAS_ATIVO } from '@/lib/jogosFlags'
import CacaClient from '@/app/jogos/[slug]/caca/CacaClient'

// Caça-Palavras pelo QR da mesa: aqui o % garantido pode virar cashback quando a conta é paga. Sem indexação.
export const metadata: Metadata = {
  title: 'Caça-Palavras — Trindade Online',
  robots: { index: false, follow: false },
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  if (!CACA_PALAVRAS_ATIVO) notFound()
  const { token } = await params
  return <CacaClient modo="mesa" chave={token} />
}
