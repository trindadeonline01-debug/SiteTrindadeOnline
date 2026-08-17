import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Cliente separado (chave anon) só pra validar o access_token de quem chamou
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const MAX_BYTES = 8 * 1024 * 1024

// Baixa uma foto de uma URL externa (ex: extraída de outro cardápio) e sobe
// pro nosso Storage — precisa rodar no servidor porque o navegador do
// lojista não consegue ler o conteúdo de uma imagem de outro domínio
// (CORS). Só o dono da empresa pode disparar isso pra sua própria empresa.
export async function POST(req: NextRequest) {
  try {
    const { access_token, company_id, image_url } = await req.json()
    if (!access_token || !company_id || !image_url) {
      return NextResponse.json({ error: 'dados faltando' }, { status: 400 })
    }

    const { data: userData } = await supabaseAuth.auth.getUser(access_token)
    if (!userData?.user) return NextResponse.json({ error: 'sessão inválida' }, { status: 401 })

    const { data: company } = await supabase.from('companies').select('owner_id').eq('id', company_id).maybeSingle()
    if (!company || company.owner_id !== userData.user.id) {
      return NextResponse.json({ error: 'empresa não é sua' }, { status: 403 })
    }

    let imgRes: Response
    try {
      imgRes = await fetch(image_url, { signal: AbortSignal.timeout(15000) })
    } catch {
      return NextResponse.json({ error: 'não deu pra acessar essa URL (fora do ar ou demorou demais)' }, { status: 400 })
    }
    if (!imgRes.ok) return NextResponse.json({ error: 'URL não respondeu (status ' + imgRes.status + ')' }, { status: 400 })

    const contentType = imgRes.headers.get('content-type') || ''
    if (!contentType.startsWith('image/')) return NextResponse.json({ error: 'a URL não é de uma imagem' }, { status: 400 })

    const buf = Buffer.from(await imgRes.arrayBuffer())
    if (buf.byteLength > MAX_BYTES) return NextResponse.json({ error: 'imagem grande demais' }, { status: 400 })

    const ext = (contentType.split('/')[1] || 'jpg').split(';')[0]
    const path = `${company_id}/importado/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('loja-produtos').upload(path, buf, { contentType, upsert: true })
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    const photo_url = supabase.storage.from('loja-produtos').getPublicUrl(path).data.publicUrl
    return NextResponse.json({ photo_url })
  } catch {
    return NextResponse.json({ error: 'falha ao importar a foto' }, { status: 500 })
  }
}
