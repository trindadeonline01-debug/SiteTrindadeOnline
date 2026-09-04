import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { criarEntregaEChamarMotoboy } from '@/lib/entregaDispatch'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Chamado pelo botão "🏍️ Chamar motoboy" em /painel/pedidos. Valida que
// quem está pedindo é dono da empresa (ou admin) e delega a criação da
// entrega + chamada do motoboy pra criarEntregaEChamarMotoboy — a mesma
// função usada pelo disparo automático em /api/loja/registrar-pedido. O
// código de confirmação só é avisado pro cliente (e pro motoboy) quando
// alguém ACEITA a corrida — ver o branch "aceita" em /api/entrega/webhook.
export async function POST(req: NextRequest) {
  try {
    const { access_token, company_id, pedido_id, customer_name, customer_phone, dropoff_address } = await req.json()
    if (!access_token || !company_id || !customer_name?.trim() || !dropoff_address?.trim()) {
      return NextResponse.json({ error: 'dados faltando' }, { status: 400 })
    }

    const { data: userData, error: authError } = await supabaseAuth.auth.getUser(access_token)
    if (!userData?.user) return NextResponse.json({ error: `sessão inválida${authError ? ' — ' + authError.message : ''}` }, { status: 401 })

    const { data: company } = await supabase.from('companies').select('owner_id').eq('id', company_id).maybeSingle()
    if (!company) return NextResponse.json({ error: 'empresa não encontrada' }, { status: 404 })
    if (company.owner_id !== userData.user.id) {
      const { data: profile } = await supabase.from('profiles').select('user_type').eq('id', userData.user.id).maybeSingle()
      if (profile?.user_type !== 'admin') return NextResponse.json({ error: 'empresa não é sua' }, { status: 403 })
    }

    const result = await criarEntregaEChamarMotoboy({
      companyId: company_id, pedidoId: pedido_id || null, customerName: customer_name, customerPhone: customer_phone, dropoffAddress: dropoff_address,
    })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

    return NextResponse.json({ ok: true, delivery_order_id: result.deliveryOrderId, delivery_code: result.deliveryCode })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha ao chamar motoboy' }, { status: 500 })
  }
}
