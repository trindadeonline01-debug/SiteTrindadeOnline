import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Nunca cacheado — o cliente reabre esse link várias vezes acompanhando o
// pedido, tem que refletir o status real na hora.
export const dynamic = 'force-dynamic'

// Dados públicos de UM pedido, pra tela de acompanhamento do cliente
// (/pedido/[id]) — service role porque o cliente final não tem sessão
// autenticada nem RLS própria pra ler loja_pedidos; quem tem o link (o ID,
// um UUID) é quem pode ver, mesmo modelo já usado em /anuncio/[id] e
// /empresa/[slug]/item/[id]. Só devolve o que o cliente já veria de
// qualquer jeito no checkout/WhatsApp — nunca dado de outro cliente.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data: pedido } = await supabase
    .from('loja_pedidos')
    .select('id, order_number, customer_name, status, payment_method, payment_status, delivery_type, delivery_address, subtotal, delivery_fee, total, notes, created_at, cancelamento_solicitado_em, company_id, itens:loja_pedido_itens(id, product_name, unit_price, qty, selected_options)')
    .eq('id', id).maybeSingle()
  if (!pedido) return NextResponse.json({ error: 'pedido não encontrado' }, { status: 404 })

  const { data: company } = await supabase.from('companies').select('name, slug, phone').eq('id', pedido.company_id).maybeSingle()

  let entrega: { status: string; motoboy_name: string | null; delivery_code: string | null; picked_up_at: string | null; delivered_at: string | null } | null = null
  if (pedido.delivery_type === 'entrega') {
    const { data } = await supabase
      .from('delivery_orders').select('status, motoboy_name, delivery_code, picked_up_at, delivered_at')
      .eq('pedido_id', pedido.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
    entrega = data || null
  }

  return NextResponse.json({ pedido, company, entrega })
}
