import { createHmac, timingSafeEqual } from 'crypto'

// Identificação única do cliente na mesa (nov/2026): nome + WhatsApp confirmado por
// código, uma vez só. O resultado é um token assinado (HMAC, sem estado no banco) que o
// celular guarda e manda de volta em pedir, cashback e quiz. O servidor nunca confia em
// nome/telefone vindos do corpo da requisição: só no que está dentro do token.

const VALIDADE_MS = 60 * 86_400_000

function assinar(tel: string, nomeB64: string, exp: number) {
  return createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY!).update(`mesa-ident|${tel}|${nomeB64}|${exp}`).digest('hex').slice(0, 40)
}
function igual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export function criarIdentToken(tel: string, nome: string) {
  const exp = Date.now() + VALIDADE_MS
  const nomeB64 = Buffer.from(nome, 'utf8').toString('base64url')
  return `${tel}.${nomeB64}.${exp}.${assinar(tel, nomeB64, exp)}`
}

export function lerIdentToken(token: unknown): { tel: string; nome: string } | null {
  const [tel, nomeB64, expS, sig] = String(token || '').split('.')
  const exp = Number(expS)
  if (!tel || !nomeB64 || !exp || !sig || exp < Date.now()) return null
  if (!igual(sig, assinar(tel, nomeB64, exp))) return null
  return { tel, nome: Buffer.from(nomeB64, 'base64url').toString('utf8') }
}

// Nome digitado pelo cliente: só letras, espaço, apóstrofo, ponto e hífen; 2 a 40 caracteres.
export function limparNome(raw: unknown): string | null {
  const n = String(raw ?? '').trim().replace(/\s+/g, ' ')
  if (n.length < 2 || n.length > 40) return null
  if (!/^[\p{L}][\p{L} '.-]*$/u.test(n)) return null
  return n
}

// Como o nome aparece no ranking do quiz: primeiro nome + inicial do último sobrenome
// ("Maria da Silva Santos" → "Maria S."). Nome de uma palavra só fica como está.
export function nomeRanking(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  const cap = (s: string) => s.charAt(0).toLocaleUpperCase('pt-BR') + s.slice(1).toLocaleLowerCase('pt-BR')
  const primeiro = cap(partes[0]).slice(0, 12)
  if (partes.length === 1) return primeiro
  const ultimo = partes[partes.length - 1]
  return `${primeiro} ${ultimo.charAt(0).toLocaleUpperCase('pt-BR')}.`
}
