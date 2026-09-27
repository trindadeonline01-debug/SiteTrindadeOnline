import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const OG_WIDTH = 1200
const OG_HEIGHT = 630

// Foto da loja recortada em paisagem (1200x630) pro og:image do cardápio —
// sem isso, WhatsApp mostra a foto no formato original (quadrada/retrato),
// ocupando a tela toda no preview do link (reclamação real do Ricardo,
// set/2026, mesmo motivo do banner de entrega em src/lib/entregaDispatch.ts).
// Cacheia num caminho estável (hash da URL da foto) — generateMetadata roda
// a cada acesso à página, não pode recortar de novo a cada vez.
export async function getCardapioOgImage(photoUrl: string, companyId: string): Promise<string | null> {
  const hash = createHash('md5').update(photoUrl).digest('hex').slice(0, 16)
  const filename = `${companyId}-${hash}.webp`
  const path = `og-cardapio/${filename}`

  const { data: existing } = await supabase.storage.from('company-photos').list('og-cardapio', { search: filename })
  if (existing && existing.length > 0) {
    return supabase.storage.from('company-photos').getPublicUrl(path).data.publicUrl
  }

  try {
    // sharp importado sob demanda, só aqui dentro — generateMetadata roda em
    // toda visita à página (inclusive crawler), um import estático que falhe
    // pra carregar deixaria a página inteira fora do ar, não só sem imagem
    // (mesma lição de src/lib/entregaDispatch.ts e opengraph-image.tsx).
    const sharp = (await import('sharp')).default
    const res = await fetch(photoUrl)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const out = await sharp(buf)
      .resize({ width: OG_WIDTH, height: OG_HEIGHT, fit: 'cover', position: 'attention' })
      .webp({ quality: 82 })
      .toBuffer()
    const { error } = await supabase.storage.from('company-photos').upload(path, out, { contentType: 'image/webp', upsert: false })
    if (error) return null
    return supabase.storage.from('company-photos').getPublicUrl(path).data.publicUrl
  } catch (err) {
    console.error('[getCardapioOgImage]', err)
    return null
  }
}
