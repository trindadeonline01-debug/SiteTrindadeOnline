import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { gerarRespostaIA } from '@/lib/crmIA'
import { sendCustomerWhatsApp } from '@/lib/whatsapp'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Resgata conversa travada em "modo humano" (pedido do Ricardo, out/2026,
// caso real Calçada do Peixe: Ju responde um "oi" direto do celular, o
// webhook desliga a IA pra aquele contato — certo, pra não atropelar quem já
// tá sendo atendido — mas NUNCA ligava de volta sozinha. 33 contatos achados
// travados há até 18 dias, cliente perguntando "cardápio" sem resposta
// nenhuma, nem da loja nem da IA).
//
// Regra combinada: cliente manda mensagem, loja tem 5 minutos pra responder.
// Passou disso sem resposta humana, a IA assume e responde já lendo o
// histórico inteiro da conversa (mesma gerarRespostaIA do atendimento normal
// — contexto completo, não só a última mensagem). Humano volta a falar a
// qualquer momento → o próprio webhook desliga a IA nessa hora de novo (ver
// src/app/api/crm/webhook/route.ts). Cliente manda outra mensagem e a loja
// de novo não responde em 5min → o ciclo se repete sozinho, sem fim.
//
// Não precisou de coluna nova: `last_message_direction === 'in'` já diz que
// a mensagem mais recente é do cliente e ainda não foi respondida (qualquer
// resposta, humana ou da IA, vira 'out' e muda esse campo), e
// `last_message_at` já marca quando isso aconteceu.
//
// Roda via pg_cron a cada 1 minuto (mesmo padrão combinado com o Ricardo pra
// /api/cron/entrega-expirar — vercel.json só permite cron diário no plano
// Hobby, não dá pra confiar nisso pra um timeout de 5min).
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const validos = [process.env.CRON_SECRET, process.env.ATENDIMENTO_CRON_SECRET].filter(Boolean)
  if (!validos.some(s => auth === `Bearer ${s}`)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString()

  const { data: pendentes } = await supabase
    .from('crm_contacts')
    .select('id, phone, company_id, companies!inner(crm_ia_enabled)')
    .eq('atendimento_modo', 'humano')
    .eq('last_message_direction', 'in')
    .eq('companies.crm_ia_enabled', true)
    .lte('last_message_at', cutoff)
    .limit(100)

  let resgatados = 0, erros = 0
  for (const contato of pendentes || []) {
    // Reivindica o contato ANTES de gerar a resposta — se outra execução do
    // cron (improvável, mas possível se uma rodada demorar) já pegou esse
    // mesmo contato, affected rows = 0 e a gente simplesmente pula.
    const { data: claimed } = await supabase
      .from('crm_contacts').update({ atendimento_modo: 'ia' })
      .eq('id', contato.id).eq('atendimento_modo', 'humano')
      .select('id').maybeSingle()
    if (!claimed) continue

    try {
      const { data: historico } = await supabase
        .from('crm_messages').select('direction, body')
        .eq('contact_id', contato.id).not('body', 'is', null)
        .order('sent_at', { ascending: false }).limit(20)
      const respostaIA = await gerarRespostaIA(contato.company_id, ((historico || []) as any[]).reverse(), contato.phone)
      if (respostaIA) {
        await sendCustomerWhatsApp(contato.company_id, contato.phone, respostaIA.texto)
        await supabase.from('crm_contacts').update({ pediu_humano_em: null }).eq('id', contato.id)
        if (respostaIA.followUpDias) {
          const followUpAt = new Date(Date.now() + respostaIA.followUpDias * 24 * 60 * 60 * 1000).toISOString()
          await supabase.from('crm_contacts').update({ follow_up_at: followUpAt }).eq('id', contato.id)
        }
        resgatados++
      }
    } catch (err) {
      console.error('[atendimento-resgate] falhou', contato.id, err)
      erros++
    }
  }

  return NextResponse.json({ ok: true, resgatados, erros, total: (pendentes || []).length })
}
