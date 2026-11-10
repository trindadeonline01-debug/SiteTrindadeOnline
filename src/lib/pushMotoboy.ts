import { createClient } from '@supabase/supabase-js'
import { GoogleAuth } from 'google-auth-library'

// Push nativo (FCM) pro app do motoboy (app-motoboy/). Mesmo projeto
// Firebase e mesma chave de serviço do app da loja (FIREBASE_SERVICE_ACCOUNT_JSON,
// ver pushLoja.ts). Sempre só com dados: quem decide o que fazer é o serviço
// nativo do app (modules/alarme-motoboy) — "oferta_corrida" sobe o alarme em
// loop, "oferta_encerrada" para. Sem a variável ou sem a tabela, vira no-op:
// a corrida nunca pode falhar por causa de push.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

let auth: GoogleAuth | null = null
let projectId = ''
function getAuth(): GoogleAuth | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!raw) return null
  if (!auth) {
    try {
      const credentials = JSON.parse(raw)
      projectId = credentials.project_id
      auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/firebase.messaging'] })
    } catch (err) {
      console.error('[pushMotoboy] FIREBASE_SERVICE_ACCOUNT_JSON inválida', err)
      return null
    }
  }
  return auth
}

export async function enviarPushMotoboy(motoboyId: string, data: Record<string, string>, ttlSeg = 120): Promise<void> {
  try {
    const a = getAuth()
    if (!a) return
    const { data: tokens } = await supabase.from('motoboy_push_tokens').select('id, token').eq('motoboy_id', motoboyId)
    if (!tokens?.length) return
    const accessToken = await a.getAccessToken()
    await Promise.all(tokens.map(async t => {
      try {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: { token: t.token, data, android: { priority: 'HIGH', ttl: `${ttlSeg}s` } } }),
        })
        if (res.ok) return
        const err = await res.json().catch(() => ({}))
        const status = err?.error?.status
        if (res.status === 404 || status === 'NOT_FOUND' || status === 'UNREGISTERED') {
          await supabase.from('motoboy_push_tokens').delete().eq('id', t.id)
        } else {
          console.error('[pushMotoboy] FCM recusou', res.status, JSON.stringify(err).slice(0, 300))
        }
      } catch (err) {
        console.error('[pushMotoboy] falha ao enviar', err)
      }
    }))
  } catch (err) {
    console.error('[pushMotoboy] erro geral', err)
  }
}

// Corrida nova: o app toca em loop até a oferta vencer (expira_em) ou abrir.
export function pushOfertaCorrida(motoboyId: string, opts: { titulo: string; corpo: string; expiresAt: string }) {
  return enviarPushMotoboy(motoboyId, {
    tipo: 'oferta_corrida', title: opts.titulo, body: opts.corpo,
    expira_em: String(new Date(opts.expiresAt).getTime()),
  })
}

// Oferta respondida/cancelada antes de vencer: cala o alarme no aparelho.
export function pushOfertaEncerrada(motoboyId: string) {
  return enviarPushMotoboy(motoboyId, { tipo: 'oferta_encerrada' }, 60)
}

// Corrida cancelada pela loja (oferta pendente ou já aceita): com o app fechado
// o aparelho toca o som de cancelamento e abre o app; com o app aberto a
// própria tela mostra o aviso (detecta pelo polling).
export function pushCorridaCancelada(motoboyId: string, empresa?: string, jaRetirou = false) {
  const loja = empresa ? `A loja ${empresa}` : 'A loja'
  return enviarPushMotoboy(motoboyId, {
    tipo: 'corrida_cancelada',
    title: '❌ Corrida cancelada',
    body: jaRetirou
      ? `${loja} cancelou o pedido. Volte ao estabelecimento e devolva o pedido.`
      : `${loja} cancelou essa corrida. Não precisa buscar nem entregar.`,
  }, 120)
}
