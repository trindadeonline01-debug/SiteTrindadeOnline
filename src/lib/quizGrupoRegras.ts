// Quiz em grupo (nov/2026): partida de 15 perguntas iguais para todos, sem eliminação, sem cashback.
// O tempo da partida é um relógio único do servidor (iniciada_em): a fase atual sai só da conta de
// "agora − início", sem cron nem estado extra.
export const GRUPO_PERGUNTAS = 15
export const GRUPO_CONTAGEM_MS = 3000
export const GRUPO_RESPOSTA_MS = 10_000
export const GRUPO_REVELACAO_MS = 4000
export const GRUPO_CICLO_MS = GRUPO_RESPOSTA_MS + GRUPO_REVELACAO_MS
export const GRUPO_FOLGA_MS = 1200
export const GRUPO_MAX_JOGADORES = 8
export const GRUPO_MIN_JOGADORES = 2
export const GRUPO_ESPERA_MAX_MS = 20 * 60_000

export type Fase =
  | { fase: 'contagem'; restanteMs: number }
  | { fase: 'pergunta'; ordem: number; restanteMs: number; decorridoMs: number }
  | { fase: 'revelacao'; ordem: number; restanteMs: number }
  | { fase: 'fim' }

// t = milissegundos desde o início da partida.
export function faseDaPartida(t: number): Fase {
  if (t < GRUPO_CONTAGEM_MS) return { fase: 'contagem', restanteMs: GRUPO_CONTAGEM_MS - t }
  const k = Math.floor((t - GRUPO_CONTAGEM_MS) / GRUPO_CICLO_MS)
  if (k >= GRUPO_PERGUNTAS) return { fase: 'fim' }
  const dentro = (t - GRUPO_CONTAGEM_MS) % GRUPO_CICLO_MS
  if (dentro < GRUPO_RESPOSTA_MS) return { fase: 'pergunta', ordem: k + 1, restanteMs: GRUPO_RESPOSTA_MS - dentro, decorridoMs: dentro }
  return { fase: 'revelacao', ordem: k + 1, restanteMs: GRUPO_CICLO_MS - dentro }
}

// Nível das 15 perguntas: 3 de cada nível, do muito fácil (1) ao impossível (5).
export const nivelDaOrdemGrupo = (ordem: number): 1 | 2 | 3 | 4 | 5 => Math.min(5, Math.floor((ordem - 1) / 3) + 1) as 1 | 2 | 3 | 4 | 5

export const CODIGO_ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ'
