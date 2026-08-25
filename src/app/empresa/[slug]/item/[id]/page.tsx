import { cache } from 'react'
import type { Metadata } from 'next'
import { createServerSupabase } from '@/lib/supabase-server'
import { fmt, promoPrice } from '@/lib/lojaPricing'
import ProdutoDetailClient from '@/components/loja/ProdutoDetailClient'

// Rota nova e crítica pro SEO (ESPECIFICACAO.md §5.2): antes o catálogo
// inteiro vivia numa página só, então um produto não tinha endereço próprio
// pra ranquear no Google nem preview de link decente no WhatsApp.
const getData = cache(async (slug: string, id: string) => {
  const supabaseServer = await createServerSupabase()
  const { data: company } = await supabaseServer.from('companies')
    .select('id,name,slug,phone,address,avg_rating,total_reviews,status,loja_digital_enabled,flexible_hours,loja_taxa_entrega,loja_pedido_minimo,category:categories(name,slug),hours:company_hours(label,hours,order,day_of_week,open_time,close_time,closed)')
    .eq('slug', slug).maybeSingle()
  if (!company || company.status !== 'active' || !company.loja_digital_enabled) return { company: null, produto: null, related: [] }

  const { data: produto } = await supabaseServer.from('loja_produtos')
    .select('*, groups:loja_opcoes_grupo(*, options:loja_opcoes(*))')
    .eq('id', id).eq('company_id', company.id).eq('active', true).maybeSingle()
  if (!produto) return { company, produto: null, related: [] }

  const { data: related } = await supabaseServer.from('loja_produtos')
    .select('id,name,photo_url,sale_price,promo_type,promo_value,promo_starts_at,promo_ends_at')
    .eq('company_id', company.id).eq('active', true).neq('id', id)
    .order('display_order').limit(4)

  return { company, produto, related: related || [] }
})

export async function generateMetadata({ params }: { params: Promise<{ slug: string; id: string }> }): Promise<Metadata> {
  const { slug, id } = await params
  const { company, produto } = await getData(slug, id)
  if (!company || !produto) return { title: 'Produto não encontrado — Trindade Online' }

  const price = promoPrice(produto as any) ?? produto.sale_price
  const title = `${produto.name} · ${fmt(price)} — ${company.name} | Trindade Online`
  const description = (produto.description || '').trim()
    || `${produto.name} por ${fmt(price)} em ${company.name}, no bairro Trindade, São Gonçalo/RJ.`
  const url = `https://trindadeonline.com.br/empresa/${slug}/item/${id}`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: 'Trindade Online', locale: 'pt_BR', type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function ItemPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params
  const { company, produto, related } = await getData(slug, id)

  if (!company || !produto) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'Inter,sans-serif', padding: 24, background: '#F0EDE8' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Produto não encontrado</div>
        <a href={`/empresa/${slug}/cardapio`} style={{ color: '#C9951A' }}>← Ver cardápio</a>
      </div>
    )
  }

  return <ProdutoDetailClient slug={slug} company={company as any} produto={produto as any} related={related as any} />
}
