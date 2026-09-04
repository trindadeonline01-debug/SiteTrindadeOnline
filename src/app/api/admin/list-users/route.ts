import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/requireAdmin'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  try {
    const { data: profiles } = await supabase.from('profiles').select('*').order('created_at', {ascending: false}).limit(500)
    const { data: authData } = await supabase.auth.admin.listUsers()

    const merged = (profiles || []).map((p: any) => {
      const authUser = authData?.users.find((u: any) => u.id === p.id)
      return { ...p, email: authUser?.email || null }
    })

    return NextResponse.json({ users: merged })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
