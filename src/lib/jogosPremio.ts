// Percentuais de prêmio dos jogos (quiz e caça-palavras), configuráveis pela loja no painel de Cashback (nov/2026).
// Quiz: `quiz_campanhas.marcos` mapeia o marco (2,3,5,6,8,10) para o % que a loja quer pagar nele; os marcos vêm de 10, 20, 30, 35, 40 e 45 acertos.
// Caça-palavras: `quiz_campanhas.caca_marcos` mapeia o nível (1 a 5) para o %. A rodada guarda o % no momento em que o nível é concluído.
export const PREMIO_PCT_MAX = 15    // mesmo teto do cashback comum da loja (CASHBACK_PERCENT_MAX em src/lib/cashback.ts)
export const QUIZ_MARCOS_CHAVES = ['2', '3', '5', '6', '8', '10']
export const QUIZ_MARCOS_ACERTOS = [10, 20, 30, 35, 40, 45]
export const QUIZ_PCT_PADRAO = [2, 3, 5, 6, 8, 10]
export const CACA_BONUS_PADRAO = [2, 3, 5, 8, 10]

const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= PREMIO_PCT_MAX
const lista = (raw: unknown, chaves: string[], padrao: number[]): number[] => {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return chaves.map((k, i) => (ok(Number(o[k])) && o[k] !== null && o[k] !== '' ? Math.round(Number(o[k])) : padrao[i]))
}
export const lerQuizPcts = (raw: unknown) => lista(raw, QUIZ_MARCOS_CHAVES, QUIZ_PCT_PADRAO)
export const lerCacaBonus = (raw: unknown) => lista(raw, ['1', '2', '3', '4', '5'], CACA_BONUS_PADRAO)
// o % mostrado ao jogador para um marco do quiz (cai no próprio marco se a loja não configurou)
export const pctDoMarcoQuiz = (marcos: unknown, marco: number) => {
  const v = Number((marcos as Record<string, unknown> | null)?.[String(marco)])
  return Number.isFinite(v) && v >= 0 && (marcos as Record<string, unknown>)?.[String(marco)] != null ? v : marco
}

// Confere o que a loja digitou: n números inteiros de 0 a 15, em ordem crescente (jogar mais precisa valer mais, senão o portão perde o sentido).
export function validarSequencia(v: unknown, n: number, rotulos: string[]): number[] | string {
  if (!Array.isArray(v) || v.length !== n) return 'Preencha todos os percentuais.'
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const x = Number(v[i])
    if (v[i] === '' || v[i] === null || !Number.isFinite(x)) return `Digite o percentual de ${rotulos[i]}.`
    if (x < 0 || x > PREMIO_PCT_MAX) return `O percentual de ${rotulos[i]} precisa ficar entre 0% e ${PREMIO_PCT_MAX}%.`
    if (!Number.isInteger(x)) return `Use números inteiros (${rotulos[i]}).`
    if (i > 0 && x < out[i - 1]) return `${rotulos[i]} não pode valer menos que ${rotulos[i - 1]}. Os percentuais precisam subir (ou ficar iguais).`
    out.push(x)
  }
  return out
}

// Valor em R$ de um prêmio do caça-palavras: o % (ou o R$, se a campanha for de valor fixo) já está guardado na rodada.
export function valorPremioDireto(args: { modo: 'percentual' | 'fixo'; valor: number; base: number; teto: number }): number {
  if (!(args.valor > 0)) return 0
  const bruto = args.modo === 'fixo' ? args.valor : args.base * args.valor / 100
  const limitado = args.modo === 'percentual' && args.teto > 0 ? Math.min(bruto, args.teto) : bruto
  return Math.round((limitado + Number.EPSILON) * 100) / 100
}
