import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evo.trindadeonline.com.br'
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || ''
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'Trindade Online'
const ADMIN_WHATSAPP = process.env.ADMIN_WHATSAPP_NUMBER || '21980239006'

export type AdminEvent =
  | { type: 'nova_empresa'; nome: string; categoria?: string }
  | { type: 'nova_sugestao'; empresa: string; sugestoes: string[] }
  | { type: 'nova_assinatura'; empresa: string; plano: string; valor: number }
  | { type: 'motoboy_reenviou'; nome: string }
  | { type: 'humano_solicitado'; empresa: string; contato: string; mensagem: string }
  | { type: 'mp_renovacao_falhou'; empresa: string; venceEm: string | null; motivo: string }
  | { type: 'pagamento_sem_pedido'; empresa: string; mpPaymentId: string }

function buildMessage(event: AdminEvent): string {
  if (event.type === 'nova_empresa') {
    return `🏪 Nova empresa cadastrada!\n\n${event.nome}${event.categoria ? `\n${event.categoria}` : ''}`
  }
  if (event.type === 'nova_sugestao') {
    return `💡 Nova sugestão de subcategoria!\n\n${event.empresa} sugeriu:\n${event.sugestoes.map(s => `• ${s}`).join('\n')}`
  }
  if (event.type === 'motoboy_reenviou') {
    return `🏍️ ${event.nome} reenviou os ajustes do cadastro de motoboy — confere em Admin → Entregas → Motoboys.`
  }
  if (event.type === 'pagamento_sem_pedido') {
    return `🚨 Pagamento aprovado SEM pedido criado — ${event.empresa}\nPagamento Mercado Pago: ${event.mpPaymentId}\n\nO cliente pagou mas o pedido não conseguiu ser salvo. O sistema segue tentando sozinho; se não aparecer em Pedidos, confira com a loja e o cliente.`
  }
  if (event.type === 'mp_renovacao_falhou') {
    return `⚠️ Mercado Pago: não consegui renovar o acesso da ${event.empresa}.${event.venceEm ? `\nVence em: ${event.venceEm}` : ''}\nMotivo: ${event.motivo}\n\nVou tentar de novo amanhã. Se continuar falhando, a loja precisa reconectar em Painel → Pagamentos antes de vencer.`
  }
  if (event.type === 'humano_solicitado') {
    return `🙋 ${event.empresa}: ${event.contato} pediu pra falar com um atendente de verdade.\n\nÚltima mensagem: "${event.mensagem}"`
  }
  return `💰 Nova assinatura!\n\n${event.empresa} assinou o ${event.plano} · R$ ${event.valor.toFixed(2).replace('.', ',')}`
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : '55' + digits
}

// Notifica o admin no WhatsApp — best-effort, nunca lança erro pro chamador
export async function notifyAdmin(event: AdminEvent): Promise<void> {
  try {
    const { data: flag } = await supabase.from('feature_flags').select('enabled').eq('key', 'notify_admin_whatsapp').maybeSingle()
    if (flag && flag.enabled === false) return

    await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(EVOLUTION_INSTANCE)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_KEY },
      body: JSON.stringify({ number: formatPhone(ADMIN_WHATSAPP), text: buildMessage(event) })
    })
  } catch {
    // notificação é best-effort — nunca deve derrubar o fluxo principal (cadastro, pagamento, etc.)
  }
}
