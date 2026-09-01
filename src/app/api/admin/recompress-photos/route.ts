import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { requireAdmin } from '@/lib/requireAdmin'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BATCH_SIZE = 6 // pequeno de propósito — não passar do limite de tempo de função serverless
const MAX_DIMENSION = 900
const WEBP_QUALITY = 78
const SKIP_UNDER_BYTES = 150 * 1024

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  try {
    const { offset = 0 } = await req.json()

    const { data: photos, error } = await supabaseAdmin
      .from('company_photos')
      .select('id, url')
      .order('id')
      .range(offset, offset + BATCH_SIZE - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!photos || photos.length === 0) return NextResponse.json({ done: true, processed: 0, skipped: 0, failed: 0, nextOffset: offset })

    let processed = 0, skipped = 0, failed = 0

    for (const photo of photos) {
      try {
        const marker = '/company-photos/'
        const idx = photo.url.indexOf(marker)
        if (idx === -1) { skipped++; continue }
        const path = photo.url.slice(idx + marker.length)

        const res = await fetch(photo.url)
        if (!res.ok) { failed++; continue }
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.byteLength <= SKIP_UNDER_BYTES) { skipped++; continue }

        const out = await sharp(buf)
          .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: WEBP_QUALITY })
          .toBuffer()

        // Nunca sobrescrever no mesmo caminho — o CDN do Supabase não
        // invalida direito quando o arquivo é trocado no mesmo link, e o
        // link antigo fica servindo algo quebrado. Sempe sobe num caminho
        // novo e troca a URL salva no banco.
        const newPath = path.replace(/\.[a-zA-Z0-9]+$/, '') + `-rc${Date.now()}.webp`
        const { error: upErr } = await supabaseAdmin.storage
          .from('company-photos')
          .upload(newPath, out, { contentType: 'image/webp', upsert: false })

        if (upErr) { failed++; continue }

        const { data: urlData } = supabaseAdmin.storage.from('company-photos').getPublicUrl(newPath)
        await supabaseAdmin.from('company_photos').update({ url: urlData.publicUrl }).eq('id', photo.id)
        await supabaseAdmin.storage.from('company-photos').remove([path])
        processed++
      } catch {
        failed++
      }
    }

    return NextResponse.json({ done: false, processed, skipped, failed, batchSize: photos.length, nextOffset: offset + photos.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
