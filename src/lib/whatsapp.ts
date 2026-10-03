import { createClient } from '@supabase/supabase-js'
import { moduleActive } from '@/lib/modules'

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
    // Normaliza UMA vez e reusa pro envio E pra busca do contato — quem
    // chama aqui às vezes passa o telefone cru, sem DDI (ex: delivery_orders.
    // customer_phone), e crm_contacts.phone sempre guarda COM o 55. Buscar
    // com o valor cru nunca achava o contato: a mensagem saía (ou falhava
    // calada — sem checar `res.ok` também), mas nunca ficava registrada na
    // conversa do CRM. Achado real do Ricardo, set/2026: motoboy confirmou
    // entrega da Trindade Entrega e "seu pedido foi entregue" nunca chegou/
    // apareceu pro cliente.
    const normalized = formatPhone(phone)
    const { data: instance } = await supabase
      .from('crm_whatsapp_instances').select('instance_name, api_key')
      .eq('company_id', companyId).eq('status', 'connected').limit(1).maybeSingle()
    if (!instance) return
    const res = await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(instance.instance_name)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: instance.api_key },
      body: JSON.stringify({ number: normalized, text }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[sendCustomerWhatsApp] Evolution respondeu ${res.status}: ${body.slice(0, 300)}`)
      return
    }
    // Grava o wa_message_id real (igual /api/crm/enviar já faz) — se a
    // Evolution algum dia ecoar essa mensagem de volta pelo webhook, o
    // dedup por wa_message_id lá já filtra sozinho, sem deixar essa mensagem
    // da própria IA ser confundida com "o dono digitou direto do celular"
    // (ver a troca pra atendimento_modo='humano' em api/crm/webhook).
    const resData = await res.json().catch(() => null)
    const waMessageId: string | null = resData?.key?.id || null
    const { data: contact } = await supabase.from('crm_contacts').select('id').eq('company_id', companyId).eq('phone', normalized).maybeSingle()
    if (contact) {
      await supabase.from('crm_messages').insert({ company_id: companyId, contact_id: contact.id, direction: 'out', body: text, status: 'sent', sent_at: new Date().toISOString(), wa_message_id: waMessageId })
      await supabase.from('crm_contacts').update({ last_message_at: new Date().toISOString(), last_message_preview: text, last_message_direction: 'out' }).eq('id', contact.id)
    }
  } catch (err: any) {
    console.error('[sendCustomerWhatsApp] falha ao mandar WhatsApp pro cliente:', err?.message || err)
  }
}

// Mensagem "novo pedido" pro DONO da loja — WhatsApp de verdade, pela
// própria instância da loja (não a da plataforma). Achado real, out/2026
// (Michelly Bem Doce, pedido #2): instância conectada, telefone certo no
// perfil, tudo configurado certinho — mesmo assim a mensagem nunca saiu.
// Testado na mão direto contra a Evolution API (mesma instância/telefone):
// enviou normal, 201. A causa não era configuração nem a Evolution — era
// essa notificação depender de registrar-pedido ser chamado via fetch de
// servidor-pra-servidor de dentro de criar-pedido (outra function
// serverless, sem log nenhum se esse fetch falhasse). Essa função agora é
// chamada DIRETO, no mesmo processo, de quem cria o pedido — mesmo padrão
// já usado (e que já funcionava) pro aviso de admin em criar-pedido.
//
// Telefone: primeiro tenta o cadastrado no perfil do dono; se não tiver,
// cai pro número que está DE FATO escaneado na instância (ownerJid, via
// fetchInstances da Evolution) — pedido do Ricardo, out/2026: "pelo menos
// pro telefone que tá escaneado", pra não depender só do perfil estar
// preenchido certo.
export async function notifyOwnerNewOrder(companyId: string, text: string): Promise<{ ok: boolean; detail?: string }> {
  try {
    const { data: company } = await supabase.from('companies').select('owner_id, crm_whatsapp_enabled, trial_modules_until').eq('id', companyId).maybeSingle()
    if (!company) return { ok: false, detail: 'empresa não encontrada' }
    if (!moduleActive(company.crm_whatsapp_enabled, company.trial_modules_until)) return { ok: false, detail: 'módulo CRM WhatsApp não ativo' }
    const { data: instance } = await supabase
      .from('crm_whatsapp_instances').select('instance_name, api_key')
      .eq('company_id', companyId).eq('status', 'connected').limit(1).maybeSingle()
    if (!instance) return { ok: false, detail: 'sem instância conectada' }

    const { data: owner } = company.owner_id
      ? await supabase.from('profiles').select('phone').eq('id', company.owner_id).maybeSingle()
      : { data: null }
    let targetPhone = owner?.phone ? formatPhone(owner.phone) : null
    if (!targetPhone) {
      try {
        const fiRes = await fetch(`${EVOLUTION_URL}/instance/fetchInstances?instanceName=${encodeURIComponent(instance.instance_name)}`, {
          headers: { apikey: instance.api_key },
        })
        if (fiRes.ok) {
          const fi = await fiRes.json()
          const ownerJid: string | undefined = Array.isArray(fi) ? fi[0]?.ownerJid : fi?.ownerJid
          if (ownerJid) targetPhone = ownerJid.split('@')[0]
        }
      } catch {
        // segue sem o fallback — melhor tentar o telefone do perfil (se
        // tiver, já tentou acima) do que travar o pedido por causa disso
      }
    }
    if (!targetPhone) return { ok: false, detail: 'sem telefone do dono nem número escaneado pra mandar' }

    const res = await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(instance.instance_name)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: instance.api_key },
      body: JSON.stringify({ number: targetPhone, text }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      const detail = `Evolution respondeu ${res.status}: ${body.slice(0, 300)}`
      console.error(`[notifyOwnerNewOrder] ${detail}`)
      return { ok: false, detail }
    }
    return { ok: true }
  } catch (err: any) {
    const detail = `falha ao mandar WhatsApp pro dono: ${err?.message || err}`
    console.error(`[notifyOwnerNewOrder] ${detail}`)
    return { ok: false, detail }
  }
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
