import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { moduleActive } from '@/lib/modules'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evo.trindadeonline.com.br'

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : '55' + digits
}

type Status = 'recebido' | 'em_preparo' | 'pronto' | 'saiu_entrega' | 'entregue' | 'cancelado'

function buildStatusMessage(status: Status, deliveryType: string | null): string | null {
  const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
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
export async function POST(req: NextRequest) {
  try {
    const { companyId, phone, status, deliveryType } = await req.json()
    if (!companyId || !phone || !status) return NextResponse.json({ error: 'dados obrigatórios' }, { status: 400 })

    const text = buildStatusMessage(status, deliveryType || null)
    if (!text) return NextResponse.json({ ok: true })

    const { data: company } = await supabase.from('companies').select('crm_whatsapp_enabled, trial_modules_until').eq('id', companyId).maybeSingle()
    if (!company || !moduleActive(company.crm_whatsapp_enabled, company.trial_modules_until)) return NextResponse.json({ ok: true })

    const { data: instance } = await supabase
      .from('crm_whatsapp_instances').select('instance_name, api_key')
      .eq('company_id', companyId).eq('status', 'connected').limit(1).maybeSingle()
    if (!instance) return NextResponse.json({ ok: true })

    await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(instance.instance_name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: instance.api_key },
      body: JSON.stringify({ number: formatPhone(phone), text }),
    })

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
  } catch {
    return NextResponse.json({ error: 'falha ao notificar' }, { status: 500 })
  }
}
