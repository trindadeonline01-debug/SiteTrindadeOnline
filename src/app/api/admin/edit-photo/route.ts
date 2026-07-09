import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const photoId = formData.get('photo_id') as string
    const photoUrl = formData.get('photo_url') as string

    if (!file || !photoId || !photoUrl) {
      return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 })
    }

    const parts = photoUrl.split('/company-photos/')
    const path = parts[1]
    if (!path) return NextResponse.json({ error: 'Path inválido' }, { status: 400 })

    const buffer = await file.arrayBuffer()
    const { error } = await supabaseAdmin.storage
      .from('company-photos')
      .update(path, buffer, { contentType: 'image/jpeg', upsert: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
