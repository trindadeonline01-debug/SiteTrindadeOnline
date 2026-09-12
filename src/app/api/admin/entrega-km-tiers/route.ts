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

// Preço da entrega da PLATAFORMA por faixa de km — global. Salva sempre
// substituindo a lista inteira, igual ao editor de km que cada loja já usa
// pro próprio frete.
export async function GET() {
  const { data } = await supabase.from('entrega_km_tiers').select('km_until, price, blocked, position').order('position')
  return NextResponse.json({ tiers: data || [] })
}

export async function POST(req: NextRequest) {
  try {
    const { access_token, tiers } = await req.json()
    if (!(await requireAdmin(access_token))) return NextResponse.json({ error: 'acesso negado' }, { status: 403 })
    if (!Array.isArray(tiers)) return NextResponse.json({ error: 'lista inválida' }, { status: 400 })

    await supabase.from('entrega_km_tiers').delete().not('id', 'is', null)
    const rows = tiers.map((t: any, i: number) => ({
      position: i, km_until: t.km_until != null ? Number(t.km_until) : null,
      price: t.price != null ? Number(t.price) : null, blocked: !!t.blocked,
    }))
    if (rows.length) {
      const { error } = await supabase.from('entrega_km_tiers').insert(rows)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha ao salvar' }, { status: 500 })
  }
}
