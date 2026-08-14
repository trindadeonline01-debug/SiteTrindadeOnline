import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'

export const maxDuration = 300 // Vercel limita ao teto do plano — só pede o máximo possível

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BATCH_SIZE = 8
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://trindadeonline.com.br'
const STATUS_KEY = 'photo_migration_status'
const OFFSET_KEY = 'photo_migration_offset'
const TIME_BUDGET_MS = 4.5 * 60 * 1000 // deixa folga sob o teto de 300s antes de passar a corrente adiante
const STALE_AFTER_MS = 5 * 60 * 1000 // corrente "running" sem batimento há mais que isso é considerada morta

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

// Rede autêntica (não busca o próprio callback antes de ele terminar), pra
// não deixar o processo ser congelado pela Vercel antes do fetch sair de
// verdade — foi exatamente isso que travou a corrente anterior em silêncio.
function chainNext(nextOffset: number) {
  after(async () => {
    try {
      await fetch(`${SITE_URL}/api/admin/repair-photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto: true, offset: nextOffset }),
      })
    } catch {
      // se essa ponta falhar, a próxima visita na home destrava de novo
      // via checagem de "running" parado (STALE_AFTER_MS)
    }
  })
}

async function migrateBatch(photos: { id: string; url: string }[]) {
  let migrated = 0, failed = 0
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
  return { migrated, failed }
}

export async function POST(req: NextRequest) {
  try {
    const { user_id, auto, offset = 0 } = await req.json()

    if (!auto) {
      if (!user_id) return NextResponse.json({ error: 'user_id obrigatório' }, { status: 400 })
      const { data: profile } = await supabaseAdmin.from('profiles').select('user_type').eq('id', user_id).single()
      if (profile?.user_type !== 'admin') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    // Kick automático (disparado por tráfego real do site, sem depender de
    // alguém clicar em botão nenhum): se já tem uma corrente rodando de
    // verdade ou já terminou, não faz nada. Mas se "running" tá parado há
    // mais que STALE_AFTER_MS sem batimento, trata como corrente morta e
    // deixa recomeçar — antes isso travava pra sempre se um elo caísse.
    if (auto && offset === 0) {
      const { data: statusRow } = await supabaseAdmin
        .from('site_settings')
        .select('value, updated_at')
        .eq('key', STATUS_KEY)
        .maybeSingle()
      const isStale = statusRow?.updated_at
        ? Date.now() - new Date(statusRow.updated_at).getTime() > STALE_AFTER_MS
        : false
      if (statusRow?.value === 'done' || (statusRow?.value === 'running' && !isStale)) {
        return NextResponse.json({ skipped: true, status: statusRow.value })
      }
      await setStatus('running')
    }

    // Processa o máximo de lotes possível numa invocação só, em vez de
    // depender de vários pulos HTTP em cadeia — bem mais robusto. Só recorre
    // à corrente via after() se sobrar trabalho depois do orçamento de tempo.
    const startedAt = Date.now()
    let cursor = offset
    let totalMigrated = 0, totalFailed = 0

    while (true) {
      const { data: photos, error } = await supabaseAdmin
        .from('company_photos')
        .select('id, url')
        .order('id')
        .range(cursor, cursor + BATCH_SIZE - 1)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      if (!photos || photos.length === 0) {
        await setStatus('done')
        return NextResponse.json({ done: true, migrated: totalMigrated, failed: totalFailed, nextOffset: cursor })
      }

      const { migrated, failed } = await migrateBatch(photos)
      totalMigrated += migrated
      totalFailed += failed
      cursor += photos.length

      if (auto) await setOffsetHeartbeat(cursor)

      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        if (auto) chainNext(cursor)
        return NextResponse.json({ done: false, migrated: totalMigrated, failed: totalFailed, nextOffset: cursor })
      }
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
