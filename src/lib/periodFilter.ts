// Regra padrão de filtro de data do site (definida em Sala de Vendas,
// set/2026 — Ricardo: "ficou top", pediu pra virar o padrão de todas as
// páginas). Qualquer filtro de período novo ou atualizado deve importar
// daqui em vez de reinventar o próprio conjunto de opções — é o que
// garante o "igual em todas as páginas" que ele pediu.
export type PeriodKind = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'other_month' | 'custom' | 'all'

export interface PeriodSel {
  kind: PeriodKind
  monthIndex?: number     // só pra 'other_month' (0-11)
  customFrom?: string     // só pra 'custom' — 'yyyy-mm-dd', igual ao <input type="date">
  customTo?: string       // só pra 'custom' — idem; vazio = "até agora"
}

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function fmtBR(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')
}

// `to` null = sem limite superior (vai até agora).
export function periodRange(p: PeriodSel): { from: string | null; to: string | null } {
  const now = new Date()
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  switch (p.kind) {
    case 'today':
      return { from: startOfDay(now).toISOString(), to: null }
    case 'yesterday': {
      const y = new Date(now); y.setDate(now.getDate() - 1)
      return { from: startOfDay(y).toISOString(), to: startOfDay(now).toISOString() }
    }
    case 'week': {
      // Semana começando na segunda-feira.
      const day = now.getDay()
      const diffToMonday = day === 0 ? 6 : day - 1
      const monday = new Date(now); monday.setDate(now.getDate() - diffToMonday)
      return { from: startOfDay(monday).toISOString(), to: null }
    }
    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: null }
    case 'year':
      return { from: new Date(now.getFullYear(), 0, 1).toISOString(), to: null }
    case 'other_month': {
      if (p.monthIndex == null) return { from: null, to: null }
      // Mês escolhido só pelo nome (sem ano) — se ainda não chegou esse mês
      // esse ano, assume o ano passado (ex: escolher "Dezembro" em março só
      // pode ser dezembro do ano anterior).
      const year = p.monthIndex > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear()
      return {
        from: new Date(year, p.monthIndex, 1).toISOString(),
        to: new Date(year, p.monthIndex + 1, 1).toISOString(),
      }
    }
    case 'custom': {
      // Período personalizado = intervalo de verdade, "De" (início) até
      // "Até" (fim) — os dois campos existem sempre, independentes (pedido
      // do Ricardo, set/2026: antes só tinha 1 campo de data única em Sala
      // de Vendas, inconsistente com o resto do site). "Até" vazio = sem
      // limite superior (vai até agora); "De" vazio = sem limite inferior.
      if (!p.customFrom && !p.customTo) return { from: null, to: null }
      const from = p.customFrom ? new Date(p.customFrom + 'T00:00:00').toISOString() : null
      // `to` é exclusivo (usa < to nas queries) — soma 1 dia pro dia
      // escolhido em "Até" contar inteiro, não só até meia-noite dele.
      let to: string | null = null
      if (p.customTo) {
        const d = new Date(p.customTo + 'T00:00:00')
        d.setDate(d.getDate() + 1)
        to = d.toISOString()
      }
      return { from, to }
    }
    default:
      return { from: null, to: null }
  }
}

export function periodLabel(p: PeriodSel): string {
  switch (p.kind) {
    case 'today': return 'hoje'
    case 'yesterday': return 'ontem'
    case 'week': return 'esta semana'
    case 'month': return 'este mês'
    case 'year': return 'este ano'
    case 'other_month': return p.monthIndex != null ? MESES[p.monthIndex].toLowerCase() : 'mês'
    case 'custom': {
      if (p.customFrom && p.customTo) return `${fmtBR(p.customFrom)} a ${fmtBR(p.customTo)}`
      if (p.customFrom) return `desde ${fmtBR(p.customFrom)}`
      if (p.customTo) return `até ${fmtBR(p.customTo)}`
      return 'período personalizado'
    }
    default: return 'tudo'
  }
}
