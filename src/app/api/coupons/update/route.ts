import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { coupon_id, updates } = await req.json()
    if (!coupon_id) return NextResponse.json({ error: 'coupon_id obrigatório' }, { status: 400 })
    const { error } = await supabase.from('coupons').update(updates).eq('id', coupon_id)
    if (error) {
      console.error('[coupons/update]', error)
      return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[coupons/update]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
