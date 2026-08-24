import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://trindadeonline.com.br'

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now()
}

async function uploadPhoto(companyId: string, index: number, dataUrl: string): Promise<string | null> {
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/)
  if (!match) return null
  const [, mime, base64] = match
  const ext = mime.split('/')[1] || 'jpg'
  const buffer = Buffer.from(base64, 'base64')
  const path = `${companyId}/${index}-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('company-photos').upload(path, buffer, { contentType: mime, upsert: true })
  if (error) return null
  const { data: urlData } = supabase.storage.from('company-photos').getPublicUrl(path)
  return urlData.publicUrl
}

function inviteEmailHtml(name: string, actionLink: string): string {
  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f0f0f0;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:20px 0;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="border-radius:16px;overflow:hidden;font-family:Arial,sans-serif;">
  <tr><td style="background:#111;padding:32px 24px;text-align:center;">
    <div style="font-size:22px;font-weight:bold;letter-spacing:3px;color:#fff;margin-bottom:16px;">TRINDADE<span style="color:#C9951A;">ONLINE</span></div>
    <div style="font-size:18px;font-weight:bold;color:#fff;margin-bottom:10px;">Sua loja já está no ar! 🎉</div>
    <div style="font-size:13px;color:#aaa;line-height:1.7;">Olá! Cadastramos a <strong style="color:#fff;">${name}</strong> no Trindade Online durante nossa visita. Falta só um passo: criar sua senha de acesso pra você gerenciar seu perfil, fotos e avaliações.</div>
  </td></tr>
  <tr><td style="background:#C9951A;height:3px;"></td></tr>
  <tr><td style="background:#F5F5F5;padding:28px 24px;text-align:center;">
    <a href="${actionLink}" style="display:inline-block;background:#C9951A;color:#111;padding:14px 28px;border-radius:10px;font-size:14px;font-weight:bold;text-decoration:none;">Criar minha senha</a>
    <div style="font-size:11px;color:#999;margin-top:16px;">Depois de criar a senha, você já entra direto no seu painel.</div>
  </td></tr>
  <tr><td style="background:#111;padding:16px 20px;text-align:center;border-top:3px solid #C9951A;">
    <div style="font-size:12px;color:#C9951A;">trindadeonline.com.br</div>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

export async function POST(req: NextRequest) {
  try {
    const {
      name, email, phone, category_id, subcategory_ids, description,
      tags, address, external_link, external_link_label, photos,
    } = await req.json()

    if (!name?.trim() || !email?.trim() || !phone?.trim() || !category_id) {
      return NextResponse.json({ error: 'Preencha nome, email, whatsapp e categoria' }, { status: 400 })
    }

    // 1. Cria o login (sem senha ainda) e gera o link de criação de senha
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'invite',
      email: email.trim().toLowerCase(),
      options: {
        data: { name: name.trim(), user_type: 'company', phone: phone.trim() },
        redirectTo: `${SITE_URL}/redefinir-senha`,
      },
    })
    if (linkError || !linkData?.user) {
      return NextResponse.json({ error: linkError?.message || 'Não foi possível criar o login (email já cadastrado?)' }, { status: 400 })
    }
    const ownerId = linkData.user.id
    const actionLink = linkData.properties.action_link

    // 2. Cria a empresa já ativa (Ricardo já validou o negócio pessoalmente)
    const slug = slugify(name)
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({
        owner_id: ownerId,
        name: name.trim().toUpperCase(),
        slug,
        category_id,
        description: description?.trim() || null,
        tags: Array.isArray(tags) ? tags : [],
        address: address?.trim() || null,
        phone: phone.trim(),
        external_link: external_link?.trim() || null,
        external_link_label: external_link?.trim() ? (external_link_label?.trim() || null) : null,
        status: 'active',
        plan: 'free',
      })
      .select()
      .single()

    if (companyError || !company) {
      return NextResponse.json({ error: companyError?.message || 'Erro ao criar empresa' }, { status: 500 })
    }

    // 3. Subcategorias
    if (Array.isArray(subcategory_ids) && subcategory_ids.length > 0) {
      await supabase.from('company_subcategories').insert(
        subcategory_ids.map((sid: string, i: number) => ({ company_id: company.id, subcategory_id: sid, is_primary: i === 0 }))
      )
    }

    // 4. Fotos
    if (Array.isArray(photos) && photos.length > 0) {
      const urls = await Promise.all(photos.map((p: string, i: number) => uploadPhoto(company.id, i, p)))
      const rows = urls
        .map((url, i) => (url ? { company_id: company.id, url, order: i } : null))
        .filter(Boolean)
      if (rows.length > 0) await supabase.from('company_photos').insert(rows as any[])
    }

    // 5. Email com o link de criar senha
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Trindade Online <noreply@trindadeonline.com.br>',
        to: email.trim(),
        subject: 'Sua loja já está no ar no Trindade Online!',
        html: inviteEmailHtml(company.name, actionLink),
      }),
    })
    const emailOk = emailRes.ok
    if (emailOk) await supabase.from('email_logs').insert({ company_id: company.id, email_type: 'cadastro_rapido' })

    return NextResponse.json({ ok: true, company: { id: company.id, name: company.name, slug: company.slug }, email_sent: emailOk, action_link: actionLink })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
