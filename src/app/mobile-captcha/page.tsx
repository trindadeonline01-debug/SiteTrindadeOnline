'use client'
import CaptchaTurnstile from '@/components/CaptchaTurnstile'

// Ponte só pro app nativo da loja (pasta app-loja/ do repo) — ele não consegue rodar o
// widget do Cloudflare Turnstile sozinho (não existe SDK nativo, só
// JavaScript de navegador), então abre essa página dentro de uma WebView
// quase invisível só pra resolver o desafio e mandar o token de volta via
// postMessage. Sem isso o login do app quebraria: desde a auditoria de
// segurança de out/2026, TODO signInWithPassword (de qualquer origem,
// navegador ou app) exige esse token — ver CaptchaTurnstile.tsx.
export default function AppLojaCaptchaPage() {
  function handleToken(token: string | null) {
    if (!token) return
    // @ts-expect-error — injetado pela WebView do React Native, não existe tipo pra isso
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(token)
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#F5F6F2' }}>
      <CaptchaTurnstile onToken={handleToken} />
    </div>
  )
}
