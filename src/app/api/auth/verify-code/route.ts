import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { email, code } = await req.json()
    if (!email || !code) return NextResponse.json({ error: 'Email e código obrigatórios' }, { status: 400 })

    const { data: record } = await supabase
      .from('email_verifications')
      .select('*')
      .eq('email', email)
      .eq('code', code)
      .eq('used', false)
      .single()

    if (!record) return NextResponse.json({ error: 'Código inválido.' }, { status: 400 })
    if (new Date(record.expires_at) < new Date()) return NextResponse.json({ error: 'Código expirado. Solicite um novo.' }, { status: 400 })

    // Marca como usado
    await supabase.from('email_verifications').update({ used: true }).eq('id', record.id)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
