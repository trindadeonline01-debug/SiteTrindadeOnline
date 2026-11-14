// Prêmio do Quiz (Pesca Premiada) — regras do servidor.
// O prêmio é um PERCENTUAL provisório até a conta da mesa ser paga e fechada; só ali vira valor em
// R$ (cashback). Regras (Ricardo, 5/nov/2026): vale a melhor rodada do dia da conta, no máximo
// 1 prêmio por conta e 1 prêmio por WhatsApp a cada 7 dias. Quem não tem WhatsApp confirmado
// na conta joga só pelo ranking.
import type { SupabaseClient } from '@supabase/supabase-js'
import { PORTAO_CASHBACK } from '@/lib/cacaPalavras'

export const QUIZ_PREMIO_INTERVALO_DIAS = 7
const H = 3_600_000

// Início da janela de rodadas que valem para a conta: 3 h antes de ela abrir (o cliente joga
// enquanto espera o pedido) ou, sem conta ainda, as últimas 6 h.
export function desdeDaConta(abertaEm?: string | null): string {
  return new Date(abertaEm ? new Date(abertaEm).getTime() - 3 * H : Date.now() - 6 * H).toISOString()
}

export async function jaGanhouNosUltimosDias(sb: SupabaseClient, companyId: string, jogadorId: string): Promise<boolean> {
  // vale para os dois jogos juntos: 1 prêmio por WhatsApp a cada 7 dias, seja do quiz ou do caça-palavras
  const desde = new Date(Date.now() - QUIZ_PREMIO_INTERVALO_DIAS * 24 * H).toISOString()
  const janela = new Date(Date.now() - (QUIZ_PREMIO_INTERVALO_DIAS + 1) * 24 * H).toISOString()
  const { data: rods } = await sb.from('quiz_rodadas').select('id').eq('company_id', companyId).eq('jogador_id', jogadorId).gte('iniciada_em', janela)
  const ids = (rods || []).map(r => r.id)
  if (ids.length) {
    const { count } = await sb.from('quiz_premios').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('estado', 'liberado').gte('criado_em', desde).in('rodada_id', ids)
    if ((count || 0) > 0) return true
  }
  const { data: rc } = await sb.from('caca_rodadas').select('id').eq('company_id', companyId).eq('jogador_id', jogadorId).gte('criada_em', janela)
  const ids2 = (rc || []).map(r => r.id)
  if (!ids2.length) return false
  const { count: c2 } = await sb.from('caca_premios').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('estado', 'liberado').gte('criado_em', desde).in('rodada_id', ids2)
  return (c2 || 0) > 0
}

// Melhor rodada encerrada do jogador (por telefone) na janela, que ainda não virou prêmio.
export async function melhorRodadaPremiavel(sb: SupabaseClient, companyId: string, telefone: string, desde: string): Promise<{ rodadaId: string; marco: number; jogadorId: string } | null> {
  const { data: j } = await sb.from('quiz_jogadores').select('id').eq('company_id', companyId).eq('telefone', telefone).maybeSingle()
  if (!j) return null
  const { data: rods } = await sb.from('quiz_rodadas').select('id, marco, pontos').eq('company_id', companyId).eq('jogador_id', j.id).eq('estado', 'encerrada').gt('marco', 0).not('mesa_id', 'is', null).gte('iniciada_em', desde).order('marco', { ascending: false }).order('pontos', { ascending: false }).limit(10)
  for (const r of rods || []) {
    const { count } = await sb.from('quiz_premios').select('id', { count: 'exact', head: true }).eq('rodada_id', r.id)
    if (!count) return { rodadaId: r.id, marco: r.marco, jogadorId: j.id }
  }
  return null
}

// ---------- caça-palavras ----------
// Rodada que ficou "jogando" mas o tempo da grade já passou (o jogador saiu do jogo): encerra por tempo, com a mesma regra do jogo
// (do nível 4 em diante o tempo esgotado perde o bônus). Sem isso o bônus garantido ficaria preso numa rodada que nunca fecha.
export async function encerrarCacaVencidas(sb: SupabaseClient, companyId: string, jogadorId: string) {
  const { data } = await sb.from('caca_rodadas').select('id, nivel, marco, mesa_id, tempo_total, grade_iniciada_em').eq('company_id', companyId).eq('jogador_id', jogadorId).eq('estado', 'jogando').gte('criada_em', new Date(Date.now() - 12 * H).toISOString())
  for (const r of data || []) {
    if (Date.now() < Date.parse(r.grade_iniciada_em) + (r.tempo_total + 5) * 1000) continue
    await sb.from('caca_rodadas').update({ estado: 'encerrada', motivo_fim: 'tempo', encerrada_em: new Date().toISOString(), marco: r.mesa_id && r.nivel > PORTAO_CASHBACK ? 0 : r.marco, atualizada_em: new Date().toISOString() }).eq('id', r.id).eq('estado', 'jogando')
  }
}

async function melhorCacaPremiavel(sb: SupabaseClient, companyId: string, telefone: string, desde: string): Promise<{ rodadaId: string; marco: number; jogadorId: string } | null> {
  const { data: j } = await sb.from('quiz_jogadores').select('id').eq('company_id', companyId).eq('telefone', telefone).maybeSingle()
  if (!j) return null
  await encerrarCacaVencidas(sb, companyId, j.id)
  const { data: rods } = await sb.from('caca_rodadas').select('id, marco, pontos').eq('company_id', companyId).eq('jogador_id', j.id).in('estado', ['encerrada', 'entre_niveis']).gt('marco', 0).not('mesa_id', 'is', null).gte('criada_em', desde).order('marco', { ascending: false }).order('pontos', { ascending: false }).limit(10)
  for (const r of rods || []) {
    const { count } = await sb.from('caca_premios').select('id', { count: 'exact', head: true }).eq('rodada_id', r.id)
    if (!count) return { rodadaId: r.id, marco: r.marco, jogadorId: j.id }
  }
  return null
}

// Melhor prêmio possível da conta, somando os dois jogos (quiz e caça-palavras). Empate fica com o quiz.
export type Premiavel = { jogo: 'quiz' | 'caca'; rodadaId: string; marco: number; jogadorId: string }
export async function melhorPremiavel(sb: SupabaseClient, companyId: string, telefone: string, desde: string): Promise<Premiavel | null> {
  const q = await melhorRodadaPremiavel(sb, companyId, telefone, desde)
  const c = await melhorCacaPremiavel(sb, companyId, telefone, desde)
  if (q && (!c || q.marco >= c.marco)) return { jogo: 'quiz', ...q }
  if (c) return { jogo: 'caca', ...c }
  return null
}
// Esta conta já recebeu prêmio (de qualquer jogo)?
export async function contaJaPremiada(sb: SupabaseClient, comandaId: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    sb.from('quiz_premios').select('id', { count: 'exact', head: true }).eq('comanda_id', comandaId),
    sb.from('caca_premios').select('id', { count: 'exact', head: true }).eq('comanda_id', comandaId),
  ])
  return (a.count || 0) + (b.count || 0) > 0
}
