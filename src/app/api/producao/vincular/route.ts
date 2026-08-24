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

// Chamado logo depois do login/cadastro em /producao. Resolve, nessa ordem:
// 1) já tem linha vinculada a esse user_id -> devolve ela
// 2) tem convite pendente (mesmo email, user_id ainda null) -> vincula
// 3) senão, é pedido de acesso espontâneo -> cria linha nova como 'convidado'
export async function POST(req: NextRequest) {
  try {
    const { access_token, name } = await req.json()
    const { data: userData, error: authError } = await supabaseAuth.auth.getUser(access_token)
    if (!userData?.user) return NextResponse.json({ error: `Não autenticado${authError ? ' — ' + authError.message : ''}` }, { status: 401 })

    const user = userData.user
    const email = (user.email || '').toLowerCase()

    const { data: byUser } = await supabase.from('production_team').select('*').eq('user_id', user.id).maybeSingle()
    if (byUser) return NextResponse.json({ ok: true, member: byUser })

    const { data: pending } = await supabase.from('production_team').select('*').ilike('email', email).is('user_id', null).maybeSingle()
    if (pending) {
      const { data: linked, error } = await supabase.from('production_team').update({ user_id: user.id }).eq('id', pending.id).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, member: linked })
    }

    const { data: created, error: insertError } = await supabase.from('production_team').insert({
      user_id: user.id, email, name: name?.trim() || email.split('@')[0],
    }).select().single()
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
    return NextResponse.json({ ok: true, member: created })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
