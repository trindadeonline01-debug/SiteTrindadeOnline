import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : '55' + digits
}
function onlyDigits(v: string): string { return v.replace(/\D/g, '') }

// CNH é documento sensível — fica num bucket privado, nunca com URL pública.
async function uploadCnhPhoto(base64: string): Promise<{ path: string | null; error: string | null }> {
  const match = base64.match(/^data:(image\/\w+);base64,(.+)$/)
  if (!match) return { path: null, error: 'foto da CNH inválida' }
  const [, mime, raw] = match
  const ext = mime.split('/')[1] || 'jpg'
  const buf = Buffer.from(raw, 'base64')
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from('motoboy-docs').upload(path, buf, { contentType: mime })
  if (error) return { path: null, error: error.message }
  return { path, error: null }
}

export async function GET() {
  const { data, error } = await supabase.from('motoboys').select('*').order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const motoboys = await Promise.all((data || []).map(async m => {
    if (!m.cnh_photo_path) return { ...m, cnh_photo_url: null }
    const { data: signed } = await supabase.storage.from('motoboy-docs').createSignedUrl(m.cnh_photo_path, 3600)
    return { ...m, cnh_photo_url: signed?.signedUrl || null }
  }))
  return NextResponse.json({ motoboys })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body

    if (action === 'create') {
      const { name, phone, address, cpf, cnh_photo_base64, pix_key, pix_key_type } = body
      if (!name?.trim() || !phone?.trim() || !address?.trim() || !cpf?.trim() || !cnh_photo_base64) {
        return NextResponse.json({ error: 'Nome, telefone, endereço, CPF e foto da CNH são obrigatórios.' }, { status: 400 })
      }
      const cpfDigits = onlyDigits(cpf)
      if (cpfDigits.length !== 11) return NextResponse.json({ error: 'CPF inválido — precisa ter 11 números.' }, { status: 400 })

      const { path: cnhPath, error: uploadError } = await uploadCnhPhoto(cnh_photo_base64)
      if (uploadError) return NextResponse.json({ error: uploadError }, { status: 500 })

      const { error } = await supabase.from('motoboys').insert({
        name: name.trim(), phone: formatPhone(phone), address: address.trim(), cpf: cpfDigits, cnh_photo_path: cnhPath,
        pix_key: pix_key?.trim() || null, pix_key_type: pix_key_type || null,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'update') {
      const { id, name, phone, address, cpf, cnh_photo_base64, pix_key, pix_key_type } = body
      if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
      if (cpf && onlyDigits(cpf).length !== 11) return NextResponse.json({ error: 'CPF inválido — precisa ter 11 números.' }, { status: 400 })

      const update: Record<string, any> = {
        name: name?.trim(), phone: phone ? formatPhone(phone) : undefined,
        address: address?.trim(), cpf: cpf ? onlyDigits(cpf) : undefined,
        pix_key: pix_key?.trim() || null, pix_key_type: pix_key_type || null,
      }
      if (cnh_photo_base64) {
        const { path: cnhPath, error: uploadError } = await uploadCnhPhoto(cnh_photo_base64)
        if (uploadError) return NextResponse.json({ error: uploadError }, { status: 500 })
        update.cnh_photo_path = cnhPath
      }

      const { error } = await supabase.from('motoboys').update(update).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'toggle') {
      const { id, active } = body
      if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
      const { error } = await supabase.from('motoboys').update({ active }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'ação inválida' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha' }, { status: 500 })
  }
}
