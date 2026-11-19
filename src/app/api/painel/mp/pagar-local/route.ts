import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/requireUser'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Painel → Pagamentos (loja com Mercado Pago conectado): além de pagar pelo
// site, deixa o cliente escolher pagar no local (na entrega ou retirada).
// Pix aqui é o Pix direto pra loja, combinado na hora — não passa pelo MP.
const METODOS_LOCAL = ['dinheiro', 'pix', 'cartao_credito', 'cartao_debito'] as const

export async function POST(req: NextRequest) {
  try {
    const { company_id, enabled, metodos } = await req.json()
    if (!company_id) return NextResponse.json({ error: 'dados faltando' }, { status: 400 })
    const access = await requireCompanyAccess(req, company_id)
    if (access instanceof NextResponse) return access

    const upd: Record<string, unknown> = {}
    if (typeof enabled === 'boolean') upd.pagar_local_enabled = enabled
    if (Array.isArray(metodos)) {
      const lista = METODOS_LOCAL.filter(m => metodos.includes(m))
      if (lista.length === 0) return NextResponse.json({ error: 'Escolha pelo menos uma forma de pagamento no local.' }, { status: 400 })
      upd.pagar_local_metodos = lista
    }
    if (!Object.keys(upd).length) return NextResponse.json({ error: 'nada pra salvar' }, { status: 400 })
    const { error } = await supabase.from('companies').update(upd).eq('id', company_id)
    if (error) return NextResponse.json({ error: 'Falhou ao salvar' }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[painel/mp/pagar-local]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
