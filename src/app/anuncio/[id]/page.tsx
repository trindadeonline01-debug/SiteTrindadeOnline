import { cache } from 'react'
import type { Metadata } from 'next'
import { createServerSupabase } from '@/lib/supabase-server'
import AnuncioPageClient from '@/components/anuncio/AnuncioPageClient'

const TYPE_LABEL: Record<string, string> = {
  desapega: 'Desapega', emprego: 'Empregos', imovel: 'Imóveis', achado: 'Achados & Perdidos',
}

const getListing = cache(async (id: string) => {
  const supabaseServer = await createServerSupabase()
  const { data } = await supabaseServer.from('listings').select('*,user:profiles(name),photos:listing_photos(url,order)').eq('id', id).maybeSingle()
  return data
})

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const listing = await getListing(id)
  if (!listing) return { title: 'Anúncio não encontrado — Trindade Online' }
  const label = TYPE_LABEL[listing.type] || 'Anúncios'
  const title = `${listing.title} — ${label} · Trindade Online`
  const description = (listing.description || '').trim().slice(0, 200)
    || `${listing.title} — anúncio de ${label} no bairro Trindade, São Gonçalo/RJ.`
  const image = [...(listing.photos || [])].sort((a: any, b: any) => a.order - b.order)[0]?.url || 'https://trindadeonline.com.br/og-image.png'
  const url = `https://trindadeonline.com.br/anuncio/${id}`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: 'Trindade Online', images: [{ url: image, width: 1200, height: 630, alt: listing.title }], locale: 'pt_BR', type: 'website' },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  }
}

export default async function AnuncioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const listing = await getListing(id)

  if (!listing) {
    return (
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'Inter,sans-serif',padding:24}}>
        <div style={{fontSize:48,marginBottom:12}}>🔍</div>
        <div style={{fontSize:18,fontWeight:700,marginBottom:16}}>Anúncio não encontrado</div>
        <a href="/" style={{color:'#C9951A'}}>← Voltar ao início</a>
      </div>
    )
  }

  return <AnuncioPageClient id={id} initialListing={listing as any} />
}
