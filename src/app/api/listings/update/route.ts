import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/requireUser'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Só o que a página do anúncio edita — nunca user_id, category etc.
const EDITABLE_FIELDS = ['title', 'description', 'price', 'address', 'contact_phone', 'status'] as const
const ALLOWED_STATUS = ['active', 'paused', 'resolved', 'deleted', 'expired']

export async function POST(req: NextRequest) {
  try {
    // user_id no corpo é ignorado: o user_id do dono aparece na página
    // pública do anúncio, então não prova nada. Quem manda é o token.
    const { listing_id, updates } = await req.json()
    if (!listing_id || !updates || typeof updates !== 'object') {
      return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 })
    }

    const auth = await requireUser(req)
    if (auth instanceof NextResponse) return auth

    const { data: listing } = await supabaseAdmin.from('listings').select('user_id').eq('id', listing_id).maybeSingle()
    if (!listing || (listing.user_id !== auth.userId && !auth.isAdmin)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const safeUpdates: Record<string, unknown> = {}
    for (const key of EDITABLE_FIELDS) if (key in updates) safeUpdates[key] = updates[key]
    if ('status' in safeUpdates && !ALLOWED_STATUS.includes(String(safeUpdates.status))) {
      return NextResponse.json({ error: 'Status inválido' }, { status: 400 })
    }
    if (!Object.keys(safeUpdates).length) return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 })

    const { error } = await supabaseAdmin.from('listings').update(safeUpdates).eq('id', listing_id)
    if (error) {
      console.error('[listings/update]', error)
      return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[listings/update]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
