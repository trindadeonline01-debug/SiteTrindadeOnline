import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/requireAdmin'
import { gerarRespostaIA, type HistoricoMsg } from '@/lib/crmIA'

// Simulador do atendente de IA (só admin): digita como se fosse o cliente e vê a resposta que a IA daria,
// com o cardápio/horário/regras reais da loja escolhida. NÃO envia nada por WhatsApp e NÃO grava conversa.
// Cada resposta chama a API da Anthropic (custo pequeno), então fica atrás de login de admin.

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  const body = await req.json().catch(() => ({}))

  if (body?.acao === 'lojas') {
    const { data } = await supabase.from('companies').select('id, name').eq('loja_digital_enabled', true).order('name')
    return NextResponse.json({ lojas: data || [] })
  }

  const companyId: string = String(body?.companyId || '')
  const historicoBruto: unknown = body?.historico
  if (!companyId || !Array.isArray(historicoBruto)) return NextResponse.json({ error: 'companyId e historico são obrigatórios' }, { status: 400 })

  const historico: HistoricoMsg[] = historicoBruto
    .slice(-30)
    .map((m: any) => ({ direction: m?.direction === 'out' ? 'out' : 'in', body: String(m?.body ?? '').slice(0, 2000) }) as HistoricoMsg)
    .filter(m => m.body?.trim())
  if (historico.length === 0 || historico[historico.length - 1].direction !== 'in') {
    return NextResponse.json({ error: 'A última mensagem precisa ser do cliente' }, { status: 400 })
  }

  try {
    // Sem telefone: a IA não procura pedido/cashback de ninguém, responde só com os dados da loja.
    const resposta = await gerarRespostaIA(companyId, historico, null, null)
    if (!resposta) return NextResponse.json({ texto: null, aviso: 'A IA não devolveu resposta (veja crm_webhook_debug: ia_sem_resposta / ia_erro).' })
    return NextResponse.json({ texto: resposta.texto, followUpDias: resposta.followUpDias ?? null })
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err).slice(0, 300) }, { status: 500 })
  }
}
