import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Cliente separado (chave anon) só pra validar o access_token de quem tá
// logado como equipe — nunca confia num user_id vindo direto do corpo
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evo.trindadeonline.com.br'
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || 'trindade2024'
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'Trindade Online'

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
    // best-effort — nunca derruba o fluxo principal
  }
}

async function sendInviteEmail(to: string, name: string) {
  try {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#F5F0E8;">
        <div style="background:#0B0D10;padding:28px 24px;text-align:center;">
          <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:2px;">TRINDADE <span style="color:#FFB020">ONLINE</span></div>
          <div style="font-size:12px;color:#8B95A3;letter-spacing:1px;margin-top:4px;">AGENDA DE PRODUÇÃO</div>
        </div>
        <div style="padding:28px 24px;background:#fff;">
          <p style="font-size:15px;color:#333;line-height:1.6;">Olá, <strong>${name}</strong>! Você foi convidado a acessar a Agenda de Produção do Trindade Online.</p>
          <p style="font-size:15px;color:#333;line-height:1.6;">É por ali que você vai ver as gravações e tarefas atribuídas a você, com roteiro e local de cada uma.</p>
          <div style="text-align:center;margin:28px 0;">
            <a href="https://trindadeonline.com.br/agenda" style="display:inline-block;background:#FFB020;color:#0B0D10;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:700;">Acessar a Agenda →</a>
          </div>
          <p style="font-size:13px;color:#888;line-height:1.6;">Use este email (<strong>${to}</strong>) pra criar sua senha na primeira vez que acessar.</p>
        </div>
      </div>`
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Trindade Online <noreply@trindadeonline.com.br>', to, subject: '🎬 Você foi convidado pra Agenda de Produção', html })
    })
  } catch {
    // best-effort
  }
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body

    // ===== ADMIN =====

    if (action === 'create_client') {
      const { name, address, notes } = body
      if (!name?.trim()) return NextResponse.json({ error: 'Nome do cliente é obrigatório' }, { status: 400 })
      const { data, error } = await supabase.from('production_clients').insert({
        name: name.trim(), address: address?.trim() || null, notes: notes?.trim() || null
      }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, client: data })
    }

    if (action === 'create_team') {
      const { name, email, phone } = body
      if (!name?.trim() || !email?.trim()) return NextResponse.json({ error: 'Preencha nome e email' }, { status: 400 })
      const { data, error } = await supabase.from('production_team').insert({
        name: name.trim(), email: email.trim().toLowerCase(), phone: phone?.trim() || null
      }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      await sendInviteEmail(data.email, data.name)
      if (data.phone) {
        await sendWhatsApp(data.phone, `Oi ${data.name}! 🎬 Você foi convidado pra Agenda de Produção do Trindade Online.\n\nAcesse trindadeonline.com.br/agenda e crie sua senha com o email ${data.email} pra ver suas tarefas.`)
      }
      return NextResponse.json({ ok: true, member: data })
    }

    if (action === 'create_task') {
      const { client_id, title, roteiro, reference_link, location, scheduled_at, assigned_to } = body
      if (!client_id || !title?.trim() || !scheduled_at) {
        return NextResponse.json({ error: 'Preencha cliente, título e data/hora' }, { status: 400 })
      }
      const { data, error } = await supabase.from('production_tasks').insert({
        client_id, title: title.trim(), roteiro: roteiro?.trim() || null,
        reference_link: reference_link?.trim() || null, location: location?.trim() || null,
        scheduled_at, assigned_to: assigned_to || null
      }).select('*, client:production_clients(name), team:production_team(name, phone)').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      const team = Array.isArray(data.team) ? data.team[0] : data.team
      const client = Array.isArray(data.client) ? data.client[0] : data.client
      if (team?.phone) {
        await sendWhatsApp(team.phone, `📋 Nova tarefa pra você!\n\nCliente: ${client?.name || '—'}\nTítulo: ${data.title}\nQuando: ${fmtWhen(data.scheduled_at)}${data.location ? `\nLocal: ${data.location}` : ''}\n\nAcesse trindadeonline.com.br/agenda pra ver o roteiro e aceitar.`)
      }
      return NextResponse.json({ ok: true, task: data })
    }

    if (action === 'delete_task') {
      const { id } = body
      await supabase.from('production_tasks').delete().eq('id', id)
      return NextResponse.json({ ok: true })
    }

    // ===== EQUIPE (autenticado por access_token) =====

    if (action === 'team_link') {
      const { access_token } = body
      const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(access_token)
      if (userErr || !userData?.user?.email) return NextResponse.json({ authorized: false })

      const email = userData.user.email.toLowerCase()
      const { data: member } = await supabase.from('production_team').select('*').eq('email', email).maybeSingle()
      if (!member) return NextResponse.json({ authorized: false })

      if (!member.user_id) {
        await supabase.from('production_team').update({
          user_id: userData.user.id, status: 'ativo', joined_at: new Date().toISOString()
        }).eq('id', member.id)
      }
      return NextResponse.json({ authorized: true, member: { id: member.id, name: member.name, email: member.email } })
    }

    if (action === 'team_my_tasks') {
      const { access_token } = body
      const { data: userData } = await supabaseAuth.auth.getUser(access_token)
      if (!userData?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

      const { data: member } = await supabase.from('production_team').select('id, name').eq('user_id', userData.user.id).maybeSingle()
      if (!member) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

      const { data: tasks } = await supabase
        .from('production_tasks')
        .select('*, client:production_clients(name, address)')
        .eq('assigned_to', member.id)
        .order('scheduled_at', { ascending: true })

      return NextResponse.json({ ok: true, member, tasks: tasks || [] })
    }

    if (action === 'team_accept_task' || action === 'team_complete_task') {
      const { access_token, task_id } = body
      const { data: userData } = await supabaseAuth.auth.getUser(access_token)
      if (!userData?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

      const { data: member } = await supabase.from('production_team').select('id').eq('user_id', userData.user.id).maybeSingle()
      if (!member) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

      const { data: task } = await supabase.from('production_tasks').select('id, assigned_to, status').eq('id', task_id).maybeSingle()
      if (!task || task.assigned_to !== member.id) return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 })

      if (action === 'team_accept_task') {
        if (task.status !== 'pendente') return NextResponse.json({ error: 'Essa tarefa já foi aceita' }, { status: 400 })
        await supabase.from('production_tasks').update({ status: 'aceito', accepted_at: new Date().toISOString() }).eq('id', task_id)
      } else {
        if (task.status === 'concluido') return NextResponse.json({ error: 'Essa tarefa já está concluída' }, { status: 400 })
        await supabase.from('production_tasks').update({ status: 'concluido', completed_at: new Date().toISOString() }).eq('id', task_id)
      }
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Lista tudo (painel admin)
export async function GET() {
  try {
    const { data: clients } = await supabase.from('production_clients').select('*').order('name')
    const { data: team } = await supabase.from('production_team').select('*').order('name')
    const { data: tasks } = await supabase
      .from('production_tasks')
      .select('*, client:production_clients(name), team:production_team(name)')
      .order('scheduled_at', { ascending: false })
    return NextResponse.json({ clients: clients || [], team: team || [], tasks: tasks || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
