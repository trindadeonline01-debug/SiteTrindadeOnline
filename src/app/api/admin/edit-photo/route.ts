import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { photo_id, photo_url, regions } = await req.json()
    if (!photo_id || !photo_url || !regions?.length) {
      return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 })
    }

    const parts = photo_url.split('/company-photos/')
    const path = parts[1]
    if (!path) return NextResponse.json({ error: 'Path inválido' }, { status: 400 })

    const imgRes = await fetch(photo_url)
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer())

    const img = sharp(imgBuffer)
    const meta = await img.metadata()
    const w = meta.width || 800
    const h = meta.height || 600

    const overlays = regions.map((r: any) => ({
      input: Buffer.from(
        `<svg width="${Math.round(r.w)}" height="${Math.round(r.h)}">
          <rect width="100%" height="100%" fill="black"/>
        </svg>`
      ),
      top: Math.round(r.y),
      left: Math.round(r.x),
    }))

    const edited = await sharp(imgBuffer).composite(overlays).jpeg({ quality: 90 }).toBuffer()

    const { error } = await supabaseAdmin.storage
      .from('company-photos')
      .update(path, edited, { contentType: 'image/jpeg', upsert: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
