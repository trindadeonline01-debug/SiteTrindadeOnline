import type { SupabaseClient } from '@supabase/supabase-js'

// Trava anti-loop do atendente de IA (14/nov/2026). Caso real: uma central automática (mensagens de operadora)
// escrevia sem parar para uma loja e a IA respondia cada uma — 138 respostas em um dia numa só conversa, gasto de
// crédito da API e risco para o número da loja. Se a IA já mandou LIMITE respostas a este contato na última janela,
// ela fica quieta; a conversa segue aparecendo no painel para a loja decidir.
export const IA_LOOP_LIMITE = 8
export const IA_LOOP_JANELA_MIN = 15

export async function iaEmLoop(sb: SupabaseClient, contactId: string): Promise<boolean> {
  try {
    const { count } = await sb.from('crm_messages').select('id', { count: 'exact', head: true })
      .eq('contact_id', contactId).eq('origem', 'ia')
      .gte('sent_at', new Date(Date.now() - IA_LOOP_JANELA_MIN * 60_000).toISOString())
    return (count || 0) >= IA_LOOP_LIMITE
  } catch { return false }
}
