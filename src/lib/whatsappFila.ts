import { createClient } from '@supabase/supabase-js'
import { sendPlatformWhatsApp } from '@/lib/whatsapp'

// Fila de WhatsApp automático (lembrete de plano/trial, aviso em lote) pelo
// número da PLATAFORMA. Nunca manda junto: cada aviso entra como 1 linha em
// blast_logs, de uma campanha com status 'fila', e o cron
// /api/cron/whatsapp-fila (pg_cron a cada 5 min) manda UMA mensagem por vez.
// Motivo (out/2026): o lembrete "vence em 5 dias" saiu pra 198 empresas em
// 3 minutos e o WhatsApp do Ricardo foi bloqueado na hora.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evo.trindadeonline.com.br'
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || ''
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'Trindade Online'

export const FILA_STATUS = 'fila'
// Intervalo mínimo entre DUAS mensagens quaisquer da plataforma em lote
// (fila ou campanha do admin) — 4,5 min, pro pg_cron de 5 em 5 nunca
// pular uma rodada por diferença de segundos.
const INTERVALO_MIN_MS = 270_000
// Só manda em horário comercial de Brasília (sem horário de verão desde 2019).
const HORA_INICIO = 8
const HORA_FIM = 20

export type ItemFila = { phone: string; nome: string; texto: string }

// Agrupa os avisos de uma rodada numa campanha só (aparece em Disparos do admin).
export async function enfileirarWhatsApp(nomeCampanha: string, itens: ItemFila[]): Promise<number> {
  const validos = itens.filter(i => i.phone && i.texto)
  if (validos.length === 0) return 0
  const { data: campaign, error } = await supabase.from('blast_campaigns').insert({
    name: nomeCampanha,
    messages: [],
    filter: 'automatico',
    delay_min: 300,
    delay_max: 300,
    total_contacts: validos.length,
    status: FILA_STATUS,
  }).select('id').single()
  if (error || !campaign) { console.error('[whatsappFila] não criou campanha', error); return 0 }
  const { error: logErr } = await supabase.from('blast_logs').insert(validos.map(i => ({
    campaign_id: campaign.id, phone: i.phone, contact_name: i.nome, company_name: i.nome,
    message_sent: i.texto, status: 'pending',
  })))
  if (logErr) { console.error('[whatsappFila] não enfileirou', logErr); return 0 }
  return validos.length
}

async function instanciaConectada(): Promise<boolean> {
  try {
    const res = await fetch(`${EVOLUTION_URL}/instance/connectionState/${encodeURIComponent(EVOLUTION_INSTANCE)}`, { headers: { apikey: EVOLUTION_KEY } })
    if (!res.ok) return false
    const data = await res.json()
    return data?.instance?.state === 'open'
  } catch {
    return false
  }
}

// Uma rodada do cron: manda no máximo 1 mensagem.
export async function processarFilaWhatsApp(): Promise<{ enviado: boolean; motivo?: string }> {
  const horaBrasilia = (new Date().getUTCHours() - 3 + 24) % 24
  if (horaBrasilia < HORA_INICIO || horaBrasilia >= HORA_FIM) return { enviado: false, motivo: 'fora do horário' }

  const desde = new Date(Date.now() - INTERVALO_MIN_MS).toISOString()
  const { count: recentes } = await supabase.from('blast_logs')
    .select('id', { count: 'exact', head: true }).gte('sent_at', desde)
  if ((recentes || 0) > 0) return { enviado: false, motivo: 'intervalo mínimo' }

  const { data: campanhas } = await supabase.from('blast_campaigns')
    .select('id').eq('status', FILA_STATUS).order('created_at', { ascending: true })
  if (!campanhas?.length) return { enviado: false, motivo: 'fila vazia' }

  for (const camp of campanhas) {
    const { data: item } = await supabase.from('blast_logs')
      .select('id, phone, message_sent').eq('campaign_id', camp.id).eq('status', 'pending')
      .order('created_at', { ascending: true }).limit(1).maybeSingle()
    if (!item) {
      await supabase.from('blast_campaigns').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', camp.id)
      continue
    }

    // WhatsApp caído/bloqueado: não queima a fila — tenta na próxima rodada.
    if (!(await instanciaConectada())) return { enviado: false, motivo: 'whatsapp desconectado' }

    const { data: claimed } = await supabase.from('blast_logs')
      .update({ status: 'sending' }).eq('id', item.id).eq('status', 'pending').select('id')
    if (!claimed?.length) return { enviado: false, motivo: 'concorrência' }

    const r = item.message_sent
      ? await sendPlatformWhatsApp(item.phone, item.message_sent)
      : { ok: false, detail: 'mensagem vazia' }
    await supabase.from('blast_logs').update({
      status: r.ok ? 'sent' : 'failed', error_message: r.detail || null, sent_at: new Date().toISOString(),
    }).eq('id', item.id)
    const { data: c } = await supabase.from('blast_campaigns').select('sent_count, failed_count, started_at').eq('id', camp.id).single()
    await supabase.from('blast_campaigns').update(r.ok
      ? { sent_count: (c?.sent_count || 0) + 1, started_at: c?.started_at || new Date().toISOString() }
      : { failed_count: (c?.failed_count || 0) + 1, started_at: c?.started_at || new Date().toISOString() }
    ).eq('id', camp.id)
    return { enviado: r.ok, motivo: r.ok ? undefined : r.detail }
  }
  return { enviado: false, motivo: 'fila vazia' }
}
