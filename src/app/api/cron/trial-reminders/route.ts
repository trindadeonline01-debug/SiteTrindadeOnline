import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

async function sendWhatsApp(phone: string, message: string): Promise<boolean> {
  try {
    const res = await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(EVOLUTION_INSTANCE)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
      body: JSON.stringify({ number: formatPhone(phone), text: message })
    })
    return res.ok
  } catch {
    return false
  }
}

async function sendEmail(to: string, subject: string, body: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Trindade Online <noreply@trindadeonline.com.br>',
        to,
        subject,
        html: buildEmailHtml(body)
      })
    })
    return res.ok
  } catch {
    return false
  }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: reminders } = await supabase.from('trial_reminders').select('*').eq('active', true)
  if (!reminders || reminders.length === 0) return NextResponse.json({ ok: true, sent: 0 })

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, phone, owner_id, trial_ends_at')
    .eq('status', 'active').neq('plan', 'paid').not('trial_ends_at', 'is', null)

  let sentCount = 0
  const now = Date.now()

  for (const company of companies || []) {
    const daysLeft = Math.ceil((new Date(company.trial_ends_at).getTime() - now) / 86400000)
    const reminder = reminders.find(r => r.days_before === daysLeft)
    if (!reminder) continue

    // Ja enviado esse marco pra essa empresa? (unique constraint evita duplicidade)
    const { error: logError } = await supabase.from('trial_reminder_log').insert({ company_id: company.id, reminder_id: reminder.id })
    if (logError) continue // 23505 = ja enviado antes, pula

    if (company.phone && reminder.whatsapp_message) {
      await sendWhatsApp(company.phone, fillTemplate(reminder.whatsapp_message, company.name))
    }
    if (reminder.email_subject && reminder.email_body) {
      const { data: authUser } = await supabase.auth.admin.getUserById(company.owner_id)
      const email = authUser?.user?.email
      if (email) await sendEmail(email, reminder.email_subject, fillTemplate(reminder.email_body, company.name))
    }
    sentCount++
  }

  return NextResponse.json({ ok: true, sent: sentCount, checked: (companies || []).length })
}
