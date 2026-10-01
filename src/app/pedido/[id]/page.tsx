import { cache } from 'react'
import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import PedidoClient from './PedidoClient'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Service role direto (não createServerSupabase) — quem abre esse link não
// tem sessão nenhuma, nem precisa: o UUID do pedido na URL é a própria
// credencial, mesmo modelo de /anuncio/[id] e /empresa/[slug]/item/[id].
const getData = cache(async (id: string) => {
  const { data: pedido } = await supabase
    .from('loja_pedidos')
    .select('id, order_number, customer_name, status, payment_method, payment_status, delivery_type, delivery_address, subtotal, delivery_fee, total, notes, created_at, cancelamento_solicitado_em, company_id, itens:loja_pedido_itens(id, product_name, unit_price, qty, selected_options)')
    .eq('id', id).maybeSingle()
  if (!pedido) return { pedido: null, company: null, entrega: null }

  const { data: company } = await supabase.from('companies').select('name, slug, phone').eq('id', pedido.company_id).maybeSingle()

  let entrega = null
  if (pedido.delivery_type === 'entrega') {
    const { data } = await supabase
      .from('delivery_orders').select('status, motoboy_name, delivery_code, picked_up_at, delivered_at')
      .eq('pedido_id', pedido.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
    entrega = data || null
  }

  return { pedido, company, entrega }
})

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const { pedido, company } = await getData(id)
  if (!pedido || !company) return { title: 'Pedido não encontrado — Trindade Online' }
  const title = `Pedido${pedido.order_number ? ` nº ${pedido.order_number}` : ''} — ${company.name}`
  return { title, robots: { index: false, follow: false } }
}

export default async function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { pedido, company, entrega } = await getData(id)
  return <PedidoClient id={id} initialPedido={pedido as any} initialCompany={company} initialEntrega={entrega as any} />
}
