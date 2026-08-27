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
// dentro do horário — tem prioridade sobre tudo o resto.
export function isOpenNow(hours?: HourRow[], flexible?: boolean, paused?: boolean): boolean {
  if (paused) return false
  if (flexible) return true
  if (!hours || hours.length === 0) return false
  const today = new Date().getDay()
  const todayRows = hours.filter(h => h.day_of_week === today)
  if (todayRows.length === 0) return false
  if (todayRows.some(h => h.closed)) return false
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
  return todayRows.some(h => {
    if (!h.open_time || !h.close_time) return false
    const [oh, om] = h.open_time.split(':').map(Number)
    const [ch, cm] = h.close_time.split(':').map(Number)
    return nowMin >= oh * 60 + om && nowMin <= ch * 60 + cm
  })
}
