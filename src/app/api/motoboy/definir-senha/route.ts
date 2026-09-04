import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { getMotoboyFromRequest } from '@/lib/motoboySession'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

// Criar/trocar a senha de acesso do painel — precisa já estar logado
// (por código de WhatsApp) pra poder definir uma. Sem isso alguém que
// soubesse só o telefone do motoboy poderia criar uma senha nova pra ele.
export async function POST(req: NextRequest) {
  try {
    const motoboy = await getMotoboyFromRequest(req)
    if (!motoboy) return NextResponse.json({ error: 'sessão inválida' }, { status: 401 })
    const { senha } = await req.json()
    if (!senha || senha.length < 6) return NextResponse.json({ error: 'Senha precisa ter pelo menos 6 caracteres.' }, { status: 400 })

    await supabase.from('motoboys').update({ password_hash: hashPassword(senha) }).eq('id', motoboy.id)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha ao salvar senha' }, { status: 500 })
  }
}
