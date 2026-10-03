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

    const numericFields = ['diaria', 'entrega_taxa_padrao']
    const update: Record<string, number | string> = {}
    for (const key of numericFields) {
      if (fields[key] != null) update[key] = Number(fields[key])
    }
    if (fields.entrega_taxa_metodo === 'bairro' || fields.entrega_taxa_metodo === 'distancia') {
      update.entrega_taxa_metodo = fields.entrega_taxa_metodo
    }

    const { error } = await supabase.from('entrega_pricing').update({ ...update, updated_at: new Date().toISOString() }).eq('id', true)
    if (error) {
      console.error('[admin/entrega-pricing]', error)
      return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[admin/entrega-pricing]', err)
    return NextResponse.json({ error: 'falha ao salvar' }, { status: 500 })
  }
}
