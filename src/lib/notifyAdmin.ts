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
