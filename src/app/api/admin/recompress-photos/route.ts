import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BATCH_SIZE = 6 // pequeno de propósito — não passar do limite de tempo de função serverless
const MAX_DIMENSION = 900
const WEBP_QUALITY = 78
const SKIP_UNDER_BYTES = 150 * 1024

export async function POST(req: NextRequest) {
  try {
    const { user_id, offset = 0 } = await req.json()
    if (!user_id) return NextResponse.json({ error: 'user_id obrigatório' }, { status: 400 })

    const { data: profile } = await supabaseAdmin.from('profiles').select('user_type').eq('id', user_id).single()
    if (profile?.user_type !== 'admin') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

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

        const { error: upErr } = await supabaseAdmin.storage
          .from('company-photos')
          .update(path, out, { contentType: 'image/webp', upsert: true })

        if (upErr) { failed++; continue }
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
