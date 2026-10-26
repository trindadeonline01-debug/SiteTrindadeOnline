import crypto from 'crypto'

// Assina/confere o `state` do fluxo OAuth do Mercado Pago Connect — carrega
// qual empresa iniciou a conexão (o callback do MP não devolve mais nada
// nosso além do `code`) e expira rápido (10min) pra não virar um link
// reaproveitável. HMAC com a própria service role key: já é um segredo só
// nosso, nunca exposto, não precisa de env var nova só pra isso.
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY!
const MAX_AGE_MS = 10 * 60 * 1000

function sign(payload: string): string {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex')
}

export function signMpState(companyId: string): string {
  const payload = `${companyId}.${Date.now()}`
  const payloadB64 = Buffer.from(payload).toString('base64url')
  return `${payloadB64}.${sign(payloadB64)}`
}

export function verifyMpState(state: string): { companyId: string } | null {
  const [payloadB64, sig] = (state || '').split('.')
  if (!payloadB64 || !sig) return null
  if (sign(payloadB64) !== sig) return null
  const [companyId, tsStr] = Buffer.from(payloadB64, 'base64url').toString().split('.')
  const ts = Number(tsStr)
  if (!companyId || !ts || Date.now() - ts > MAX_AGE_MS) return null
  return { companyId }
}
