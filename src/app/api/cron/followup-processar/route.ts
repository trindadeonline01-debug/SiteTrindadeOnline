import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { gerarFollowUpSilencio } from '@/lib/crmIA'
import { iaLiberadaParaEmpresa } from '@/lib/atendimentoIA'
import { avaliarFollowup, textoReserva, FRASE_OPTOUT, type FollowupItem } from '@/lib/followupPolicy'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Processa a fila de follow-ups (docs/DESENHO_FOLLOWUP.md). O pg_cron só chama
// esta rota quando EXISTE item vencido (comando condicional) — fila vazia = zero
// chamadas à Vercel. Teto por rodada pra nunca sair em rajada.
//
// MODO SOMBRA (fase 2): decide e escreve o texto, mas NÃO envia — grava o item
// como 'simulado' para o admin revisar em "O que eu teria mandado". O envio real
// (fase 3) ainda não existe aqui de propósito: loja com followup_modo = 'real'
// é tratada como sombra até essa fase ser liberada.
const TETO_POR_RODADA = 15

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const validos = [process.env.CRON_SECRET, process.env.ATENDIMENTO_CRON_SECRET].filter(Boolean)
  if (!validos.some(s => auth === `Bearer ${s}`)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Item preso em 'processando' (função caiu no meio) não fica pra sempre: vira 'falhou'.
  await supabase.from('crm_followups')
    .update({ status: 'falhou', motivo: 'preso_em_processamento', processado_em: new Date().toISOString() })
    .eq('status', 'processando').lt('due_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())

  const { data: vencidos } = await supabase
    .from('crm_followups')
    .select('id, company_id, contact_id, passo, ancora_msg_id, due_at')
    .eq('status', 'pendente').lte('due_at', new Date().toISOString())
    .order('due_at', { ascending: true }).limit(TETO_POR_RODADA)

  const resumo: Record<string, number> = {}
  const conta = (k: string) => { resumo[k] = (resumo[k] || 0) + 1 }

  for (const item of (vencidos || []) as FollowupItem[]) {
    // Trava otimista: só um processo fica com o item.
    const { data: pego } = await supabase
      .from('crm_followups').update({ status: 'processando' })
      .eq('id', item.id).eq('status', 'pendente').select('id').maybeSingle()
    if (!pego) continue

    try {
      const d = await avaliarFollowup(supabase, item)
      const agora = new Date().toISOString()

      if (d.acao !== 'enviar') {
        const status = d.acao === 'cancelar' ? 'cancelado' : d.acao === 'expirar' ? 'expirado' : 'ignorado'
        await supabase.from('crm_followups').update({ status, motivo: d.motivo, processado_em: agora }).eq('id', item.id)
        conta(`${status}:${d.motivo}`)
        continue
      }

      // Texto: IA (só onde a IA está liberada) com texto de reserva se falhar.
      let texto: string | null = null
      let motivo = 'ok'
      if (iaLiberadaParaEmpresa(item.company_id)) {
        texto = await gerarFollowUpSilencio(item.company_id, d.historico, d.phone, item.passo === 2 ? 2 : 1)
      }
      if (!texto) { texto = textoReserva(item.passo); motivo = 'texto_reserva' }
      if (item.passo === 2) texto = `${texto} ${FRASE_OPTOUT}`

      await supabase.from('crm_followups')
        .update({ status: 'simulado', motivo, texto_gerado: texto, processado_em: agora })
        .eq('id', item.id)
      conta(`simulado:${motivo}`)
    } catch (err) {
      console.error('[followup-processar] falhou', item.id, err)
      // Volta pra fila só uma vez: marca falhou pra não ficar preso em 'processando'.
      await supabase.from('crm_followups')
        .update({ status: 'falhou', motivo: 'erro_interno', processado_em: new Date().toISOString() }).eq('id', item.id)
      conta('falhou:erro_interno')
    }
  }

  return NextResponse.json({ ok: true, total: (vencidos || []).length, resumo })
}
