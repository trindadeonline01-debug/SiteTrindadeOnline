// Categoria Igrejas usa um sistema à parte (horário de culto: manhã/noite
// por dia, não intervalo aberto/fechado) — id fixo, não mexe nesse arquivo
export const IGREJAS_CATEGORY_ID = '00000000-0000-0000-0000-000000000008'

// Nomes dos dias, Segunda primeiro — usado pela grade de culto das Igrejas
export const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']

// value segue o padrão de Date.getDay() (0=Domingo...6=Sábado) — 7 é um
// valor especial só pra "Feriados", que não é dia da semana de verdade
export const DAYS_OF_WEEK: { value: number; label: string }[] = [
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terça' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' },
  { value: 7, label: 'Feriados' },
]

export function dayOfWeekLabel(day: number): string {
  return DAYS_OF_WEEK.find(d => d.value === day)?.label || String(day)
}

export type HourRow = {
  id?: string
  day_of_week: number | null
  open_time: string | null
  close_time: string | null
  closed: boolean
}

// Confere se a empresa está aberta agora, considerando todos os intervalos
// cadastrados pro dia de hoje — true se o horário atual cair dentro de
// QUALQUER um deles (dá suporte a mais de um horário no mesmo dia, ex:
// almoço 11h-14h e janta 18h-23h). Empresas sem horário fixo (flexible=true,
// ex: ambulantes) contam sempre como abertas, sem depender de "hours".
// paused=true (pausa manual do lojista, ex: imprevisto) força fechado mesmo
// dentro do horário — tem prioridade sobre tudo, inclusive forcedOpen.
// forcedOpen=true força aberto mesmo fora do horário cadastrado.
// Um intervalo cujo fechamento é <= abertura (ex: 18:00-00:00, 22:00-02:00)
// atravessa a meia-noite — soma 24h ao horário de fechamento pra comparação.
function rowCoversMinute(h: HourRow, minutesSinceOpenDay: number): boolean {
  if (h.closed || !h.open_time || !h.close_time) return false
  const [oh, om] = h.open_time.split(':').map(Number)
  const [ch, cm] = h.close_time.split(':').map(Number)
  const openMin = oh * 60 + om
  let closeMin = ch * 60 + cm
  if (closeMin <= openMin) closeMin += 1440
  return minutesSinceOpenDay >= openMin && minutesSinceOpenDay <= closeMin
}

export function isOpenNow(hours?: HourRow[], flexible?: boolean, paused?: boolean, forcedOpen?: boolean): boolean {
  if (paused) return false
  if (forcedOpen) return true
  if (flexible) return true
  if (!hours || hours.length === 0) return false
  const now = new Date()
  const today = now.getDay()
  const yesterday = (today + 6) % 7
  const nowMin = now.getHours() * 60 + now.getMinutes()

  if (hours.some(h => h.day_of_week === today && rowCoversMinute(h, nowMin))) return true
  // Turno de ontem que começou antes da meia-noite e ainda não fechou hoje
  return hours.some(h => h.day_of_week === yesterday && rowCoversMinute(h, nowMin + 1440))
}
