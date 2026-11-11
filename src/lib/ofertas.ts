import { createClient } from '@supabase/supabase-js'

// Ofertas por WhatsApp (nov/2026): a loja chama de volta quem parou de pedir, pelo PRÓPRIO WhatsApp dela.
// Regras combinadas com o Ricardo (um número de loja bloqueado é prejuízo dela): máximo 15 por dia por loja,
// 1 mensagem por vez com 2 a 4 minutos entre elas, só das 8h às 20h (Brasília), nunca para quem pediu
// pra sair, nunca para quem já recebeu oferta nos últimos 7 dias, e NUNCA cai no número da plataforma.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evo.trindadeonline.com.br'

export const LIMITE_OFERTAS_DIA = 15
export const INTERVALO_MIN_S = 120
export const INTERVALO_MAX_S = 240
export const HORA_INICIO = 8
export const HORA_FIM = 20 // exclusivo
export const DIAS_SEM_REPETIR = 7
export const RODAPE_SAIR = '\n\n(Para não receber mais mensagens, responda SAIR.)'

const BRT = 3 * 3600000

export const horaBrasilia = (d = new Date()) => new Date(d.getTime() - BRT).getUTCHours()
export const dentroDoHorario = (d = new Date()) => { const h = horaBrasilia(d); return h >= HORA_INICIO && h < HORA_FIM }
export function inicioDoDiaBR(d = new Date()): string {
  const br = new Date(d.getTime() - BRT)
  return new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate(), 3, 0, 0)).toISOString()
}

// Intervalo "aleatório" (2 a 4 min) mas estável para cada mensagem: derivado do id.
export function intervaloDoLog(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return INTERVALO_MIN_S + (h % (INTERVALO_MAX_S - INTERVALO_MIN_S + 1))
}

export { primeiroNome, personalizar } from '@/lib/ofertasTexto'

export async function lojaConectada(companyId: string): Promise<{ instance_name: string; api_key: string } | null> {
  const { data } = await sb.from('crm_whatsapp_instances').select('instance_name, api_key').eq('company_id', companyId).eq('status', 'connected').limit(1).maybeSingle()
  return data && data.api_key ? (data as { instance_name: string; api_key: string }) : null
}

// Envia UMA mensagem pelo WhatsApp da loja (sem reserva na plataforma) e registra na conversa do CRM.
export async function enviarPelaLoja(companyId: string, phone: string, nome: string | null, texto: string): Promise<{ ok: boolean; erro?: string }> {
  const inst = await lojaConectada(companyId)
  if (!inst) return { ok: false, erro: 'WhatsApp da loja desconectado' }
  try {
    const res = await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(inst.instance_name)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
      body: JSON.stringify({ number: phone, text: texto }),
    })
    if (!res.ok) return { ok: false, erro: `Evolution ${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}` }
    const j = await res.json().catch(() => null)
    const waId: string | null = j?.key?.id || null
    const agora = new Date().toISOString()
    let { data: contato } = await sb.from('crm_contacts').select('id').eq('company_id', companyId).eq('phone', phone).maybeSingle()
    if (!contato) {
      const { data: novo } = await sb.from('crm_contacts').insert({ company_id: companyId, phone, name: nome || null }).select('id').maybeSingle()
      contato = novo
    }
    if (contato) {
      await sb.from('crm_messages').insert({ company_id: companyId, contact_id: contato.id, direction: 'out', body: texto, status: 'sent', sent_at: agora, wa_message_id: waId, origem: 'campanha' })
      await sb.from('crm_contacts').update({ last_message_at: agora, last_message_preview: texto, last_message_direction: 'out' }).eq('id', contato.id)
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: String((e as Error)?.message || e).slice(0, 200) }
  }
}
