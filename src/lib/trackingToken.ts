import crypto from 'crypto'

// Link público de acompanhamento do motoboy (nov/2026): /acompanhar/<token>.
// O token é o id da entrega assinado com HMAC — impossível de adivinhar ou de
// trocar por outra entrega, e não precisa de coluna nova no banco. Mesmo
// segredo já usado em mpOauthState.ts (a service role key, nunca exposta).
// O link só mostra a posição enquanto a corrida está a caminho; depois da
// entrega a página só diz "entregue" (a posição é apagada ao fim da corrida).
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY!

function sign(payload: string): string {
  return crypto.createHmac('sha256', SECRET).update('acompanhar:' + payload).digest('base64url').slice(0, 22)
}

export function signTracking(deliveryOrderId: string): string {
  return `${deliveryOrderId}.${sign(deliveryOrderId)}`
}

export function verifyTracking(token: string): string | null {
  const [id, sig] = (token || '').split('.')
  if (!id || !sig || !/^[0-9a-f-]{36}$/i.test(id)) return null
  const esperado = sign(id)
  const a = Buffer.from(sig), b = Buffer.from(esperado)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  return id
}

export function trackingUrl(deliveryOrderId: string): string {
  return `https://www.trindadeonline.com.br/acompanhar/${signTracking(deliveryOrderId)}`
}
