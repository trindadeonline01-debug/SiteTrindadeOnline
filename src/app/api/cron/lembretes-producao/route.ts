import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evo.trindadeonline.com.br'
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || ''
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'Trindade Online'

const STATUS_LABEL: Record<string, string> = { a_gravar: 'A gravar', gravado: 'Gravado', editado: 'Editado', postado: 'Postado' }

function formatPhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '')
  if (digits.startsWith('55')) return digits
  return '55' + digits
}
async function sendWhatsApp(phone: string, message: string) {
  try {
    await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(EVOLUTION_INSTANCE)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_KEY },
      body: JSON.stringify({ number: formatPhone(phone), text: message })
    })
  } catch {
    // best-effort — nunca derruba o job
  }
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const { data: tasks } = await supabase
      .from('production_tasks')
      .select('id, title, video_status, scheduled_at, assigned_to, folder:production_folders!inner(name, archived, client:production_clients(name))')
      .eq('folder.archived', false)
      .neq('video_status', 'postado')
      .is('reminder_sent_at', null)
      .gte('scheduled_at', `${tomorrow}T00:00:00`)
      .lt('scheduled_at', `${tomorrow}T23:59:59`)

    if (!tasks || tasks.length === 0) return NextResponse.json({ ok: true, sent: 0 })

    const { data: admins } = await supabase.from('production_team').select('name, phone').eq('role', 'admin').eq('status', 'ativo').not('phone', 'is', null)
    const assignedIds = [...new Set(tasks.map(t => t.assigned_to).filter(Boolean))]
    const { data: assignees } = assignedIds.length
      ? await supabase.from('production_team').select('id, name, phone').in('id', assignedIds)
      : { data: [] as any[] }

    let sent = 0
    for (const t of tasks) {
      const folder: any = Array.isArray(t.folder) ? t.folder[0] : t.folder
      const client = Array.isArray(folder?.client) ? folder.client[0] : folder?.client
      const assignee = assignees?.find(a => a.id === t.assigned_to)
      const statusLabel = STATUS_LABEL[t.video_status] || t.video_status
      const when = fmtDate(t.scheduled_at)

      if (assignee?.phone) {
        await sendWhatsApp(assignee.phone,
          `📅 Lembrete — ${t.title}\n\nOi, ${assignee.name.split(' ')[0]}! "${folder?.name}" (${client?.name}) precisa ser postado amanhã (${when}).\nStatus atual: ${statusLabel}.`)
        sent++
      }
      for (const admin of admins || []) {
        await sendWhatsApp(admin.phone,
          `📅 Lembrete de equipe — ${t.title}\n\n"${folder?.name}" (${client?.name}) precisa ser postado amanhã (${when}).\nResponsável: ${assignee?.name || 'ninguém atribuído'}.\nStatus atual: ${statusLabel}.`)
      }

      await supabase.from('production_tasks').update({ reminder_sent_at: new Date().toISOString() }).eq('id', t.id)
    }

    return NextResponse.json({ ok: true, sent: tasks.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
