// Regras do Quiz Premiado (docs/DESENHO_QUIZ.md) — funções puras, sem banco, testáveis.
// O servidor é quem manda: este arquivo nunca roda no celular com dados sensíveis.

export const QUIZ_TEMPO_S = 10           // tempo normal por pergunta
export const QUIZ_TEMPO_PENSAR_S = 20    // com "Pensar"
export const QUIZ_FOLGA_MS = 1500        // folga de rede pro servidor aceitar a resposta
export const QUIZ_PULOS = 3
export const QUIZ_PENSAR = 2
export const QUIZ_PORTAO = 30            // 30 acertos: entra a escolha parar/arriscar
export const QUIZ_TETO_ACERTOS = 45      // 45 acertos: 10% garantido
export const QUIZ_ERROS_PERDOADOS = 3    // até os 30 acertos o jogador pode errar 3 vezes e continuar; o 4º erro encerra

export type EstadoRodada = 'jogando' | 'portao' | 'risco' | 'encerrada'
export type MotivoFim = 'erro' | 'tempo' | 'parou' | 'abandono' | 'banco_esgotado'

export type Rodada = { estado: EstadoRodada; acertos: number; marco: number; pontos: number; erros: number }

// Marco (nível de prêmio) alcançado por quantidade de acertos.
export function marcoDe(acertos: number): number {
  // Marcos (nov/2026, pedido do Ricardo): 10, 20, 30 e depois 35, 40, 45 (as 3 últimas etapas são de 5 perguntas bem difíceis).
  if (acertos >= 45) return 10
  if (acertos >= 40) return 8
  if (acertos >= 35) return 6
  if (acertos >= 30) return 5
  if (acertos >= 20) return 3
  if (acertos >= 10) return 2
  return 0
}

// Dificuldade da N-ésima pergunta (1-based): 1–5 fácil, 6–10 média, 11+ difícil.
export function nivelDaPergunta(ordem: number): 1 | 2 | 3 {
  return ordem <= 5 ? 1 : ordem <= 10 ? 2 : 3
}

// 5 níveis (nov/2026, pedido do Ricardo): 1 muito fácil · 2 fácil · 3 intermediário · 4 difícil · 5 impossível.
// Segue os ACERTOS (não as perguntas servidas): 0–9, 10–19, 20–29, 30–39 (zona de risco começa) e 40–45.
export function nivelPorAcertos(acertos: number): 1 | 2 | 3 | 4 | 5 {
  return acertos < 10 ? 1 : acertos < 20 ? 2 : acertos < 30 ? 3 : acertos < 40 ? 4 : 5
}

// Pontos (ranking, nunca dinheiro): 100 + 20 por segundo inteiro restante, máx. 200.
export function pontosDaResposta(restanteMs: number): number {
  const seg = Math.max(0, Math.floor(restanteMs / 1000))
  return Math.min(200, 100 + 20 * seg)
}

// Depois de um ACERTO.
export function aposAcerto(r: Rodada, pontos: number): Rodada {
  const acertos = r.acertos + 1
  const marco = marcoDe(acertos)
  // De 30 a 44 acertos, antes de cada nova pergunta o jogador decide: parar e garantir ou arriscar.
  const estado: EstadoRodada = acertos >= QUIZ_PORTAO && acertos < QUIZ_TETO_ACERTOS ? 'portao' : 'jogando'
  return { estado, acertos, marco, pontos: r.pontos + pontos, erros: r.erros }
}

// Depois de ERRO ou TEMPO ESGOTADO (conta igual).
//  Fase segura (menos de 30 acertos): o jogador tem 3 erros perdoados e continua jogando; o 4º erro
//    encerra a rodada e ele leva o último marco.
//  Fase de risco (quem escolheu continuar): qualquer erro encerra e zera o prêmio.
//  A partir de 45 acertos o 10% já está garantido: qualquer erro encerra e ele leva o 10%.
export function aposErro(r: Rodada): Rodada {
  const fasesegura = r.estado === 'jogando' && r.acertos < QUIZ_PORTAO
  if (fasesegura && r.erros < QUIZ_ERROS_PERDOADOS) return { ...r, erros: r.erros + 1 }
  const marco = r.estado === 'risco' ? 0 : marcoDe(r.acertos)
  return { ...r, estado: 'encerrada', marco, erros: fasesegura ? r.erros + 1 : r.erros }
}

// Decisão no portão / antes de cada pergunta da fase de risco.
export function aposDecisao(r: Rodada, parar: boolean): Rodada {
  if (parar) return { ...r, estado: 'encerrada', marco: marcoDe(r.acertos) }
  return { ...r, estado: 'risco' }
}

export type Marcos = Record<string, number>
export const MARCOS_PADRAO: Marcos = { '2': 2, '3': 3, '5': 5, '6': 6, '8': 8, '10': 10 }

// Valor do prêmio em R$ no fechamento da conta.
//  percentual: pct do marco × base (consumo sem taxa de serviço), limitado ao teto
//  fixo: valor em R$ cadastrado para o marco
export function valorDoPremio(args: { modo: 'percentual' | 'fixo'; marco: number; marcos: Marcos; base: number; teto: number }): number {
  const v = Number(args.marcos[String(args.marco)])
  if (!v || v <= 0 || args.marco <= 0) return 0
  const bruto = args.modo === 'fixo' ? v : args.base * v / 100
  const limitado = args.modo === 'percentual' && args.teto > 0 ? Math.min(bruto, args.teto) : bruto
  return Math.round((limitado + Number.EPSILON) * 100) / 100
}
