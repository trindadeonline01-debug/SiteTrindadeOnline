import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { company_id } = await req.json()
    if (!company_id) return NextResponse.json({ error: 'company_id obrigatorio' }, { status: 400 })

    const { data: company } = await supabase.from('companies').select('name, owner_id').eq('id', company_id).single()
    if (!company) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 404 })

    const { data: authUser } = await supabase.auth.admin.getUserById(company.owner_id)
    const email = authUser?.user?.email
    if (!email) return NextResponse.json({ error: 'Email nao encontrado' }, { status: 404 })

    const { data: plans } = await supabase.from('plans').select('*').eq('active', true).eq('type', 'subscription').order('display_order')

    const planCards = (plans || []).map((p: any) => {
      const months = Math.max(1, Math.round(Number(p.days) / 30))
      const label = months === 1 ? 'MENSAL' : months === 6 ? 'SEMESTRAL' : 'ANUAL'
      const isPopular = months === 6
      const perMonth = (Number(p.value) / months).toFixed(2).replace('.', ',')
      const [reais, cents] = perMonth.split(',')
      const totalLine = months > 1
        ? `<div style="font-size:10px;color:#C9951A;font-weight:bold;margin-bottom:10px;">Total R$ ${Number(p.value).toFixed(2).replace('.', ',')}</div>`
        : `<div style="font-size:10px;color:#aaa;margin-bottom:10px;">&nbsp;</div>`
      const borderStyle = isPopular ? 'border:2px solid #C9951A;' : 'border:1px solid #ddd;'
      const labelColor = isPopular ? '#C9951A' : '#888'
      const btnBg = isPopular ? '#C9951A' : '#111'
      const btnColor = isPopular ? '#111' : '#C9951A'
      const popularBadge = isPopular
        ? `<div style="background:#C9951A;color:#111;font-size:9px;font-weight:bold;padding:5px 0;text-align:center;border-radius:8px 8px 0 0;">MAIS POPULAR</div>`
        : `<div style="height:20px;"></div>`

      return `<td width="33%" style="padding:4px;vertical-align:top;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;${borderStyle}">
          <tr><td>
            ${popularBadge}
            <div style="padding:10px 8px 14px;text-align:center;">
              <div style="font-size:11px;color:${labelColor};font-weight:bold;margin-bottom:6px;">${label}</div>
              <div style="font-size:20px;font-weight:bold;color:#111;">R$${reais}<span style="font-size:12px;">,${cents}</span></div>
              <div style="font-size:10px;color:#aaa;margin-bottom:4px;">por mes</div>
              ${totalLine}
              <a href="https://www.trindadeonline.com.br/login?redirect=/painel?tab=plano" style="display:inline-block;background:${btnBg};color:${btnColor};padding:8px 16px;border-radius:8px;font-size:11px;font-weight:bold;text-decoration:none;">Assinar</a>
            </div>
          </td></tr>
        </table>
      </td>`
    }).join('')

    const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f0f0f0;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:20px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="border-radius:16px;overflow:hidden;font-family:Arial,sans-serif;">

  <tr><td style="background:#111;padding:28px 20px 0 20px;">
    <div style="font-size:22px;font-weight:bold;letter-spacing:3px;color:#fff;text-align:center;margin-bottom:14px;">TRINDADE<span style="color:#C9951A;">ONLINE</span></div>
    <div style="font-size:18px;font-weight:bold;color:#fff;text-align:center;margin-bottom:10px;">Sua empresa foi aprovada! 🎉</div>
    <div style="font-size:13px;color:#aaa;line-height:1.7;text-align:center;margin-bottom:20px;">Ola! A empresa <strong style="color:#fff;">${company.name}</strong> ja esta visivel no Trindade Online e pode ser encontrada pelos moradores do bairro.</div>
    <div style="background:#C9951A;height:3px;margin:0 -20px;"></div>
    <div style="background:#F5F5F5;margin:0 -20px;padding:24px 20px;">
      <div style="font-size:13px;font-weight:bold;color:#333;text-align:center;margin-bottom:16px;">Veja o que cada plano oferece:</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <td width="49%" style="background:#fff;border:1px solid #ddd;border-radius:10px;padding:14px;vertical-align:top;">
            <div style="font-size:11px;font-weight:bold;color:#888;letter-spacing:1px;margin-bottom:2px;">GRATUITO</div>
            <div style="font-size:11px;color:#aaa;margin-bottom:10px;">Para sempre</div>
            <div style="font-size:12px;color:#555;margin-bottom:5px;">&#10003; Perfil cadastrado</div>
            <div style="font-size:12px;color:#555;margin-bottom:5px;">&#10003; Aparece nas categorias</div>
            <div style="font-size:12px;color:#555;margin-bottom:10px;">&#10003; Fotos e descricao</div>
            <div style="height:1px;background:#eee;margin-bottom:10px;"></div>
            <div style="font-size:12px;color:#ccc;text-decoration:line-through;margin-bottom:5px;">&#10007; WhatsApp visivel</div>
            <div style="font-size:12px;color:#ccc;text-decoration:line-through;margin-bottom:5px;">&#10007; Endereco completo</div>
            <div style="font-size:12px;color:#ccc;text-decoration:line-through;margin-bottom:5px;">&#10007; Link externo</div>
            <div style="font-size:12px;color:#ccc;text-decoration:line-through;margin-bottom:5px;">&#10007; Buscas por tags</div>
            <div style="font-size:12px;color:#ccc;text-decoration:line-through;margin-bottom:5px;">&#10007; Cupons Relampago</div>
            <div style="font-size:12px;color:#ccc;text-decoration:line-through;">&#10007; Promocoes da Semana</div>
          </td>
          <td width="2%"></td>
          <td width="49%" style="background:#fff;border:2px solid #C9951A;border-radius:10px;padding:14px;vertical-align:top;">
            <div style="font-size:11px;font-weight:bold;color:#C9951A;letter-spacing:1px;margin-bottom:2px;">PLANO PAGO</div>
            <div style="font-size:11px;color:#C9951A;margin-bottom:10px;">Tudo desbloqueado</div>
            <div style="font-size:12px;color:#555;margin-bottom:5px;">&#10003; Perfil cadastrado</div>
            <div style="font-size:12px;color:#555;margin-bottom:5px;">&#10003; Aparece nas categorias</div>
            <div style="font-size:12px;color:#555;margin-bottom:10px;">&#10003; Fotos e descricao</div>
            <div style="height:1px;background:#eee;margin-bottom:10px;"></div>
            <div style="font-size:12px;color:#C9951A;font-weight:bold;margin-bottom:5px;">&#10003; WhatsApp visivel</div>
            <div style="font-size:12px;color:#C9951A;font-weight:bold;margin-bottom:5px;">&#10003; Endereco completo</div>
            <div style="font-size:12px;color:#C9951A;font-weight:bold;margin-bottom:5px;">&#10003; Link externo</div>
            <div style="font-size:12px;color:#C9951A;font-weight:bold;margin-bottom:5px;">&#10003; Buscas por tags</div>
            <div style="font-size:12px;color:#C9951A;font-weight:bold;margin-bottom:5px;">&#10003; Cupons Relampago</div>
            <div style="font-size:12px;color:#C9951A;font-weight:bold;">&#10003; Promocoes da Semana</div>
          </td>
        </tr>
      </table>
      <div style="font-size:11px;font-weight:bold;color:#888;letter-spacing:1px;text-align:center;margin-bottom:12px;">ESCOLHA SEU PLANO:</div>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>${planCards}</tr>
      </table>
    </div>
  </td></tr>

  <tr><td style="background:#111;padding:16px 20px;text-align:center;border-top:3px solid #C9951A;">
    <div style="font-size:12px;color:#555;">Pagamento via Pix - Ativacao imediata</div>
    <div style="font-size:12px;color:#C9951A;margin-top:4px;">trindadeonline.com.br</div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>
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

    await supabase.from('email_logs').insert({ company_id, email_type: 'aprovacao' })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}