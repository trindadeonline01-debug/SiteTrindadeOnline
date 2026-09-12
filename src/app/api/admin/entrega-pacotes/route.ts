import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function requireAdmin(accessToken: string | undefined) {
  if (!accessToken) return false
  const { data: userData } = await supabaseAuth.auth.getUser(accessToken)
  if (!userData?.user) return false
  const { data: profile } = await supabase.from('profiles').select('user_type').eq('id', userData.user.id).maybeSingle()
  return profile?.user_type === 'admin'
}

// CRUD de pacotes (ofertas com desconto) de diária e crédito — pode ter
// quantos quiser de cada categoria, editar e ativar/desativar (Ricardo,
// set/2026). `quantidade` é dias de diária pra categoria 'diaria', ou valor
// em R$ de crédito concedido pra categoria 'entrega'.
export async function GET() {
  const { data } = await supabase.from('entrega_pacotes').select('*').order('categoria').order('quantidade')
  return NextResponse.json({ pacotes: data || [] })
}

export async function POST(req: NextRequest) {
  try {
    const { access_token, id, categoria, nome, quantidade, preco, ativo } = await req.json()
    if (!(await requireAdmin(access_token))) return NextResponse.json({ error: 'acesso negado' }, { status: 403 })

    if (id) {
      const update: Record<string, any> = { updated_at: new Date().toISOString() }
      if (categoria === 'diaria' || categoria === 'entrega') update.categoria = categoria
      if (nome != null) update.nome = String(nome).trim()
      if (quantidade != null) update.quantidade = Number(quantidade)
      if (preco != null) update.preco = Number(preco)
      if (ativo != null) update.ativo = Boolean(ativo)
      const { error } = await supabase.from('entrega_pacotes').update(update).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (categoria !== 'diaria' && categoria !== 'entrega') return NextResponse.json({ error: 'categoria inválida' }, { status: 400 })
    if (!nome?.trim() || !(Number(quantidade) > 0) || !(Number(preco) > 0)) return NextResponse.json({ error: 'dados inválidos' }, { status: 400 })

    const { error } = await supabase.from('entrega_pacotes').insert({
      categoria, nome: nome.trim(), quantidade: Number(quantidade), preco: Number(preco), ativo: ativo !== false,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha ao salvar' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { access_token, id } = await req.json()
    if (!(await requireAdmin(access_token))) return NextResponse.json({ error: 'acesso negado' }, { status: 403 })
    if (!id) return NextResponse.json({ error: 'id faltando' }, { status: 400 })
    await supabase.from('entrega_pacotes').delete().eq('id', id)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha ao excluir' }, { status: 500 })
  }
}
