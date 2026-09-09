import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { requireAdminOrSecret } from '@/lib/requireAdminOrSecret'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BATCH_SIZE = 6 // pequeno de propósito — não passar do limite de tempo de função serverless
const MAX_DIMENSION = 1000
const WEBP_QUALITY = 78
const SKIP_UNDER_BYTES = 150 * 1024
const BUCKET = 'loja-produtos'
const MARKER = '/loja-produtos/'

// Mesmo padrão do recompress-photos (fotos de empresa), só que pras fotos de
// produto do catálogo (loja_produtos) e das opções/adicionais (loja_opcoes) —
// são fotos importadas por link antes da compressão na importação existir
// (ver /api/loja/importar-foto) e podem estar bem pesadas.
async function processBatch(table: 'loja_produtos' | 'loja_opcoes', offset: number) {
  const { data: rows, error } = await supabaseAdmin
    .from(table)
    .select('id, photo_url')
    .order('id')
    .range(offset, offset + BATCH_SIZE - 1)

  if (error) throw new Error(error.message)
  if (!rows || rows.length === 0) return { done: true, processed: 0, skipped: 0, failed: 0, batchSize: 0 }

  let processed = 0, skipped = 0, failed = 0

  for (const row of rows) {
    try {
      const url = (row as any).photo_url as string | null
      if (!url) { skipped++; continue }
      const idx = url.indexOf(MARKER)
      if (idx === -1) { skipped++; continue }
      const path = url.slice(idx + MARKER.length)

      const res = await fetch(url)
      if (!res.ok) { failed++; continue }
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.byteLength <= SKIP_UNDER_BYTES) { skipped++; continue }

      const out = await sharp(buf)
        .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer()

      // Mesmo cuidado do recompress-photos: nunca sobrescrever no mesmo
      // caminho (CDN não invalida direito) — sobe num caminho novo e troca
      // a URL salva no banco, só depois apaga o arquivo antigo.
      const newPath = path.replace(/\.[a-zA-Z0-9]+$/, '') + `-rc${Date.now()}.webp`
      const { error: upErr } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(newPath, out, { contentType: 'image/webp', upsert: false })

      if (upErr) { failed++; continue }

      const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(newPath)
      await supabaseAdmin.from(table).update({ photo_url: urlData.publicUrl }).eq('id', row.id)
      await supabaseAdmin.storage.from(BUCKET).remove([path])
      processed++
    } catch {
      failed++
    }
  }

  return { done: false, processed, skipped, failed, batchSize: rows.length }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminOrSecret(req)
  if (auth instanceof NextResponse) return auth

  try {
    const { phase = 'produtos', offset = 0 } = await req.json()
    const table = phase === 'opcoes' ? 'loja_opcoes' : 'loja_produtos'
    const result = await processBatch(table, offset)

    return NextResponse.json({
      done: result.done,
      processed: result.processed,
      skipped: result.skipped,
      failed: result.failed,
      phase,
      // quando a fase de produtos termina, o front pede pra virar pra opções
      nextPhase: result.done ? (phase === 'produtos' ? 'opcoes' : null) : phase,
      nextOffset: result.done ? 0 : offset + result.batchSize,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
