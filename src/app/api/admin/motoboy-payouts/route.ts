import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getEntregaPricing } from '@/lib/entregaPricing'
import { sendMotoboyWhatsApp } from '@/lib/whatsapp'

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
  if (error) { console.error('[admin/motoboy-payouts] upload', error); return { path: null, error: 'falha ao salvar comprovante' } }
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
  // Repasse já sai com o corte da plataforma retido — motoboy recebia
  // 100% do fee antes (Ricardo, set/2026: "não existe divisão nenhuma
  // hoje" — corrigido).
  const pricing = await getEntregaPricing()
  const prontosByMotoboy = new Map<string, { count: number; valor: number; oldest: string }>()
  for (const o of pendentesOrders || []) {
    if (!o.motoboy_id || !o.delivered_at) continue
    const cur = prontosByMotoboy.get(o.motoboy_id) || { count: 0, valor: 0, oldest: o.delivered_at }
    cur.count += 1
    cur.valor += Math.max(0, Number(o.fee) - pricing.motoboy_corte_plataforma)
    if (o.delivered_at < cur.oldest) cur.oldest = o.delivered_at
    prontosByMotoboy.set(o.motoboy_id, cur)
  }
  // "A receber" não depende mais de ninguém gerar repasse — já entra aqui
  // sozinho assim que o motoboy confirma a entrega (Ricardo, set/2026: "o
  // dinheiro já fica lá disponível a receber"). Atrasado = mais de 7 dias
  // (um ciclo semanal, já que o pagamento real é toda segunda) parado sem
  // virar pagamento.
  const ATRASO_DIAS = 7
  const agora = Date.now()
  const prontos = Array.from(prontosByMotoboy.entries()).map(([motoboy_id, v]) => ({
    motoboy_id, motoboy_name: motoboyById.get(motoboy_id)?.name || '—',
    count: v.count, valor: v.valor,
    atrasado: (agora - new Date(v.oldest).getTime()) / 86_400_000 > ATRASO_DIAS,
  }))

  const hoje = new Date()
  const monthStart = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  let pagoMes = 0
  for (const p of payouts) {
    if (p.status === 'pago' && p.paid_at && new Date(p.paid_at) >= monthStart) pagoMes += Number(p.valor)
  }
  const pendente = prontos.reduce((a, p) => a + p.valor, 0)
  const atrasado = prontos.filter(p => p.atrasado).reduce((a, p) => a + p.valor, 0)

  return NextResponse.json({ payouts, motoboys, prontos, kpis: { pagoMes, pendente, atrasado } })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!(await requireAdmin(body.access_token))) return NextResponse.json({ error: 'acesso negado' }, { status: 403 })
    const { action } = body

    // Antes eram 2 passos (gerar repasse → marcar pago, em momentos
    // diferentes). Ricardo, set/2026: o repasse só existe de verdade quando
    // o Pix já saiu (pagamento semanal, toda segunda) — não faz sentido um
    // estado intermediário "gerado mas não pago". Um clique só, no momento
    // em que o Pix de fato aconteceu, fecha tudo que estava pendente
    // daquele motoboy de uma vez.
    if (action === 'pay_now') {
      const { motoboy_id } = body
      if (!motoboy_id) return NextResponse.json({ error: 'motoboy_id obrigatório' }, { status: 400 })
      const { data: orders } = await supabase
        .from('delivery_orders').select('id, fee, delivered_at')
        .eq('motoboy_id', motoboy_id).eq('status', 'entregue').eq('payout_status', 'liberado').is('payout_id', null)
      if (!orders || orders.length === 0) return NextResponse.json({ error: 'nenhuma entrega pendente de pagamento pra esse motoboy' }, { status: 400 })

      const pricing = await getEntregaPricing()
      const dates = orders.map(o => new Date(o.delivered_at)).sort((a, b) => a.getTime() - b.getTime())
      const periodStart = dates[0].toISOString().slice(0, 10)
      const periodEnd = dates[dates.length - 1].toISOString().slice(0, 10)
      const valor = orders.reduce((a, o) => a + Math.max(0, Number(o.fee) - pricing.motoboy_corte_plataforma), 0)
      const paidAt = new Date().toISOString()

      const { data: payout, error } = await supabase.from('motoboy_payouts').insert({
        motoboy_id, period_start: periodStart, period_end: periodEnd, entregas_count: orders.length, valor,
        status: 'pago', paid_at: paidAt,
      }).select().single()
      if (error) {
        console.error('[admin/motoboy-payouts]', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
      }
      await supabase.from('delivery_orders').update({ payout_id: payout.id, payout_status: 'pago' }).in('id', orders.map(o => o.id))

      const { data: motoboy } = await supabase.from('motoboys').select('name, phone').eq('id', motoboy_id).maybeSingle()
      if (motoboy?.phone) {
        const valorFmt = valor.toFixed(2).replace('.', ',')
        await sendMotoboyWhatsApp(motoboy.phone, `✅ Pagamento confirmado! R$ ${valorFmt} (${orders.length} entrega${orders.length > 1 ? 's' : ''}) caiu no seu Pix. Valeu pelo trampo! 🙌`)
      }
      return NextResponse.json({ ok: true, payout })
    }

    if (action === 'attach_comprovante') {
      const { id, comprovante_base64 } = body
      if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
      if (!comprovante_base64) return NextResponse.json({ error: 'comprovante obrigatório' }, { status: 400 })
      const { path, error: uploadError } = await uploadComprovante(comprovante_base64, id)
      if (uploadError) return NextResponse.json({ error: uploadError }, { status: 500 })
      const { error } = await supabase.from('motoboy_payouts').update({ comprovante_path: path }).eq('id', id)
      if (error) {
        console.error('[admin/motoboy-payouts]', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
      }
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'ação inválida' }, { status: 400 })
  } catch (err: any) {
    console.error('[admin/motoboy-payouts]', err)
    return NextResponse.json({ error: 'falha' }, { status: 500 })
  }
}
