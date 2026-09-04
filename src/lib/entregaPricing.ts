import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type DayType = 'util' | 'fds' | 'feriado'

export interface EntregaPricing {
  diaria_util: number
  diaria_fds: number
  diaria_feriado: number
  entrega_util: number
  entrega_fds: number
  entrega_feriado: number
  pacote_dias: number
  pacote_desconto: number
}

// Servidor roda em UTC (Vercel) — sem timeZone explícito aqui a data vira
// amanhã/ontem dependendo da hora, e feriado/fim de semana saem errados
// perto da meia-noite. Sempre calcular o dia certo na Trindade.
export function todaySaoPaulo(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

export async function getEntregaPricing(): Promise<EntregaPricing> {
  const { data } = await supabase.from('entrega_pricing').select('*').eq('id', true).maybeSingle()
  return {
    diaria_util: Number(data?.diaria_util ?? 20),
    diaria_fds: Number(data?.diaria_fds ?? 30),
    diaria_feriado: Number(data?.diaria_feriado ?? 30),
    entrega_util: Number(data?.entrega_util ?? 5),
    entrega_fds: Number(data?.entrega_fds ?? 6),
    entrega_feriado: Number(data?.entrega_feriado ?? 8),
    pacote_dias: Number(data?.pacote_dias ?? 5),
    pacote_desconto: Number(data?.pacote_desconto ?? 10),
  }
}

export async function getDayType(dateStr: string): Promise<DayType> {
  const { data: feriado } = await supabase.from('entrega_feriados').select('data').eq('data', dateStr).maybeSingle()
  if (feriado) return 'feriado'
  // new Date('YYYY-MM-DD') é interpretado como UTC meia-noite — getUTCDay()
  // evita o dia da semana escorregar um dia pra trás em fusos negativos.
  const dow = new Date(dateStr + 'T00:00:00Z').getUTCDay()
  return (dow === 0 || dow === 6) ? 'fds' : 'util'
}

export function diariaValueFor(pricing: EntregaPricing, dayType: DayType): number {
  return dayType === 'feriado' ? pricing.diaria_feriado : dayType === 'fds' ? pricing.diaria_fds : pricing.diaria_util
}

export function entregaValueFor(pricing: EntregaPricing, dayType: DayType): number {
  return dayType === 'feriado' ? pricing.entrega_feriado : dayType === 'fds' ? pricing.entrega_fds : pricing.entrega_util
}

// Preço de hoje, pronto — é o caso de uso mais comum (cobrar a diária/crédito
// no momento da compra, ou o fee de uma corrida sendo despachada agora).
export async function getTodayValues(): Promise<{ pricing: EntregaPricing; dayType: DayType; diaria: number; entrega: number; today: string }> {
  const today = todaySaoPaulo()
  const pricing = await getEntregaPricing()
  const dayType = await getDayType(today)
  return { pricing, dayType, diaria: diariaValueFor(pricing, dayType), entrega: entregaValueFor(pricing, dayType), today }
}
