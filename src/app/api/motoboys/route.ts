import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { sendMotoboyWhatsApp } from '@/lib/entregaDispatch'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function requireAdmin(accessToken: string | undefined): Promise<boolean> {
  if (!accessToken) return false
  const { data: userData } = await supabaseAuth.auth.getUser(accessToken)
  if (!userData?.user) return false
  const { data: profile } = await supabase.from('profiles').select('user_type').eq('id', userData.user.id).maybeSingle()
  return profile?.user_type === 'admin'
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : '55' + digits
}
function onlyDigits(v: string): string { return v.replace(/\D/g, '') }

// CNH (e os outros documentos do auto-cadastro) são sensíveis — ficam num
// bucket privado, nunca com URL pública.
async function uploadCnhPhoto(base64: string): Promise<{ path: string | null; error: string | null }> {
  const match = base64.match(/^data:(image\/\w+);base64,(.+)$/)
  if (!match) return { path: null, error: 'foto da CNH inválida' }
  const [, mime, raw] = match
  const ext = mime.split('/')[1] || 'jpg'
  const buf = Buffer.from(raw, 'base64')
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from('motoboy-docs').upload(path, buf, { contentType: mime })
  if (error) return { path: null, error: error.message }
  return { path, error: null }
}

async function signedUrl(path: string | null): Promise<string | null> {
  if (!path) return null
  const { data } = await supabase.storage.from('motoboy-docs').createSignedUrl(path, 3600)
  return data?.signedUrl || null
}

