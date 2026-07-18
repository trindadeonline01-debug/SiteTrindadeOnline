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

    const { data: company } = await supabase.from('companies').select('name, owner_id').eq('id', company_id).single()
    if (!company) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 })

    const { data: authUser } = await supabase.auth.admin.getUserById(company.owner_id)
    const email = authUser?.user?.email
    if (!email) return NextResponse.json({ error: 'Email não encontrado' }, { status: 404 })

    const { data: plans } = await supabase.from('plans').select('*').eq('active', true).eq('type', 'subscription').order('display_order')

    const plansHtml = (plans || []).map((p: any) => {
      const months = Math.max(1, Math.round(Number(p.days) / 30))
      const period = months === 1 ? 'Mensal' : months === 6 ? 'Semestral' : 'Anual'
      return `
        <a href="https://www.trindadeonline.com.br/login?redirect=/painel?tab=plano" style="display:block;background:#1A1A1A;border-radius:12px;padding:20px;margin-bottom:12px;text-decoration:none;">
          <div style="font-size:13px;font-weight:700;color:#C9951A;margin-bottom:4px;">${period} - ${p.name}</div>
          <div style="font-size:24px;font-weight:700;color:#fff;margin-bottom:4px;">R$ ${Number(p.value).toFixed(2).replace('.',',')}</div>
          <div style="font-size:11px;color:#888;">${months === 1 ? 'Cobrado mensalmente' : `Cobrado a cada ${months} meses`}</div>
          <div style="margin-top:12px;background:#C9951A;color:#111;padding:10px;border-radius:8px;text-align:center;font-weight:700;font-size:13px;">Assinar este plano</div>
        </a>
      `
    }).join('')

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#111;border-radius:16px;overflow:hidden;">
        <div style="padding:28px 32px 0;">
          <div style="font-size:24px;font-weight:700;color:#fff;letter-spacing:2px;">TRINDADE <span style="color:#C9951A;">ONLINE</span></div>
        </div>
        <div style="padding:28px 32px;">
          <div style="font-size:32px;margin-bottom:16px;">🎉</div>
          <h2 style="font-size:20px;color:#fff;margin:0 0 12px;">Sua empresa foi aprovada!</h2>
          <p style="font-size:14px;color:#AAA;line-height:1.7;margin-bottom:24px;">
            Sua empresa <strong style="color:#fff;">${company.name}</strong> foi aprovada e ja esta visivel no Trindade Online.<br><br>
            Para liberar todas as funcionalidades escolha um plano abaixo:
          </p>
          ${plansHtml}
          <p style="font-size:12px;color:#555;margin-top:24px;text-align:center;">
            Pagamento via Pix - Ativacao imediata<br>
            <a href="https://www.trindadeonline.com.br" style="color:#C9951A;">trindadeonline.com.br</a>
          </p>
        </div>
      </div>
    `

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Trindade Online <noreply@trindadeonline.com.br>',
        to: email,
        subject: 'Sua empresa foi aprovada no Trindade Online!',
        html
      })
    })

    if (!res.ok) {
      const err = await res.json()
      return NextResponse.json({ error: err }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
