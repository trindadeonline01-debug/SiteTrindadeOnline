import { createHmac, timingSafeEqual } from 'crypto'

// Sessão do jogador do quiz (token assinado, sem estado). MESMO formato de /api/mesa/quiz — quem entra
// no quiz solo vale também no quiz em grupo.
const igual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y) }
function assinar(jid: string, cid: string, exp: number) {
  return createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY!).update(`quiz-jogador|${jid}|${cid}|${exp}`).digest('hex').slice(0, 40)
}
export function lerJogadorToken(token: unknown, cid: string): string | null {
  const [jid, c, expS, sig] = String(token || '').split('.')
  const exp = Number(expS)
  if (!jid || c !== cid || !exp || !sig || exp < Date.now()) return null
  return igual(sig, assinar(jid, c, exp)) ? jid : null
}
