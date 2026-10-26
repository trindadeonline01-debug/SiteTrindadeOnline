import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { signMpState } from '@/lib/mpOauthState'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.trindadeonline.com.br'

// Primeiro passo do Mercado Pago Connect (OAuth marketplace) — monta a URL
// de autorização e devolve pro painel redirecionar o navegador. O lojista
// sai do nosso site, loga na própria conta MP dele, autoriza, e volta pelo
// /api/painel/mp/callback.
export async function POST(req: NextRequest) {
  try {
    const { access_token, company_id } = await req.json()
    if (!access_token || !company_id) return NextResponse.json({ error: 'dados faltando' }, { status: 400 })

    const { data: userData, error: authError } = await supabaseAuth.auth.getUser(access_token)
    if (!userData?.user) return NextResponse.json({ error: `sessão inválida${authError ? ' — ' + authError.message : ''}` }, { status: 401 })

    const { data: company } = await supabase.from('companies').select('owner_id').eq('id', company_id).maybeSingle()
    if (!company || company.owner_id !== userData.user.id) {
      return NextResponse.json({ error: 'empresa não é sua' }, { status: 403 })
    }

    const clientId = process.env.MERCADO_PAGO_CLIENT_ID
    if (!clientId) return NextResponse.json({ error: 'Mercado Pago Connect não configurado (falta MERCADO_PAGO_CLIENT_ID)' }, { status: 500 })

    const state = signMpState(company_id)
    const redirectUri = `${SITE_URL}/api/painel/mp/callback`
    const url = `https://auth.mercadopago.com.br/authorization?client_id=${encodeURIComponent(clientId)}&response_type=code&platform_id=mp&state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}`

    return NextResponse.json({ url })
  } catch (err: any) {
    console.error('[painel/mp/connect]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
