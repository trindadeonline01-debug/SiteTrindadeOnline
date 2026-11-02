import type { SupabaseClient } from '@supabase/supabase-js'
import { isOpenNow, type HourRow } from '@/lib/businessHours'

// POLÍTICA DE DECISÃO DO FOLLOW-UP (docs/DESENHO_FOLLOWUP.md, seção 6).
// Roda na hora de processar o item da fila — nunca na hora de criar. Devolve
// SEMPRE uma decisão com motivo, pra nada sumir em silêncio. Não envia nada:
// quem envia (ou só simula, no modo sombra) é a rota que chama esta função.

export type FollowupItem = {
  id: string
  company_id: string
  contact_id: string
  passo: number
  ancora_msg_id: string
  due_at: string
}

export type Decisao =
  | { acao: 'enviar'; motivo: 'ok'; historico: { direction: 'in' | 'out'; body: string }[]; phone: string; companyName: string }
  | { acao: 'ignorar' | 'cancelar' | 'expirar'; motivo: string }

const ATRASO_MAX_MS = 3 * 60 * 60 * 1000 // item vencido há mais de 3h nunca dispara
const JANELA_SEM_HORARIO = { inicio: 9 * 60, fim: 18 * 60 } // lojas sem horário fixo: 9h–18h
const FOLGA_ANTES_DE_FECHAR_MIN = 10
const LIMITE_DIARIO_PADRAO = 30
const CICLO_DIAS = 7

const RE_PERGUNTA = /\?|\b(quer|queria|gostaria|prefere|posso|pode me|me (diz|fala|conta|passa|manda)|escolh|link)/i
const RE_SENSIVEL = /(reclam|absurdo|demor|errad|p[ée]ssim|horr[ií]vel|cancel|reembols|estorn|n[ãa]o chegou|procon|denunci|golpe)/i
const RE_PARAR = /(\bparar\b|para de (me )?(mandar|enviar)|\bchega\b|n[ãa]o quero mais|me tira|sair da lista|n[ãa]o me (chame|mande))/i

function spNow(): { day: number; minutes: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date())
  const m: Record<string, string> = {}
  parts.forEach(p => { m[p.type] = p.value })
  const wk: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const hour = parseInt(m.hour, 10)
  return { day: wk[m.weekday] ?? 0, minutes: hour * 60 + parseInt(m.minute, 10), hour }
}

// Minutos que faltam pra loja fechar no intervalo que cobre "agora" (null = não achou).
function minutosAteFechar(hours: HourRow[]): number | null {
  const { day, minutes } = spNow()
  const ontem = (day + 6) % 7
  const cands: number[] = []
  for (const h of hours) {
    if (h.closed || !h.open_time || !h.close_time) continue
    const [oh, om] = h.open_time.split(':').map(Number)
    const [ch, cm] = h.close_time.split(':').map(Number)
    const abre = oh * 60 + om
    let fecha = ch * 60 + cm
    if (fecha <= abre) fecha += 1440
    if (h.day_of_week === day && minutes >= abre && minutes <= fecha) cands.push(fecha - minutes)
    if (h.day_of_week === ontem && minutes + 1440 >= abre && minutes + 1440 <= fecha) cands.push(fecha - (minutes + 1440))
  }
  return cands.length ? Math.max(...cands) : null
}

function variantesTelefone(phone: string): string[] {
  const d = phone.replace(/\D/g, '')
  const sem55 = d.startsWith('55') ? d.slice(2) : d
  return Array.from(new Set([d, sem55, `55${sem55}`]))
}

