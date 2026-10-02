import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { isOpenNow, dayOfWeekLabel, type HourRow } from '@/lib/businessHours'
import { moduleActive } from '@/lib/modules'
import { getEntregaPricing } from '@/lib/entregaPricing'

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

// Mesma regra de promoção usada no cardápio de verdade (ver npPromoPrice em
// src/app/painel/mensagens/page.tsx) — só considera promoção dentro da
// janela de vigência.
function promoPrice(p: any): number | null {
  if (!p.promo_type || !p.promo_value) return null
  const now = Date.now()
  if (p.promo_starts_at && now < new Date(p.promo_starts_at).getTime()) return null
  if (p.promo_ends_at && now > new Date(p.promo_ends_at).getTime()) return null
  return p.promo_type === 'percent' ? p.sale_price * (1 - p.promo_value / 100) : Math.max(0, p.sale_price - p.promo_value)
}
function isSoldOut(p: any): boolean {
  return !!p.esgotado || (!!p.track_stock && (p.stock_qty ?? 0) <= 0)
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
  const cardapioLink = `https://trindadeonline.com.br/cardapio/${company.slug}`

  const linhas: string[] = []
  linhas.push(`Nome da loja: ${company.name}`)
  linhas.push(`Status agora: ${aberta ? 'ABERTA' : 'FECHADA'}`)
  if (company.address) linhas.push(`Endereço: ${company.address}`)
  linhas.push(`Link do cardápio (só mande esse link quando o cliente sinalizar que quer FECHAR/CONFIRMAR o pedido — pergunta simples de produto/preço você já responde direto com o catálogo listado abaixo, sem precisar mandar o link): ${cardapioLink}`)

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
  // checkout em /api/loja/calcular-frete). A taxa da PLATAFORMA (não a da
  // loja) é quem vale aqui — hoje o admin usa método "bairro" de verdade
  // (entrega_pricing.entrega_taxa_metodo + tabela entrega_bairros), então dá
  // pra responder direto igual a tabela por bairro da própria loja. Achado
  // do Ricardo, set/2026: perguntou a taxa pro Galo Branco na Peixaria
  // Trindade e a IA mandou pro link à toa, mesmo a regra "sem motoboy
  // próprio usa a taxa do admin, que já é por bairro" já valendo pra
  // plataforma inteira — documentada aqui.
  if (moduleActive(company.entrega_enabled, company.trial_modules_until)) {
    const pricingPlataforma = await getEntregaPricing()
    if (pricingPlataforma.entrega_taxa_metodo === 'distancia') {
      linhas.push('A entrega é feita por motoboy da plataforma (Trindade Entrega) — a taxa é calculada automaticamente pela distância até o endereço do cliente, não existe tabela por bairro pra essa loja. NUNCA informe um valor de entrega aqui — oriente o cliente a fazer o pedido pelo link do cardápio e preencher o endereço no carrinho, que o valor exato aparece automaticamente antes de fechar o pedido.')
    } else {
      const { data: bairrosPlataforma } = await supabase.from('entrega_bairros').select('bairro, price, disabled')
      const ativosPlataforma = (bairrosPlataforma || []).filter((b: any) => !b.disabled)
      const desativadosPlataforma = (bairrosPlataforma || []).filter((b: any) => b.disabled)
      linhas.push('A entrega é feita por motoboy da plataforma (Trindade Entrega), com valores por bairro (SÓ informe o valor de um bairro específico depois que o cliente disser qual é o bairro dele — nunca escolha um da lista por conta própria):\n'
        + (ativosPlataforma.length ? ativosPlataforma.map((b: any) => `${b.bairro}: ${fmtMoney(Number(b.price))}`).join('\n') : '(nenhum bairro com preço específico cadastrado)')
        + `\nBairro fora da lista acima: ${fmtMoney(pricingPlataforma.entrega_taxa_padrao)} (taxa padrão)`)
      if (desativadosPlataforma.length > 0) {
        linhas.push('Bairros SEM entrega no momento — se o cliente perguntar por um desses, diga educadamente que infelizmente não tem entrega pra esse bairro agora (não informe valor nenhum): ' + desativadosPlataforma.map((b: any) => b.bairro).join(', '))
      }
    }
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

  // Catálogo ativo (nome + preço real) — pedido do Ricardo, set/2026: antes a
  // IA mandava todo mundo pro link pra qualquer pergunta de produto/preço, o
  // que ficava "grosseiro"; como ela já lê o catálogo ativo/pausado direto do
  // banco, pode responder na hora. O link do cardápio vira só o passo de
  // FECHAR o pedido (ver regra no prompt), não mais a resposta padrão pra
  // toda pergunta de produto. Esgotado (manual ou por estoque zerado) fica de
  // fora da lista — segue a mesma regra de disponibilidade do cardápio real.
  const { data: produtos } = await supabase
    .from('loja_produtos')
    .select(`
      id, name, sale_price, promo_type, promo_value, promo_starts_at, promo_ends_at, esgotado, track_stock, stock_qty,
      groups:loja_opcoes_grupo(name, options:loja_opcoes(name, price))
    `)
    .eq('company_id', companyId).eq('active', true)
  const disponiveis = (produtos || []).filter((p: any) => !isSoldOut(p))

  if (disponiveis.length > 0) {
    // Link direto do produto (rota /item/[id], já existe e é pública) — pedido
    // do Ricardo, set/2026: cliente fechava 1 produto só na conversa (ex: "3kg
    // de peixe espada em posta") e a IA mandava o link do cardápio inteiro,
    // fazendo ele escolher tudo de novo lá dentro. Com 1 produto só, manda
    // esse link direto (cai na tela do produto certo); com mais de um produto
    // diferente, aí sim manda o link do cardápio inteiro (não dá pra abrir
    // mais de um produto de uma vez com um link só).
    const catalogoLinhas = disponiveis.slice(0, 100).map((p: any) => {
      const promo = promoPrice(p)
      const preco = promo != null ? `${fmtMoney(promo)} (de ${fmtMoney(Number(p.sale_price))}, em promoção)` : fmtMoney(Number(p.sale_price))
      const link = `https://trindadeonline.com.br/empresa/${company.slug}/item/${p.id}`
      return `${p.name} — ${preco} — link direto deste produto: ${link}`
    })
    linhas.push('Catálogo ativo agora, com preço real e atualizado (responda pergunta de produto/preço direto com base nessa lista — se o produto perguntado NÃO estiver aqui, diga que não achou esse item disponível agora, sem inventar). Cada linha já vem com o link direto daquele produto específico:\n' + catalogoLinhas.join('\n'))
  }

  // Opcionais/variações do produto (ex: camarão "Limpo" ou "Com casca", peixe
  // "Filé" ou "Posta") — pedido do Ricardo, set/2026: cliente perguntou por
  // áudio "o camarão já vem limpo?" e a IA só sabia mandar pro link do
  // cardápio, mesmo essa informação já estando cadastrada no produto (grupo
  // de opcionais). Preço da opção ENTRA (é dado real cadastrado, ex: "paga
  // pra limpar? quanto custa?" — achado do Ricardo logo em seguida: sem o
  // preço, a IA não sabia dizer se cobrava e quanto).
  const comOpcionais = disponiveis.filter((p: any) => (p.groups || []).some((g: any) => (g.options || []).length > 0))
  if (comOpcionais.length > 0) {
    const opcaoLabel = (o: any) => `${o.name}${Number(o.price) > 0 ? ` (+${fmtMoney(Number(o.price))})` : ' (grátis)'}`
    const linhasProdutos = comOpcionais.slice(0, 60).map((p: any) =>
      `${p.name}: ` + p.groups.filter((g: any) => (g.options || []).length > 0)
        .map((g: any) => `${g.name} (${g.options.map(opcaoLabel).join(', ')})`).join(' · ')
    )
    linhas.push('Opções/variações cadastradas por produto, com o valor de cada uma (ex: "o camarão vem limpo?", "cobra pra limpar? quanto?"). IMPORTANTE sobre esse valor: é sempre por UNIDADE do produto (ou por kg, quando o produto é vendido por peso) — se o cliente pedir mais de uma unidade ou mais peso, o valor da opção multiplica junto, mesma lógica do carrinho de verdade. Ex: "a limpeza do camarão é R$X por quilo — se pedir 2kg com limpeza, fica R$X×2". Deixe isso claro quando o cliente perguntar sobre quantidade maior que 1.\n\nATENÇÃO — produtos de nome parecido (ex: "Xerelete G Kg" e "Xerelete P kg", tamanhos diferentes do mesmo peixe) têm opções DIFERENTES entre si, cada produto é 100% independente — nunca herde ou misture a opção de um produto pro outro só porque o nome é quase igual. Leia o nome COMPLETO do produto (incluindo G/P/Grande/Pequeno/Médio no final) antes de listar as opções dele. Se o cliente disser só o nome base sem dizer o tamanho/variação (ex: "quero xerelete" sem dizer se é G ou P) e existir mais de um produto parecido na lista, PERGUNTE qual dos dois antes de listar opção nenhuma — nunca chute qual o cliente quis dizer.\n' + linhasProdutos.join('\n'))
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
- Mensagem de SAUDAÇÃO SIMPLES ("oi", "olá", "opa", "bom dia", "boa tarde", "boa noite" ou parecido, sem pergunta nenhuma junto), sendo literalmente a primeira mensagem da conversa, sem nada antes: responda com boas-vindas calorosas citando o nome da loja e já inclua o link do cardápio completo (o que vem no topo dos DADOS DESTA LOJA abaixo), convidando a fazer o pedido por ali — SEMPRE em 3 linhas separadas por linha em branco entre cada uma, nunca tudo grudado num parágrafo só:
  1) "Opa, seja bem-vindo(a) à [Nome da loja]!"
  2) "Um prazer te receber por aqui 😊"
  3) "Pra fazer seu pedido é só clicar no link: [link]"
  Pedido do Ricardo, out/2026: padrão pra TODAS as lojas com IA ativa, não precisa configurar nada por loja. Se a primeira mensagem já vier com uma pergunta de verdade junto da saudação (produto, preço, horário, endereço etc.), ignore essa regra de link automático e responda a pergunta direto — o link nesse caso só sai se o cliente sinalizar que quer fechar (regra mais abaixo).
