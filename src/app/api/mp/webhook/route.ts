import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function sendConfirmationEmail(to: string, subject: string, html: string) {
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Trindade Online <noreply@trindadeonline.com.br>', to, subject, html })
    })
  } catch (err) { console.error('Email error:', err) }
}

function emailTemplate(title: string, body: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#fff;">
    <div style="font-size:22px;font-weight:700;color:#111;margin-bottom:24px;">TRINDADE <span style="color:#C9951A">ONLINE</span></div>
    <h2 style="font-size:18px;color:#111;margin-bottom:16px;">${title}</h2>
    ${body}
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#AAA;">
      Trindade Online · São Gonçalo, RJ · <a href="https://trindadeonline.com.br" style="color:#C9951A;">trindadeonline.com.br</a>
    </div>
  </div>`
}

async function processPayment(paymentId: string) {
  try {
    const { data: setting } = await supabase.from('settings').select('value').eq('key', 'mp_access_token').maybeSingle()
    const accessToken = setting?.value
    if (!accessToken) return

    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    const payment = await res.json()
    if (payment.status !== 'approved') return

    let ext: any = {}; try { ext = JSON.parse(payment.external_reference || '{}') } catch(e) { console.error('webhook: external_reference invalido', payment.external_reference) }

    // DESTAQUE
    if (ext.type === 'highlight' && ext.company_id) {
      const startsAt = new Date()
      const expiresAt = new Date(Date.now() + ext.days * 86400000)
      await supabase.from('highlights').insert({
        company_id: ext.company_id,
        level: ext.level,
        duration_days: ext.days,
        price_paid: ext.value,
        starts_at: startsAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        status: 'active',
        clicks_count: 0,
        impressions_count: 0,
      })
      // Buscar email do dono
      const { data: comp } = await supabase.from('companies').select('name, owner_id').eq('id', ext.company_id).maybeSingle()
      if (comp) {
        const { data: authUser } = await supabase.auth.admin.getUserById(comp.owner_id)
        const email = authUser?.user?.email
        if (email) {
          const levelLabel = ext.level === 'home' ? 'Home' : ext.level === 'category' ? 'Categoria' : 'Subcategoria'
          await sendConfirmationEmail(email, '✅ Destaque ativado — Trindade Online', emailTemplate(
            '✅ Seu destaque foi ativado!',
            `<p style="color:#444;font-size:14px;margin-bottom:16px;">Olá! Seu destaque foi ativado com sucesso.</p>
            <div style="background:#F5F0E8;border-radius:12px;padding:20px;margin-bottom:16px;">
              <div style="font-size:13px;color:#888;margin-bottom:6px;">EMPRESA</div>
              <div style="font-size:16px;font-weight:700;color:#111;margin-bottom:12px;">${comp.name}</div>
              <div style="font-size:13px;color:#888;margin-bottom:4px;">TIPO DE DESTAQUE</div>
              <div style="font-size:15px;font-weight:600;color:#111;margin-bottom:12px;">Destaque ${levelLabel}</div>
              <div style="display:flex;gap:24px;">
                <div><div style="font-size:12px;color:#888;">PERÍODO</div><div style="font-size:14px;font-weight:600;">${ext.days} dias</div></div>
                <div><div style="font-size:12px;color:#888;">VALOR PAGO</div><div style="font-size:14px;font-weight:600;">R$ ${Number(ext.value).toFixed(2)}</div></div>
                <div><div style="font-size:12px;color:#888;">VENCE EM</div><div style="font-size:14px;font-weight:600;">${expiresAt.toLocaleDateString('pt-BR')}</div></div>
              </div>
            </div>`
          ))
        }
      }
      return
    }

    // PLANO
    const { data: rec } = await supabase.from('payments').select('*').eq('payment_id', String(paymentId)).maybeSingle()
    const companyId = rec?.company_id || ext.company_id
    if (!companyId) return

    const days = rec?.days || ext.days || 30
    const planEndsAt = new Date(Date.now() + days * 86400000)

    if (!rec) {
      await supabase.from('payments').insert({ company_id: ext.company_id, payment_id: String(paymentId), plan: ext.plan, value: payment.transaction_amount, days, status: 'paid', paid_at: new Date().toISOString() })
    } else {
      await supabase.from('payments').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', rec.id)
    }
    await supabase.from('companies').update({ plan: 'paid', plan_ends_at: planEndsAt.toISOString(), status: 'active' }).eq('id', companyId)

    // Email de confirmação do plano
    const { data: comp } = await supabase.from('companies').select('name, owner_id').eq('id', companyId).maybeSingle()
    if (comp) {
      const { data: authUser } = await supabase.auth.admin.getUserById(comp.owner_id)
      const email = authUser?.user?.email
      if (email) {
        const planLabel = ext.plan?.includes('mensal') ? 'Mensal' : ext.plan?.includes('trimestral') ? 'Trimestral' : 'Semestral'
        await sendConfirmationEmail(email, '✅ Plano ativado — Trindade Online', emailTemplate(
          '✅ Seu plano foi ativado!',
          `<p style="color:#444;font-size:14px;margin-bottom:16px;">Olá! Seu plano foi ativado com sucesso.</p>
          <div style="background:#F5F0E8;border-radius:12px;padding:20px;margin-bottom:16px;">
            <div style="font-size:13px;color:#888;margin-bottom:6px;">EMPRESA</div>
            <div style="font-size:16px;font-weight:700;color:#111;margin-bottom:12px;">${comp.name}</div>
            <div style="display:flex;gap:24px;flex-wrap:wrap;">
              <div><div style="font-size:12px;color:#888;">PLANO</div><div style="font-size:14px;font-weight:600;">${planLabel}</div></div>
              <div><div style="font-size:12px;color:#888;">VALOR PAGO</div><div style="font-size:14px;font-weight:600;">R$ ${Number(payment.transaction_amount).toFixed(2)}</div></div>
              <div><div style="font-size:12px;color:#888;">VENCE EM</div><div style="font-size:14px;font-weight:600;">${planEndsAt.toLocaleDateString('pt-BR')}</div></div>
            </div>
          </div>
          <a href="https://trindadeonline.com.br/painel" style="display:inline-block;padding:12px 24px;background:#C9951A;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;">Acessar meu painel →</a>`
        ))
      }
    }

  } catch (err) {
    console.error('processPayment error:', err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const response = NextResponse.json({ ok: true })
    if ((body.type === 'payment' || body.action === 'payment.updated') && body.data?.id) {
      await processPayment(String(body.data.id))
    }
    return response
  } catch {
    return NextResponse.json({ ok: true })
  }
}

export async function GET() {
  return NextResponse.json({ ok: true })
}
