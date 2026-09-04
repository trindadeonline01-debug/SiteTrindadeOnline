import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendMotoboyWhatsApp } from '@/lib/entregaDispatch'
import { notifyAdmin } from '@/lib/notifyAdmin'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PHOTO_COLUMN: Record<string, string> = {
  cnh: 'cnh_photo_path',
  moto_frente: 'moto_frente_photo_path',
  moto_tras: 'moto_tras_photo_path',
  documento_moto: 'documento_moto_photo_path',
  selfie: 'selfie_photo_path',
}

async function uploadPhoto(base64: string, prefix: string): Promise<{ path: string | null; error: string | null }> {
  const match = base64.match(/^data:(image\/\w+);base64,(.+)$/)
  if (!match) return { path: null, error: `foto inválida (${prefix})` }
  const [, mime, raw] = match
  const ext = mime.split('/')[1] || 'jpg'
  const buf = Buffer.from(raw, 'base64')
  const path = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from('motoboy-docs').upload(path, buf, { contentType: mime })
  if (error) return { path: null, error: error.message }
  return { path, error: null }
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token obrigatório' }, { status: 400 })
  const { data: motoboy } = await supabase.from('motoboys').select('name, status, pending_flags').eq('adjust_token', token).maybeSingle()
  if (!motoboy || (motoboy.status !== 'pendencia' && motoboy.status !== 'standby')) {
    return NextResponse.json({ error: 'link inválido ou expirado' }, { status: 404 })
  }
  return NextResponse.json({ name: motoboy.name, pending_flags: motoboy.pending_flags || [] })
}

// Motoboy reenvia só as fotos que foram marcadas como pendência (link que
// ele recebeu no WhatsApp com o token). Se isso zera a lista de
// pendências: cadastro "pendencia" (já tinha sido aprovado) libera sozinho;
// cadastro "standby" (nunca chegou a ser aprovado) volta pra fila do admin.
export async function POST(req: NextRequest) {
  try {
    const { token, photos } = await req.json() as { token: string; photos: Record<string, string> }
    if (!token || !photos || Object.keys(photos).length === 0) return NextResponse.json({ error: 'dados faltando' }, { status: 400 })

    const { data: motoboy } = await supabase.from('motoboys').select('id, name, phone, status, pending_flags').eq('adjust_token', token).maybeSingle()
    if (!motoboy) return NextResponse.json({ error: 'link inválido ou expirado' }, { status: 404 })
    if (motoboy.status !== 'pendencia' && motoboy.status !== 'standby') return NextResponse.json({ error: 'esse cadastro não está esperando ajuste' }, { status: 400 })

    const update: Record<string, any> = {}
    for (const [key, base64] of Object.entries(photos)) {
      const column = PHOTO_COLUMN[key]
      if (!column) continue
      const { path, error } = await uploadPhoto(base64, key)
      if (error) return NextResponse.json({ error }, { status: 500 })
      update[column] = path
    }

    const remainingFlags = ((motoboy.pending_flags as any[]) || []).filter(f => !photos[f.key])
    update.pending_flags = remainingFlags.length ? remainingFlags : null

    if (remainingFlags.length === 0) {
      if (motoboy.status === 'pendencia') {
        update.status = 'aprovado'
        update.adjust_token = null
      } else {
        update.status = 'aguardando_aprovacao'
        update.adjust_token = null
      }
    }

    await supabase.from('motoboys').update(update).eq('id', motoboy.id)

    if (remainingFlags.length === 0) {
      if (motoboy.status === 'pendencia') {
        await sendMotoboyWhatsApp(motoboy.phone, `✅ Tudo certo, ${motoboy.name}! Recebemos o ajuste e seu cadastro está liberado — você já pode receber corridas.`)
      } else {
        await sendMotoboyWhatsApp(motoboy.phone, `📋 Recebemos seu ajuste, ${motoboy.name}! A Trindade Online vai conferir de novo — te aviso assim que aprovar.`)
        await notifyAdmin({ type: 'motoboy_reenviou', nome: motoboy.name })
      }
    }

    return NextResponse.json({ ok: true, resolved: remainingFlags.length === 0 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha ao reenviar' }, { status: 500 })
  }
}