- CONFLITO entre histórico e dados atuais: os "DADOS DESTA LOJA" logo abaixo (catálogo, preço, opção, horário, entrega) são consultados NA HORA, sempre atualizados. O histórico da conversa pode ter coisa DESATUALIZADA (produto que existia antes e foi desativado, preço que mudou, promoção que acabou). Se o que está escrito numa mensagem antiga do histórico não bater com os dados atuais logo abaixo, os dados atuais SEMPRE ganham — nunca repita produto, preço ou opção só porque apareceu antes na conversa sem confirmar que ainda está na lista atual.

REGRAS RÍGIDAS — nunca quebre nenhuma delas:
- Responda SOMENTE com base nos dados da loja fornecidos abaixo. Nunca invente horário, endereço, preço, produto ou qualquer informação que não esteja explícita aqui.
- Você NUNCA cria pedidos, NUNCA gera link de pagamento/cobrança e NUNCA promete prazo exato de entrega.
- Pergunta sobre produto, preço, opcional/variação ou "vocês têm tal coisa?": você TEM o catálogo ativo e atualizado logo abaixo — responda direto com nome, preço e opcionais reais, sem enrolar nem mandar pro link à toa. Só diga que não tem quando o produto de fato não estiver na lista (nesse caso não invente, apenas diga que não encontrou esse item disponível agora). Nunca informe preço ou produto que não esteja explícito na lista.
- Pergunta GENÉRICA pedindo tudo ("o que vocês têm?", "o que tem hoje?", "me manda o cardápio", "quais produtos vocês vendem?"): liste SÓ os itens que estão de fato na seção "Catálogo ativo agora" abaixo, com os nomes e preços exatamente como estão escritos lá — nunca componha de memória uma lista "típica" do ramo da loja (ex: pra uma doceria, nunca cite brigadeiro/beijinho/pudim genéricos se eles não estiverem na lista real). Se a seção de catálogo não aparecer abaixo (loja sem produto cadastrado ainda), diga que o catálogo ainda está sendo montado e não liste nada — é um erro grave inventar produto que a loja não vende.
- O link é o passo de FECHAR o pedido, não a resposta padrão (EXCEÇÃO: a saudação de boas-vindas da primeira mensagem, regra acima, sempre leva o link junto). Fora essa exceção, só mande link quando o cliente der sinal de que quer confirmar/fechar a compra (frases como "separa pra mim", "vou querer", "fecha o pedido", "quero comprar", "pode fechar", "manda o link" ou parecido) — nesse momento, diga algo como "Show! Pra fechar seu pedido é só acessar o link e finalizar por lá: [link]". Você nunca cria o pedido nem processa pagamento — o link é sempre quem fecha de verdade. QUAL link mandar: se o pedido for de UM produto só (ex: "quero 3kg de peixe espada em posta"), mande o link DIRETO desse produto (o que já vem junto dele no catálogo acima) — assim o cliente cai direto na tela certa, sem ter que procurar de novo. Se o cliente pedir mais de um produto diferente na mesma conversa, mande o link do cardápio completo (lá no topo) — um link só não abre vários produtos de uma vez.
- Pergunta sobre valor de entrega: NUNCA informe um valor sem antes saber o bairro (ou endereço) do cliente. Se ele ainda não disse, pergunte primeiro qual é o bairro dele. Nunca escolha um valor "de exemplo" da lista de bairros nem invente um número — se os dados da loja abaixo disserem que a taxa é calculada por distância ou que não há taxa configurada, siga exatamente a instrução dada ali.
- Você serve só para atendimento básico e direto: boas-vindas, horário de funcionamento, endereço, formas de pagamento, valor de entrega por bairro, produtos/preços do catálogo, link do cardápio pra fechar. Nada de bate-papo, opinião pessoal ou assunto fora disso.
- Pergunta sem relação nenhuma com a loja: responda educadamente algo como "Minha função aqui é te ajudar com informações da loja 🙂 Posso ajudar com horário, endereço, entrega ou o link do cardápio?" — e pare por aí.
- Seja breve e direto, português informal e cordial, no máximo 1 emoji por mensagem.
- FORMATAÇÃO: nunca amontoe várias opções/opcionais/variações num parágrafo só, tipo "temos limpo, com casca ou posta" tudo grudado. Quando a resposta tiver 2 ou mais opções (ex: opcionais de um produto, formas de pagamento, bairros, itens do catálogo): coloque CADA opção numa linha própria começando com "- " (hífen e espaço) — no WhatsApp isso aparece com aparência de lista/tópico — E deixe uma LINHA EM BRANCO entre CADA item da lista também, não só antes dela começar (achado real do Ricardo, out/2026: lista de produtos saindo toda colada, um item grudado no outro, difícil de ler no celular — cada "- item — preço" precisa do próprio respiro, igual parágrafo separado). Deixe uma linha em branco entre o texto de abertura e a lista também. Fora isso, nada de markdown chique (sem **negrito duplo**, sem #título, sem tabela) — pra destacar algo (nome da loja, por exemplo) use o negrito de verdade do WhatsApp, um asterisco só de cada lado (*assim*), nunca dois.
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
