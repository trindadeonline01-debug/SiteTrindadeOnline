import { createClient } from '@supabase/supabase-js'
import { todaySaoPaulo } from '@/lib/entregaPricing'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Aplica um pagamento confirmado (diária, crédito ou os dois juntos) na
// carteira de entrega da empresa. Idempotente do lado de quem chama (só
// chamar quando o `delivery_payments.status` ainda não era 'paid') — usado
// tanto pelo poll da tela (/api/entrega/checar-pagamento) quanto pelo
// webhook do Mercado Pago, que podem, em teoria, disparar quase juntos.
export async function applyDeliveryWalletPayment(opts: {
  companyId: string
  kind: 'diaria' | 'credito' | 'combo'
  credits: number
  dias: number
  value: number
}) {
  const { companyId, kind, credits, dias, value } = opts
  const today = todaySaoPaulo()

  const { data: wallet } = await supabase.from('company_delivery_wallet').select('credits, daily_paid_until').eq('company_id', companyId).maybeSingle()

  const updates: Record<string, any> = { company_id: companyId, updated_at: new Date().toISOString() }

  if ((kind === 'diaria' || kind === 'combo') && dias > 0) {
    // Empilha em cima do que ainda resta pago, em vez de desperdiçar dias
    // que a empresa já tinha comprado — renovar antes de vencer não perde nada.
    const base = wallet?.daily_paid_until && wallet.daily_paid_until >= today ? addDaysToDateStr(wallet.daily_paid_until, 1) : today
    updates.daily_paid_until = addDaysToDateStr(base, dias - 1)
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
