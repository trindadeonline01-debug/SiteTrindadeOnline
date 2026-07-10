import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { listing_id, user_id, updates } = await req.json()
    if (!listing_id || !user_id) return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 })

    const { data: listing } = await supabaseAdmin.from('listings').select('user_id').eq('id', listing_id).single()
    if (!listing || listing.user_id !== user_id) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    const { error } = await supabaseAdmin.from('listings').update(updates).eq('id', listing_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
