// "Dia comercial": loja que funciona de madrugada (ex.: Calçada do Peixe fecha à 1h) quer que as vendas
// depois da meia-noite contem no dia que ela abriu. `viradaHora` (companies.dia_virada_hora, 0 a 6) é a hora
// em que o dia novo começa; 0 = meia-noite (comportamento de sempre). Fuso fixo de Brasília (-03:00).

const HORA_MS = 3_600_000

export const clampVirada = (v: unknown): number => {
  const n = Math.floor(Number(v))
  return n >= 0 && n <= 6 ? n : 0
}

// Data (yyyy-mm-dd) do dia comercial em que `agora` cai.
export function diaComercialDe(agora: Date, viradaHora: number): string {
  const deslocado = new Date(agora.getTime() - clampVirada(viradaHora) * HORA_MS)
  return deslocado.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

// Faixa [ini, fim) do dia comercial `dia` (yyyy-mm-dd): das `viradaHora`h desse dia até as `viradaHora`h do seguinte.
export function faixaDiaComercial(dia: string, viradaHora: number): { ini: string; fim: string } {
  const h = String(clampVirada(viradaHora)).padStart(2, '0')
  const ini = new Date(`${dia}T${h}:00:00-03:00`)
  return { ini: ini.toISOString(), fim: new Date(ini.getTime() + 24 * HORA_MS).toISOString() }
}
