import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function requireAdmin(accessToken: string | undefined): Promise<boolean> {
  if (!accessToken) return false
  const { data: userData } = await supabaseAuth.auth.getUser(accessToken)
  if (!userData?.user) return false
  const { data: profile } = await supabase.from('profiles').select('user_type').eq('id', userData.user.id).maybeSingle()
  return profile?.user_type === 'admin'
}

async function signedUrl(path: string | null): Promise<string | null> {
  if (!path) return null
  const { data } = await supabase.storage.from('motoboy-docs').createSignedUrl(path, 3600)
  return data?.signedUrl || null
}

async function uploadComprovante(base64: string, payoutId: string): Promise<{ path: string | null; error: string | null }> {
  const match = base64.match(/^data:([\w/+.-]+);base64,(.+)$/)
  if (!match) return { path: null, error: 'comprovante inválido' }
  const [, mime, raw] = match
  const ext = mime.split('/')[1] || 'jpg'
  const buf = Buffer.from(raw, 'base64')
  const path = `comprovante-${payoutId}-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('motoboy-docs').upload(path, buf, { contentType: mime })
  if (error) return { path: null, error: error.message }
  return { path, error: null }
}

// GET — lista de repasses + prévia do que ainda pode virar repasse (entregas
// já entregues, com payout_status liberado, ainda sem payout_id) + KPIs.
export async function GET(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!(await requireAdmin(accessToken))) return NextResponse.json({ error: 'acesso negado' }, { status: 403 })

  const { data: motoboys } = await supabase.from('motoboys').select('id, name, phone, pix_key, pix_key_type').order('name')
  const motoboyById = new Map((motoboys || []).map(m => [m.id, m]))

  const { data: payoutsRaw } = await supabase.from('motoboy_payouts').select('*').order('period_end', { ascending: false })
  const payouts = await Promise.all((payoutsRaw || []).map(async p => ({
    ...p,
    motoboy_name: motoboyById.get(p.motoboy_id)?.name || '—',
    pix_key: motoboyById.get(p.motoboy_id)?.pix_key || null,
    pix_key_type: motoboyById.get(p.motoboy_id)?.pix_key_type || null,
    comprovante_url: await signedUrl(p.comprovante_path),
  })))

  const { data: pendentesOrders } = await supabase
    .from('delivery_orders').select('motoboy_id, fee, delivered_at')
    .eq('status', 'entregue').eq('payout_status', 'liberado').is('payout_id', null)
  const prontosByMotoboy = new Map<string, { count: number; valor: number }>()
  for (const o of pendentesOrders || []) {
    if (!o.motoboy_id) continue
    const cur = prontosByMotoboy.get(o.motoboy_id) || { count: 0, valor: 0 }
    cur.count += 1
    cur.valor += Number(o.fee)
    prontosByMotoboy.set(o.motoboy_id, cur)
  }
  const prontos = Array.from(prontosByMotoboy.entries()).map(([motoboy_id, v]) => ({
    motoboy_id, motoboy_name: motoboyById.get(motoboy_id)?.name || '—', ...v,
  }))

  const hoje = new Date()
  const monthStart = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  let pagoMes = 0, pendente = 0, atrasado = 0
  for (const p of payouts) {
    if (p.status === 'pago') {
      if (p.paid_at && new Date(p.paid_at) >= monthStart) pagoMes += Number(p.valor)
    } else {
      pendente += Number(p.valor)
      const prazo = new Date(p.period_end); prazo.setDate(prazo.getDate() + 2)
      if (prazo < hoje) atrasado += Number(p.valor)
    }
  }

  return NextResponse.json({ payouts, motoboys, prontos, kpis: { pagoMes, pendente, atrasado } })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!(await requireAdmin(body.access_token))) return NextResponse.json({ error: 'acesso negado' }, { status: 403 })
    const { action } = body

    if (action === 'generate') {
      const { motoboy_id } = body
      if (!motoboy_id) return NextResponse.json({ error: 'motoboy_id obrigatório' }, { status: 400 })
      const { data: orders } = await supabase
        .from('delivery_orders').select('id, fee, delivered_at')
        .eq('motoboy_id', motoboy_id).eq('status', 'entregue').eq('payout_status', 'liberado').is('payout_id', null)
      if (!orders || orders.length === 0) return NextResponse.json({ error: 'nenhuma entrega pendente de repasse pra esse motoboy' }, { status: 400 })

      const dates = orders.map(o => new Date(o.delivered_at)).sort((a, b) => a.getTime() - b.getTime())
      const periodStart = dates[0].toISOString().slice(0, 10)
      const periodEnd = dates[dates.length - 1].toISOString().slice(0, 10)
      const valor = orders.reduce((a, o) => a + Number(o.fee), 0)

      const { data: payout, error } = await supabase.from('motoboy_payouts').insert({
        motoboy_id, period_start: periodStart, period_end: periodEnd, entregas_count: orders.length, valor,
      }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      await supabase.from('delivery_orders').update({ payout_id: payout.id }).in('id', orders.map(o => o.id))
      return NextResponse.json({ ok: true, payout })
    }

    if (action === 'attach_comprovante' || action === 'mark_paid') {
      const { id, comprovante_base64 } = body
      if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
      const update: Record<string, any> = {}
      if (comprovante_base64) {
        const { path, error: uploadError } = await uploadComprovante(comprovante_base64, id)
        if (uploadError) return NextResponse.json({ error: uploadError }, { status: 500 })
        update.comprovante_path = path
      }
      if (action === 'mark_paid') {
        update.status = 'pago'
        update.paid_at = new Date().toISOString()
      }
      const { error } = await supabase.from('motoboy_payouts').update(update).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (action === 'mark_paid') {
        await supabase.from('delivery_orders').update({ payout_status: 'pago' }).eq('payout_id', id)
      }
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'ação inválida' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha' }, { status: 500 })
  }
}
