import type { Metadata } from 'next'
import { createServerSupabase } from '@/lib/supabase-server'
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
  // descrição, vamos manter só o nome"). A imagem tinha sido tirada nessa
  // época ("tô ocupando muito espaço"), mas sem ela o WhatsApp cai no
  // ícone genérico do site inteiro — achado real do Ricardo, out/2026:
  // mandar o link do cardápio da loja mostrava a logo do Trindade Online,
  // não da loja. Volta a foto da própria empresa (mesmo padrão já
  // funcionando em /empresa/[slug] e /anuncio/[id] — URL direto, sem
  // passar pelo opengraph-image.tsx/Satori, que quebra com foto em webp).
  const title = `Cardápio ${company.name} — Trindade Online`
  const description = (company.description || '').trim()
    || `Peça pelo cardápio digital de ${company.name}, direto pelo Trindade Online.`
  const url = `https://trindadeonline.com.br/cardapio/${slug}`
  const photoUrl = [...(company.photos || [])].sort((a: any, b: any) => a.order - b.order)[0]?.url

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: company.name, description: '', url, siteName: 'Trindade Online', locale: 'pt_BR', type: 'website',
      ...(photoUrl ? { images: [{ url: photoUrl, width: 1200, height: 630, alt: company.name }] } : {}),
    },
    twitter: {
      card: photoUrl ? 'summary_large_image' : 'summary', title: company.name, description: '',
      ...(photoUrl ? { images: [photoUrl] } : {}),
    },
  }
}

export default function CardapioPage({ params }: { params: Promise<{ slug: string }> }) {
  return <CardapioClient params={params} />
}
