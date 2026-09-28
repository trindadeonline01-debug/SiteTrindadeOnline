import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { isOpenNow, dayOfWeekLabel, type HourRow } from '@/lib/businessHours'
import { moduleActive } from '@/lib/modules'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const anthropic = new Anthropic()

const PAY_LABEL: Record<string, string> = {
  pix: 'Pix', dinheiro: 'dinheiro', cartao: 'cartão',
  cartao_credito: 'cartão de crédito', cartao_debito: 'cartão de débito',
}

// Palavras que indicam pedido de humano — checado sem acento/maiúscula.
// Pedido do Ricardo, set/2026: só transfere de verdade na SEGUNDA vez que a
// pessoa insiste (ver máquina de estado em src/app/api/crm/webhook/route.ts,
// campos crm_contacts.atendimento_modo/pediu_humano_em).
const PALAVRAS_HUMANO = [
  'humano', 'atendente', 'pessoa de verdade', 'falar com alguem', 'falar com uma pessoa',
  'quero um atendente', 'nao e robo', 'nao sou robo', 'gerente', 'dono da loja', 'dona da loja',
]

function normalize(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function pedeHumano(texto: string): boolean {
  const norm = normalize(texto)
  if (!norm) return false
  return PALAVRAS_HUMANO.some(kw => norm.includes(kw))
}

function fmtHora(hhmm: string | null): string {
  return hhmm ? hhmm.slice(0, 5) : ''
}

function fmtMoney(n: number): string {
  return 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',')
}

