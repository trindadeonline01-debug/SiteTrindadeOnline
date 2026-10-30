import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Mesmo princípio do requireAdmin: identidade vem do token de sessão no
// header Authorization (mandado pelo adminFetch), nunca de um user_id no corpo.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function requireUser(req: NextRequest): Promise<{ userId: string; isAdmin: boolean } | NextResponse> {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: userData, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !userData?.user) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })

  const { data: profile } = await supabaseAdmin.from('profiles').select('user_type').eq('id', userData.user.id).maybeSingle()
  return { userId: userData.user.id, isAdmin: profile?.user_type === 'admin' }
}

// Dono da empresa ou admin (modo admin do painel, ?empresa=).
export async function requireCompanyAccess(req: NextRequest, companyId: string): Promise<{ userId: string } | NextResponse> {
  const auth = await requireUser(req)
  if (auth instanceof NextResponse) return auth
  if (auth.isAdmin) return { userId: auth.userId }

  const { data: company } = await supabaseAdmin.from('companies').select('owner_id').eq('id', companyId).maybeSingle()
  if (!company) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 })
  if (company.owner_id !== auth.userId) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  return { userId: auth.userId }
}
