import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getMotoboyFromRequest } from '@/lib/motoboySession'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Dados do próprio motoboy pro painel dele — nunca de outro (o token da
// sessão já resolve pra um motoboy_id só, ver motoboySession.ts).
export async function GET(req: NextRequest) {
  const motoboy = await getMotoboyFromRequest(req)
  if (!motoboy) return NextResponse.json({ error: 'sessão inválida' }, { status: 401 })

  const { data: full } = await supabase.from('motoboys').select('id, name, phone, pix_key, pix_key_type, status, available, password_hash').eq('id', motoboy.id).maybeSingle()

  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7)
  const { data: recentOrders } = await supabase
    .from('delivery_orders').select('id, company_id, customer_name, status, fee, created_at, payout_id')
    .eq('motoboy_id', motoboy.id).order('created_at', { ascending: false }).limit(15)

  const companyIds = Array.from(new Set((recentOrders || []).map(o => o.company_id)))
  const { data: companies } = companyIds.length ? await supabase.from('companies').select('id, name').in('id', companyIds) : { data: [] as any[] }
  const nameByCompany = new Map((companies || []).map(c => [c.id, c.name]))

  const { data: weekOrders } = await supabase.from('delivery_orders').select('fee, status').eq('motoboy_id', motoboy.id).gte('created_at', weekStart.toISOString())
  const entregasSemana = (weekOrders || []).filter(o => o.status === 'entregue').length

  const { data: payouts } = await supabase.from('motoboy_payouts').select('*').eq('motoboy_id', motoboy.id).order('period_end', { ascending: false }).limit(10)
  const aReceber = (payouts || []).filter(p => p.status === 'pendente').reduce((a, p) => a + Number(p.valor), 0)
  const jaRecebido = (payouts || []).filter(p => p.status === 'pago').reduce((a, p) => a + Number(p.valor), 0)

  return NextResponse.json({
    motoboy: { name: full?.name, phone: full?.phone, pix_key: full?.pix_key, pix_key_type: full?.pix_key_type, status: full?.status, available: full?.available, has_password: !!full?.password_hash },
    entregasSemana, aReceber, jaRecebido,
    recentOrders: (recentOrders || []).map(o => ({ id: o.id, company_name: nameByCompany.get(o.company_id) || '—', customer_name: o.customer_name, status: o.status, fee: o.fee, created_at: o.created_at, pago: !!o.payout_id })),
    payouts: (payouts || []).map(p => ({ id: p.id, period_start: p.period_start, period_end: p.period_end, valor: p.valor, status: p.status, paid_at: p.paid_at })),
  })
}

export async function POST(req: NextRequest) {
  try {
    const motoboy = await getMotoboyFromRequest(req)
    if (!motoboy) return NextResponse.json({ error: 'sessão inválida' }, { status: 401 })
    const body = await req.json()

    if (body.action === 'disponibilidade') {
      await supabase.from('motoboys').update({ available: !!body.available }).eq('id', motoboy.id)
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'atualizar_pix') {
      if (!body.pix_key?.trim()) return NextResponse.json({ error: 'chave Pix obrigatória' }, { status: 400 })
      await supabase.from('motoboys').update({ pix_key: body.pix_key.trim(), pix_key_type: body.pix_key_type || 'celular' }).eq('id', motoboy.id)
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'logout') {
      const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
      if (token) await supabase.from('motoboy_sessions').delete().eq('token', token)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'ação inválida' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha' }, { status: 500 })
  }
}
