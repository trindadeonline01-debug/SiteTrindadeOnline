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

// company_mp_accounts não tem nenhuma policy de RLS de propósito (token de
// cobrança não pode ser lido pelo navegador) — essa rota devolve só o que o
// painel precisa mostrar, nunca o token em si.
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

    const { data: conta } = await supabase.from('company_mp_accounts')
      .select('mp_email, application_fee_pct, pix_automatico_enabled, connected_at, status')
      .eq('company_id', company_id).eq('status', 'connected').maybeSingle()

    return NextResponse.json({ connected: !!conta, conta: conta || null })
  } catch (err: any) {
    console.error('[painel/mp/status]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
