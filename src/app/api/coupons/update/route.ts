import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/requireUser'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Só os campos que a tela de edição de cupom realmente altera — nunca
// company_id, contadores de uso etc. vindos do corpo da requisição.
const EDITABLE_FIELDS = ['title', 'discount_value', 'expires_at', 'min_purchase'] as const

export async function POST(req: NextRequest) {
  try {
    const { coupon_id, updates } = await req.json()
    if (!coupon_id || !updates || typeof updates !== 'object') {
      return NextResponse.json({ error: 'coupon_id obrigatório' }, { status: 400 })
    }

    const { data: coupon } = await supabase.from('coupons').select('company_id').eq('id', coupon_id).maybeSingle()
    if (!coupon) return NextResponse.json({ error: 'Cupom não encontrado' }, { status: 404 })

    const access = await requireCompanyAccess(req, coupon.company_id)
    if (access instanceof NextResponse) return access

    const safeUpdates: Record<string, unknown> = {}
    for (const key of EDITABLE_FIELDS) if (key in updates) safeUpdates[key] = updates[key]
    if (!Object.keys(safeUpdates).length) return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 })

    const { error } = await supabase.from('coupons').update(safeUpdates).eq('id', coupon_id)
    if (error) {
      console.error('[coupons/update]', error)
      return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[coupons/update]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
