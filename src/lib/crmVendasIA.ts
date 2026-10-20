import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const anthropic = new Anthropic()

// Versão genérica do crmAtendimentoIA.ts (que é específico pra salão de
// festas) — pro Radar de Clientes (piloto, companies.crm_vendas_pilot).
// Mesma arquitetura (lê só mensagem nova + resumo anterior, nunca o
// histórico inteiro), mas classificando venda + CANAL em vez de evento.
// Tabela de estado própria (crm_vendas_contato_estado) pra não misturar
// com a classificação de atendimento da Júlia.
const ResumoVendaSchema = z.object({
  fechou: z.boolean(),
  fechou_em: z.string().nullable(),
  canal: z.enum(['trindade_online', 'whatsapp_direto', 'ifood', 'anota_ai', 'outro_app', 'desconhecido']).nullable(),
  valor: z.number().nullable(),
  produto: z.string().nullable(),
  nota: z.string(),
})
export type ResumoVenda = z.infer<typeof ResumoVendaSchema>

type MensagemClassificar = { direction: 'in' | 'out'; body: string | null; media_type: string | null; sent_at: string }

async function classificarContato(companyId: string, contactId: string, resumoAnterior: ResumoVenda | null, novasMensagens: MensagemClassificar[]) {
  const linhasMsg = novasMensagens.map(m => {
    const quem = m.direction === 'in' ? 'Cliente' : 'Loja'
    const data = new Date(m.sent_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    const texto = m.body?.trim() || (m.media_type ? `[enviou ${m.media_type === 'image' ? 'uma imagem' : 'um arquivo'}, sem legenda]` : '[mensagem vazia]')
    return `[${data}] ${quem}: ${texto}`
  }).join('\n')

  const prompt = `Você está classificando UMA conversa de WhatsApp entre um comércio local (comida/delivery) e um cliente, pra alimentar um radar de clientes. Responda só com o que está explícito na conversa — nunca invente ou chute.

Importante: esse comércio vende por VÁRIOS canais ao mesmo tempo — pelo cardápio digital do Trindade Online, por fora direto no WhatsApp, e às vezes também por outros apps de delivery (iFood, Anota Aí, etc). Sua tarefa principal é identificar SE fechou venda e POR QUAL CANAL, só quando isso está claro na conversa.

ESTADO ANTERIOR já conhecido sobre esse cliente (pode estar tudo null/false se é a primeira leitura):
${JSON.stringify(resumoAnterior || {})}

MENSAGENS NOVAS desde a última leitura, mais antiga primeiro (pode faltar contexto de mensagens mais antigas já lidas antes — use o estado anterior pra isso, não invente o que não está em nenhum dos dois):
${linhasMsg}

Devolva o estado ATUALIZADO. Mantenha um campo do jeito que já estava se as mensagens novas não trouxerem nada que o mude — só altere com evidência nova:
- fechou: true SÓ se ficou claro que uma venda foi fechada de verdade (cliente confirmou o pedido, combinou entrega/retirada, ou a loja confirmou que vai preparar) — só perguntar preço, só demonstrar interesse, ou só pedir o cardápio NÃO conta.
- fechou_em: data AAAA-MM-DD em que ficou claro que fechou, baseada nas datas das mensagens — null se fechou for false.
- canal: por onde essa venda foi fechada, SÓ quando a conversa deixa isso claro —
  "trindade_online" (cliente usou o link/cardápio digital do Trindade Online, pediu pelo site),
  "whatsapp_direto" (negociado aqui na própria conversa, sem citar nenhum outro app),
  "ifood" (cliente ou loja menciona iFood),
  "anota_ai" (cliente ou loja menciona Anota Aí),
  "outro_app" (menciona outro app de delivery que não é nenhum dos acima),
  "desconhecido" (fechou mas não dá pra saber o canal pela conversa).
  Se fechou for false, deixe null.
- valor: o valor em reais do pedido, SÓ se um número aparecer explícito na conversa (preço combinado, total do pedido) — null se não tiver número nenhum, NUNCA estime.
- produto: nome do produto/prato principal pedido, se ficar claro — null se não tiver.
- nota: uma frase curta resumindo o estado atual dessa conversa, pra um humano auditar depois.`

  const response = await anthropic.messages.parse({
    model: 'claude-haiku-4-5',
    max_tokens: 1000,
    output_config: { format: zodOutputFormat(ResumoVendaSchema) },
    messages: [{ role: 'user', content: prompt }],
  })

  const resumo = response.parsed_output
  if (!resumo) return

  const ultimaMsg = novasMensagens[novasMensagens.length - 1]
  await supabase.from('crm_vendas_contato_estado').upsert({
    company_id: companyId,
    contact_id: contactId,
    last_message_at: ultimaMsg.sent_at,
    resumo,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'contact_id' })

  // Só registra no ledger (crm_sales_signals) venda de canal que NÃO é
  // trindade_online — essa já entra sozinha via trigger em loja_pedidos,
  // direto e sem chute de IA. Registrar de novo aqui duplicaria a mesma
  // venda. fechou_em diferente do estado anterior = fechamento novo (dedupe
  // natural, sem precisar de campo extra "já registrado").
  const fechouDeNovo = resumo.fechou && resumo.fechou_em && resumo.fechou_em !== resumoAnterior?.fechou_em
  if (fechouDeNovo && resumo.canal && resumo.canal !== 'trindade_online') {
    await supabase.from('crm_sales_signals').insert({
      company_id: companyId,
      contact_id: contactId,
      channel: resumo.canal,
      source: 'ia_conversa',
      confirmed: false,
      valor: resumo.valor,
      produto: resumo.produto,
      occurred_at: new Date(resumo.fechou_em + 'T12:00:00').toISOString(),
    })
  }
}

const ORCAMENTO_MS = 90_000

type ContatoPendente = { contact_id: string; resumo: ResumoVenda | null; last_message_at: string | null; ultima_msg_real: string }

// Mesmo desenho de classificarEmpresa() em crmAtendimentoIA.ts — só gasta
// IA em contato com mensagem nova desde a última leitura, processa o que
// couber no orçamento de tempo e deixa o resto pra próxima rodada do cron.
export async function classificarEmpresaVendas(companyId: string): Promise<{ processados: number; semMudanca: number; restantes: number; erros: number }> {
  const inicio = Date.now()
  const { data: pendentes } = await supabase.rpc('crm_vendas_contatos_pendentes', { p_company_id: companyId })
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
      console.error('[crmVendasIA] falhou classificando contato', pendente.contact_id, err)
      erros++
    }
  }
  const restantes = lista.length - i

  const { count } = await supabase.from('crm_contacts').select('id', { count: 'exact', head: true }).eq('company_id', companyId)
  const semMudanca = (count || 0) - lista.length
  return { processados, semMudanca, restantes, erros }
}
