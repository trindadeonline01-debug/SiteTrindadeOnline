import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { company_id } = await req.json()
    if (!company_id) return NextResponse.json({ error: 'company_id obrigatório' }, { status: 400 })

    // Buscar empresa e dono
    const { data: company } = await supabase
      .from('companies')
      .select('id, name, slug, owner_id')
      .eq('id', company_id)
      .single()
    if (!company) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 })

    // Buscar email do dono
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, name')
      .eq('id', company.owner_id)
      .single()
    if (!profile?.email) return NextResponse.json({ ok: true, skipped: 'sem email do dono' })

    // Verificar se já foi enviado email hoje pra essa empresa
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const { data: logs } = await supabase
      .from('notification_log')
      .select('id')
      .eq('company_id', company_id)
      .eq('type', 'contact_interest')
      .gte('sent_at', startOfDay.toISOString())
      .limit(1)
    if (logs && logs.length > 0) {
      return NextResponse.json({ ok: true, skipped: 'ja enviado hoje' })
    }

    // Contar quantos interesses recebeu hoje
    const { count: interestesHoje } = await supabase
      .from('contact_requests')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', company_id)
      .gte('created_at', startOfDay.toISOString())

    const totalHoje = interestesHoje || 1

    // Enviar email via Resend
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:0;background:#F5F0E8;">
        <div style="background:#111;padding:32px 24px;text-align:center;">
          <div style="font-size:26px;font-weight:800;color:#fff;letter-spacing:2px;">TRINDADE <span style="color:#C9951A">ONLINE</span></div>
        </div>
        <div style="padding:32px 28px;background:#fff;">
          <div style="font-size:14px;color:#C9951A;font-weight:700;letter-spacing:1px;margin-bottom:12px;">🔔 NOVO INTERESSE</div>
          <h1 style="font-size:22px;color:#111;margin:0 0 16px;line-height:1.3;">
            ${totalHoje === 1 ? 'Um cliente' : `${totalHoje} clientes`} ${totalHoje === 1 ? 'tentou' : 'tentaram'} entrar em contato com sua empresa hoje
          </h1>
          <p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 20px;">
            Olá, <strong>${profile.name || 'lojista'}</strong>! Como sua empresa <strong>${company.name}</strong> ainda não tem um plano ativo, seus dados de contato (WhatsApp, endereço, link) estão bloqueados no site.
          </p>
          <p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 24px;">
            Ative um plano agora e comece a receber contatos diretos hoje mesmo.
          </p>
          <div style="text-align:center;margin:32px 0;">
            <a href="https://trindadeonline.com.br/painel" style="display:inline-block;background:#C9951A;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:700;letter-spacing:0.5px;">
              Ativar meu plano →
            </a>
          </div>
          <div style="background:#F5F0E8;border-radius:12px;padding:20px;margin-top:24px;">
            <div style="font-size:13px;color:#888;line-height:1.6;">
              💡 <strong>Dica:</strong> Empresas com plano ativo aparecem primeiro nas buscas e recebem contatos diretos por WhatsApp.
            </div>
          </div>
        </div>
        <div style="padding:24px;text-align:center;background:#F5F0E8;">
          <div style="font-size:12px;color:#888;">
            Trindade Online · <a href="https://trindadeonline.com.br" style="color:#C9951A;text-decoration:none;">trindadeonline.com.br</a>
          </div>
        </div>
      </div>
    `

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Trindade Online <noreply@trindadeonline.com.br>',
        to: profile.email,
        subject: `🔔 Alguém tentou entrar em contato com ${company.name}`,
        html
      })
    })

    if (!resendRes.ok) {
      const err = await resendRes.json()
      return NextResponse.json({ error: 'Erro Resend: ' + (err.message || 'desconhecido') }, { status: 500 })
    }

    // Registrar no log
    await supabase.from('notification_log').insert({
      company_id,
      type: 'contact_interest',
      metadata: { total_hoje: totalHoje, email_to: profile.email }
    })

    return NextResponse.json({ ok: true, sent: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
