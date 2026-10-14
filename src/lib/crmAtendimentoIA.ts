import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const anthropic = new Anthropic()

// Estado compacto por contato (crm_atendimento_contato_estado.resumo) —
// campos de julgamento, que uma leitura pontual do texto resolve. Métricas
// objetivas (novo cliente, respondeu, tempo de resposta, evadiu sem
// resposta) NÃO passam por aqui: são calculadas direto em SQL a partir de
// crm_messages (recompute_crm_atendimento_diario/agora), porque são fato,
// não interpretação.
const ResumoSchema = z.object({
  tipo_evento: z.enum(['infantil', 'casamento', 'debutante', 'corporativo', 'outro']).nullable(),
  interesse: z.enum(['so_espaco', 'espaco_buffet']).nullable(),
  fechou: z.boolean(),
  fechou_em: z.string().nullable(),
  recompra: z.boolean(),
  reclamou_demora: z.boolean(),
  reclamou_em: z.string().nullable(),
  perdeu_por_demora: z.boolean(),
  perdeu_em: z.string().nullable(),
  nota: z.string(),
})
export type ResumoAtendimento = z.infer<typeof ResumoSchema>

type MensagemClassificar = { direction: 'in' | 'out'; body: string | null; media_type: string | null; sent_at: string }

// Lê só as mensagens novas desde a última leitura + o resumo compacto
// anterior (nunca o histórico inteiro de novo) — é o desenho combinado com o
// Ricardo pra manter o custo baixo rodando algumas vezes por dia.
async function classificarContato(companyId: string, contactId: string, resumoAnterior: ResumoAtendimento | null, novasMensagens: MensagemClassificar[]) {
  const linhasMsg = novasMensagens.map(m => {
    const quem = m.direction === 'in' ? 'Cliente' : 'Salão'
    const data = new Date(m.sent_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    const texto = m.body?.trim() || (m.media_type ? `[enviou ${m.media_type === 'image' ? 'uma imagem' : 'um arquivo'}, sem legenda — não dá pra ver o conteúdo, só que algo foi enviado]` : '[mensagem vazia]')
    return `[${data}] ${quem}: ${texto}`
  }).join('\n')

  const prompt = `Você está classificando UMA conversa de WhatsApp de um salão de festas (negócio que aluga espaço pra eventos) com um cliente, pra alimentar um painel de atendimento. Responda só com o que está explícito na conversa — nunca invente ou chute.

ESTADO ANTERIOR já conhecido sobre esse cliente (pode estar tudo null/false se é a primeira leitura dessa conversa):
${JSON.stringify(resumoAnterior || {})}

MENSAGENS NOVAS desde a última leitura, mais antiga primeiro (pode faltar contexto de mensagens mais antigas já lidas antes — use o estado anterior acima pra isso, não invente o que não está em nenhum dos dois):
${linhasMsg}

Devolva o estado ATUALIZADO. Mantenha um campo do jeito que já estava se as mensagens novas não trouxerem nada que o mude — só altere com evidência nova:
- tipo_evento: infantil, casamento, debutante, corporativo ou outro — null se ainda não ficou claro
- interesse: "so_espaco" (só quer alugar o espaço) ou "espaco_buffet" (espaço + buffet/comida completa) — null se não ficou claro
- fechou: true SÓ se o cliente confirmou que vai fechar/alugar o espaço de verdade pra FESTA DELE (pagou ou prometeu sinal, ou combinou a DATA DO EVENTO de forma definitiva). IMPORTANTE — agendar uma VISITA ou DEGUSTAÇÃO pra conhecer o espaço NÃO é fechar, mesmo que o salão "confirme o agendamento" — isso é só uma etapa anterior à decisão. Também não conta: só pedir orçamento, só demonstrar interesse, só perguntar preço. Na dúvida entre "visita agendada" e "festa fechada", marque false.
- fechou_em: data no formato AAAA-MM-DD em que ficou claro que fechou, baseada nas datas das mensagens acima — null se fechou for false
- recompra: true SÓ se o próprio cliente deixar claro que JÁ alugou o espaço antes pra uma festa dele — "já fui numa festa lá" como convidado NÃO conta como recompra
- reclamou_demora: true se o cliente reclamar explicitamente de demora ou falta de resposta do salão, mesmo que continue negociando depois
- reclamou_em: data AAAA-MM-DD da reclamação — null se reclamou_demora for false
- perdeu_por_demora: true SÓ se o cliente disser explicitamente que fechou/vai fechar em OUTRO salão/espaço por causa da demora ou falta de resposta daqui — é mais forte que uma reclamação comum, é a venda se confirmando perdida por esse motivo específico
- perdeu_em: data AAAA-MM-DD em que isso ficou claro — null se perdeu_por_demora for false
- nota: uma frase curta resumindo o estado atual dessa conversa, pra um humano auditar depois`

  const response = await anthropic.messages.parse({
    model: 'claude-haiku-4-5',
    max_tokens: 1000,
    output_config: { format: zodOutputFormat(ResumoSchema) },
    messages: [{ role: 'user', content: prompt }],
  })

  const resumo = response.parsed_output
  if (!resumo) return

  const ultimaMsg = novasMensagens[novasMensagens.length - 1]
  await supabase.from('crm_atendimento_contato_estado').upsert({
    company_id: companyId,
    contact_id: contactId,
    last_message_at: ultimaMsg.sent_at,
    resumo,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'contact_id' })
}

// Teto de tempo por rodada, bem abaixo do maxDuration da rota (120s) — na
// primeira rodada de uma empresa nova, TODO contato com mensagem ainda
// precisa de 1ª classificação (nenhum tem "last_message_at" ainda), o que
// pode passar de uma centena de chamadas de IA em sequência. Em vez de
// estourar o timeout da Vercel (e perder o que não deu tempo de salvar),
// processa o quanto couber no orçamento de tempo e deixa o resto pra
// próxima rodada do cron (a cada ~3h) — o backlog inicial some em algumas
// rodadas, sem risco de 504. Mesma lição do /api/painel/importar-ia-fotos.
const ORCAMENTO_MS = 90_000

type ContatoPendente = { contact_id: string; resumo: ResumoAtendimento | null; last_message_at: string | null; ultima_msg_real: string }

// Processa uma empresa inteira: só gasta chamada de IA em contato que teve
// mensagem nova desde o último "last_message_at" — contato parado não custa
// nada numa rodada do cron.
//
// A lista de pendentes vem de uma função SQL (crm_atendimento_contatos_pendentes),
// não de puxar a tabela crm_messages inteira pro JS e filtrar aqui — achado
// real, out/2026 (Júlia Eventos): com companyId fixo e milhares de
// mensagens, o .select() batia no teto padrão de linhas do Supabase (bem
// menor que o .limit() pedido no código) e SEMPRE truncava nas mensagens
// mais ANTIGAS — contato com conversa mais recente nunca entrava na lista,
// mesmo sem nunca ter sido classificado. Resolvido pro cálculo de "quem
// precisa" morar no banco (sem teto de linha nenhum), e as mensagens de
// cada contato pendente serem buscadas uma de cada vez, com teto por
// contato (bem abaixo de qualquer limite de linhas real).
export async function classificarEmpresa(companyId: string): Promise<{ processados: number; semMudanca: number; restantes: number; erros: number }> {
  const inicio = Date.now()
  const { data: pendentes } = await supabase.rpc('crm_atendimento_contatos_pendentes', { p_company_id: companyId })
  const lista = (pendentes || []) as ContatoPendente[]
  if (lista.length === 0) {
    const { count } = await supabase.from('crm_contacts').select('id', { count: 'exact', head: true }).eq('company_id', companyId)
    return { processados: 0, semMudanca: count || 0, restantes: 0, erros: 0 }
  }

  let processados = 0, erros = 0
  let i = 0
  for (; i < lista.length; i++) {
    if (Date.now() - inicio > ORCAMENTO_MS) break
    const pendente = lista[i]
    try {
      let query = supabase
        .from('crm_messages')
        .select('contact_id, direction, body, media_type, sent_at')
        .eq('contact_id', pendente.contact_id)
        .order('sent_at', { ascending: true })
        .limit(300)
      if (pendente.last_message_at) query = query.gt('sent_at', pendente.last_message_at)
      const { data: novas } = await query
      const comConteudo = (novas || []).filter(m => m.body?.trim() || m.media_type) as MensagemClassificar[]
      if (comConteudo.length === 0) continue
      await classificarContato(companyId, pendente.contact_id, pendente.resumo, comConteudo)
      processados++
    } catch (err) {
      console.error('[crmAtendimentoIA] falhou classificando contato', pendente.contact_id, err)
      erros++
    }
  }
  const restantes = lista.length - i

  const { count } = await supabase.from('crm_contacts').select('id', { count: 'exact', head: true }).eq('company_id', companyId)
  const semMudanca = (count || 0) - lista.length
  return { processados, semMudanca, restantes, erros }
}
