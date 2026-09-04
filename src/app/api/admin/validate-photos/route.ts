import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import sharp from 'sharp'
import { requireAdmin } from '@/lib/requireAdmin'

export const maxDuration = 300 // Vercel limita ao teto do plano — só pede o máximo possível

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BATCH_SIZE = 6 // decodificar imagem pesa mais que só copiar bytes
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://trindadeonline.com.br'
const STATUS_KEY = 'photo_validation_status'
const OFFSET_KEY = 'photo_validation_offset'
const TIME_BUDGET_MS = 4.5 * 60 * 1000
const STALE_AFTER_MS = 5 * 60 * 1000

async function setStatus(value: string) {
  await supabaseAdmin.from('site_settings').upsert(
    { key: STATUS_KEY, value, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  )
}

async function setOffsetHeartbeat(offset: number) {
  await supabaseAdmin.from('site_settings').upsert(
    { key: OFFSET_KEY, value: String(offset), updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  )
}

function chainNext(nextOffset: number) {
  after(async () => {
    try {
      await fetch(`${SITE_URL}/api/admin/validate-photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto: true, offset: nextOffset }),
      })
    } catch {}
  })
}

// Um tamanho de arquivo "razoável" no banco não prova que a imagem abre de
// verdade — um download truncado por uma corrida (arquivo original apagado
// no meio de outro processo lendo ele) produz um arquivo menor, mas ainda
// assim não-vazio, que passa por qualquer checagem de "size > 0". A única
// forma real de saber é tentar decodificar a imagem de verdade.
async function validateBatch(photos: { id: string; url: string }[]) {
  let ok = 0, removed = 0, errors = 0
  for (const photo of photos) {
    try {
      const marker = '/company-photos/'
      const idx = photo.url.indexOf(marker)
      if (idx === -1) { errors++; continue }
      const path = photo.url.slice(idx + marker.length)

      const { data: fileBlob, error: dlErr } = await supabaseAdmin.storage.from('company-photos').download(path)
      if (dlErr || !fileBlob) { errors++; continue }

      const buf = Buffer.from(await fileBlob.arrayBuffer())

      let corrupted = buf.byteLength === 0
      if (!corrupted) {
        try {
          const meta = await sharp(buf).metadata()
          if (!meta.width || !meta.height) corrupted = true
        } catch {
          corrupted = true
        }
      }

      if (corrupted) {
        // Sem como recuperar o conteúdo original a partir daqui — a empresa
        // fica sem essa foto específica, em vez de com um link eternamente
        // quebrado.
        await supabaseAdmin.from('company_photos').delete().eq('id', photo.id)
        await supabaseAdmin.storage.from('company-photos').remove([path])
        removed++
      } else {
        ok++
      }
    } catch {
      errors++
    }
  }
  return { ok, removed, errors }
}

export async function POST(req: NextRequest) {
  try {
    const { auto, offset = 0 } = await req.json()

    // auto:true = a própria rota se re-chamando (servidor-a-servidor); pedido
    // manual do painel precisa provar sessão de admin de verdade.
    if (!auto) {
      const auth = await requireAdmin(req)
      if (auth instanceof NextResponse) return auth
    }

    if (auto && offset === 0) {
      await supabaseAdmin.from('site_settings').upsert(
        { key: STATUS_KEY, value: 'pending', updated_at: new Date(0).toISOString() },
        { onConflict: 'key', ignoreDuplicates: true }
      )
      const staleThreshold = new Date(Date.now() - STALE_AFTER_MS).toISOString()
      const { data: claimed } = await supabaseAdmin
        .from('site_settings')
        .update({ value: 'running', updated_at: new Date().toISOString() })
        .eq('key', STATUS_KEY)
        .neq('value', 'done')
        .or(`value.neq.running,updated_at.lt.${staleThreshold}`)
        .select()
      if (!claimed || claimed.length === 0) {
        return NextResponse.json({ skipped: true })
      }
    }

    const startedAt = Date.now()
    let cursor = offset
    let totalOk = 0, totalRemoved = 0, totalErrors = 0

    while (true) {
      const { data: photos, error } = await supabaseAdmin
        .from('company_photos')
        .select('id, url')
        .order('id')
        .range(cursor, cursor + BATCH_SIZE - 1)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      if (!photos || photos.length === 0) {
        await setStatus('done')
        return NextResponse.json({ done: true, ok: totalOk, removed: totalRemoved, errors: totalErrors, nextOffset: cursor })
      }

      const { ok, removed, errors } = await validateBatch(photos)
      totalOk += ok
      totalRemoved += removed
      totalErrors += errors
      cursor += photos.length

      if (auto) await setOffsetHeartbeat(cursor)

      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        if (auto) chainNext(cursor)
        return NextResponse.json({ done: false, ok: totalOk, removed: totalRemoved, errors: totalErrors, nextOffset: cursor })
      }
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
