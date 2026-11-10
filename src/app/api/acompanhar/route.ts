import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyTracking } from '@/lib/trackingToken'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'

// Estado público de UMA entrega para a página /acompanhar/[token] (nov/2026).
// Quem tem o link (token assinado) vê: nome da loja, primeiro nome do
// motoboy, a fase da corrida e — SÓ enquanto ele está a caminho — a última
// posição dele. Nunca devolve telefone, placa, código ou dado de outra
// entrega. Posição velha (> 2 min) vem marcada como "sem sinal".
const SEM_SINAL_MS = 2 * 60 * 1000

export async function GET(req: NextRequest) {
  const id = verifyTracking(req.nextUrl.searchParams.get('t') || '')
  if (!id) return NextResponse.json({ error: 'link inválido' }, { status: 404 })

  const { data: o } = await supabase
    .from('delivery_orders')
    .select('id, company_id, status, motoboy_id, motoboy_name, pickup_address, dropoff_address, pickup_code, picked_up_at, delivered_at')
    .eq('id', id).maybeSingle()
  if (!o) return NextResponse.json({ error: 'entrega não encontrada' }, { status: 404 })

  const { data: company } = await supabase.from('companies').select('name').eq('id', o.company_id).maybeSingle()
  const empresa = company?.name || ''
  const base = { empresa, motoboy: (o.motoboy_name || '').trim().split(/\s+/)[0] || null }

  if (o.status === 'entregue') return NextResponse.json({ ...base, estado: 'entregue', entregueEm: o.delivered_at })
  if (o.status === 'cancelada') return NextResponse.json({ ...base, estado: 'cancelada' })
  if (o.status !== 'a_caminho') return NextResponse.json({ ...base, estado: 'aguardando' })

  // Antes da retirada (quando a loja exige código) o motoboy está indo buscar
  // o pedido; depois, vindo até o cliente.
  const indoParaLoja = !!o.pickup_code && !o.picked_up_at
  const fase = indoParaLoja ? 'loja' : 'cliente'
  const destino = indoParaLoja ? o.pickup_address : o.dropoff_address

  let posicao: { lat: number; lng: number; semSinal: boolean } | null = null
  if (o.motoboy_id) {
    const { data: loc } = await supabase
      .from('motoboy_locations').select('lat, lng, updated_at').eq('motoboy_id', o.motoboy_id).maybeSingle()
    if (loc) {
      posicao = {
        lat: loc.lat, lng: loc.lng,
        semSinal: Date.now() - new Date(loc.updated_at).getTime() > SEM_SINAL_MS,
      }
    }
  }

  return NextResponse.json({ ...base, estado: 'a_caminho', fase, destino: destino || null, posicao })
}
