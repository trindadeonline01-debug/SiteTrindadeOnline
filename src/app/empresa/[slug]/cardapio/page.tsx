import type { Metadata } from 'next'
import { createServerSupabase } from '@/lib/supabase-server'
import { getCardapioOgImage } from '@/lib/cardapioOg'
import CardapioClient from './CardapioClient'

// A tela de cardápio sempre foi 'use client' (carrinho, checkout, tudo no
// navegador) — mas metadata (og:image pro preview do WhatsApp) só pode vir
// de um Server Component. Esse page.tsx faz só isso e delega o resto pro
// CardapioClient, que continua com a mesma lógica de sempre.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const supabaseServer = await createServerSupabase()
  const { data: company } = await supabaseServer
    .from('companies')
    .select('id, name, description, status, loja_digital_enabled, photos:company_photos(url, order)')
    .eq('slug', slug).maybeSingle()

  if (!company || company.status !== 'active' || !company.loja_digital_enabled) {
    return { title: 'Cardápio não encontrado — Trindade Online' }
  }

  // <title> da aba continua descritivo (bom pra SEO/resultado de busca) —
  // só o preview do link (WhatsApp) precisa ser enxuto: só o nome, sem
  // descrição embaixo (pedido do Ricardo, set/2026: "não pode ter
  // descrição, vamos manter só o nome").
  const title = `Cardápio ${company.name} — Trindade Online`
  const description = (company.description || '').trim()
    || `Peça pelo cardápio digital de ${company.name}, direto pelo Trindade Online.`
  const url = `https://trindadeonline.com.br/empresa/${slug}/cardapio`
  const rawPhotoUrl = [...(company.photos || [])].sort((a, b) => a.order - b.order)[0]?.url
  // Recorta em paisagem (1200x630) — a foto original geralmente é quadrada/
  // retrato, e sem recorte o WhatsApp mostra ela esticada, ocupando a tela
  // toda no preview (pedido do Ricardo, set/2026). Sem foto nenhuma, cai pro
  // opengraph-image.tsx (gradiente + nome).
  const photoUrl = rawPhotoUrl ? await getCardapioOgImage(rawPhotoUrl, company.id) : null

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: company.name, description: '', url, siteName: 'Trindade Online', locale: 'pt_BR', type: 'website',
      ...(photoUrl ? { images: [{ url: photoUrl, width: 1200, height: 630, alt: company.name }] } : {}),
    },
    twitter: {
      card: 'summary_large_image', title: company.name, description: '',
      ...(photoUrl ? { images: [photoUrl] } : {}),
    },
  }
}

export default function CardapioPage({ params }: { params: Promise<{ slug: string }> }) {
  return <CardapioClient params={params} />
}
