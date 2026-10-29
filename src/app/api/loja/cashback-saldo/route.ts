import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSaldoCashback } from '@/lib/cashback'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Público de propósito (sem access_token) — igual /api/loja/checar-pix, só
// devolve um saldo em R$ atrelado a telefone+loja, nada sensível o
// suficiente pra exigir login (o cliente do cardápio nem sempre tem conta).
export async function POST(req: NextRequest) {
  try {
    const { companyId, phone } = await req.json()
    if (!companyId || !phone) return NextResponse.json({ saldo: 0 })

    const { data: company } = await supabase.from('companies')
      .select('cashback_enabled, cashback_percent').eq('id', companyId).maybeSingle()
    if (!company?.cashback_enabled) return NextResponse.json({ saldo: 0, enabled: false })

    const saldo = await getSaldoCashback(supabase, companyId, phone)
    return NextResponse.json({ saldo, enabled: true, percent: Number(company.cashback_percent || 0) })
  } catch (err) {
    console.error('[cashback-saldo]', err)
    return NextResponse.json({ saldo: 0 })
  }
}