export async function GET(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!(await requireAdmin(accessToken))) return NextResponse.json({ error: 'acesso negado' }, { status: 403 })

  const { data, error } = await supabase.from('motoboys').select('*').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (data || []).map(m => m.id)
  const { data: terms } = ids.length
    ? await supabase.from('motoboy_terms_acceptance').select('*').in('motoboy_id', ids)
    : { data: [] as any[] }
  const termsByMotoboy = new Map((terms || []).map(t => [t.motoboy_id, t]))

  // Estatísticas por motoboy pro card de "aprovados" — mesmas contas do
  // painel dele, só que em lote pra todo mundo de uma vez.
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7)
  const { data: weekOrders } = ids.length
    ? await supabase.from('delivery_orders').select('motoboy_id, status').in('motoboy_id', ids).gte('created_at', weekStart.toISOString())
    : { data: [] as any[] }
  const entregasSemanaByMotoboy = new Map<string, number>()
  for (const o of weekOrders || []) {
    if (o.status === 'entregue') entregasSemanaByMotoboy.set(o.motoboy_id, (entregasSemanaByMotoboy.get(o.motoboy_id) || 0) + 1)
  }
  const { data: payouts } = ids.length
    ? await supabase.from('motoboy_payouts').select('motoboy_id, valor, status').in('motoboy_id', ids)
    : { data: [] as any[] }
  const aReceberByMotoboy = new Map<string, number>()
  const jaRecebidoByMotoboy = new Map<string, number>()
  for (const p of payouts || []) {
    if (p.status === 'pendente') aReceberByMotoboy.set(p.motoboy_id, (aReceberByMotoboy.get(p.motoboy_id) || 0) + Number(p.valor))
    if (p.status === 'pago') jaRecebidoByMotoboy.set(p.motoboy_id, (jaRecebidoByMotoboy.get(p.motoboy_id) || 0) + Number(p.valor))
  }

  const motoboys = await Promise.all((data || []).map(async m => {
    const term = termsByMotoboy.get(m.id)
    return {
      ...m,
      cnh_photo_url: await signedUrl(m.cnh_photo_path),
      moto_frente_photo_url: await signedUrl(m.moto_frente_photo_path),
      moto_tras_photo_url: await signedUrl(m.moto_tras_photo_path),
      documento_moto_photo_url: await signedUrl(m.documento_moto_photo_path),
      selfie_photo_url: await signedUrl(m.selfie_photo_path),
      terms: term ? { ...term, pdf_url: await signedUrl(term.pdf_path) } : null,
      entregas_semana: entregasSemanaByMotoboy.get(m.id) || 0,
      a_receber: aReceberByMotoboy.get(m.id) || 0,
      ja_recebido: jaRecebidoByMotoboy.get(m.id) || 0,
    }
  }))
  return NextResponse.json({ motoboys })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body

    if (action === 'create') {
      const { name, phone, address, cpf, cnh_photo_base64, pix_key, pix_key_type } = body
      if (!(await requireAdmin(body.access_token))) return NextResponse.json({ error: 'acesso negado' }, { status: 403 })
      if (!name?.trim() || !phone?.trim() || !address?.trim() || !cpf?.trim() || !cnh_photo_base64) {
        return NextResponse.json({ error: 'Nome, telefone, endereço, CPF e foto da CNH são obrigatórios.' }, { status: 400 })
      }
      const cpfDigits = onlyDigits(cpf)
      if (cpfDigits.length !== 11) return NextResponse.json({ error: 'CPF inválido — precisa ter 11 números.' }, { status: 400 })

      const { path: cnhPath, error: uploadError } = await uploadCnhPhoto(cnh_photo_base64)
      if (uploadError) return NextResponse.json({ error: uploadError }, { status: 500 })

      // Cadastrado direto pelo admin — já entra aprovado, sem passar pelo
      // fluxo de auto-cadastro/aprovação.
      const { error } = await supabase.from('motoboys').insert({
        name: name.trim(), phone: formatPhone(phone), address: address.trim(), cpf: cpfDigits, cnh_photo_path: cnhPath,
        pix_key: pix_key?.trim() || null, pix_key_type: pix_key_type || null, status: 'aprovado',
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'update') {
      const { id, name, phone, address, cpf, cnh_photo_base64, pix_key, pix_key_type, active } = body
      if (!(await requireAdmin(body.access_token))) return NextResponse.json({ error: 'acesso negado' }, { status: 403 })
      if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
      if (cpf && onlyDigits(cpf).length !== 11) return NextResponse.json({ error: 'CPF inválido — precisa ter 11 números.' }, { status: 400 })

      const update: Record<string, any> = {
        name: name?.trim(), phone: phone ? formatPhone(phone) : undefined,
        address: address?.trim(), cpf: cpf ? onlyDigits(cpf) : undefined,
        pix_key: pix_key?.trim() || null, pix_key_type: pix_key_type || null,
        active: typeof active === 'boolean' ? active : undefined,
      }
      if (cnh_photo_base64) {
        const { path: cnhPath, error: uploadError } = await uploadCnhPhoto(cnh_photo_base64)
        if (uploadError) return NextResponse.json({ error: uploadError }, { status: 500 })
        update.cnh_photo_path = cnhPath
      }

      const { error } = await supabase.from('motoboys').update(update).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'toggle') {
      const { id, active } = body
      if (!(await requireAdmin(body.access_token))) return NextResponse.json({ error: 'acesso negado' }, { status: 403 })
      if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
      const { error } = await supabase.from('motoboys').update({ active }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // ── aprovação do auto-cadastro ──────────────────────────────────────
    if (action === 'approve' || action === 'send_pendencias' || action === 'reject') {
      if (!(await requireAdmin(body.access_token))) return NextResponse.json({ error: 'acesso negado' }, { status: 403 })
      const { id, flagged } = body as { id: string; flagged?: { key: string; label: string; reason: string }[] }
      if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
      const { data: motoboy } = await supabase.from('motoboys').select('id, name, phone').eq('id', id).maybeSingle()
      if (!motoboy) return NextResponse.json({ error: 'motoboy não encontrado' }, { status: 404 })

      if (action === 'reject') {
        await supabase.from('motoboys').update({ status: 'recusado' }).eq('id', id)
        await sendMotoboyWhatsApp(motoboy.phone, `Oi, ${motoboy.name}! Depois de conferir seu cadastro na Trindade Online, não conseguimos aprovar dessa vez. Qualquer dúvida, chama a gente.`)
        return NextResponse.json({ ok: true })
      }

      const hasFlags = !!flagged?.length
      const adjustToken = crypto.randomBytes(16).toString('hex')
      const adjustLink = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.trindadeonline.com.br'}/motoboy/ajustar?token=${adjustToken}`
      const pendListText = (flagged || []).map(f => `• ${f.label} — ${f.reason}`).join('\n')

      if (action === 'approve') {
        if (hasFlags) {
          await supabase.from('motoboys').update({ status: 'pendencia', pending_flags: flagged, adjust_token: adjustToken }).eq('id', id)
          await sendMotoboyWhatsApp(motoboy.phone, `✅ Cadastro aprovado, ${motoboy.name}!\n\nSó falta ajustar antes de você começar a receber corridas:\n\n${pendListText}\n\nManda de novo por aqui → ${adjustLink}`)
        } else {
          await supabase.from('motoboys').update({ status: 'aprovado', pending_flags: null, adjust_token: null }).eq('id', id)
          await sendMotoboyWhatsApp(motoboy.phone, `✅ Cadastro aprovado, ${motoboy.name}!\n\nVocê já faz parte da equipe de entrega da Trindade Online. A partir de agora você recebe as corridas por aqui mesmo, no WhatsApp.\n\nResponde SIM quando quiser aceitar uma corrida, ou NÃO se não puder. Bem-vindo! 🏍️`)
        }
        return NextResponse.json({ ok: true })
      }

      // send_pendencias — recusa foto(s) sem aprovar o cadastro; fica em
      // espera até o motoboy reenviar (nem aprovado, nem recusado).
      if (!hasFlags) return NextResponse.json({ error: 'nenhuma pendência marcada' }, { status: 400 })
      await supabase.from('motoboys').update({ status: 'standby', pending_flags: flagged, adjust_token: adjustToken }).eq('id', id)
      await sendMotoboyWhatsApp(motoboy.phone, `📋 Oi, ${motoboy.name}! Pra finalizar seu cadastro na Trindade Online, precisamos que você ajuste:\n\n${pendListText}\n\nManda de novo por aqui → ${adjustLink}`)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'ação inválida' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha' }, { status: 500 })
  }
}
