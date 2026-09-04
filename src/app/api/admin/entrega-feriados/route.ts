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

export async function GET() {
  const { data } = await supabase.from('entrega_feriados').select('*').order('data')
  return NextResponse.json({ feriados: data || [] })
}

export async function POST(req: NextRequest) {
  try {
    const { access_token, data, nome } = await req.json()
    if (!(await requireAdmin(access_token))) return NextResponse.json({ error: 'acesso negado' }, { status: 403 })
    if (!data || !nome?.trim()) return NextResponse.json({ error: 'data e nome obrigatórios' }, { status: 400 })

    const { error } = await supabase.from('entrega_feriados').insert({ data, nome: nome.trim() })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha ao salvar' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { access_token, id } = await req.json()
    if (!(await requireAdmin(access_token))) return NextResponse.json({ error: 'acesso negado' }, { status: 403 })
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

    const { error } = await supabase.from('entrega_feriados').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha ao excluir' }, { status: 500 })
  }
}
