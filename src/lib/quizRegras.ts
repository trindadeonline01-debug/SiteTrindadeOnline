// Regras do Quiz Premiado (docs/DESENHO_QUIZ.md) — funções puras, sem banco, testáveis.
// O servidor é quem manda: este arquivo nunca roda no celular com dados sensíveis.

export const QUIZ_TEMPO_S = 5            // tempo normal por pergunta
export const QUIZ_TEMPO_PENSAR_S = 10    // com "Pensar"
export const QUIZ_FOLGA_MS = 1500        // folga de rede pro servidor aceitar a resposta
export const QUIZ_PULOS = 3
export const QUIZ_PENSAR = 2
export const QUIZ_PORTAO = 15            // 15 acertos: entra a escolha parar/arriscar
export const QUIZ_TETO_ACERTOS = 30      // 30 acertos: 10% garantido

export type EstadoRodada = 'jogando' | 'portao' | 'risco' | 'encerrada'
export type MotivoFim = 'erro' | 'tempo' | 'parou' | 'abandono' | 'banco_esgotado'

export type Rodada = { estado: EstadoRodada; acertos: number; marco: number; pontos: number }

// Marco (nível de prêmio) alcançado por quantidade de acertos.
export function marcoDe(acertos: number): number {
  if (acertos >= 30) return 10
  if (acertos >= 25) return 8
  if (acertos >= 20) return 6
  if (acertos >= 15) return 5
  if (acertos >= 10) return 3
  if (acertos >= 5) return 2
  return 0
}

// Dificuldade da N-ésima pergunta (1-based): 1–5 fácil, 6–10 média, 11+ difícil.
export function nivelDaPergunta(ordem: number): 1 | 2 | 3 {
  return ordem <= 5 ? 1 : ordem <= 10 ? 2 : 3
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
  // De 15 a 29 acertos, antes de cada nova pergunta o jogador decide: parar e garantir ou arriscar.
  const estado: EstadoRodada = acertos >= QUIZ_PORTAO && acertos < QUIZ_TETO_ACERTOS ? 'portao' : 'jogando'
  return { estado, acertos, marco, pontos: r.pontos + pontos }
}

// Depois de ERRO ou TEMPO ESGOTADO: na fase segura mantém o último marco; na fase de risco
// (quem escolheu continuar) zera. A partir de 30 acertos o 10% já está garantido.
export function aposErro(r: Rodada): Rodada {
  const marco = r.estado === 'risco' ? 0 : marcoDe(r.acertos)
  return { ...r, estado: 'encerrada', marco }
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
