import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/requireAdmin'
import { sendTestOfferMessage } from '@/lib/entregaDispatch'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Manda a mensagem de oferta de entrega (com a foto da loja + link curto,
// igual ao disparo real) pro WhatsApp de um motoboy escolhido no admin —
// usa o pedido de entrega mais recente do banco só pra ter conteúdo real
// pra visualizar, sem criar oferta nem mexer no status de nada.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  const { motoboyId } = await req.json()
  if (!motoboyId) return NextResponse.json({ error: 'motoboyId obrigatório' }, { status: 400 })

  const { data: motoboy } = await supabase.from('motoboys').select('phone').eq('id', motoboyId).maybeSingle()
  if (!motoboy) return NextResponse.json({ error: 'motoboy não encontrado' }, { status: 404 })

  const { data: order } = await supabase
    .from('delivery_orders').select('id').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!order) return NextResponse.json({ error: 'nenhum pedido de entrega no banco ainda pra usar de exemplo' }, { status: 404 })

  const result = await sendTestOfferMessage(order.id, motoboy.phone)
  if (!result.ok) return NextResponse.json({ error: result.error || 'falha ao enviar' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
