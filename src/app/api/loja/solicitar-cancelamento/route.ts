import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/phone'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evo.trindadeonline.com.br'

// Chamado pela tela pública de acompanhamento (/pedido/[id]) — qualquer um
// com o link do pedido pode pedir, sem precisar estar logado (mesmo modelo
// de confiança da própria página: quem tem o link é quem fez o pedido).
// NUNCA cancela sozinho — só marca o pedido e avisa a loja, que decide
// (cancelar ou manter) em /painel/pedidos. Só a loja sabe se já está em
// preparo ou já saiu com o motoboy (Ricardo, set/2026).
export async function POST(req: NextRequest) {
  try {
    const { pedidoId } = await req.json()
    if (!pedidoId) return NextResponse.json({ error: 'pedido inválido' }, { status: 400 })

    const { data: pedido } = await supabase
      .from('loja_pedidos')
      .select('id, company_id, status, customer_name, cancelamento_solicitado_em')
      .eq('id', pedidoId).maybeSingle()
    if (!pedido) return NextResponse.json({ error: 'pedido não encontrado' }, { status: 404 })

    if (!['recebido', 'em_preparo'].includes(pedido.status)) {
      return NextResponse.json({ error: 'Esse pedido já passou da etapa em que dá pra pedir cancelamento — fala direto com a loja.' }, { status: 400 })
    }
    if (pedido.cancelamento_solicitado_em) return NextResponse.json({ ok: true })

    await supabase.from('loja_pedidos').update({ cancelamento_solicitado_em: new Date().toISOString() }).eq('id', pedidoId)

    const { data: company } = await supabase.from('companies').select('owner_id, name').eq('id', pedido.company_id).maybeSingle()
    const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.trindadeonline.com.br'

    if (company?.owner_id) {
      fetch(`${site}/api/push/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '🙋 Pedido de cancelamento', body: `${pedido.customer_name} pediu pra cancelar o pedido.`,
          target: 'external_user_id', userId: company.owner_id, url: `${site}/painel/pedidos`,
        }),
      }).catch(() => {})

      try {
        const { data: owner } = await supabase.from('profiles').select('phone').eq('id', company.owner_id).maybeSingle()
        if (owner?.phone) {
          const { data: instance } = await supabase
            .from('crm_whatsapp_instances').select('instance_name, api_key')
            .eq('company_id', pedido.company_id).eq('status', 'connected').limit(1).maybeSingle()
          if (instance) {
            await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(instance.instance_name)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: instance.api_key },
              body: JSON.stringify({ number: normalizePhone(owner.phone), text: `🙋 *Pedido de cancelamento*\n${pedido.customer_name} pediu pra cancelar o pedido. Decide em ${site}/painel/pedidos` }),
            })
          }
        }
      } catch (err: any) {
        console.error('[solicitar-cancelamento] falha ao avisar dono por WhatsApp:', err?.message || err)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[loja/solicitar-cancelamento]', err)
    return NextResponse.json({ error: 'falha ao solicitar cancelamento' }, { status: 500 })
  }
}
