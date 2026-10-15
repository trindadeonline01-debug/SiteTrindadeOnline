import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { gerarFollowUp } from '@/lib/crmIA'
import { sendCustomerWhatsApp } from '@/lib/whatsapp'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Mesmo piloto hardcoded de src/lib/crmIA.ts (JULIA_EVENTOS_COMPANY_ID) — só
// essa empresa usa o perfil de salão de eventos por enquanto.
const JULIA_EVENTOS_COMPANY_ID = '32ddce3a-ff9b-475b-9a3d-d829efcf8f24'

// Dispara o retorno proativo que a Julia (IA) combinou com a cliente (ver
// [AGENDAR_RETORNO:N] em crmIA.ts) quando o prazo vence. 1x/dia é suficiente
// pra granularidade de dias (diferente do atendimento-classificar, que
// precisa rodar várias vezes ao dia). crm_contacts.follow_up_at já é
// cancelado automaticamente no webhook assim que a cliente volta a falar
// antes do prazo — o que sobra aqui é só quem realmente não respondeu.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const validos = [process.env.CRON_SECRET, process.env.ATENDIMENTO_CRON_SECRET].filter(Boolean)
  if (!validos.some(s => auth === `Bearer ${s}`)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: pendentes } = await supabase
    .from('crm_contacts')
    .select('id, phone')
    .eq('company_id', JULIA_EVENTOS_COMPANY_ID)
    .not('follow_up_at', 'is', null)
    .lte('follow_up_at', new Date().toISOString())

  let enviados = 0, erros = 0
  for (const contato of pendentes || []) {
    try {
      const { data: historico } = await supabase
        .from('crm_messages').select('direction, body')
        .eq('contact_id', contato.id).not('body', 'is', null)
        .order('sent_at', { ascending: false }).limit(20)
      const mensagem = await gerarFollowUp(JULIA_EVENTOS_COMPANY_ID, ((historico || []) as any[]).reverse(), contato.phone)
      if (mensagem) {
        await sendCustomerWhatsApp(JULIA_EVENTOS_COMPANY_ID, contato.phone, mensagem)
        enviados++
      }
    } catch (err) {
      console.error('[atendimento-followup] falhou', contato.id, err)
      erros++
    } finally {
      // Limpa sempre, falhando ou não — evita reenviar o mesmo follow-up
      // todo dia se alguma chamada específica der erro uma vez.
      await supabase.from('crm_contacts').update({ follow_up_at: null }).eq('id', contato.id)
    }
  }

  return NextResponse.json({ ok: true, enviados, erros, total: (pendentes || []).length })
}
