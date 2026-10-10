import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/requireAdmin'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function resetEmailHtml(link: string): string {
  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f0f0f0;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:20px 0;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="border-radius:16px;overflow:hidden;font-family:Arial,sans-serif;">
  <tr><td style="background:#111;padding:32px 24px;text-align:center;">
    <div style="font-size:22px;font-weight:bold;letter-spacing:3px;color:#fff;margin-bottom:16px;">TRINDADE<span style="color:#C9951A;">ONLINE</span></div>
    <div style="font-size:18px;font-weight:bold;color:#fff;margin-bottom:10px;">Redefinir sua senha</div>
    <div style="font-size:13px;color:#aaa;line-height:1.7;">Pedimos pra gerar um link de redefinição de senha pra sua conta. Clica no botão abaixo pra criar uma senha nova.</div>
  </td></tr>
  <tr><td style="background:#C9951A;height:3px;"></td></tr>
  <tr><td style="background:#F5F5F5;padding:28px 24px;text-align:center;">
    <a href="${link}" style="display:inline-block;background:#C9951A;color:#111;padding:14px 28px;border-radius:10px;font-size:14px;font-weight:bold;text-decoration:none;">Criar nova senha</a>
    <div style="font-size:11px;color:#999;margin-top:16px;">Se você não pediu isso, pode ignorar este email.</div>
  </td></tr>
  <tr><td style="background:#111;padding:16px 20px;text-align:center;border-top:3px solid #C9951A;">
    <div style="font-size:12px;color:#C9951A;">trindadeonline.com.br</div>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  try {
    const { user_id, new_password, send_reset_link, email } = await req.json()

    if (send_reset_link && email) {
      // www. — mesmo domínio usado em todo o resto do site (sem www aqui
      // funcionava só porque a Vercel redireciona o domínio nu pro www,
      // mas evita depender desse redirect extra no meio do link de senha).
      const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.trindadeonline.com.br'
      // Usa a Admin API (generateLink) em vez de resetPasswordForEmail —
      // auditoria de segurança, out/2026: depois de ligar o CAPTCHA pra
      // valer pros usuários reais, essa rota (service_role, ação do admin
      // dentro do painel, nunca exposta a anônimo) quebraria pedindo um
      // captchaToken que não faz sentido existir aqui. generateLink é API
      // admin de verdade — não passa pelo endpoint público /auth/v1/recover,
      // então nunca vai depender de CAPTCHA. Só gera o link; quem manda o
      // email agora somos nós (mesmo padrão Resend do resto do projeto).
      const { data, error } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: `${site}/redefinir-senha` },
      })
      if (error || !data?.properties?.action_link) {
        console.error('[admin/reset-password]', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
      }
      const sent = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Trindade Online <noreply@trindadeonline.com.br>',
          to: email,
          subject: '🔑 Redefinir sua senha — Trindade Online',
          html: resetEmailHtml(data.properties.action_link),
        }),
      })
      if (!sent.ok) {
        console.error('[admin/reset-password] falha ao enviar email:', await sent.text().catch(() => ''))
        return NextResponse.json({ error: 'Erro ao enviar email' }, { status: 502 })
      }
      return NextResponse.json({ ok: true, method: 'link' })
    }

    if (new_password && user_id) {
      const { error } = await supabase.auth.admin.updateUserById(user_id, { password: new_password })
      if (error) {
        console.error('[admin/reset-password]', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
      }
      return NextResponse.json({ ok: true, method: 'direct' })
    }

    return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
  } catch (err: any) {
    console.error('[admin/reset-password]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
