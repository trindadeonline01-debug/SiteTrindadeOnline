import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://trindadeonline.com.br'
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

function inviteEmailHtml(name: string): string {
  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f0f0f0;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:20px 0;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="border-radius:16px;overflow:hidden;font-family:Arial,sans-serif;">
  <tr><td style="background:#111;padding:32px 24px;text-align:center;">
    <div style="font-size:22px;font-weight:bold;letter-spacing:3px;color:#fff;margin-bottom:16px;">TRINDADE<span style="color:#C9951A;">ONLINE</span></div>
    <div style="font-size:12px;color:#8B95A3;letter-spacing:1px;margin-bottom:14px;">AGENDA DE PRODUÇÃO</div>
    <div style="font-size:18px;font-weight:bold;color:#fff;margin-bottom:10px;">Você foi convidado(a) pra equipe! 🎬</div>
    <div style="font-size:13px;color:#aaa;line-height:1.7;">Olá, <strong style="color:#fff;">${name}</strong>! Você já pode criar sua conta na Agenda de Produção — é por ali que a equipe organiza clientes, pastas de conteúdo e status de gravação/edição.</div>
  </td></tr>
  <tr><td style="background:#C9951A;height:3px;"></td></tr>
  <tr><td style="background:#F5F5F5;padding:28px 24px;text-align:center;">
    <a href="${SITE_URL}/producao" style="display:inline-block;background:#C9951A;color:#111;padding:14px 28px;border-radius:10px;font-size:14px;font-weight:bold;text-decoration:none;">Criar minha conta</a>
    <div style="font-size:11px;color:#999;margin-top:16px;">Use exatamente este email pra criar sua conta — assim seu acesso já vem liberado.</div>
  </td></tr>
  <tr><td style="background:#111;padding:16px 20px;text-align:center;border-top:3px solid #C9951A;">
    <div style="font-size:12px;color:#C9951A;">trindadeonline.com.br/producao</div>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

export async function POST(req: NextRequest) {
  try {
    const { access_token, name, email, phone } = await req.json()
    if (!name?.trim() || !email?.trim()) {
      return NextResponse.json({ error: 'Preencha nome e email' }, { status: 400 })
    }

    // Só admin da equipe pode convidar
    const { data: userData } = await supabaseAuth.auth.getUser(access_token)
    if (!userData?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    const { data: me } = await supabase.from('production_team').select('role, status').eq('user_id', userData.user.id).maybeSingle()
    if (!me || me.status !== 'ativo' || me.role !== 'admin') {
      return NextResponse.json({ error: 'Só administradores podem convidar' }, { status: 403 })
    }

    const emailLower = email.trim().toLowerCase()
    const { data: existing } = await supabase.from('production_team').select('id').ilike('email', emailLower).maybeSingle()
    if (existing) return NextResponse.json({ error: 'Já existe um convite ou conta pra esse email' }, { status: 400 })

    // Não cria o login aqui — a pessoa cria a própria conta em /producao (com
    // esse mesmo email) e o sistema reconhece o convite automaticamente. Já
    // entra ativo porque o admin convidando já é a aprovação; joined_at só é
    // marcado quando ela efetivamente acessa a agenda pela 1ª vez.
    const { error: teamError } = await supabase.from('production_team').insert({
      user_id: null, name: name.trim(), email: emailLower,
      phone: phone?.trim() || null, role: 'member', status: 'ativo',
    })
    if (teamError) return NextResponse.json({ error: teamError.message }, { status: 500 })

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Trindade Online <noreply@trindadeonline.com.br>',
        to: email.trim(),
        subject: '🎬 Você foi convidado pra Agenda de Produção',
        html: inviteEmailHtml(name.trim()),
      }),
    })
    if (phone?.trim()) {
      await sendWhatsApp(phone.trim(), `Oi ${name.trim()}! 🎬 Você foi convidado(a) pra equipe da Agenda de Produção do Trindade Online.\n\nAcesse ${SITE_URL}/producao e crie sua conta com o email ${emailLower} pra começar — seu acesso já vem liberado.`)
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
