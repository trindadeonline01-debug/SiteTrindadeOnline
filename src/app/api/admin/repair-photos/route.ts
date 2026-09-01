import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { requireAdmin } from '@/lib/requireAdmin'

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
      if (buf.byteLength === 0) {
        // Arquivo original já estava corrompido (0 bytes) antes de qualquer
        // reparo — não tem conteúdo pra recuperar. Migrar isso só criaria
        // outro link quebrado com nome novo. Em vez disso, remove de vez:
        // a empresa fica sem essa foto, não com uma foto eternamente quebrada.
        await supabaseAdmin.from('company_photos').delete().eq('id', photo.id)
        await supabaseAdmin.storage.from('company-photos').remove([path])
        continue
      }
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
    const { auto, offset = 0 } = await req.json()

    // Kick automático (disparo servidor-a-servidor via after(), sem sessão de
    // navegador) segue sem checar admin — quem chama com auto:true é a própria
    // rota se re-chamando, não um pedido de fora. Pedido manual (botão no
    // painel) precisa provar que é admin de verdade.
    if (!auto) {
      const auth = await requireAdmin(req)
      if (auth instanceof NextResponse) return auth
    }

    // Kick automático (disparado por tráfego real do site): antes isso era
    // "lê o status, depois decide, depois escreve" em passos separados — sob
    // visitas simultâneas, dois pedidos podiam ler "não tá rodando" ao mesmo
    // tempo e os DOIS começarem a migrar as mesmas linhas em paralelo (um
    // apagando o arquivo original enquanto o outro ainda tava baixando ele,
    // o que pode truncar o download e gerar um arquivo corrompido — mesmo
    // tamanho plausível, conteúdo inválido). Agora a virada pra "running" é
    // atômica: um UPDATE só, com condição, garante que só um pedido consegue
    // "ganhar a corrida" por vez.
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
