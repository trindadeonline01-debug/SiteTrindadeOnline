import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { type } = await req.json()
    const { id } = params

    if (!id || !type) return NextResponse.json({ error: 'id e type obrigatorios' }, { status: 400 })

    const columnMap: Record<string, string> = {
      whatsapp_click: 'whatsapp_clicks',
      link_click: 'link_clicks',
      address_click: 'address_clicks',
      view: 'views_count'
    }

    const column = columnMap[type]
    if (!column) return NextResponse.json({ error: 'tipo invalido' }, { status: 400 })

    await supabase.rpc('increment_company_stat', { company_id: id, stat_name: column })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}