// Prêmio do Quiz (Pesca Premiada) — regras do servidor.
// O prêmio é um PERCENTUAL provisório até a conta da mesa ser paga e fechada; só ali vira valor em
// R$ (cashback). Regras (Ricardo, 5/nov/2026): vale a melhor rodada do dia da conta, no máximo
// 1 prêmio por conta e 1 prêmio por WhatsApp a cada 7 dias. Quem não tem WhatsApp confirmado
// na conta joga só pelo ranking.
import type { SupabaseClient } from '@supabase/supabase-js'

export const QUIZ_PREMIO_INTERVALO_DIAS = 7
const H = 3_600_000

// Início da janela de rodadas que valem para a conta: 3 h antes de ela abrir (o cliente joga
// enquanto espera o pedido) ou, sem conta ainda, as últimas 6 h.
export function desdeDaConta(abertaEm?: string | null): string {
  return new Date(abertaEm ? new Date(abertaEm).getTime() - 3 * H : Date.now() - 6 * H).toISOString()
}

export async function jaGanhouNosUltimosDias(sb: SupabaseClient, companyId: string, jogadorId: string): Promise<boolean> {
  const desde = new Date(Date.now() - QUIZ_PREMIO_INTERVALO_DIAS * 24 * H).toISOString()
  const { data: rods } = await sb.from('quiz_rodadas').select('id').eq('company_id', companyId).eq('jogador_id', jogadorId).gte('iniciada_em', new Date(Date.now() - (QUIZ_PREMIO_INTERVALO_DIAS + 1) * 24 * H).toISOString())
  const ids = (rods || []).map(r => r.id)
  if (!ids.length) return false
  const { count } = await sb.from('quiz_premios').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('estado', 'liberado').gte('criado_em', desde).in('rodada_id', ids)
  return (count || 0) > 0
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
