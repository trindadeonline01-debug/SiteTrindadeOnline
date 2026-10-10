'use client'

import { forwardRef } from 'react'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'

// Widget de CAPTCHA (Cloudflare Turnstile) pras telas de login/cadastro/
// redefinição de senha — auditoria de segurança, out/2026. A Supabase não
// tem rate limit nativo no login por senha (só em envio de email/OTP), e
// como o signInWithPassword/signUp/resetPasswordForEmail são chamados
// DIRETO do navegador pro Auth da Supabase (não passam pelo nosso
// backend), uma trava escrita no nosso código nunca protegeria contra
// alguém chamando a API da Supabase direto — só o CAPTCHA validado pelo
// próprio backend deles fecha esse buraco de verdade. Habilitado em
// Supabase → Authentication → Settings → Bot and Abuse Protection.
type Props = { onToken: (token: string | null) => void }

const CaptchaTurnstile = forwardRef<TurnstileInstance, Props>(function CaptchaTurnstile({ onToken }, ref) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  if (!siteKey) return null
  return (
    <div style={{ margin: '2px 0 14px' }}>
      <Turnstile
        ref={ref}
        siteKey={siteKey}
        onSuccess={token => onToken(token)}
        onExpire={() => onToken(null)}
        onError={() => onToken(null)}
      />
    </div>
  )
})

export default CaptchaTurnstile
