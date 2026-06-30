import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { user_id, new_password, send_reset_link, email } = await req.json()

    if (send_reset_link && email) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://trindadeonline.com.br/redefinir-senha'
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, method: 'link' })
    }

    if (new_password && user_id) {
      const { error } = await supabase.auth.admin.updateUserById(user_id, { password: new_password })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, method: 'direct' })
    }

    return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
