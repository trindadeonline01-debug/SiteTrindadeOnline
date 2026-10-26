import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// `companies.pix_mp_enabled` é um flag denormalizado (mesmo padrão de
// `loja_digital_enabled`/`entrega_enabled`) pra o checkout público decidir
// "mostra Pix de verdade ou só o rótulo de sempre" com uma leitura só, sem
// precisar consultar `company_mp_accounts` (que não tem RLS nenhuma pro
// cliente) a cada carregamento de cardápio. Chamar depois de QUALQUER
// mudança em company_mp_accounts (conectar, desconectar, ligar/desligar o
// toggle) — nunca deixar os dois desincronizarem.
export async function syncPixMpEnabled(companyId: string) {
  const { data: conta } = await supabase.from('company_mp_accounts')
    .select('status, pix_automatico_enabled')
    .eq('company_id', companyId).maybeSingle()
  const enabled = !!conta && conta.status === 'connected' && conta.pix_automatico_enabled
  await supabase.from('companies').update({ pix_mp_enabled: enabled }).eq('id', companyId)
}
