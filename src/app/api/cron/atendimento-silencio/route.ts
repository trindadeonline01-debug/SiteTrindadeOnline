import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { gerarFollowUpSilencio } from '@/lib/crmIA'
import { sendCustomerWhatsApp } from '@/lib/whatsapp'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Mesmo piloto hardcoded de src/lib/crmIA.ts — Julia Eventos já tem seu
// próprio follow-up (dias, via [AGENDAR_RETORNO:N], ver atendimento-followup)
// com um tom deliberadamente nada insistente ("não é vender, é escutar").
// Esse cron aqui é outra coisa — um lembrete rápido de minutos pra loja
// genérica — e fica de fora da conta dela pra não conflitar com esse tom.
const JULIA_EVENTOS_COMPANY_ID = '32ddce3a-ff9b-475b-9a3d-d829efcf8f24'

const PRIMEIRO_TOQUE_MIN = 5
const SEGUNDO_TOQUE_MIN = 15 // depois do primeiro toque, não depois da pergunta original

// Puxa de volta quem sumiu depois da IA responder (pedido do Ricardo,
// out/2026, caso real Mineroca: Ana Lúcia perguntou sobre a promoção
// Tropeiro, a IA respondeu com as opções e nunca mais teve resposta —
// hoje a conversa simplesmente morre aí). Até 2 toques, nunca mais que
// isso: ~5min de silêncio → 1º lembrete; mais ~15min sem resposta → 2º e
// último lembrete; cliente responde a qualquer momento, o fluxo normal
// assume e esse cron para de mexer naquele contato sozinho.
//
// Sem coluna nova: em vez de um contador, cada rodada conta quantas
// mensagens 'out' seguidas existem no fim da conversa (1 = resposta
// original, só a IA ainda não tentou nenhum lembrete; 2 = já mandou o
// 1º lembrete; 3+ = já mandou os 2, para por aqui).
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const validos = [process.env.CRON_SECRET, process.env.ATENDIMENTO_CRON_SECRET].filter(Boolean)
  if (!validos.some(s => auth === `Bearer ${s}`)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const cutoffPrimeiro = new Date(Date.now() - PRIMEIRO_TOQUE_MIN * 60 * 1000).toISOString()

  const { data: candidatos } = await supabase
    .from('crm_contacts')
    .select('id, phone, company_id, companies!inner(crm_ia_enabled)')
    .eq('atendimento_modo', 'ia')
    .eq('last_message_direction', 'out')
    .eq('companies.crm_ia_enabled', true)
    .neq('company_id', JULIA_EVENTOS_COMPANY_ID)
    .lte('last_message_at', cutoffPrimeiro)
    .limit(150)

  let enviados = 0, erros = 0
  for (const contato of candidatos || []) {
    try {
      const { data: ultimas } = await supabase
        .from('crm_messages').select('direction, sent_at')
        .eq('contact_id', contato.id)
        .order('sent_at', { ascending: false }).limit(5)

      let streak = 0
      for (const m of ultimas || []) {
        if (m.direction !== 'out') break
        streak++
      }
      if (streak < 1 || streak > 2) continue // 0 = inconsistente, 3+ = já tentou os 2 toques

      const tentativa: 1 | 2 = streak === 1 ? 1 : 2
      if (tentativa === 2) {
        const ultimoToqueEm = ultimas![0].sent_at as string
        const cutoffSegundo = Date.now() - SEGUNDO_TOQUE_MIN * 60 * 1000
        if (new Date(ultimoToqueEm).getTime() > cutoffSegundo) continue // ainda não passou o 2º prazo
      }

      const { data: historico } = await supabase
        .from('crm_messages').select('direction, body')
        .eq('contact_id', contato.id).not('body', 'is', null)
        .order('sent_at', { ascending: false }).limit(20)
      const mensagem = await gerarFollowUpSilencio(contato.company_id, ((historico || []) as any[]).reverse(), contato.phone, tentativa)
      if (mensagem) {
        await sendCustomerWhatsApp(contato.company_id, contato.phone, mensagem)
        enviados++
      }
    } catch (err) {
      console.error('[atendimento-silencio] falhou', contato.id, err)
      erros++
    }
  }

  return NextResponse.json({ ok: true, enviados, erros, total: (candidatos || []).length })
}
