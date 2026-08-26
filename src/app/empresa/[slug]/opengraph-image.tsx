import { ImageResponse } from 'next/og'
import { createClient } from '@supabase/supabase-js'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Trindade Online'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Fallback só pra empresa sem foto nenhuma — quando tem foto, o
// generateMetadata de page.tsx usa a URL dela direto (mais simples e não
// depende do Satori conseguir decodificar o formato salvo no Storage).
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const { data: company } = await supabase
    .from('companies')
    .select('name, description')
    .eq('slug', slug)
    .maybeSingle()

  const name = company?.name || 'Trindade Online'
  const rawDescription = company?.description || 'Confira essa empresa no Trindade Online'
  const description = rawDescription.length > 110 ? rawDescription.slice(0, 110) + '…' : rawDescription

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: '#111111' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', background: 'linear-gradient(135deg, #1A0F00 0%, #111111 100%)' }} />

        <div style={{ position: 'absolute', top: 48, left: 64, display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: '#F0EDE8' }}>TRINDADE</span>
          <span style={{ fontSize: 28, fontWeight: 700, color: '#FFC531', marginLeft: 8 }}>ONLINE</span>
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
          <div style={{ display: 'flex', fontSize: 26, color: '#FFC531', marginTop: 10, maxWidth: 1000 }}>{description}</div>
        </div>
      </div>
    ),
    { ...size }
  )
}
