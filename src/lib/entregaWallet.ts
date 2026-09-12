import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Aplica um pagamento confirmado (diária, crédito ou os dois juntos) na
// carteira de entrega da empresa. Idempotente do lado de quem chama (só
// chamar quando o `delivery_payments.status` ainda não era 'paid') — usado
// tanto pelo poll da tela (/api/entrega/checar-pagamento) quanto pelo
// webhook do Mercado Pago, que podem, em teoria, disparar quase juntos.
//
// Diária virou um contador de dias disponíveis (não mais "válido até tal
// data") — pedido do Ricardo, set/2026: dia sem nenhuma entrega avulsa não
// pode gastar a diária daquele dia. Comprar só soma no contador; quem
// desconta 1 é a confirmação da entrega (ver src/app/api/entrega/webhook —
// só na primeira entrega avulsa CONFIRMADA de cada dia), nunca a passagem
// do calendário. Isso já resolve sozinho o "reverte pro dia seguinte": um
// dia sem entrega simplesmente não mexe no contador.
export async function applyDeliveryWalletPayment(opts: {
  companyId: string
  kind: 'diaria' | 'credito' | 'combo'
  credits: number
  dias: number
  value: number
}) {
  const { companyId, kind, credits, dias, value } = opts

  const { data: wallet } = await supabase.from('company_delivery_wallet').select('credits, dias_diaria_disponiveis').eq('company_id', companyId).maybeSingle()

  const updates: Record<string, any> = { company_id: companyId, updated_at: new Date().toISOString() }

  if ((kind === 'diaria' || kind === 'combo') && dias > 0) {
    updates.dias_diaria_disponiveis = (wallet?.dias_diaria_disponiveis || 0) + dias
  }
  if ((kind === 'credito' || kind === 'combo') && credits > 0) {
    updates.credits = (wallet?.credits || 0) + credits
  }

  await supabase.from('company_delivery_wallet').upsert(updates, { onConflict: 'company_id' })

  if (kind === 'diaria' || kind === 'combo') {
    await supabase.from('delivery_credit_ledger').insert({ company_id: companyId, kind: 'diaria', amount: value, credits_delta: 0 })
  }
  if (kind === 'credito' || kind === 'combo') {
    await supabase.from('delivery_credit_ledger').insert({ company_id: companyId, kind: 'compra_credito', amount: kind === 'combo' ? 0 : value, credits_delta: credits })
  }
}
