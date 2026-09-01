import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Achado numa auditoria de segurança (set/2026): várias rotas /api/admin/*
// não verificavam quem estava chamando — qualquer POST direto (sem passar
// pela UI) conseguia deletar usuário, resetar senha de qualquer um, virar
// admin editando o próprio user_type, etc. Esse helper centraliza a
// verificação real: confere o token de sessão (não um user_id solto no
// corpo da requisição, que é só um dado, não prova de identidade) e só
// libera se o dono desse token for admin de verdade.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function requireAdmin(req: NextRequest): Promise<{ userId: string } | NextResponse> {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: userData, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !userData?.user) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })

  const { data: profile } = await supabaseAdmin.from('profiles').select('user_type').eq('id', userData.user.id).single()
  if (profile?.user_type !== 'admin') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  return { userId: userData.user.id }
}
