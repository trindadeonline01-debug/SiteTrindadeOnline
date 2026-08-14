import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BATCH_SIZE = 8

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
    if (!photos || photos.length === 0) return NextResponse.json({ done: true, healthy: 0, repaired: 0, unrecoverable: 0, nextOffset: offset })

    let healthy = 0, repaired = 0, unrecoverable = 0
    const unrecoverableIds: string[] = []

    for (const photo of photos) {
      try {
        const marker = '/company-photos/'
        const idx = photo.url.indexOf(marker)
        if (idx === -1) { healthy++; continue }
        const path = photo.url.slice(idx + marker.length)

        // Testa o link público de verdade — é isso que o visitante usa.
        const publicCheck = await fetch(photo.url, { cache: 'no-store' })
        if (publicCheck.ok) { healthy++; continue }

        // Link público quebrado. Tenta buscar os bytes direto da API
        // autenticada do Storage (não passa pelo CDN público) — se os
        // bytes ainda existirem aí, o arquivo não foi perdido, só o link
        // ficou preso quebrado.
        const { data: fileBlob, error: dlErr } = await supabaseAdmin.storage.from('company-photos').download(path)
        if (dlErr || !fileBlob) { unrecoverable++; unrecoverableIds.push(photo.id); continue }

        const buf = Buffer.from(await fileBlob.arrayBuffer())
        const newPath = path.replace(/\.[a-zA-Z0-9]+$/, '') + `-fix${Date.now()}.webp`
        const { error: upErr } = await supabaseAdmin.storage
          .from('company-photos')
          .upload(newPath, buf, { contentType: fileBlob.type || 'image/webp', upsert: false })

        if (upErr) { unrecoverable++; unrecoverableIds.push(photo.id); continue }

        const { data: urlData } = supabaseAdmin.storage.from('company-photos').getPublicUrl(newPath)
        await supabaseAdmin.from('company_photos').update({ url: urlData.publicUrl }).eq('id', photo.id)
        await supabaseAdmin.storage.from('company-photos').remove([path])
        repaired++
      } catch {
        unrecoverable++
        unrecoverableIds.push(photo.id)
      }
    }

    return NextResponse.json({ done: false, healthy, repaired, unrecoverable, unrecoverableIds, batchSize: photos.length, nextOffset: offset + photos.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
