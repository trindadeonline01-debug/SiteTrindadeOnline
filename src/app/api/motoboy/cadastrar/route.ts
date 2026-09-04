import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateTermsPdf } from '@/lib/motoboyTermsPdf'
import { MOTOBOY_TERMS_VERSION } from '@/lib/motoboyTerms'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : '55' + digits
}
function onlyDigits(v: string): string { return v.replace(/\D/g, '') }

async function uploadPhoto(base64: string, prefix: string): Promise<{ path: string | null; error: string | null }> {
  const match = base64.match(/^data:(image\/\w+);base64,(.+)$/)
  if (!match) return { path: null, error: `foto inválida (${prefix})` }
  const [, mime, raw] = match
  const ext = mime.split('/')[1] || 'jpg'
  const buf = Buffer.from(raw, 'base64')
  const path = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from('motoboy-docs').upload(path, buf, { contentType: mime })
  if (error) return { path: null, error: error.message }
  return { path, error: null }
}

// Envio final do auto-cadastro do motoboy — cria o registro com status
// "aguardando_aprovacao" (não recebe corrida nenhuma até o admin aprovar,
// ver pickNextMotoboy em entregaDispatch.ts) e gera o PDF do termo assinado.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      nome, cpf, endereco, email, phone: rawPhone,
      cnh_base64, moto_frente_base64, moto_tras_base64, documento_moto_base64, selfie_base64,
      pix_key, pix_key_type, nome_digitado,
    } = body

    if (!nome?.trim() || !cpf?.trim() || !endereco?.trim() || !rawPhone?.trim() || !nome_digitado?.trim()) {
      return NextResponse.json({ error: 'dados obrigatórios faltando' }, { status: 400 })
    }
    if (!cnh_base64 || !moto_frente_base64 || !moto_tras_base64 || !documento_moto_base64 || !selfie_base64) {
      return NextResponse.json({ error: 'as 5 fotos são obrigatórias' }, { status: 400 })
    }
    const cpfDigits = onlyDigits(cpf)
    if (cpfDigits.length !== 11) return NextResponse.json({ error: 'CPF inválido' }, { status: 400 })
    const phone = formatPhone(rawPhone)

    // Confirma que esse WhatsApp passou pela verificação por código há
    // pouco — sem isso, qualquer um poderia se cadastrar em nome de outro
    // número só preenchendo o formulário.
    const { data: otp } = await supabase
      .from('motoboy_otp_codes').select('verified_at')
      .eq('phone', phone).eq('purpose', 'cadastro').not('verified_at', 'is', null)
      .order('verified_at', { ascending: false }).limit(1).maybeSingle()
    if (!otp || new Date(otp.verified_at).getTime() < Date.now() - 30 * 60 * 1000) {
      return NextResponse.json({ error: 'Verifica seu WhatsApp de novo antes de enviar o cadastro.' }, { status: 400 })
    }

    const { data: existing } = await supabase.from('motoboys').select('id').eq('phone', phone).maybeSingle()
    if (existing) return NextResponse.json({ error: 'Já existe um cadastro com esse WhatsApp.' }, { status: 400 })

    const uploads = await Promise.all([
      uploadPhoto(cnh_base64, 'cnh'),
      uploadPhoto(moto_frente_base64, 'moto-frente'),
      uploadPhoto(moto_tras_base64, 'moto-tras'),
      uploadPhoto(documento_moto_base64, 'documento-moto'),
      uploadPhoto(selfie_base64, 'selfie'),
    ])
    const failed = uploads.find(u => u.error)
    if (failed) return NextResponse.json({ error: failed.error }, { status: 500 })
    const [cnhPath, motoFrentePath, motoTrasPath, documentoMotoPath, selfiePath] = uploads.map(u => u.path)

    const { data: motoboy, error: insertErr } = await supabase.from('motoboys').insert({
      name: nome.trim(), phone, address: endereco.trim(), cpf: cpfDigits, email: email?.trim() || null,
      cnh_photo_path: cnhPath, moto_frente_photo_path: motoFrentePath, moto_tras_photo_path: motoTrasPath,
      documento_moto_photo_path: documentoMotoPath, selfie_photo_path: selfiePath,
      pix_key: pix_key?.trim() || null, pix_key_type: pix_key_type || null,
      status: 'aguardando_aprovacao', active: true, available: true,
    }).select('id').single()
    if (insertErr || !motoboy) return NextResponse.json({ error: insertErr?.message || 'falha ao cadastrar' }, { status: 500 })

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'desconhecido'
    const userAgent = req.headers.get('user-agent') || 'desconhecido'
    const acceptedAt = new Date()

    const pdfBytes = await generateTermsPdf({ nomeDigitado: nome_digitado.trim(), cpf: cpfDigits, phone, ipAddress: ip, userAgent, acceptedAt })
    const pdfPath = `termo-${motoboy.id}.pdf`
    await supabase.storage.from('motoboy-docs').upload(pdfPath, Buffer.from(pdfBytes), { contentType: 'application/pdf', upsert: true })

    await supabase.from('motoboy_terms_acceptance').insert({
      motoboy_id: motoboy.id, nome_digitado: nome_digitado.trim(), terms_version: MOTOBOY_TERMS_VERSION,
      ip_address: ip, user_agent: userAgent, pdf_path: pdfPath, accepted_at: acceptedAt.toISOString(),
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha ao cadastrar' }, { status: 500 })
  }
}
