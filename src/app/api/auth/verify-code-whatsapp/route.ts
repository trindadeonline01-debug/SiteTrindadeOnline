import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/phone'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { phone: rawPhone, code } = await req.json()
    if (!rawPhone || !code) return NextResponse.json({ error: 'WhatsApp e código obrigatórios' }, { status: 400 })
    const phone = normalizePhone(rawPhone)

    const { data: record } = await supabase
      .from('whatsapp_verifications')
      .select('*')
      .eq('phone', phone)
      .eq('code', code)
      .eq('used', false)
      .single()

    if (!record) return NextResponse.json({ error: 'Código inválido.' }, { status: 400 })
    if (new Date(record.expires_at) < new Date()) return NextResponse.json({ error: 'Código expirado. Solicite um novo.' }, { status: 400 })

    await supabase.from('whatsapp_verifications').update({ used: true }).eq('id', record.id)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