// Monta o contexto em texto puro com tudo que já existe cadastrado da loja
// (horário, endereço, pagamento, entrega por bairro, cardápio) — lido ao
// vivo do banco a cada resposta, nunca copiado/colado à mão (decisão com o
// Ricardo, set/2026: relatório copiado ficaria desatualizado assim que o
// lojista mudasse um preço; ler direto nunca fica velho).
async function buildContext(companyId: string): Promise<string | null> {
  const { data: company } = await supabase
    .from('companies')
    .select(`
      name, slug, phone, address, flexible_hours, store_paused, store_forced_open,
      loja_taxa_metodo, loja_taxa_entrega, loja_taxa_fora_area, loja_payment_methods,
      entrega_enabled, trial_modules_until,
      crm_ia_prompt_extra,
      hours:company_hours(day_of_week, open_time, close_time, closed)
    `)
    .eq('id', companyId).maybeSingle()
  if (!company) return null

  const hours = (company.hours || []) as HourRow[]
  const aberta = isOpenNow(hours, company.flexible_hours, company.store_paused, company.store_forced_open)
  const cardapioLink = `https://trindadeonline.com.br/empresa/${company.slug}/cardapio`

  const linhas: string[] = []
  linhas.push(`Nome da loja: ${company.name}`)
  linhas.push(`Status agora: ${aberta ? 'ABERTA' : 'FECHADA'}`)
  if (company.address) linhas.push(`Endereço: ${company.address}`)
  linhas.push(`Link do cardápio (sempre mande esse link quando perguntarem sobre produto, preço ou disponibilidade — nunca tente responder o preço de cabeça): ${cardapioLink}`)

  if (company.flexible_hours) {
    linhas.push('Horário: funcionamento livre, sem grade fixa cadastrada (considere sempre aberta).')
  } else if (hours.length > 0) {
    const porDia = [1, 2, 3, 4, 5, 6, 0].map(dia => {
      const doDia = hours.filter(h => h.day_of_week === dia && !h.closed && h.open_time && h.close_time)
      const label = dayOfWeekLabel(dia)
      return doDia.length === 0 ? `${label}: fechado` : `${label}: ${doDia.map(h => `${fmtHora(h.open_time)}–${fmtHora(h.close_time)}`).join(', ')}`
    })
    linhas.push('Horário de funcionamento:\n' + porDia.join('\n'))
  }

  const metodos = (company.loja_payment_methods?.length ? company.loja_payment_methods : ['pix', 'dinheiro', 'cartao_credito']) as string[]
  linhas.push(`Formas de pagamento aceitas: ${metodos.map(m => PAY_LABEL[m] || m).join(', ')}`)

  // Entrega feita pelo motoboy da PLATAFORMA (Trindade Entrega) — quando esse
  // módulo está ativo ele SEMPRE manda na cobrança, a loja nem configura
  // bairro/taxa própria pra isso (mesma prioridade do cálculo real do
  // checkout em /api/loja/calcular-frete). Achado real do Ricardo, set/2026:
  // Peixaria Trindade usa Trindade Entrega e não tem taxa própria cadastrada
  // (loja_taxa_entrega ficou em R$0 por padrão) — sem essa checagem aqui
  // primeiro, a IA lia "taxa padrão: R$0,00" do fallback da loja e informava
  // isso pro cliente como se fosse o valor real, o que é errado: a taxa de
  // verdade é calculada por distância até o endereço, nunca um valor fixo.
  if (moduleActive(company.entrega_enabled, company.trial_modules_until)) {
    linhas.push('A entrega é feita por motoboy da plataforma (Trindade Entrega) — a taxa é calculada automaticamente pela distância até o endereço do cliente, não existe valor fixo nem tabela por bairro pra essa loja. NUNCA informe um valor de entrega aqui (nem R$0, nem um valor "padrão") — oriente o cliente a fazer o pedido pelo link do cardápio e preencher o endereço no carrinho, que o valor exato aparece automaticamente antes de fechar o pedido.')
  } else if (company.loja_taxa_metodo === 'distancia') {
    linhas.push('A taxa de entrega varia por distância — não dá pra informar um valor exato aqui. Oriente o cliente a colocar o endereço no carrinho do cardápio pra ver o valor calculado na hora.')
  } else {
    const { data: bairros } = await supabase
      .from('company_delivery_bairros').select('bairro, price, disabled').eq('company_id', companyId)
    const ativos = (bairros || []).filter(b => !b.disabled)
    if (ativos.length > 0) {
      linhas.push('Valores de entrega por bairro (SÓ informe o valor de um bairro específico depois que o cliente disser qual é o bairro dele — nunca escolha um da lista por conta própria):\n' + ativos.map(b => `${b.bairro}: ${fmtMoney(Number(b.price))}`).join('\n'))
      if (company.loja_taxa_fora_area != null) {
        linhas.push(`Bairro fora da lista acima: ${fmtMoney(Number(company.loja_taxa_fora_area))} (taxa padrão fora de área)`)
      }
    } else if (company.loja_taxa_entrega) {
      linhas.push(`Taxa de entrega padrão: ${fmtMoney(Number(company.loja_taxa_entrega))}`)
    } else {
      linhas.push('Não há taxa de entrega configurada pra essa loja ainda. Não informe R$0 nem invente um valor — diga que vai confirmar o valor da entrega e, se o cliente insistir, sugira perguntar direto pela loja.')
    }
  }

  // Opcionais/variações do produto (ex: camarão "Limpo" ou "Com casca", peixe
  // "Filé" ou "Posta") — pedido do Ricardo, set/2026: cliente perguntou por
  // áudio "o camarão já vem limpo?" e a IA só sabia mandar pro link do
  // cardápio, mesmo essa informação já estando cadastrada no produto (grupo
  // de opcionais). Só nome das opções, nunca preço — preço de adicional
  // continua sendo só no cardápio, igual preço de produto.
  const { data: produtos } = await supabase
    .from('loja_produtos')
    .select('name, groups:loja_opcoes_grupo(name, options:loja_opcoes(name))')
    .eq('company_id', companyId).eq('active', true)
  const comOpcionais = (produtos || []).filter((p: any) => (p.groups || []).some((g: any) => (g.options || []).length > 0))
  if (comOpcionais.length > 0) {
    const linhasProdutos = comOpcionais.slice(0, 60).map((p: any) =>
      `${p.name}: ` + p.groups.filter((g: any) => (g.options || []).length > 0)
        .map((g: any) => `${g.name} (${g.options.map((o: any) => o.name).join(', ')})`).join(' · ')
    )
    linhas.push('Opções/variações cadastradas por produto (use isso SÓ pra responder pergunta sobre opcional/variação de um produto específico, ex: "o camarão vem limpo?" — nunca pra confirmar preço ou se um produto existe, isso continua sendo só pelo link do cardápio):\n' + linhasProdutos.join('\n'))
  }

  if (company.crm_ia_prompt_extra?.trim()) {
    linhas.push('Instruções extras do dono da loja (siga à risca):\n' + company.crm_ia_prompt_extra.trim())
  }

  return linhas.join('\n\n')
}

