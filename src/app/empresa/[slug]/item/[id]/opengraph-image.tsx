import { ImageResponse } from 'next/og'
import { createClient } from '@supabase/supabase-js'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Trindade Online'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function fmt(n: number) { return 'R$ ' + n.toFixed(2).replace('.', ',') }
function promoPrice(p: { promo_type: string | null; promo_value: number | null; promo_starts_at: string | null; promo_ends_at: string | null; sale_price: number }): number | null {
  if (!p.promo_type || !p.promo_value) return null
  const now = Date.now()
  if (p.promo_starts_at && now < new Date(p.promo_starts_at).getTime()) return null
  if (p.promo_ends_at && now > new Date(p.promo_ends_at).getTime()) return null
  return p.promo_type === 'percent' ? p.sale_price * (1 - p.promo_value / 100) : Math.max(0, p.sale_price - p.promo_value)
}

// Preview de link específico do produto — sem isso, colar o link de "2 pães
// de picanha" no WhatsApp mostrava o card genérico do site inteiro.
export default async function Image({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params

  const { data: company } = await supabase.from('companies').select('id, name').eq('slug', slug).maybeSingle()
  const { data: produto } = company
    ? await supabase.from('loja_produtos')
        .select('name, photo_url, sale_price, promo_type, promo_value, promo_starts_at, promo_ends_at')
        .eq('id', id).eq('company_id', company.id).maybeSingle()
    : { data: null }

  const name = produto?.name || 'Produto'
  const companyName = company?.name || 'Trindade Online'
  const price = produto ? (promoPrice(produto as any) ?? produto.sale_price) : null

  // Satori (o gerador dessa imagem) não decodifica .webp de forma confiável
  // — a imagem inteira sai em branco no preview do WhatsApp, sem erro
  // visível. Bastante foto do Storage está em webp (reparo automático de
  // foto quebrada, por exemplo), então pula pro fundo com gradiente.
  let photoUrl = produto?.photo_url || null
  if (photoUrl && /\.webp(\?|$)/i.test(photoUrl)) photoUrl = null

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

          {price !== null && (
            <div style={{ position: 'absolute', top: 44, right: 64, display: 'flex', background: '#C9951A', color: '#1A1610', fontSize: 34, fontWeight: 700, padding: '10px 24px', borderRadius: 12 }}>
              {fmt(price)}
            </div>
          )}

          <div
            style={{
              position: 'absolute', left: 0, right: 0, bottom: 0,
              display: 'flex', flexDirection: 'column',
              padding: '40px 64px 48px',
              background: 'linear-gradient(0deg, rgba(0,0,0,0.85) 30%, rgba(0,0,0,0) 100%)',
            }}
          >
            <div style={{ display: 'flex', fontSize: 56, fontWeight: 700, color: '#F0EDE8', lineHeight: 1.15, maxWidth: 1050 }}>{name}</div>
            <div style={{ display: 'flex', fontSize: 26, color: '#C9951A', marginTop: 10, maxWidth: 1000 }}>{companyName}</div>
          </div>
        </div>
      ),
      { ...size }
    )
  }

  try {
    return render(true)
  } catch {
    return render(false)
  }
}
