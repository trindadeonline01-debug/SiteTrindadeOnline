// Mesma ideia do filtro de período padrão do site (src/lib/periodFilter.ts,
// aprovado pelo Ricardo em Sala de Vendas e já usado no painel web do
// motoboy) — reimplementado aqui porque o app é outro pacote/runtime (RN,
// sem DOM), sem jeito limpo de importar direto do Next.js. Pedido do
// Ricardo, out/2026: "Ganhos" precisa de hoje/ontem/esta semana/semana
// passada/mês passado — por isso o conjunto aqui é um pouco maior que o do
// site (que usa "Outro mês" pra qualquer mês passado em vez de um pill
// dedicado de "mês passado").
export type PeriodKind = 'today' | 'yesterday' | 'week' | 'last_week' | 'month' | 'last_month' | 'all'

export const PERIODS: { kind: PeriodKind; label: string }[] = [
  { kind: 'today', label: 'Hoje' },
  { kind: 'yesterday', label: 'Ontem' },
  { kind: 'week', label: 'Esta semana' },
  { kind: 'last_week', label: 'Semana passada' },
  { kind: 'month', label: 'Este mês' },
  { kind: 'last_month', label: 'Mês passado' },
  { kind: 'all', label: 'Tudo' },
]

// `to` null = sem limite superior (vai até agora).
export function periodRange(kind: PeriodKind): { from: string | null; to: string | null } {
  const now = new Date()
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const mondayOf = (d: Date) => {
    const day = d.getDay()
    const diffToMonday = day === 0 ? 6 : day - 1
    const monday = new Date(d)
    monday.setDate(d.getDate() - diffToMonday)
    return startOfDay(monday)
  }
  switch (kind) {
    case 'today':
      return { from: startOfDay(now).toISOString(), to: null }
    case 'yesterday': {
      const y = new Date(now); y.setDate(now.getDate() - 1)
      return { from: startOfDay(y).toISOString(), to: startOfDay(now).toISOString() }
    }
    case 'week':
      return { from: mondayOf(now).toISOString(), to: null }
    case 'last_week': {
      const thisMonday = mondayOf(now)
      const lastMonday = new Date(thisMonday); lastMonday.setDate(thisMonday.getDate() - 7)
      return { from: lastMonday.toISOString(), to: thisMonday.toISOString() }
    }
    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: null }
    case 'last_month': {
      const firstThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const firstLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      return { from: firstLastMonth.toISOString(), to: firstThisMonth.toISOString() }
    }
    default:
      return { from: null, to: null }
  }
}
