import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import JogosClient from './JogosClient'

// Página de jogos da loja. Sem indexação: é um endereço para quem já é cliente da loja.
// Título e descrição da prévia no WhatsApp com o nome da loja (a imagem vem de opengraph-image.tsx).
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { data } = await sb.from('companies').select('name').eq('slug', slug).maybeSingle()
  const loja = String(data?.name || '').trim()
  const title = loja ? `🎮 Jogos da ${loja}` : 'Jogos — Trindade Online'
  const description = 'Quiz e Caça-Palavras para jogar enquanto seu pedido fica pronto. Suba no ranking da loja!'
  return {
    title, description, robots: { index: false, follow: false },
    openGraph: { title, description, siteName: 'Trindade Online', locale: 'pt_BR', type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <JogosClient slug={slug} />
}
