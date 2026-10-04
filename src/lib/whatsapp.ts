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
    // Loja sem WhatsApp escaneado (instância não conectada): antes a
    // mensagem simplesmente não saía, calada — cliente nunca recebia nem o
    // código de entrega nem "pedido entregue" (achado real, out/2026,
    // Batataria Família B chamando motoboy avulso sem estar conectada).
    // Cai pro número da PLATAFORMA como reserva — pedido do Ricardo:
    // "pelo menos não deixa de funcionar". Não é a conversa do CRM da loja
    // (nunca passou pelo WhatsApp dela de verdade), então não tenta gravar
    // em crm_messages/crm_contacts — só garante que a mensagem chega.
    if (!instance) {
      await sendPlatformWhatsApp(normalized, text)
      return
    }
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

// Mensagem "novo pedido" pro DONO da loja. Primeira versão (out/2026)
// mandava pela própria instância da loja, dela pra ela mesma — corrigido
// o bug de nem sair (ver commit anterior), mas descoberto um segundo
// problema na sequência, também real (Michelly Bem Doce): mandar uma
// mensagem de um número PRA ELE MESMO no WhatsApp cai na conversa
// especial "Mensagens para você" (confirmado pelo `pushName:"Você"` que a
// Evolution devolveu no teste) — e o WhatsApp não notifica direito esse
// tipo de mensagem (não vibra, não aparece como alerta normal). A
// mensagem saía (201, confirmado), só que ninguém via.
//
// Agora sai pela instância da PLATAFORMA (mesma usada pro aviso que o
// Ricardo já recebe como admin, que sempre funcionou) — duas contas
// diferentes conversando de verdade, notifica normal. Telefone: o
// cadastrado no perfil do dono; se não tiver, cai pro número que está DE
// FATO escaneado na instância da loja (ownerJid, via fetchInstances da
// Evolution — usado só pra DESCOBRIR o número aqui, o envio em si nunca
// passa pela instância da loja) — pedido do Ricardo, out/2026: "pelo
// menos pro telefone que tá escaneado".
export async function notifyOwnerNewOrder(companyId: string, text: string): Promise<{ ok: boolean; detail?: string }> {
  try {
    const { data: company } = await supabase.from('companies').select('owner_id, crm_whatsapp_enabled, trial_modules_until').eq('id', companyId).maybeSingle()
    if (!company) return { ok: false, detail: 'empresa não encontrada' }
    if (!moduleActive(company.crm_whatsapp_enabled, company.trial_modules_until)) return { ok: false, detail: 'módulo CRM WhatsApp não ativo' }

    const { data: owner } = company.owner_id
      ? await supabase.from('profiles').select('phone').eq('id', company.owner_id).maybeSingle()
      : { data: null }
    let targetPhone = owner?.phone ? formatPhone(owner.phone) : null

    if (!targetPhone) {
      const { data: instance } = await supabase
        .from('crm_whatsapp_instances').select('instance_name, api_key')
        .eq('company_id', companyId).eq('status', 'connected').limit(1).maybeSingle()
      if (instance) {
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
          // segue sem o fallback — nada mais a tentar
        }
      }
    }
    if (!targetPhone) return { ok: false, detail: 'sem telefone do dono nem número escaneado pra mandar' }

    return await sendPlatformWhatsApp(targetPhone, text)
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
