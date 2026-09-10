import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { mapsLink } from '@/lib/entregaDispatch'

// Link curtinho que o motoboy recebe no WhatsApp (em vez do link cru do
// Google Maps, com endereço codificado passando de 100 caracteres) — abre
// aqui e redireciona pro Maps de verdade. Público, sem auth: quem tem o
// link é quem recebeu a oferta de entrega, e ele só devolve o mesmo
// endereço que já foi mandado na mensagem.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest, context: { params: Promise<{ id: string; tipo: string }> }) {
  const { id, tipo } = await context.params
  if (tipo !== 'r' && tipo !== 'd') return new NextResponse('link inválido', { status: 400 })

  const { data: order } = await supabase
    .from('delivery_orders').select('pickup_address, dropoff_address').eq('id', id).maybeSingle()
  if (!order) return new NextResponse('entrega não encontrada', { status: 404 })

  const address = tipo === 'r' ? order.pickup_address : order.dropoff_address
  return NextResponse.redirect(mapsLink(address))
}
