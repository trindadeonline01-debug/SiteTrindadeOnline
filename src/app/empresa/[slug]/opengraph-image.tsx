import { ImageResponse } from 'next/og'
import { createClient } from '@supabase/supabase-js'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Trindade Online'

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

  // O gerador de imagem do Next (Satori) não decodifica .webp de forma
  // confiável — quando isso acontece, a imagem inteira sai em branco no
  // preview do WhatsApp, sem erro visível. Bastante foto real do Storage
  // está em webp (ex: reparo automático de foto quebrada), então pula
  // direto pro fundo com gradiente em vez de arriscar a imagem toda.
  if (photoUrl && /\.webp(\?|$)/i.test(photoUrl)) photoUrl = null

  const name = company?.name || 'Trindade Online'
  const rawDescription = company?.description || 'Confira essa empresa no Trindade Online'
  const description = rawDescription.length > 110 ? rawDescription.slice(0, 110) + '…' : rawDescription

  function render(withPhoto: boolean) {
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: '#111111' }}>
          {withPhoto && photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" width={1200} height={630} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, objectFit: 'cover' }} />
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
  }

  // Mesmo depois do filtro de webp, uma foto pode falhar por outro motivo
  // (URL fora do ar, formato inesperado) — nesse caso cai pro fundo sem
  // foto em vez de devolver um preview quebrado.
  try {
    return render(true)
  } catch {
    return render(false)
  }
}
