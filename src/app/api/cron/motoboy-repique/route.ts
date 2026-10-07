import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { matchBairroInAddress } from '@/lib/entregaPricing'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.trindadeonline.com.br'

// Toca de novo, a cada 10s, pra toda oferta de corrida ainda pendente — o
// WhatsApp (offerMessage, entregaDispatch.ts) já manda a mensagem completa
// na hora; isso aqui é só o "insistir" por cima, via push (OneSignal), pro
// motoboy perceber mesmo com o celular travado — onde JS de site nenhum
// toca som sozinho (achado real, out/2026: Ricardo perguntou se dava pra
// tocar musiquinha com a tela bloqueada; resposta é não, exceto repetindo
// notificação de verdade do sistema operacional).
//
// Sem estado nenhum pra controlar "já mandei esse" — cada rodada do pg_cron
// (10 em 10s) simplesmente dispara push pra QUALQUER oferta 'pendente' e
// ainda não vencida; como o cron já é 10 em 10s, isso sozinho dá o
// "insistindo" sem precisar de coluna nova nem de lógica de repique própria.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: offers } = await supabase
    .from('delivery_offers').select('id, motoboy_id, delivery_order_id')
    .eq('status', 'pendente').gt('expires_at', new Date().toISOString())
  if (!offers || offers.length === 0) return NextResponse.json({ ok: true, sent: 0 })

  const orderIds = [...new Set(offers.map(o => o.delivery_order_id))]
  const { data: orders } = await supabase.from('delivery_orders').select('id, company_id, fee, dropoff_address').in('id', orderIds)
  const orderMap = new Map((orders || []).map(o => [o.id, o]))

  const companyIds = [...new Set((orders || []).map(o => o.company_id))]
  const { data: companies } = await supabase.from('companies').select('id, name').in('id', companyIds)
  const companyMap = new Map((companies || []).map(c => [c.id, c.name]))

  let sent = 0
  await Promise.all(offers.map(async o => {
    const order = orderMap.get(o.delivery_order_id)
    if (!order) return
    const companyName = companyMap.get(order.company_id) || 'uma loja'
    const bairro = matchBairroInAddress(order.dropoff_address)
    const fee = Number(order.fee || 0).toFixed(2).replace('.', ',')
    const body = bairro ? `${companyName} → ${bairro} · R$ ${fee}` : `${companyName} · R$ ${fee}`
    try {
      const res = await fetch(`${SITE_URL}/api/push/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '🏍️ Tem entrega esperando!', body, target: 'external_user_id', userId: o.motoboy_id, url: `${SITE_URL}/motoboy/painel` }),
      })
      if (res.ok) sent++
    } catch (err) {
      console.error('[motoboy-repique] push', err)
    }
  }))

  return NextResponse.json({ ok: true, sent })
}
