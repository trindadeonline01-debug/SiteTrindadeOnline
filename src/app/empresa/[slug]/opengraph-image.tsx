import { ImageResponse } from 'next/og'
import { createClient } from '@supabase/supabase-js'
import { fetchImageAsDataUri } from '@/lib/ogImageFetch'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Trindade Online'
// Sem cache: se a empresa trocar a foto principal, o preview do link tem
// que acompanhar na próxima vez que alguém compartilhar, não ficar preso
// na primeira versão gerada.
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Preview de link específico da empresa: usa a primeira foto cadastrada
// (se tiver) e o nome/descrição dela, em vez da imagem genérica do site
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const { data: company } = await supabase
    .from('companies')
    .select('id, name, description')
    .eq('slug', slug)
    .maybeSingle()

  let photoUrl: string | null = null
  if (company) {
    const { data: photo } = await supabase
      .from('company_photos')
      .select('url')
      .eq('company_id', company.id)
      .order('order', { ascending: true })
      .limit(1)
      .maybeSingle()
    photoUrl = photo?.url || null
  }

  // Busca a foto aqui, com timeout e verificação de content-type, em vez de
  // entregar a URL crua pro <img> e deixar o fetch interno do Satori decidir
  // sozinho — sem isso, qualquer falha (timeout, webp, resposta estranha)
  // derrubava a imagem inteira em branco, sem dar pra saber o motivo.
  const photoDataUri = photoUrl ? await fetchImageAsDataUri(photoUrl) : null

  const name = company?.name || 'Trindade Online'
  const rawDescription = company?.description || 'Confira essa empresa no Trindade Online'
  const description = rawDescription.length > 110 ? rawDescription.slice(0, 110) + '…' : rawDescription

  try {
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: '#111111' }}>
          {photoDataUri ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoDataUri} alt="" width={1200} height={630} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, objectFit: 'cover' }} />
          ) : (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', background: 'linear-gradient(135deg, #1A0F00 0%, #111111 100%)' }} />
          )}

          <div style={{ position: 'absolute', top: 48, left: 64, display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: '#F0EDE8' }}>TRINDADE</span>
            <span style={{ fontSize: 28, fontWeight: 700, color: '#C9951A', marginLeft: 8 }}>ONLINE</span>
          </div>

          <div
            style={{
              position: 'absolute', left: 0, right: 0, bottom: 0,
              display: 'flex', flexDirection: 'column',
              padding: '40px 64px 48px',
              background: 'linear-gradient(0deg, rgba(0,0,0,0.85) 30%, rgba(0,0,0,0) 100%)',
            }}
          >
            <div style={{ display: 'flex', fontSize: 56, fontWeight: 700, color: '#F0EDE8', lineHeight: 1.15, maxWidth: 1050 }}>{name}</div>
            <div style={{ display: 'flex', fontSize: 26, color: '#C9951A', marginTop: 10, maxWidth: 1000 }}>{description}</div>
          </div>
        </div>
      ),
      { ...size }
    )
  } catch {
    // Rede de segurança final — se até isso falhar (ex: layout do Satori
    // com a foto embutida), sobe a mesma imagem sem foto nenhuma.
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: '#111111' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', background: 'linear-gradient(135deg, #1A0F00 0%, #111111 100%)' }} />
          <div style={{ position: 'absolute', top: 48, left: 64, display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: '#F0EDE8' }}>TRINDADE</span>
            <span style={{ fontSize: 28, fontWeight: 700, color: '#C9951A', marginLeft: 8 }}>ONLINE</span>
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', padding: '40px 64px 48px', background: 'linear-gradient(0deg, rgba(0,0,0,0.85) 30%, rgba(0,0,0,0) 100%)' }}>
            <div style={{ display: 'flex', fontSize: 56, fontWeight: 700, color: '#F0EDE8', lineHeight: 1.15, maxWidth: 1050 }}>{name}</div>
            <div style={{ display: 'flex', fontSize: 26, color: '#C9951A', marginTop: 10, maxWidth: 1000 }}>{description}</div>
          </div>
        </div>
      ),
      { ...size }
    )
  }
}
