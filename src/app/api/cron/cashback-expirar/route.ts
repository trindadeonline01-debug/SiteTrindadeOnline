import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { CASHBACK_EXPIRA_DIAS } from '@/lib/cashback'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 1x/dia basta pra isso (não é como entrega-expirar, que precisa de verdade
// de 1x/minuto) — mesmo CRON_SECRET de sempre, sem token novo.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { data, error } = await supabase.rpc('expirar_cashback', { dias: CASHBACK_EXPIRA_DIAS })
  if (error) {
    console.error('[cashback-expirar]', error)
    return NextResponse.json({ error: 'falhou' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, expirados: data })
}
