import { NextRequest, NextResponse } from 'next/server'
import { buildEmailHtml } from '@/lib/trialReminders'

import { plataformaTexto } from '@/lib/wa/plataforma'

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('55')) return digits
  return '55' + digits
}

function fillTemplate(template: string, nome: string): string {
  return (template || '').replace(/\{\{nome\}\}/g, nome)
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
        const r = await plataformaTexto(formatPhone(phone), fillTemplate(whatsapp_message, nome))
        result.whatsapp = r.ok
        if (!r.ok) result.error = r.detail
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
    console.error('[trial-reminders/test]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
