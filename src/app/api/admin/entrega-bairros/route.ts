import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function requireAdmin(accessToken: string | undefined) {
  if (!accessToken) return false
  const { data: userData } = await supabaseAuth.auth.getUser(accessToken)
  if (!userData?.user) return false
  const { data: profile } = await supabase.from('profiles').select('user_type').eq('id', userData.user.id).maybeSingle()
  return profile?.user_type === 'admin'
}

// Preço da entrega da PLATAFORMA por bairro — global (não é por loja).
// Salva sempre substituindo a lista inteira, igual ao editor de bairro que
// cada loja já usa pro próprio frete (mesma UX, tabela global em vez de
// por company_id).
export async function GET() {
  const { data } = await supabase.from('entrega_bairros').select('bairro, price, disabled')
  return NextResponse.json({ bairros: data || [] })
}

export async function POST(req: NextRequest) {
  try {
    const { access_token, bairros } = await req.json()
    if (!(await requireAdmin(access_token))) return NextResponse.json({ error: 'acesso negado' }, { status: 403 })
    if (!Array.isArray(bairros)) return NextResponse.json({ error: 'lista inválida' }, { status: 400 })

    await supabase.from('entrega_bairros').delete().not('id', 'is', null)
    const rows = bairros
      .filter((b: any) => b?.bairro && (b.price != null || b.disabled))
      .map((b: any) => ({ bairro: String(b.bairro), price: b.disabled ? 0 : Number(b.price) || 0, disabled: !!b.disabled }))
    if (rows.length) {
      const { error } = await supabase.from('entrega_bairros').insert(rows)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha ao salvar' }, { status: 500 })
  }
}
