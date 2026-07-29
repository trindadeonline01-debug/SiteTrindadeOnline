import { NextRequest, NextResponse } from 'next/server'

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evo.trindadeonline.com.br'
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || 'trindade2024'
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'Trindade Online'

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('55')) return digits
  return '55' + digits
}

function fillTemplate(template: string, nome: string): string {
  return (template || '').replace(/\{\{nome\}\}/g, nome)
}

function buildEmailHtml(bodyText: string): string {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f0f0f0;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:20px 0;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="border-radius:16px;overflow:hidden;font-family:Arial,sans-serif;">
  <tr><td style="background:#111;padding:28px 24px;text-align:center;">
    <div style="font-size:20px;font-weight:bold;letter-spacing:3px;color:#fff;">TRINDADE<span style="color:#C9951A;">ONLINE</span></div>
  </td></tr>
  <tr><td style="background:#C9951A;height:3px;"></td></tr>
  <tr><td style="background:#fff;padding:32px 28px;">
    <div style="font-size:14px;color:#333;line-height:1.7;white-space:pre-line;">${bodyText}</div>
    <table cellpadding="0" cellspacing="0" style="margin-top:24px;"><tr><td style="background:#C9951A;border-radius:10px;">
      <a href="https://trindadeonline.com.br/painel" style="display:inline-block;padding:12px 28px;font-size:13px;font-weight:bold;color:#111;text-decoration:none;">Acessar meu painel &rarr;</a>
    </td></tr></table>
  </td></tr>
  <tr><td style="background:#111;padding:16px 24px;text-align:center;border-top:3px solid #C9951A;">
    <div style="font-size:11px;color:#C9951A;">trindadeonline.com.br</div>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

export async function POST(req: NextRequest) {
  try {
    const { phone, email, name, whatsapp_message, email_subject, email_body } = await req.json()
    if (!phone && !email) return NextResponse.json({ error: 'informe telefone e/ou email' }, { status: 400 })

    const nome = name?.trim() || 'Empresa Teste'
    const result: { whatsapp?: boolean; email?: boolean; error?: string } = {}

    if (phone) {
      if (!whatsapp_message) {
        result.whatsapp = false
      } else {
        const res = await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(EVOLUTION_INSTANCE)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
          body: JSON.stringify({ number: formatPhone(phone), text: fillTemplate(whatsapp_message, nome) })
        })
        result.whatsapp = res.ok
        if (!res.ok) result.error = await res.text()
      }
    }

    if (email) {
      if (!email_subject || !email_body) {
        result.email = false
      } else {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Trindade Online <noreply@trindadeonline.com.br>',
            to: email,
            subject: `[TESTE] ${email_subject}`,
            html: buildEmailHtml(fillTemplate(email_body, nome))
          })
        })
        result.email = res.ok
        if (!res.ok) result.error = (result.error || '') + ' | email: ' + await res.text()
      }
    }

    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
