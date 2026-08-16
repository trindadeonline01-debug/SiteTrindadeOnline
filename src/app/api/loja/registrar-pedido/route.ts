import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Chamado (fire-and-forget) logo após um pedido ser criado no cardápio público
// ou lançado avulso no painel. Roda com service role porque o cliente final não
// tem permissão de escrita em crm_contacts/loja_produtos (RLS restringe ao dono).
export async function POST(req: NextRequest) {
  try {
    const { companyId, phone, name, address, total, items } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'companyId obrigatório' }, { status: 400 })

    if (phone) {
      const { data: existing } = await supabase
        .from('crm_contacts').select('total_orders, total_spent, address')
        .eq('company_id', companyId).eq('phone', phone).maybeSingle()
      await supabase.from('crm_contacts').upsert({
        company_id: companyId, phone, name: name || null,
        address: address || existing?.address || null,
        last_purchase_at: new Date().toISOString(),
        total_orders: (existing?.total_orders || 0) + 1,
        total_spent: Number(existing?.total_spent || 0) + Number(total || 0),
      }, { onConflict: 'company_id,phone' })
    }

    if (Array.isArray(items)) {
      for (const it of items) {
        if (!it?.produtoId || !it?.qty) continue
        const { data: prod } = await supabase.from('loja_produtos').select('total_pedidos').eq('id', it.produtoId).maybeSingle()
        if (prod) await supabase.from('loja_produtos').update({ total_pedidos: (prod.total_pedidos || 0) + Number(it.qty) }).eq('id', it.produtoId)
      }
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'falha ao registrar' }, { status: 500 })
  }
}
