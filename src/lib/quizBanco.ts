import type { SupabaseClient } from '@supabase/supabase-js'
import banco from '@/data/quiz/banco.json'
import filmes from '@/data/quiz/temas/filmes.json'
import musica from '@/data/quiz/temas/musica.json'
import futebol from '@/data/quiz/temas/futebol.json'
import rio from '@/data/quiz/temas/rio.json'
import gastronomia from '@/data/quiz/temas/gastronomia.json'

// Banco de perguntas do Quiz: o original (Q-xxxx, sem tema ou tema "mar") + 5 temas (nov/2026).
// O arquivo é a fonte; o servidor carrega no banco sozinho na 1ª vez e quando ele cresce.
// Pergunta nova entra com status "a_revisar" e ativa; o que já existe no banco nunca é sobrescrito.
export type PerguntaArq = { id: string; nivel: number; categoria: string; enunciado: string; opcoes: string[]; curiosidade: string | null; tema?: string | null }

const base = (banco as unknown as PerguntaArq[]).map(q => ({ ...q, tema: /^Mar/.test(q.categoria) ? 'mar' : null }))
export const BANCO_COMPLETO: PerguntaArq[] = [
  ...base,
  ...(filmes as unknown as PerguntaArq[]), ...(musica as unknown as PerguntaArq[]), ...(futebol as unknown as PerguntaArq[]),
  ...(rio as unknown as PerguntaArq[]), ...(gastronomia as unknown as PerguntaArq[]),
]

// Temas que o jogador pode escolher (id = campo `tema` das perguntas). "misturado" = todas.
export type TemaQuiz = { id: string; nome: string; icone: string }
export const TEMAS_QUIZ: TemaQuiz[] = [
  { id: 'filmes', nome: 'Filmes e séries', icone: '🎬' },
  { id: 'musica', nome: 'Música brasileira', icone: '🎵' },
  { id: 'futebol', nome: 'Futebol', icone: '⚽' },
  { id: 'rio', nome: 'Rio e São Gonçalo', icone: '📍' },
  { id: 'gastronomia', nome: 'Gastronomia e peixaria', icone: '🍤' },
]
export const temaValido = (t: unknown): string | null => (TEMAS_QUIZ.some(x => x.id === t) ? String(t) : null)

let bancoOk = false
export async function garantirBanco(sb: SupabaseClient) {
  if (bancoOk) return
  const { count } = await sb.from('quiz_perguntas').select('id', { count: 'exact', head: true })
  if ((count || 0) < BANCO_COMPLETO.length) {
    const { data: ex } = await sb.from('quiz_perguntas').select('id').limit(5000)
    const tem = new Set((ex || []).map(r => r.id as string))
    const novas = BANCO_COMPLETO.filter(q => !tem.has(q.id))
    for (let i = 0; i < novas.length; i += 100) {
      const lote = novas.slice(i, i + 100).map(q => ({ id: q.id, nivel: q.nivel, categoria: q.categoria, enunciado: q.enunciado, opcoes: q.opcoes, curiosidade: q.curiosidade, tema: q.tema || null, status: 'a_revisar' }))
      await sb.from('quiz_perguntas').upsert(lote, { onConflict: 'id', ignoreDuplicates: true })
    }
  }
  bancoOk = true
}
