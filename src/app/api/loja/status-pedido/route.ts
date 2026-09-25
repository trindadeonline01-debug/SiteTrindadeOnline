import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { moduleActive } from '@/lib/modules'
import { normalizePhone } from '@/lib/phone'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evo.trindadeonline.com.br'

type Status = 'recebido' | 'em_preparo' | 'pronto' | 'saiu_entrega' | 'entregue' | 'cancelado'

function buildStatusMessage(status: Status, deliveryType: string | null): string | null {
  // Servidor roda em UTC (Vercel) — sem timeZone explícito aqui a mensagem
  // saía com a hora certa em Londres, não na Trindade.
  const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
  switch (status) {
    case 'em_preparo': return '👨‍🍳 Seu pedido já está em preparo!'
    case 'pronto': return deliveryType === 'retirada' ? '✅ Seu pedido está pronto! Pode vir retirar.' : '✅ Seu pedido está pronto e já vai sair para entrega!'
    case 'saiu_entrega': return '🚴 Seu pedido acabou de sair para entrega!'
    case 'entregue': return deliveryType === 'retirada'
      ? `📦 Retirada confirmada às ${hora}. Obrigado pela preferência!`
      : '🎉 Pedido entregue! Obrigado pela preferência, bom apetite!'
    case 'cancelado': return '❌ Seu pedido foi cancelado.'
    default: return null
  }
}

// Chamado (fire-and-forget) sempre que o lojista avança o status de um pedido
// em /painel/pedidos ou /painel/cozinha — manda a atualização como
// mensagem de WhatsApp de verdade pro cliente, além do push já existente.
//
// O recibo completo (itens, pagamento, taxa, total) só sai UMA vez, na
// confirmação do pedido (registrar-pedido) — mandar de novo aqui quando o
// pedido entra em preparo duplicava a mensagem inteira pro cliente, o que
// o Ricardo pediu pra tirar (set/2026): a partir daqui é só status curto.
export async function POST(req: NextRequest) {
  try {
    const { companyId, pedidoId, phone: rawPhone, status, deliveryType } = await req.json()
    if (!companyId || !rawPhone || !status) return NextResponse.json({ error: 'dados obrigatórios' }, { status: 400 })
    const phone = normalizePhone(rawPhone)

    let text = buildStatusMessage(status, deliveryType || null)
    if (!text) return NextResponse.json({ ok: true })

    // Código de confirmação vai junto só aqui — quando a LOJA de fato marca
    // saiu_entrega — nunca antes disso. Cobre os dois motoboys possíveis:
    // PRÓPRIO (código gerado em /painel/pedidos ao atribuir) ou da
    // PLATAFORMA/Trindade Entrega (código em delivery_orders, motoboy aceita
    // por conta própria via WhatsApp e pode aceitar antes do pedido ficar
    // pronto — por isso esse aviso não pode disparar na hora do aceite,
    // bug real reportado pelo Ricardo, set/2026).
    if (status === 'saiu_entrega' && pedidoId) {
      const { data: pedido } = await supabase
        .from('loja_pedidos').select('delivery_confirm_code, motoboy_id').eq('id', pedidoId).eq('company_id', companyId).maybeSingle()
      if (pedido?.motoboy_id && pedido.delivery_confirm_code) {
        text += `\n\n🔑 Código de confirmação: *${pedido.delivery_confirm_code}*\nInforme esse número pro entregador quando ele chegar.`
      } else {
        const { data: entrega } = await supabase
          .from('delivery_orders').select('delivery_code, motoboy_name').eq('pedido_id', pedidoId).eq('company_id', companyId).maybeSingle()
        if (entrega?.delivery_code) {
          text += `\n\n🏍️ ${entrega.motoboy_name ? `${entrega.motoboy_name} está a caminho.\n` : ''}🔑 Código de entrega: *${entrega.delivery_code}*\nMostre esse número pro motoboy quando ele chegar.`
        }
      }
    }

    const { data: company } = await supabase.from('companies').select('crm_whatsapp_enabled, trial_modules_until').eq('id', companyId).maybeSingle()
    if (!company || !moduleActive(company.crm_whatsapp_enabled, company.trial_modules_until)) return NextResponse.json({ ok: true })

    const { data: instance } = await supabase
      .from('crm_whatsapp_instances').select('instance_name, api_key')
      .eq('company_id', companyId).eq('status', 'connected').limit(1).maybeSingle()
    if (!instance) return NextResponse.json({ ok: true })

    const res = await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(instance.instance_name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: instance.api_key },
      body: JSON.stringify({ number: phone, text }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[status-pedido] envio falhou (${res.status}): ${body.slice(0, 300)}`)
      return NextResponse.json({ ok: true })
    }

    const { data: contact } = await supabase.from('crm_contacts').select('id').eq('company_id', companyId).eq('phone', phone).maybeSingle()
    if (contact) {
      await supabase.from('crm_messages').insert({
        company_id: companyId, contact_id: contact.id, direction: 'out', body: text, status: 'sent', sent_at: new Date().toISOString(),
      })
      await supabase.from('crm_contacts').update({
        last_message_at: new Date().toISOString(), last_message_preview: text, last_message_direction: 'out',
      }).eq('id', contact.id)
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[status-pedido] falha geral:', err?.message || err)
    return NextResponse.json({ error: 'falha ao notificar' }, { status: 500 })
  }
}
