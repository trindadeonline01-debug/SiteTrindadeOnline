import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { confirmarCashbackPendente } from '@/lib/cashbackMesa'

// Cliente confirma pelo link do WhatsApp que a conta foi dele — só então o cashback
// de mesa entra no saldo. POST (botão), nunca GET, pra pré-visualização de link não confirmar sozinha.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST(req: NextRequest) {
  let token = ''
  try { token = String((await req.json()).token || '') } catch { /* corpo inválido */ }
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) return NextResponse.json({ error: 'Link inválido.' }, { status: 400 })
  const r = await confirmarCashbackPendente(sb, token)
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 409 })
  return NextResponse.json(r)
}
