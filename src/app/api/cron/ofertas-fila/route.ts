import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { dentroDoHorario, enviarPelaLoja, inicioDoDiaBR, intervaloDoLog, lojaConectada, LIMITE_OFERTAS_DIA } from '@/lib/ofertas'

// Fila de ofertas por WhatsApp (nov/2026). Roda a cada minuto (pg_cron). Em cada rodada manda NO MÁXIMO
// 1 mensagem por loja, só das 8h às 20h, respeitando o limite diário e o intervalo de 2 a 4 minutos.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const validos = [process.env.CRON_SECRET, process.env.ATENDIMENTO_CRON_SECRET].filter(Boolean)
  if (!validos.some(s => auth === `Bearer ${s}`)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!dentroDoHorario()) return NextResponse.json({ ok: true, fora_do_horario: true })

  const { data: pendentes } = await sb.from('crm_campaign_logs')
    .select('id, campaign_id, company_id, phone, nome, texto, created_at')
    .eq('status', 'pendente').order('created_at', { ascending: true }).limit(300)
  if (!pendentes?.length) return NextResponse.json({ ok: true, enviados: 0 })

  const porLoja = new Map<string, typeof pendentes>()
  for (const p of pendentes) { const l = porLoja.get(p.company_id) || []; l.push(p); porLoja.set(p.company_id, l) }

  const inicioDia = inicioDoDiaBR()
  let enviados = 0, pulados = 0
  const campanhasTocadas = new Set<string>()

  for (const [companyId, fila] of porLoja) {
    // Campanha cancelada: descarta a fila dela.
    const ids = [...new Set(fila.map(f => f.campaign_id))]
    const { data: camps } = await sb.from('crm_campaigns').select('id, status').in('id', ids)
    const canceladas = new Set((camps || []).filter(c => c.status === 'cancelada').map(c => c.id))
    const ativa = fila.filter(f => !canceladas.has(f.campaign_id))
    if (canceladas.size) await sb.from('crm_campaign_logs').update({ status: 'pulado', erro: 'Campanha cancelada' }).eq('status', 'pendente').in('campaign_id', [...canceladas])
    const proximo = ativa[0]
    if (!proximo) continue

    if (!(await lojaConectada(companyId))) {
      // Desconectada há mais de 2 dias: desiste dessa mensagem (não fica pendente para sempre).
      if (Date.now() - new Date(proximo.created_at).getTime() > 2 * 86400000) {
        await sb.from('crm_campaign_logs').update({ status: 'falhou', erro: 'WhatsApp da loja desconectado' }).eq('id', proximo.id)
        campanhasTocadas.add(proximo.campaign_id)
      }
      continue
    }

    const { count: hoje } = await sb.from('crm_campaign_logs').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'enviado').gte('enviado_em', inicioDia)
    if ((hoje || 0) >= LIMITE_OFERTAS_DIA) continue

    const { data: ultimo } = await sb.from('crm_campaign_logs').select('enviado_em').eq('company_id', companyId).eq('status', 'enviado').order('enviado_em', { ascending: false }).limit(1).maybeSingle()
    if (ultimo?.enviado_em && Date.now() - new Date(ultimo.enviado_em).getTime() < intervaloDoLog(proximo.id) * 1000) continue

    // Pediu pra sair depois de a campanha ser criada?
    const { data: contato } = await sb.from('crm_contacts').select('followup_optout').eq('company_id', companyId).eq('phone', proximo.phone).maybeSingle()
    if (contato?.followup_optout) {
      await sb.from('crm_campaign_logs').update({ status: 'pulado', erro: 'Pediu para não receber mensagens' }).eq('id', proximo.id)
      campanhasTocadas.add(proximo.campaign_id); pulados++
      continue
    }

    // Reivindica antes de enviar (duas rodadas simultâneas não mandam a mesma mensagem).
    const { data: claimed } = await sb.from('crm_campaign_logs').update({ status: 'enviado', enviado_em: new Date().toISOString() }).eq('id', proximo.id).eq('status', 'pendente').select('id').maybeSingle()
    if (!claimed) continue
    const r = await enviarPelaLoja(companyId, proximo.phone, proximo.nome, proximo.texto)
    if (r.ok) enviados++
    else await sb.from('crm_campaign_logs').update({ status: 'falhou', erro: r.erro || 'Falha no envio', enviado_em: null }).eq('id', proximo.id)
    campanhasTocadas.add(proximo.campaign_id)
  }

  // Fecha campanhas sem nada pendente.
  for (const id of campanhasTocadas) {
    const { count } = await sb.from('crm_campaign_logs').select('id', { count: 'exact', head: true }).eq('campaign_id', id).eq('status', 'pendente')
    if (!count) await sb.from('crm_campaigns').update({ status: 'concluida', concluida_em: new Date().toISOString() }).eq('id', id).eq('status', 'enviando')
  }
  return NextResponse.json({ ok: true, enviados, pulados })
}
