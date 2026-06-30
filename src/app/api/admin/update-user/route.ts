import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { user_id, updates, new_email } = await req.json()
    if (!user_id) return NextResponse.json({ error: 'user_id obrigatório' }, { status: 400 })

    const { error } = await supabase.from('profiles').update(updates).eq('id', user_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (new_email) {
      const { error: emailErr } = await supabase.auth.admin.updateUserById(user_id, { email: new_email })
      if (emailErr) return NextResponse.json({ error: emailErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
