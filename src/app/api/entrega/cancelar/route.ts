import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cancelarChamadaMotoboy } from '@/lib/entregaDispatch'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Chamado pelo botão "Cancelar" em /painel/pedidos — tanto no card do
// pedido quanto no banner "Nenhum motoboy aceitou" (sem_motoboy), lá em
// cima. Status permitido é checado dentro de cancelarChamadaMotoboy.
export async function POST(req: NextRequest) {
  try {
    const { access_token, company_id, delivery_order_id } = await req.json()
    if (!access_token || !company_id || !delivery_order_id) {
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

    const { data: order } = await supabase.from('delivery_orders').select('company_id').eq('id', delivery_order_id).maybeSingle()
    if (!order || order.company_id !== company_id) return NextResponse.json({ error: 'entrega não encontrada' }, { status: 404 })

    const result = await cancelarChamadaMotoboy(delivery_order_id)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[entrega/cancelar]', err)
    return NextResponse.json({ error: 'falha ao cancelar' }, { status: 500 })
  }
}
