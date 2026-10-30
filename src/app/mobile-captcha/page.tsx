'use client'
import CaptchaTurnstile from '@/components/CaptchaTurnstile'

// Ponte só pro app nativo da loja (pasta app-loja/ do repo) — ele não consegue rodar o
// widget do Cloudflare Turnstile sozinho (não existe SDK nativo, só
// JavaScript de navegador), então abre essa página dentro de uma WebView
// escondida só pra resolver o desafio e mandar o resultado de volta via
// postMessage. Sem isso o login do app quebraria: desde a auditoria de
// segurança de out/2026, TODO signInWithPassword (de qualquer origem,
// navegador ou app) exige esse token — ver CaptchaTurnstile.tsx.
//
// Mensagens pro app: o próprio token; '__interactive__' quando o Cloudflare
// precisa de um toque do usuário (o app mostra a WebView); '__done__' quando
// esse toque terminou; '__expired__' quando o token venceu ou deu erro (o
// app recarrega a página pra pegar outro).
export default function AppLojaCaptchaPage() {
  function post(msg: string) {
    // @ts-expect-error — injetado pela WebView do React Native, não existe tipo pra isso
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg)
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#FFFFFF' }}>
      <CaptchaTurnstile
        appearance="interaction-only"
        onToken={t => post(t ?? '__expired__')}
        onBeforeInteractive={() => post('__interactive__')}
        onAfterInteractive={() => post('__done__')}
      />
    </div>
  )
}