const SYSTEM_PROMPT_BASE = `Você é o atendente automático de WhatsApp de uma loja cadastrada no Trindade Online, uma plataforma de comércio do bairro Trindade (São Gonçalo, RJ).

CONTEXTO DA CONVERSA — leia com atenção antes de responder:
- As mensagens anteriores desta conversa (se houver) vêm logo abaixo, na ordem em que aconteceram — incluindo mensagens automáticas de confirmação de pedido, avisos de status e qualquer coisa que já foi respondida antes (por você ou por um humano da loja).
- NUNCA trate a mensagem atual como se fosse o primeiro contato quando já existem mensagens anteriores. Não repita saudação/apresentação da loja nem mande o link do cardápio do zero se isso já apareceu antes na mesma conversa — continue de onde parou.
- Se o histórico mostrar que o cliente já fez um pedido, já recebeu confirmação, ou já perguntou algo antes, leve isso em conta na resposta em vez de ignorar.
- A saudação de boas-vindas (apresentar a loja + mandar o link do cardápio) só faz sentido quando esta é literalmente a primeira mensagem da conversa, sem nada antes.

REGRAS RÍGIDAS — nunca quebre nenhuma delas:
- Responda SOMENTE com base nos dados da loja fornecidos abaixo. Nunca invente horário, endereço, preço, produto ou qualquer informação que não esteja explícita aqui.
- Você NUNCA cria pedidos, NUNCA gera link de pagamento/cobrança e NUNCA promete prazo exato de entrega.
- Pergunta sobre produto específico, preço de produto ou "vocês têm tal coisa?": sempre direcione para o link do cardápio — nunca tente adivinhar se um produto existe ou seu preço. EXCEÇÃO: se a pergunta for sobre opcional/variação de um produto que já está na lista "Opções/variações cadastradas por produto" abaixo (ex: "o camarão vem limpo ou com casca?", "o peixe é em filé ou posta?"), responda direto com base nessa lista — sem precisar mandar pro cardápio pra isso.
- Pergunta sobre valor de entrega: NUNCA informe um valor sem antes saber o bairro (ou endereço) do cliente. Se ele ainda não disse, pergunte primeiro qual é o bairro dele. Nunca escolha um valor "de exemplo" da lista de bairros nem invente um número — se os dados da loja abaixo disserem que a taxa é calculada por distância ou que não há taxa configurada, siga exatamente a instrução dada ali.
- Você serve só para atendimento básico e direto: boas-vindas, horário de funcionamento, endereço, formas de pagamento, valor de entrega por bairro, link do cardápio. Nada de bate-papo, opinião pessoal ou assunto fora disso.
- Pergunta sem relação nenhuma com a loja: responda educadamente algo como "Minha função aqui é te ajudar com informações da loja 🙂 Posso ajudar com horário, endereço, entrega ou o link do cardápio?" — e pare por aí.
- Seja breve: no máximo 2 a 4 linhas, português informal e cordial, no máximo 1 emoji por mensagem.
- Nunca use markdown (sem **negrito**, sem listas com traço) — é WhatsApp, texto corrido normal.
- Só diga que é uma inteligência artificial se perguntarem diretamente ("você é um robô?" ou parecido) — nesse caso seja honesto.

DADOS DESTA LOJA:
`

export type HistoricoMsg = { direction: 'in' | 'out'; body: string | null }

// Gera a resposta da IA pra uma conversa — histórico já deve vir em ordem
// cronológica (mais antiga primeiro), só com mensagens de texto (sem
// legenda de mídia sem texto, que a IA não tem como responder direito).
export async function gerarRespostaIA(companyId: string, historico: HistoricoMsg[]): Promise<string | null> {
  try {
    const context = await buildContext(companyId)
    if (!context) return null

    const comTexto = historico.filter((m): m is { direction: 'in' | 'out'; body: string } => !!m.body?.trim())
    const firstInIdx = comTexto.findIndex(m => m.direction === 'in')
    if (firstInIdx === -1) return null
    const trimmed = comTexto.slice(firstInIdx)

    // A API exige troca estrita user/assistant — mensagens seguidas do mesmo
    // lado (comum no WhatsApp, cliente manda 2-3 balões seguidos) são
    // mescladas num turno só antes de montar a chamada.
    const messages: { role: 'user' | 'assistant'; content: string }[] = []
    for (const m of trimmed) {
      const role: 'user' | 'assistant' = m.direction === 'in' ? 'user' : 'assistant'
      const last = messages[messages.length - 1]
      if (last && last.role === role) last.content += '\n' + m.body
      else messages.push({ role, content: m.body })
    }
    if (messages.length === 0 || messages[0].role !== 'user') return null

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      system: SYSTEM_PROMPT_BASE + context,
      messages,
    })

    const block = response.content.find(b => b.type === 'text')
    return block && block.type === 'text' ? block.text.trim() : null
  } catch (err) {
    console.error('[gerarRespostaIA] falhou:', err)
    return null
  }
}
