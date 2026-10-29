import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// page_views e whatsapp_clicks só têm policy de SELECT pra admin (ver
// pg_policies: pv_admin/wa_admin) — o painel do lojista não lê essas tabelas
// direto do navegador. Essa rota devolve, pra empresa dele mesmo, só os
// agregados do funil (nunca linha a linha de outra empresa).
//
// Funil real de 2 estágios, não 3 — "clicou no WhatsApp" (whatsapp_clicks)
// e "fez pedido via conversa" são DOIS BOTÕES DIFERENTES sem vínculo de
// dado entre eles (um é o ícone de contato, outro já cria o pedido direto
// desde out/2026); não dá pra fingir que um é etapa do outro. O que é
// funil de verdade: visitou o cardápio → pediu pelo cardápio.
export async function POST(req: NextRequest) {
  try {
    const { access_token, company_id, from, to } = await req.json()
    if (!access_token || !company_id) return NextResponse.json({ error: 'dados faltando' }, { status: 400 })

    const { data: userData, error: authError } = await supabaseAuth.auth.getUser(access_token)
    if (!userData?.user) return NextResponse.json({ error: `sessão inválida${authError ? ' — ' + authError.message : ''}` }, { status: 401 })

    const { data: company } = await supabase.from('companies').select('owner_id').eq('id', company_id).maybeSingle()
    if (!company || company.owner_id !== userData.user.id) {
      return NextResponse.json({ error: 'empresa não é sua' }, { status: 403 })
    }

    let vq = supabase.from('page_views').select('created_at').eq('page', '/cardapio').eq('entity_id', company_id).limit(20000)
    if (from) vq = vq.gte('created_at', from)
    if (to) vq = vq.lt('created_at', to)
    const { data: visitasRows } = await vq

    let pq = supabase.from('loja_pedidos').select('created_at,total,status,origin').eq('company_id', company_id).in('origin', ['cardapio_publico', 'conversa']).limit(20000)
    if (from) pq = pq.gte('created_at', from)
    if (to) pq = pq.lt('created_at', to)
    const { data: pedidosRows } = await pq

    let cq = supabase.from('whatsapp_clicks').select('id', { count: 'exact', head: true }).eq('company_id', company_id)
    if (from) cq = cq.gte('created_at', from)
    if (to) cq = cq.lt('created_at', to)
    const { count: cliquesCount } = await cq

    const pedidosValidos = (pedidosRows || []).filter(p => p.status !== 'cancelado')

    return NextResponse.json({
      visitas: (visitasRows || []).map(r => r.created_at),
      pedidos: pedidosValidos.map(p => ({ created_at: p.created_at, total: Number(p.total) })),
      cliquesWhatsapp: cliquesCount || 0,
    })
  } catch (err: any) {
    console.error('[painel/whatsapp-funil]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
