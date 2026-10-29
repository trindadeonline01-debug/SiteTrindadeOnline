import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 1x/dia basta pra isso (não é como entrega-expirar, que precisa de verdade
// de 1x/minuto) — mesmo CRON_SECRET de sempre, sem token novo. O prazo é por
// loja (companies.cashback_expira_dias, configurável em /painel/compartilhar)
// — a função no Postgres já lê isso linha a linha, não recebe parâmetro.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { data, error } = await supabase.rpc('expirar_cashback')
  if (error) {
    console.error('[cashback-expirar]', error)
    return NextResponse.json({ error: 'falhou' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, expirados: data })
}
