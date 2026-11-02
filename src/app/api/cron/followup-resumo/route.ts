import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyAdmin } from '@/lib/notifyAdmin'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Vigia diário (08h de Brasília) + resumo semanal (segunda) do follow-up
// automático — docs/DESENHO_FOLLOWUP.md, decisão 7 e seção "Como saber se deu
// certo". Só avisa o admin quando há algo errado; o resumo da segunda sai sempre
// que houver alguma loja ligada. Uma mensagem por tipo, nunca em laço.
const MOTIVO_TXT: Record<string, string> = {
  ancora_nao_espera_resposta: 'a mensagem da loja não esperava resposta',
  mensagem_nao_entregue: 'mensagem não chegou ao cliente',
  atendimento_humano: 'conversa com atendimento humano',
  cliente_inativo_24h: 'cliente inativo há mais de 24 h',
  ancora_nao_e_conversa_ia: 'última mensagem não era da IA',
  conversa_sensivel: 'conversa com reclamação',
  possivel_pedido_para_parar: 'cliente parecia pedir para parar',
  passo1_nao_enviado: '2º lembrete sem o 1º',
  ciclo_anterior_sem_resposta_7d: 'lembrete recente sem resposta',
  limite_diario_da_loja: 'limite diário da loja',
  whatsapp_desconectado: 'WhatsApp desconectado',
  pedido_depois_da_ancora: 'cliente já fez pedido',
  conversa_andou: 'a conversa continuou',
  cliente_respondeu: 'cliente respondeu a tempo',
  humano_assumiu: 'o dono assumiu',
  nova_mensagem_ia: 'a IA mandou outra mensagem',
  loja_fechada: 'loja fechada',
  perto_de_fechar: 'perto de fechar',
  fora_da_janela_9_18: 'fora do horário 9h–18h',
  optout: 'cliente pediu para parar',
}

function diaSemanaSP(): number {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(new Date())
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd] ?? 0
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const validos = [process.env.CRON_SECRET, process.env.ATENDIMENTO_CRON_SECRET].filter(Boolean)
  if (!validos.some(s => auth === `Bearer ${s}`)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: lojas } = await supabase.from('companies').select('id, name, followup_modo').neq('followup_modo', 'off')
  if (!lojas || lojas.length === 0) return NextResponse.json({ ok: true, lojas: 0 })

  const ids = lojas.map(l => l.id)
  const dia = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const semana = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()

  // ---------- Vigia ----------
  const alertas: string[] = []

  const { data: ultimos } = await supabase
    .from('crm_followups').select('motivo, status').in('company_id', ids).in('status', ['simulado', 'enviado'])
    .gte('processado_em', dia).order('processado_em', { ascending: false }).limit(5)
  if ((ultimos || []).length >= 3 && (ultimos || []).slice(0, 3).every(u => u.motivo === 'texto_reserva')) {
    alertas.push('A IA não está escrevendo os lembretes (os 3 últimos usaram o texto de reserva). Confira o saldo/chave da Anthropic.')
  }

  const { count: falhas } = await supabase
    .from('crm_followups').select('id', { count: 'exact', head: true }).in('company_id', ids).eq('status', 'falhou').gte('processado_em', dia)
  if ((falhas || 0) >= 3) alertas.push(`${falhas} lembretes falharam por erro interno nas últimas 24 h.`)

  const { count: presos } = await supabase
    .from('crm_followups').select('id', { count: 'exact', head: true }).in('company_id', ids).eq('status', 'pendente')
    .lt('due_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
  if ((presos || 0) > 0) alertas.push(`${presos} lembrete(s) vencidos há mais de 30 min sem processar — o job pode estar parado.`)

  const { data: conectadas } = await supabase
    .from('crm_whatsapp_instances').select('company_id').in('company_id', ids).eq('status', 'connected')
  const comWhats = new Set((conectadas || []).map(c => c.company_id))
  for (const l of lojas) if (!comWhats.has(l.id)) alertas.push(`${l.name}: WhatsApp desconectado.`)

  const { count: optouts24 } = await supabase
    .from('crm_followups').select('id', { count: 'exact', head: true }).in('company_id', ids).eq('motivo', 'optout').gte('processado_em', dia)
  if ((optouts24 || 0) >= 3) alertas.push(`${optouts24} clientes pediram para parar de receber mensagens nas últimas 24 h.`)

  if (alertas.length) await notifyAdmin({ type: 'followup_alerta', linhas: alertas })

  // ---------- Resumo semanal (segunda) ----------
  let resumoEnviado = false
  if (diaSemanaSP() === 1) {
    const { data: itens } = await supabase
      .from('crm_followups').select('company_id, status, motivo, revisao, revisao_grave').in('company_id', ids).gte('criado_em', semana).limit(5000)
    const blocos: string[] = []
    for (const l of lojas) {
      const meus = (itens || []).filter(i => i.company_id === l.id)
      const simulados = meus.filter(i => i.status === 'simulado')
      const revisados = simulados.filter(i => i.revisao)
      const ok = revisados.filter(i => i.revisao === 'ok').length
      const graves = revisados.filter(i => i.revisao_grave).length
      const motivos: Record<string, number> = {}
      for (const i of meus) if (i.status === 'ignorado' || i.status === 'cancelado') motivos[i.motivo || '-'] = (motivos[i.motivo || '-'] || 0) + 1
      const top = Object.entries(motivos).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${MOTIVO_TXT[k] || k} (${n})`).join('; ')
      blocos.push(
        `*${l.name}* (${l.followup_modo === 'sombra' ? 'modo sombra' : l.followup_modo})\n` +
        `• Teria mandado: ${simulados.length} · revisados: ${revisados.length} · 👍 ${revisados.length ? Math.round((ok / revisados.length) * 100) + '%' : '–'} · erros graves: ${graves}\n` +
        `• Não mandou / cancelou: ${top || 'nada ainda'}`
      )
    }
    const totRev = (itens || []).filter(i => i.status === 'simulado' && i.revisao).length
    const meta = totRev >= 30 ? '✅ Já passou de 30 casos revisados — dá pra avaliar liberar o envio real.' : `Faltam ${30 - totRev} casos revisados para a meta de 30.`
    await notifyAdmin({ type: 'followup_resumo', texto: `📊 Follow-up automático — resumo da semana\n\n${blocos.join('\n\n')}\n\n${meta}\nRevise em Admin → Follow-up (sombra).` })
    resumoEnviado = true
  }

  return NextResponse.json({ ok: true, lojas: lojas.length, alertas: alertas.length, resumoEnviado })
}
