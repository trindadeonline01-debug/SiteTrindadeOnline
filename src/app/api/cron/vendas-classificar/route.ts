import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { classificarEmpresaVendas } from '@/lib/crmVendasIA'

export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Radar de Clientes — piloto (companies.crm_vendas_pilot), mesmo padrão do
// /api/cron/atendimento-classificar. Roda 1x/dia via vercel.json (teto do
// plano Hobby).
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const validos = [process.env.CRON_SECRET, process.env.ATENDIMENTO_CRON_SECRET].filter(Boolean)
  if (!validos.some(s => auth === `Bearer ${s}`)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // NÃO obedece à chave geral ATENDIMENTO_IA_DESLIGADO (corrigido em 5/nov/2026): esta rotina só LÊ as
  // conversas e classifica (reclamação, venda, desistência) pra alimentar os painéis das empresas piloto,
  // nunca escreve pro cliente. Desligar junto com a IA de atendimento parou as métricas da Julia Eventos.

  const { data: empresas } = await supabase
    .from('companies')
    .select('id, name')
    .eq('crm_vendas_pilot', true)

  const resultados: Array<{ empresa: string; processados: number; semMudanca: number; restantes: number; erros: number }> = []
  for (const empresa of empresas || []) {
    const classificacao = await classificarEmpresaVendas(empresa.id)
    resultados.push({ empresa: empresa.name, ...classificacao })
  }

  return NextResponse.json({ ok: true, resultados })
}
