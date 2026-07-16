import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { coupon_id } = await req.json()
    if (!coupon_id) return NextResponse.json({ error: 'coupon_id obrigatório' }, { status: 400 })
    await supabase.from('coupon_redemptions').delete().eq('coupon_id', coupon_id)
    const { error } = await supabase.from('coupons').delete().eq('id', coupon_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
