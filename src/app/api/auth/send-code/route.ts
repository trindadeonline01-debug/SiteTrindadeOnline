import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email) return NextResponse.json({ error: 'Email obrigatório' }, { status: 400 })

    // Verifica se email já está cadastrado
    const { data: existing } = await supabase.auth.admin.listUsers()
    const alreadyExists = existing?.users.find(u => u.email === email)
    if (alreadyExists) return NextResponse.json({ error: 'Este email já está cadastrado.' }, { status: 400 })

    // Gera código de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutos

    // Salva no banco (invalida códigos anteriores para o mesmo email)
    await supabase.from('email_verifications').delete().eq('email', email)
    await supabase.from('email_verifications').insert({ email, code, expires_at: expiresAt })

    // Envia email via Resend
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Trindade Online <noreply@trindadeonline.com.br>',
        to: email,
        subject: 'Seu código de verificação — Trindade Online',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#fff;">
            <div style="font-size:22px;font-weight:700;color:#111;margin-bottom:8px;">TRINDADE <span style="color:#C9951A">ONLINE</span></div>
            <p style="font-size:15px;color:#444;margin-bottom:24px;">Use o código abaixo para confirmar seu email:</p>
            <div style="background:#F5F0E8;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
              <div style="font-size:42px;font-weight:700;color:#111;letter-spacing:10px;">${code}</div>
              <div style="font-size:13px;color:#888;margin-top:8px;">Válido por 10 minutos</div>
            </div>
            <p style="font-size:13px;color:#AAA;">Se você não solicitou este código, ignore este email.</p>
          </div>
        `
      })
    })

    if (!resendRes.ok) {
      const err = await resendRes.json()
      return NextResponse.json({ error: 'Erro ao enviar email: ' + err.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
