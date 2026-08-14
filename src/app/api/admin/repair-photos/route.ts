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
    if (!photos || photos.length === 0) return NextResponse.json({ done: true, migrated: 0, failed: 0, nextOffset: offset })

    let migrated = 0, failed = 0

    // Não testa mais se o link "parece" quebrado — um fetch daqui (servidor
    // da Vercel) pode bater num nó de CDN diferente do que o celular do
    // morador bate, e dar "saudável" mesmo pra quem tá vendo quebrado de
    // verdade. Em vez de confiar nesse teste, migra TODA foto pra um link
    // novo, direto: um link que nenhum CDN nunca viu antes não tem como
    // estar com cache travado.
    for (const photo of photos) {
      try {
        const marker = '/company-photos/'
        const idx = photo.url.indexOf(marker)
        if (idx === -1) { failed++; continue }
        const path = photo.url.slice(idx + marker.length)
        if (/-fix\d+\.webp$|-rc\d+\.webp$/.test(path)) { continue } // já migrada numa rodada anterior

        const { data: fileBlob, error: dlErr } = await supabaseAdmin.storage.from('company-photos').download(path)
        if (dlErr || !fileBlob) { failed++; continue }

        const buf = Buffer.from(await fileBlob.arrayBuffer())
        const newPath = path.replace(/\.[a-zA-Z0-9]+$/, '') + `-fix${Date.now()}.webp`
        const { error: upErr } = await supabaseAdmin.storage
          .from('company-photos')
          .upload(newPath, buf, { contentType: fileBlob.type || 'image/webp', upsert: false })

        if (upErr) { failed++; continue }

        const { data: urlData } = supabaseAdmin.storage.from('company-photos').getPublicUrl(newPath)
        await supabaseAdmin.from('company_photos').update({ url: urlData.publicUrl }).eq('id', photo.id)
        await supabaseAdmin.storage.from('company-photos').remove([path])
        migrated++
      } catch {
        failed++
      }
    }

    return NextResponse.json({ done: false, migrated, failed, batchSize: photos.length, nextOffset: offset + photos.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
