import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ensureEntregaWebhookRegistered, offerToNextMotoboy } from '@/lib/entregaDispatch'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function genCode(): string { return String(Math.floor(1000 + Math.random() * 9000)) }

// Chamado pelo botão "🏍️ Chamar motoboy" em /painel/crm/pedidos. Cria a
// entrega, gera o código de confirmação e chama o primeiro motoboy da fila.
// O código só é avisado pro cliente (e pro motoboy) quando alguém ACEITA a
// corrida — ver o branch "aceita" em /api/entrega/webhook.
export async function POST(req: NextRequest) {
  try {
    const { access_token, company_id, pedido_id, customer_name, customer_phone, dropoff_address } = await req.json()
    if (!access_token || !company_id || !customer_name?.trim() || !dropoff_address?.trim()) {
      return NextResponse.json({ error: 'dados faltando' }, { status: 400 })
    }

    const { data: userData, error: authError } = await supabaseAuth.auth.getUser(access_token)
    if (!userData?.user) return NextResponse.json({ error: `sessão inválida${authError ? ' — ' + authError.message : ''}` }, { status: 401 })

    const { data: company } = await supabase.from('companies').select('owner_id, address').eq('id', company_id).maybeSingle()
    if (!company || company.owner_id !== userData.user.id) return NextResponse.json({ error: 'empresa não é sua' }, { status: 403 })
    if (!company.address?.trim()) return NextResponse.json({ error: 'Cadastre o endereço da loja no perfil antes de chamar motoboy.' }, { status: 400 })

    const { data: wallet } = await supabase.from('company_delivery_wallet').select('credits, daily_paid_on').eq('company_id', company_id).maybeSingle()
    const today = new Date().toISOString().slice(0, 10)
    if (wallet?.daily_paid_on !== today) return NextResponse.json({ error: 'Diária de hoje ainda não foi paga — ativa em Entrega no painel.' }, { status: 400 })
    if (!wallet?.credits || wallet.credits < 1) return NextResponse.json({ error: 'Sem crédito de entrega — compra mais em Entrega no painel.' }, { status: 400 })

    if (pedido_id) {
      const { data: existing } = await supabase.from('delivery_orders').select('id').eq('pedido_id', pedido_id).maybeSingle()
      if (existing) return NextResponse.json({ error: 'Esse pedido já tem uma entrega chamada.' }, { status: 400 })
    }

    const { data: order, error: insertErr } = await supabase.from('delivery_orders').insert({
      company_id, pedido_id: pedido_id || null, customer_name: customer_name.trim(), customer_phone: customer_phone || null,
      pickup_address: company.address.trim(), dropoff_address: dropoff_address.trim(), delivery_code: genCode(), fee: 5.00,
    }).select('id, delivery_code').single()
    if (insertErr || !order) return NextResponse.json({ error: insertErr?.message || 'falha ao criar entrega' }, { status: 500 })

    await ensureEntregaWebhookRegistered()
    await offerToNextMotoboy(order.id, 1)

    return NextResponse.json({ ok: true, delivery_order_id: order.id, delivery_code: order.delivery_code })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha ao chamar motoboy' }, { status: 500 })
  }
}
