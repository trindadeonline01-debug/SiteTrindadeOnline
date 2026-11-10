import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getMotoboyFromRequest } from '@/lib/motoboySession'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'

// Última posição do motoboy durante a corrida (nov/2026). O app manda aqui a
// cada ~10-15 s SÓ enquanto ele tem corrida em andamento; fica UMA linha por
// motoboy em motoboy_locations (upsert, nunca guarda trajeto — não repetir o
// travamento de banco de out/2026). Ao terminar a corrida o app manda
// { action: 'parar' } e a linha é apagada: fora da corrida ninguém vê onde o
// motoboy está (LGPD).
export async function POST(req: NextRequest) {
  const motoboy = await getMotoboyFromRequest(req)
  if (!motoboy) return NextResponse.json({ error: 'sessão inválida' }, { status: 401 })

  const body = await req.json().catch(() => ({}))

  if (body?.action === 'parar') {
    await supabase.from('motoboy_locations').delete().eq('motoboy_id', motoboy.id)
    return NextResponse.json({ ok: true })
  }

  const lat = Number(body?.lat)
  const lng = Number(body?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: 'posição inválida' }, { status: 400 })
  }
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

  // Só grava se o motoboy realmente tem corrida a caminho — evita que um app
  // com a tarefa de GPS atrasada deixe a posição guardada depois da entrega.
  const { count } = await supabase
    .from('delivery_orders').select('id', { count: 'exact', head: true })
    .eq('motoboy_id', motoboy.id).eq('status', 'a_caminho')
  if (!count) {
    await supabase.from('motoboy_locations').delete().eq('motoboy_id', motoboy.id)
    return NextResponse.json({ ok: true, ativo: false })
  }

  const agora = new Date().toISOString()
  const { error } = await supabase.from('motoboy_locations').upsert({
    motoboy_id: motoboy.id,
    lat, lng,
    accuracy: num(body?.accuracy), heading: num(body?.heading), speed: num(body?.speed),
    recorded_at: agora, updated_at: agora,
  }, { onConflict: 'motoboy_id' })
  if (error) return NextResponse.json({ error: 'falha ao salvar' }, { status: 500 })
  return NextResponse.json({ ok: true, ativo: true })
}