export async function avaliarFollowup(supabase: SupabaseClient, item: FollowupItem): Promise<Decisao> {
  // Atrasado demais (queda do WhatsApp/Vercel): nunca dispara em rajada.
  if (Date.now() - new Date(item.due_at).getTime() > ATRASO_MAX_MS) return { acao: 'expirar', motivo: 'atrasado_mais_de_3h' }

  const [{ data: company }, { data: contact }] = await Promise.all([
    supabase.from('companies')
      .select('id, name, followup_modo, flexible_hours, store_paused, store_forced_open, crm_daily_send_limit, hours:company_hours(day_of_week, open_time, close_time, closed)')
      .eq('id', item.company_id).maybeSingle(),
    supabase.from('crm_contacts')
      .select('id, phone, muted, archived, atendimento_modo, pediu_humano_em, followup_optout')
      .eq('id', item.contact_id).maybeSingle(),
  ])
  if (!company || !contact) return { acao: 'cancelar', motivo: 'dados_sumiram' }
  if (company.followup_modo === 'off') return { acao: 'cancelar', motivo: 'loja_desligada' }

  if (contact.followup_optout) return { acao: 'ignorar', motivo: 'optout' }
  if (contact.muted || contact.archived) return { acao: 'ignorar', motivo: 'contato_silenciado_ou_arquivado' }
  if (contact.atendimento_modo === 'humano' || contact.pediu_humano_em) return { acao: 'ignorar', motivo: 'atendimento_humano' }

  const { data: msgsDesc } = await supabase
    .from('crm_messages')
    .select('id, direction, body, sent_at, status, origem, deleted_at')
    .eq('contact_id', item.contact_id)
    .order('sent_at', { ascending: false }).limit(25)
  const todas = (msgsDesc || []) as { id: string; direction: 'in' | 'out'; body: string | null; sent_at: string; status: string | null; origem: string | null; deleted_at: string | null }[]

  const ancora = todas.find(m => m.id === item.ancora_msg_id)
  if (!ancora || ancora.deleted_at) return { acao: 'cancelar', motivo: 'ancora_sumiu' }

  // Última mensagem "de verdade" tem que ser a âncora (o lembrete do passo 1 é transparente).
  const ultima = todas.find(m => m.origem !== 'followup')
  if (!ultima || ultima.id !== ancora.id) return { acao: 'cancelar', motivo: 'conversa_andou' }

  if (ancora.origem !== 'ia') return { acao: 'ignorar', motivo: 'ancora_nao_e_conversa_ia' }
  if (!ancora.body || !RE_PERGUNTA.test(ancora.body)) return { acao: 'ignorar', motivo: 'ancora_nao_espera_resposta' }
  if (ancora.status !== 'delivered' && ancora.status !== 'read') return { acao: 'ignorar', motivo: 'mensagem_nao_entregue' }

  // Conversa ativa: cliente falou nas últimas 24h.
  const ultimaDoCliente = todas.find(m => m.direction === 'in')
  if (!ultimaDoCliente || Date.now() - new Date(ultimaDoCliente.sent_at).getTime() > 24 * 3600 * 1000) {
    return { acao: 'ignorar', motivo: 'cliente_inativo_24h' }
  }

  const doCliente = todas.filter(m => m.direction === 'in').slice(0, 6).map(m => m.body || '').join('\n')
  if (RE_PARAR.test(doCliente)) return { acao: 'ignorar', motivo: 'possivel_pedido_para_parar' }
  if (RE_SENSIVEL.test(doCliente)) return { acao: 'ignorar', motivo: 'conversa_sensivel' }

  // Passo 2 só depois de um passo 1 de fato enviado/simulado nesta mesma âncora.
  const { data: doContato } = await supabase
    .from('crm_followups')
    .select('id, passo, ancora_msg_id, status, processado_em')
    .eq('contact_id', item.contact_id).in('status', ['simulado', 'enviado'])
    .gte('processado_em', new Date(Date.now() - CICLO_DIAS * 24 * 3600 * 1000).toISOString())
  const anteriores = (doContato || []) as { id: string; passo: number; ancora_msg_id: string; status: string; processado_em: string }[]

  if (item.passo === 2 && !anteriores.some(f => f.ancora_msg_id === item.ancora_msg_id && f.passo === 1)) {
    return { acao: 'ignorar', motivo: 'passo1_nao_enviado' }
  }
  // Ciclo anterior (outra âncora) sem nenhuma resposta do cliente desde então: só depois de 7 dias.
  const outrosCiclos = anteriores.filter(f => f.ancora_msg_id !== item.ancora_msg_id)
  if (outrosCiclos.length) {
    const ultimoToque = Math.max(...outrosCiclos.map(f => new Date(f.processado_em).getTime()))
    const respondeuDepois = todas.some(m => m.direction === 'in' && new Date(m.sent_at).getTime() > ultimoToque)
    if (!respondeuDepois) return { acao: 'ignorar', motivo: 'ciclo_anterior_sem_resposta_7d' }
  }

  // Já comprou depois da âncora (qualquer canal) ou tem Pix em andamento.
  const tels = variantesTelefone(contact.phone)
  const { data: pedidos } = await supabase
    .from('loja_pedidos').select('id')
    .eq('company_id', item.company_id).in('customer_phone', tels)
    .gt('created_at', ancora.sent_at).neq('status', 'cancelado').limit(1)
  if (pedidos && pedidos.length) return { acao: 'cancelar', motivo: 'pedido_depois_da_ancora' }
  const { data: pix } = await supabase
    .from('loja_pagamentos_pendentes').select('payload')
    .eq('company_id', item.company_id).eq('status', 'aguardando')
    .gt('created_at', new Date(Date.now() - 2 * 3600 * 1000).toISOString()).limit(20)
  const digitos = tels[1].slice(-9)
  if ((pix || []).some(p => JSON.stringify((p as any).payload || {}).replace(/\D/g, '').includes(digitos))) {
    return { acao: 'cancelar', motivo: 'pix_em_andamento' }
  }

  // Horário: loja pausada/fechada cancela (nunca adia); sem horário fixo = 9h–18h.
  if (company.store_paused) return { acao: 'cancelar', motivo: 'loja_pausada' }
  const hours = ((company.hours as any[]) || []) as HourRow[]
  const sp = spNow()
  const semHorarioFixo = !!company.flexible_hours || (hours.length === 0 && !!company.store_forced_open)
  if (semHorarioFixo) {
    if (sp.minutes < JANELA_SEM_HORARIO.inicio || sp.minutes >= JANELA_SEM_HORARIO.fim) return { acao: 'cancelar', motivo: 'fora_da_janela_9_18' }
    if (JANELA_SEM_HORARIO.fim - sp.minutes <= FOLGA_ANTES_DE_FECHAR_MIN) return { acao: 'cancelar', motivo: 'perto_de_fechar' }
  } else {
    if (!isOpenNow(hours, false, false, !!company.store_forced_open)) return { acao: 'cancelar', motivo: 'loja_fechada' }
    const falta = minutosAteFechar(hours)
    if (falta !== null && falta <= FOLGA_ANTES_DE_FECHAR_MIN) return { acao: 'cancelar', motivo: 'perto_de_fechar' }
  }

  // WhatsApp da loja conectado.
  const { data: inst } = await supabase
    .from('crm_whatsapp_instances').select('id').eq('company_id', item.company_id).eq('status', 'connected').limit(1)
  if (!inst || !inst.length) return { acao: 'ignorar', motivo: 'whatsapp_desconectado' }

  // Teto diário da loja.
  const inicioDia = new Date(Date.now() - sp.minutes * 60000) // ~meia-noite de Brasília
  const { count } = await supabase
    .from('crm_followups').select('id', { count: 'exact', head: true })
    .eq('company_id', item.company_id).in('status', ['simulado', 'enviado']).gte('processado_em', inicioDia.toISOString())
  const teto = company.crm_daily_send_limit && company.crm_daily_send_limit > 0 ? Math.min(company.crm_daily_send_limit, LIMITE_DIARIO_PADRAO) : LIMITE_DIARIO_PADRAO
  if ((count || 0) >= teto) return { acao: 'ignorar', motivo: 'limite_diario_da_loja' }

  const historico = [...todas].reverse()
    .filter(m => !!m.body?.trim() && !m.deleted_at)
    .slice(-20)
    .map(m => ({ direction: m.direction, body: m.body as string }))
  return { acao: 'enviar', motivo: 'ok', historico, phone: contact.phone, companyName: company.name }
}

// Textos de reserva, usados se a IA falhar ou estiver desligada para a loja.
export function textoReserva(passo: number): string {
  return passo === 1
    ? 'Oi! Conseguiu ver as opções? Se quiser, posso te ajudar a montar o pedido 😊'
    : 'Qualquer coisa é só chamar por aqui, tá? Se quiser, te mando o link do cardápio 🙂'
}

export const FRASE_OPTOUT = 'Se não quiser mais mensagens, é só me avisar.'
