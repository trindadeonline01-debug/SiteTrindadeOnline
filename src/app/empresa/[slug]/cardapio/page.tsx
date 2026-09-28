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
    .select('id, name, description, status, loja_digital_enabled')
    .eq('slug', slug).maybeSingle()

  if (!company || company.status !== 'active' || !company.loja_digital_enabled) {
    return { title: 'Cardápio não encontrado — Trindade Online' }
  }

  // <title> da aba continua descritivo (bom pra SEO/resultado de busca) —
  // só o preview do link (WhatsApp) precisa ser enxuto: só o nome, sem
  // descrição embaixo (pedido do Ricardo, set/2026: "não pode ter
  // descrição, vamos manter só o nome"). Sem imagem nenhuma no preview
  // agora também (pedido do Ricardo, set/2026: "tô ocupando muito espaço,
  // não tá legal") — nem foto da empresa, nem o gradiente gerado por
  // código; por isso o opengraph-image.tsx dessa rota foi removido, e aqui
  // openGraph/twitter não declaram `images` de propósito.
  const title = `Cardápio ${company.name} — Trindade Online`
  const description = (company.description || '').trim()
    || `Peça pelo cardápio digital de ${company.name}, direto pelo Trindade Online.`
  const url = `https://trindadeonline.com.br/empresa/${slug}/cardapio`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: company.name, description: '', url, siteName: 'Trindade Online', locale: 'pt_BR', type: 'website',
    },
    twitter: {
      card: 'summary', title: company.name, description: '',
    },
  }
}

export default function CardapioPage({ params }: { params: Promise<{ slug: string }> }) {
  return <CardapioClient params={params} />
}
