import { createClient } from '@supabase/supabase-js'
import { enfileirarWhatsApp, type ItemFila } from '@/lib/whatsappFila'
import { buildEmailHtml } from '@/lib/trialReminders'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function fillTemplate(template: string, nome: string): string {
  return (template || '').replace(/\{\{nome\}\}/g, nome)
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

async function sendPlanReminders() {
  const { data: reminders } = await supabase.from('plan_reminders').select('*').eq('active', true)
  if (!reminders || reminders.length === 0) return { sent: 0, checked: 0, details: [] as string[] }

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, phone, owner_id, plan_ends_at')
    .eq('status', 'active').eq('plan', 'paid').not('plan_ends_at', 'is', null)

  let sentCount = 0
  const now = Date.now()
  const details: string[] = []
  const fila: ItemFila[] = []

  for (const company of companies || []) {
    const daysLeft = Math.ceil((new Date(company.plan_ends_at).getTime() - now) / 86400000)
    const reminder = reminders.find(r => r.days_before === daysLeft)
    if (!reminder) continue

    const { error: logError } = await supabase.from('plan_reminder_log').insert({ company_id: company.id, reminder_id: reminder.id })
    if (logError) { details.push(`${company.name}: gatilho de ${reminder.days_before}d bateu, mas ja tinha sido enviado antes`); continue }

    let waOk: boolean | null = null
    let emailOk: boolean | null = null
    // WhatsApp nunca sai na hora: entra na fila (1 mensagem a cada 5 min).
    if (company.phone && reminder.whatsapp_message) {
      fila.push({ phone: company.phone, nome: company.name, texto: fillTemplate(reminder.whatsapp_message, company.name) })
      waOk = true
    }
    if (reminder.email_subject && reminder.email_body) {
      const { data: authUser } = await supabase.auth.admin.getUserById(company.owner_id)
      const email = authUser?.user?.email
      if (email) emailOk = await sendEmail(email, reminder.email_subject, fillTemplate(reminder.email_body, company.name))
    }
    details.push(`${company.name}: gatilho de ${reminder.days_before}d — whatsapp ${waOk === null ? 'n/a' : 'na fila'}, email ${emailOk === null ? 'n/a' : emailOk ? 'ok' : 'falhou'}`)
    sentCount++
  }

  if (fila.length) await enfileirarWhatsApp(`Lembrete de plano — ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`, fila)

  return { sent: sentCount, checked: (companies || []).length, details }
}

async function downgradeExpiredPlans() {
  const { data: expired } = await supabase
    .from('companies')
    .select('id, name')
    .eq('plan', 'paid')
    .lt('plan_ends_at', new Date().toISOString())

  const details: string[] = []
  if (!expired || expired.length === 0) return { downgraded: 0, details }

  for (const company of expired) {
    await supabase.from('companies').update({ plan: 'free' }).eq('id', company.id)
    await supabase.from('notification_log').insert({
      company_id: company.id,
      type: 'plan_downgraded',
      metadata: { company_name: company.name }
    })
    details.push(`${company.name}: plano vencido, rebaixada pra free`)
  }

  return { downgraded: expired.length, details }
}

export async function runPlanExpiration() {
  const reminders = await sendPlanReminders()
  const downgrade = await downgradeExpiredPlans()
  return {
    checked: reminders.checked,
    sent: reminders.sent,
    downgraded: downgrade.downgraded,
    details: [...reminders.details, ...downgrade.details]
  }
}
