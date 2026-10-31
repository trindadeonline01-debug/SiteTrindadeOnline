import { createClient } from '@supabase/supabase-js'
import { GoogleAuth } from 'google-auth-library'

// Push nativo (FCM) pro app do lojista (app-loja/). Infra própria, separada
// do OneSignal do motoboy/site: Firebase Cloud Messaging direto, chave de
// serviço em FIREBASE_SERVICE_ACCOUNT_JSON (Vercel). Sem a variável, tudo
// aqui vira no-op silencioso — o pedido nunca pode falhar por causa de push.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Precisa bater com o canal criado em app-loja/src/push/registerPush.ts e
// com o som bundlado pelo plugin expo-notifications (sem extensão).
const CANAL_PEDIDOS = 'pedidos-loja'
const SOM_PEDIDO = 'pedido_novo_telefone'

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
      console.error('[pushLoja] FIREBASE_SERVICE_ACCOUNT_JSON inválida', err)
      return null
    }
  }
  return auth
}

// somenteDados: manda sem o bloco "notification" — assim o app (mesmo fechado)
// recebe a mensagem no próprio serviço de push e abre o alarme de tela cheia
// em repetição (app-loja/.../LojaMessagingService.kt). Com o bloco normal o
// Android só mostraria uma notificação comum que toca uma vez.
export type PushLoja = { title: string; body: string; data?: Record<string, string>; somenteDados?: boolean }

// Manda pra todos os aparelhos cadastrados da empresa. Prioridade máxima +
// canal com som: é isso que acorda o tablet em descanso. Token que o
// Firebase diz que não existe mais (app desinstalado) é apagado.
export async function enviarPushLoja(companyId: string, msg: PushLoja): Promise<{ enviados: number; falhas: number }> {
  try {
    const a = getAuth()
    if (!a) return { enviados: 0, falhas: 0 }
    const { data: tokens } = await supabase.from('loja_push_tokens').select('id, token').eq('company_id', companyId)
    if (!tokens?.length) return { enviados: 0, falhas: 0 }

    const accessToken = await a.getAccessToken()
    let enviados = 0
    let falhas = 0
    await Promise.all(tokens.map(async t => {
      try {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token: t.token,
              ...(msg.somenteDados ? {} : { notification: { title: msg.title, body: msg.body } }),
              data: msg.somenteDados ? { ...(msg.data || {}), title: msg.title, body: msg.body } : (msg.data || {}),
              android: msg.somenteDados
                ? { priority: 'HIGH', ttl: '120s' }
                : {
                    priority: 'HIGH',
                    ttl: '120s',
                    notification: { channel_id: CANAL_PEDIDOS, sound: SOM_PEDIDO, notification_priority: 'PRIORITY_MAX', visibility: 'PUBLIC' },
                  },
            },
          }),
        })
        if (res.ok) { enviados++; return }
        falhas++
        const err = await res.json().catch(() => ({}))
        const status = err?.error?.status
        if (res.status === 404 || status === 'NOT_FOUND' || status === 'UNREGISTERED') {
          await supabase.from('loja_push_tokens').delete().eq('id', t.id)
        } else {
          console.error('[pushLoja] FCM recusou', res.status, JSON.stringify(err).slice(0, 300))
        }
      } catch (err) {
        falhas++
        console.error('[pushLoja] falha ao enviar', err)
      }
    }))
    return { enviados, falhas }
  } catch (err) {
    console.error('[pushLoja] erro geral', err)
    return { enviados: 0, falhas: 0 }
  }
}
