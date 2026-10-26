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

export async function POST(req: NextRequest) {
  try {
    const { access_token, company_id, enabled } = await req.json()
    if (!access_token || !company_id || typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'dados faltando' }, { status: 400 })
    }

    const { data: userData, error: authError } = await supabaseAuth.auth.getUser(access_token)
    if (!userData?.user) return NextResponse.json({ error: `sessão inválida${authError ? ' — ' + authError.message : ''}` }, { status: 401 })

    const { data: company } = await supabase.from('companies').select('owner_id').eq('id', company_id).maybeSingle()
    if (!company || company.owner_id !== userData.user.id) {
      return NextResponse.json({ error: 'empresa não é sua' }, { status: 403 })
    }

    const { error } = await supabase.from('company_mp_accounts')
      .update({ pix_automatico_enabled: enabled, updated_at: new Date().toISOString() })
      .eq('company_id', company_id)
    if (error) return NextResponse.json({ error: 'Falhou ao salvar' }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[painel/mp/toggle-pix]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
