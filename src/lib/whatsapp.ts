import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evo.trindadeonline.com.br'
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || ''
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'Trindade Online'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.trindadeonline.com.br'

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : '55' + digits
}

// Módulo separado de entregaDispatch.ts DE PROPÓSITO (set/2026): esse aqui
// não importa sharp. entregaDispatch.ts importa sharp (binário nativo) pra
// recortar a foto do banner de entrega — e esse import, mesmo sem a função
// ser chamada, já é o bastante pra puxar o binário pro bundle da função
// serverless inteira. É o MESMO problema já documentado no KNOWLEDGE_BASE.md
// pra opengraph-image.tsx (crash de inicialização de módulo na Vercel).
// Rotas que só mandam WhatsApp de texto simples (código de verificação de
// cadastro, aprovação de motoboy, etc.) não podem ficar reféns desse
// binário — daí essas funções moraram aqui, e entregaDispatch.ts reusa
// (re-exporta) em vez de duplicar.
export async function sendPlatformWhatsApp(phone: string, text: string): Promise<{ ok: boolean; detail?: string }> {
  try {
    const res = await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(EVOLUTION_INSTANCE)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
      body: JSON.stringify({ number: formatPhone(phone), text }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      const detail = `Evolution respondeu ${res.status}: ${body.slice(0, 300)}`
      console.error(`[sendPlatformWhatsApp] ${detail}`)
      return { ok: false, detail }
    }
    return { ok: true }
  } catch (err: any) {
    const detail = `falha ao chamar a Evolution API: ${err?.message || err}`
    console.error(`[sendPlatformWhatsApp] ${detail}`)
    return { ok: false, detail }
  }
}
export const sendMotoboyWhatsApp = sendPlatformWhatsApp

// Mesma instância da plataforma, mas manda a legenda junto de uma imagem já
// pronta (URL) — não recorta/reprocessa nada, então não precisa de sharp.
export async function sendPlatformWhatsAppImage(phone: string, imageUrl: string, caption: string): Promise<{ ok: boolean; detail?: string }> {
  try {
    const res = await fetch(`${EVOLUTION_URL}/message/sendMedia/${encodeURIComponent(EVOLUTION_INSTANCE)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
      body: JSON.stringify({ number: formatPhone(phone), mediatype: 'image', media: imageUrl, caption }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      const detail = `Evolution respondeu ${res.status}: ${body.slice(0, 300)}`
      console.error(`[sendPlatformWhatsAppImage] ${detail}`)
      return { ok: false, detail }
    }
    return { ok: true }
  } catch (err: any) {
    const detail = `falha ao chamar a Evolution API: ${err?.message || err}`
    console.error(`[sendPlatformWhatsAppImage] ${detail}`)
    return { ok: false, detail }
  }
}

// Manda mensagem pro CLIENTE pela instância WhatsApp da PRÓPRIA loja (não a
// da plataforma) — mesma conversa do CRM dela, se estiver conectado.
export async function sendCustomerWhatsApp(companyId: string, phone: string | null | undefined, text: string) {
  if (!phone) return
  try {
    const { data: instance } = await supabase
      .from('crm_whatsapp_instances').select('instance_name, api_key')
      .eq('company_id', companyId).eq('status', 'connected').limit(1).maybeSingle()
    if (!instance) return
    await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(instance.instance_name)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: instance.api_key },
      body: JSON.stringify({ number: formatPhone(phone), text }),
    })
    const { data: contact } = await supabase.from('crm_contacts').select('id').eq('company_id', companyId).eq('phone', phone).maybeSingle()
    if (contact) {
      await supabase.from('crm_messages').insert({ company_id: companyId, contact_id: contact.id, direction: 'out', body: text, status: 'sent', sent_at: new Date().toISOString() })
      await supabase.from('crm_contacts').update({ last_message_at: new Date().toISOString(), last_message_preview: text, last_message_direction: 'out' }).eq('id', contact.id)
    }
  } catch {}
}

// Self-heal do webhook da instância da PLATAFORMA pra receber as respostas
// dos motoboys. Só registra uma vez; guarda o "já registrei" em settings.
export async function ensureEntregaWebhookRegistered() {
  try {
    const { data } = await supabase.from('settings').select('value').eq('key', 'entrega_webhook_registered').maybeSingle()
    if (data?.value === 'true') return
    const res = await fetch(`${EVOLUTION_URL}/webhook/set/${encodeURIComponent(EVOLUTION_INSTANCE)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
      body: JSON.stringify({
        webhook: { enabled: true, url: `${SITE_URL}/api/entrega/webhook`, byEvents: false, base64: false, events: ['MESSAGES_UPSERT'] },
      }),
    })
    if (res.ok) await supabase.from('settings').upsert({ key: 'entrega_webhook_registered', value: 'true' }, { onConflict: 'key' })
  } catch {}
}
