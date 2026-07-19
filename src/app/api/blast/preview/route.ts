import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('55')) return digits
  return '55' + digits
}

export async function POST(req: NextRequest) {
  try {
    const { filter } = await req.json()

    let contacts: string[] = []

    if (filter === 'all' || filter === 'paid' || filter === 'unpaid') {
      let query = supabase.from('companies').select('phone, plan').not('phone', 'is', null).neq('phone', '')
      if (filter === 'paid') query = query.eq('plan', 'paid')
      if (filter === 'unpaid') query = query.neq('plan', 'paid')
      const { data } = await query
      contacts = [...contacts, ...(data || []).map((c: any) => c.phone)]
    }

    if (filter === 'all' || filter === 'residents') {
      const { data } = await supabase.from('profiles').select('phone').eq('user_type', 'user').not('phone', 'is', null).neq('phone', '')
      contacts = [...contacts, ...(data || []).map((r: any) => r.phone)]
    }

    const { data: blacklist } = await supabase.from('blast_blacklist').select('phone')
    const blacklisted = new Set((blacklist || []).map((b: any) => formatPhone(b.phone)))

    const seen = new Set<string>()
    const unique = contacts.filter(p => {
      const f = formatPhone(p)
      if (seen.has(f) || blacklisted.has(f)) return false
      seen.add(f)
      return true
    })

    return NextResponse.json({ count: unique.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}