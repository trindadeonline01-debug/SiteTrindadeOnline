import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/requireAdmin'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  try {
    const { user_id, new_password, send_reset_link, email } = await req.json()

    if (send_reset_link && email) {
      // www. — mesmo domínio usado em todo o resto do site (sem www aqui
      // funcionava só porque a Vercel redireciona o domínio nu pro www,
      // mas evita depender desse redirect extra no meio do link de senha).
      const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.trindadeonline.com.br'
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${site}/redefinir-senha`
      })
      if (error) {
        console.error('[admin/reset-password]', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
      }
      return NextResponse.json({ ok: true, method: 'link' })
    }

    if (new_password && user_id) {
      const { error } = await supabase.auth.admin.updateUserById(user_id, { password: new_password })
      if (error) {
        console.error('[admin/reset-password]', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
      }
      return NextResponse.json({ ok: true, method: 'direct' })
    }

    return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
  } catch (err: any) {
    console.error('[admin/reset-password]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
