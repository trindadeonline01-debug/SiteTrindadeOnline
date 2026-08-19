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

export async function GET() {
  const { data, error } = await supabase.from('motoboys').select('*').order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ motoboys: data })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body

    if (action === 'create') {
      const { name, phone, pix_key, pix_key_type } = body
      if (!name?.trim() || !phone?.trim()) return NextResponse.json({ error: 'Nome e telefone são obrigatórios' }, { status: 400 })
      const { error } = await supabase.from('motoboys').insert({
        name: name.trim(), phone: formatPhone(phone), pix_key: pix_key?.trim() || null, pix_key_type: pix_key_type || null,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'update') {
      const { id, name, phone, pix_key, pix_key_type } = body
      if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
      const { error } = await supabase.from('motoboys').update({
        name: name?.trim(), phone: phone ? formatPhone(phone) : undefined, pix_key: pix_key?.trim() || null, pix_key_type: pix_key_type || null,
      }).eq('id', id)
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
