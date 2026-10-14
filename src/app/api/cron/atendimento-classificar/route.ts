import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { classificarEmpresa } from '@/lib/crmAtendimentoIA'

export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Painel de Atendimento — piloto (companies.crm_atendimento_pilot). Roda
// 1x/dia por enquanto (teto do cron nativo da Vercel no plano Hobby); pra
// chegar nas 5x/dia combinadas com o Ricardo precisa de pg_cron no Supabase
// chamando essa mesma rota, como já é o caso pendente de /api/cron/entrega-expirar.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: empresas } = await supabase
    .from('companies')
    .select('id, name')
    .eq('crm_atendimento_pilot', true)

  const resultados: any[] = []
  for (const empresa of empresas || []) {
    const classificacao = await classificarEmpresa(empresa.id)
    await supabase.rpc('recompute_crm_atendimento_agora', { p_company_id: empresa.id })

    // Recalcula hoje + os 2 dias anteriores — cobre o caso de uma venda ou
    // uma evasão (threshold de 48h) só ficar comprovada depois do dia em que
    // o primeiro contato aconteceu.
    const hoje = new Date()
    for (let i = 0; i < 3; i++) {
      const d = new Date(hoje)
      d.setUTCDate(d.getUTCDate() - i)
      const dataStr = d.toISOString().slice(0, 10)
      await supabase.rpc('recompute_crm_atendimento_diario', { p_company_id: empresa.id, p_date: dataStr })
    }

    resultados.push({ empresa: empresa.name, ...classificacao })
  }

  return NextResponse.json({ ok: true, resultados })
}
