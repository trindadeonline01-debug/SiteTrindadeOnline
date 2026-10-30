import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/lojaCheckout'

// Chave PÚBLICA do Mercado Pago da loja (feita pra ir pro navegador) — o
// formulário seguro de cartão precisa dela pra gerar o token do cartão na
// conta certa. Nunca devolve o access token.
export async function POST(req: NextRequest) {
  try {
    const { companyId } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'empresa obrigatória' }, { status: 400 })
    const { data } = await supabaseAdmin.from('company_mp_accounts')
      .select('mp_public_key').eq('company_id', companyId).eq('status', 'connected').maybeSingle()
    if (!data?.mp_public_key) return NextResponse.json({ error: 'Cartão indisponível nessa loja agora.' }, { status: 404 })
    return NextResponse.json({ publicKey: data.mp_public_key })
  } catch {
    return NextResponse.json({ error: 'Cartão indisponível nessa loja agora.' }, { status: 500 })
  }
}
