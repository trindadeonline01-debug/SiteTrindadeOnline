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
  const { data } = await supabase.from('entrega_pricing').select('*').eq('id', true).maybeSingle()
  return NextResponse.json({ pricing: data })
}

export async function POST(req: NextRequest) {
  try {
    const { access_token, ...fields } = await req.json()
    if (!(await requireAdmin(access_token))) return NextResponse.json({ error: 'acesso negado' }, { status: 403 })

    const allowed = ['diaria_util', 'diaria_fds', 'diaria_feriado', 'entrega_util', 'entrega_fds', 'entrega_feriado', 'pacote_dias', 'pacote_desconto']
    const update: Record<string, number> = {}
    for (const key of allowed) {
      if (fields[key] != null) update[key] = Number(fields[key])
    }

    const { error } = await supabase.from('entrega_pricing').update({ ...update, updated_at: new Date().toISOString() }).eq('id', true)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha ao salvar' }, { status: 500 })
  }
}
