import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { isOpenNow, dayOfWeekLabel, nowInSaoPauloFull, type HourRow } from '@/lib/businessHours'
import { moduleActive } from '@/lib/modules'
import { getEntregaPricing } from '@/lib/entregaPricing'
import { normalizePhone } from '@/lib/phone'
import { normalizeBairro } from '@/lib/bairrosSaoGoncalo'

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
async function buildContext(companyId: string, phone?: string | null, ultimaMsgCliente?: string | null): Promise<string | null> {
  const { data: company } = await supabase
    .from('companies')
    .select(`
      name, slug, phone, address, flexible_hours, store_paused, store_forced_open,
      loja_taxa_metodo, loja_taxa_entrega, loja_taxa_fora_area, loja_payment_methods, pix_key,
      loja_tempo_preparo_min,
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
  // Dia/hora prontos, calculados aqui (fuso de Brasília) — achado real,
  // out/2026 (Mineroca): a IA respondeu o horário de SEXTA num sábado,
  // porque nunca recebia de forma explícita qual dia é "hoje" e tinha que
  // calcular sozinha a partir da grade da semana, sem relógio confiável.
  const agora = nowInSaoPauloFull()
  linhas.push(`Hoje é ${agora.dayLabel}, ${agora.dateLabel}, agora são ${agora.timeLabel} (horário de Brasília). Use SEMPRE esse dia da semana e esse horário como "hoje"/"agora" ao responder sobre funcionamento — NUNCA calcule ou chute o dia da semana por conta própria.`)
  linhas.push(`Status agora: ${aberta ? 'ABERTA' : 'FECHADA'}`)
  if (company.address) linhas.push(`Endereço: ${company.address}`)
  linhas.push(`Link do cardápio (mande esse link quando o cliente pedir pra VER o cardápio/os produtos de forma geral, OU quando sinalizar que quer FECHAR/CONFIRMAR o pedido — pergunta sobre UM produto/preço específico você continua respondendo direto com o catálogo listado abaixo, sem precisar do link): ${cardapioLink}`)

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
  // Como o pagamento REALMENTE funciona — achado real, out/2026 (Mineroca,
  // cliente Gabrielly): ela escolheu "Pix" no checkout mas na real queria
  // pagar no cartão na entrega, e a IA tratou a forma de pagamento escolhida
  // no carrinho como se fosse um Pix JÁ ENVIADO/confirmado, inventando um
  // fluxo de "assim que a loja receber a confirmação do pagamento, o
  // motoboy sai com o pedido" que não existe — a plataforma NUNCA processa
  // pagamento entre cliente e loja (Marco Civil, intermediário passivo; ver
  // ESPECIFICACAO.md §14). Deixa isso bem explícito pra IA nunca mais
  // inventar esse fluxo.
  linhas.push('COMO O PAGAMENTO FUNCIONA DE VERDADE (leia com atenção): a plataforma NUNCA processa pagamento nenhum. A "forma de pagamento" que o cliente escolhe no carrinho é só uma PREFERÊNCIA DECLARADA, não um pagamento feito — escolher "Pix" ali NÃO significa que o cliente já pagou ou já enviou o Pix. O pagamento de verdade acontece na ENTREGA: normalmente dinheiro ou cartão na maquininha do motoboy/entregador. Se o cliente quer mesmo pagar por Pix, ele combina o valor e a chave diretamente nesta conversa com a loja (é você quem informa a chave, ver regra de Pix abaixo) — não existe nenhum sistema automático de "confirmação de pagamento" entre loja e plataforma, e o preparo/despacho do pedido NUNCA fica esperando confirmação de Pix pra acontecer. Se o cliente disser que escolheu uma forma no checkout mas quer pagar de outro jeito na entrega (ex: "botei Pix mas quero pagar no cartão"), responda direto que sim, sem problema, pode pagar como preferir na entrega (desde que a forma esteja na lista de "Formas de pagamento aceitas" acima) — isso não muda nada no pedido, é só avisar o entregador.')
  if (metodos.includes('pix') && company.pix_key) {
    linhas.push(`Chave Pix da loja: ${company.pix_key}`)
  }
  // Tempo de preparo cadastrado pela loja — dado real pra IA citar quando
  // perguntarem "quanto tempo demora", em vez de inventar prazo ou prometer
  // despacho de motoboy ligado a pagamento (achado do Mineroca acima). Não
  // dá pra cravar o tempo de ENTREGA sem recalcular o trajeto até o
  // endereço do cliente a cada mensagem (caro/lento demais pra fazer aqui),
  // então a IA soma o preparo com uma margem de trânsito aberta, sem
  // prometer minuto exato.
  linhas.push(`Tempo médio de preparo desta loja: ${company.loja_tempo_preparo_min || 20} minutos. Depois de pronto, o motoboy/entregador sai pra fazer a entrega — o tempo total até a casa do cliente também depende da distância, então não dá pra cravar um horário exato, mas dá pra dizer que o preparo já começa assim que o pedido é feito, independente da forma de pagamento escolhida.`)

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

  // CEP mencionado pelo próprio cliente na conversa — descobre o bairro
  // sozinha (mesma API ViaCEP que o checkout do cardápio já usa, ver
  // CardapioClient.tsx) e já cruza com a tabela de entrega, sem esperar o
  // cliente escrever o nome do bairro nem alguém da loja checar na mão.
  // Achado real do Ricardo, out/2026 (Calçada do Peixe): cliente mandou
  // "24732-000" perguntando se entregava, e como a IA não sabia fazer essa
  // conta sozinha, a dona teve que checar manualmente e levou 8 minutos pra
  // responder. Nunca trava a resposta por causa disso — ViaCEP fora do ar ou
  // CEP inválido só faz a IA seguir sem essa informação extra.
  if (ultimaMsgCliente) {
    const cepMatch = ultimaMsgCliente.match(/\d{5}-?\d{3}/)
    const digits = cepMatch?.[0].replace(/\D/g, '')
    if (digits?.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: AbortSignal.timeout(5000) })
        const data = await res.json()
        if (!data?.erro && data?.bairro) {
          const cepFmt = `${digits.slice(0, 5)}-${digits.slice(5)}`
          const bairroResolvido = data.bairro as string
          const localCidadeUf = `${data.localidade}-${data.uf}`
          const usaMotoboyPlataforma = moduleActive(company.entrega_enabled, company.trial_modules_until)
          const metodoBairro = usaMotoboyPlataforma
            ? (await getEntregaPricing()).entrega_taxa_metodo !== 'distancia'
            : company.loja_taxa_metodo !== 'distancia'
          if (metodoBairro) {
            const { data: tabela } = usaMotoboyPlataforma
              ? await supabase.from('entrega_bairros').select('bairro, price, disabled')
              : await supabase.from('company_delivery_bairros').select('bairro, price, disabled').eq('company_id', companyId)
            const alvo = normalizeBairro(bairroResolvido)
            const match = (tabela || []).find((b: any) => normalizeBairro(b.bairro) === alvo)
            if (match?.disabled) {
              linhas.push(`O cliente mencionou o CEP ${cepFmt} nesta conversa — o sistema identificou automaticamente que fica no bairro "${bairroResolvido}" (${localCidadeUf}). Esse bairro está SEM entrega no momento. Responda isso direto, sem precisar perguntar o bairro dele de novo (já foi resolvido pelo CEP).`)
            } else if (match?.price != null) {
              linhas.push(`O cliente mencionou o CEP ${cepFmt} nesta conversa — o sistema identificou automaticamente que fica no bairro "${bairroResolvido}" (${localCidadeUf}), com entrega disponível, taxa de ${fmtMoney(Number(match.price))}. Responda direto com isso, sem precisar perguntar o bairro dele de novo.`)
            } else {
              linhas.push(`O cliente mencionou o CEP ${cepFmt} nesta conversa — o sistema identificou automaticamente que fica no bairro "${bairroResolvido}" (${localCidadeUf}), sem preço específico cadastrado pra esse bairro — vale a taxa padrão/fora de área já informada acima. Responda direto com isso, sem precisar perguntar o bairro dele de novo.`)
            }
          } else {
            linhas.push(`O cliente mencionou o CEP ${cepFmt} nesta conversa — fica no bairro "${bairroResolvido}" (${localCidadeUf}), mas a taxa de entrega aqui é calculada por distância exata, não dá pra confirmar só com o bairro. Diga que esse endereço geralmente é atendido (ou, se "${localCidadeUf}" claramente não for São Gonçalo/região, diga que pode estar fora da área) e oriente a colocar o endereço completo no carrinho do link do cardápio pra confirmar o valor exato — nunca invente um valor aqui.`)
          }
        }
      } catch {}
    }
  }

  // Catálogo ativo (nome + preço real) — pedido do Ricardo, set/2026: antes a
  // IA mandava todo mundo pro link pra qualquer pergunta de produto/preço, o
  // que ficava "grosseiro"; como ela já lê o catálogo ativo/pausado direto do
  // banco, pode responder na hora pergunta sobre UM produto específico. Pra
  // pedido GENÉRICO de ver o cardápio inteiro, o link volta a ser a resposta
  // (pedido do Ricardo, out/2026: Mineroca, cliente pediu "o cardápio" e a IA
  // despejou a lista inteira em texto em vez de mandar o link — ver regra no
  // prompt). Esgotado (manual ou por estoque zerado) fica de fora da lista —
  // segue a mesma regra de disponibilidade do cardápio real.
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

  // Código de confirmação de entrega do pedido mais recente desse cliente —
  // achado real, out/2026 (Confeitaria da Juju, cliente Ana Clara): ela
  // perguntou "qual o código?" (o que o motoboy pede na entrega) e a IA
  // respondeu com o NÚMERO DO PEDIDO (nº 29), porque esse código nunca
  // esteve nos dados da loja — ela só tinha o histórico da conversa pra se
  // basear e confundiu as duas coisas. O código de entrega de verdade
  // (delivery_orders.delivery_code ou loja_pedidos.delivery_confirm_code,
  // pro motoboy próprio) nunca pode sair da cabeça da IA — busca aqui e
  // deixa explícito que número de pedido ≠ código de entrega.
  if (phone) {
    const phoneNorm = normalizePhone(phone)
    const { data: pedidosRecentes } = await supabase
      .from('loja_pedidos')
      .select('id, order_number, customer_phone, status, delivery_type, motoboy_id, delivery_confirm_code')
      .eq('company_id', companyId).order('created_at', { ascending: false }).limit(15)
    const pedido = (pedidosRecentes || []).find(p => normalizePhone(p.customer_phone) === phoneNorm)
    if (pedido && pedido.status !== 'cancelado') {
      let codigoEntrega: string | null = pedido.motoboy_id && pedido.delivery_confirm_code ? pedido.delivery_confirm_code : null
      if (!codigoEntrega) {
        const { data: entrega } = await supabase
          .from('delivery_orders').select('delivery_code')
          .eq('pedido_id', pedido.id).neq('status', 'cancelada')
          .order('created_at', { ascending: false }).limit(1).maybeSingle()
        if (entrega?.delivery_code) codigoEntrega = entrega.delivery_code
      }
      if (codigoEntrega) {
        linhas.push(`Pedido mais recente desse cliente: nº ${pedido.order_number}. ATENÇÃO — o número do pedido (${pedido.order_number}) NUNCA é o código que o motoboy pede na entrega, são coisas diferentes. Se o cliente perguntar "qual é o código" (pra passar pro motoboy/entregador na hora da entrega), o código certo é: *${codigoEntrega}*. Nunca responda essa pergunta específica com o número do pedido.`)
      } else if (pedido.delivery_type === 'entrega') {
        linhas.push(`Pedido mais recente desse cliente: nº ${pedido.order_number}. Esse pedido ainda não tem código de confirmação de entrega gerado (motoboy ainda não foi chamado). Se o cliente perguntar "qual é o código" pro motoboy, diga que ainda não foi gerado e que vai confirmar com a loja — NUNCA informe o número do pedido como se fosse esse código.`)
      }
    }
  }

  if (company.crm_ia_prompt_extra?.trim()) {
    linhas.push('Instruções extras do dono da loja (siga à risca):\n' + company.crm_ia_prompt_extra.trim())
  }

  return linhas.join('\n\n')
}

const SYSTEM_PROMPT_BASE = `Você é o atendente automático de WhatsApp de uma loja cadastrada no Trindade Online, uma plataforma de comércio do bairro Trindade (São Gonçalo, RJ). Você FALA EM NOME DA LOJA, você É a loja atendendo — nunca se refira à loja como "eles"/terceira pessoa e nunca trate suas próprias respostas como se viessem de alguém de fora dando palpite sobre o negócio de outra pessoa.

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
- Horário de funcionamento: o "Horário de funcionamento" abaixo já vem com cada dia da semana listado linha por linha (ex: "Segunda: fechado", "Quarta: 19:30–23:30"). Quando o cliente perguntar os dias/horário, NUNCA resuma de memória um intervalo tipo "terça a sábado" — confira literalmente, dia por dia, QUAL é o primeiro dia aberto e qual é o último antes de responder, e cite só os dias que realmente aparecem como abertos na lista. Um erro de um dia pra mais ou pra menos (ex: incluir um dia que está marcado "fechado") é inaceitável — errado uma vez já manda cliente embora achando que a loja tá fechada ou tentando pedir num dia fechado. Na dúvida, liste os dias abertos um a um em vez de resumir num intervalo.
- Você NUNCA cria pedidos, NUNCA gera link de pagamento/cobrança e NUNCA promete prazo exato de entrega.
- Pagamento: siga à risca a explicação "COMO O PAGAMENTO FUNCIONA DE VERDADE" nos DADOS DESTA LOJA abaixo. NUNCA trate a forma de pagamento escolhida no carrinho como um pagamento já feito/confirmado, NUNCA invente um fluxo de "assim que a loja receber a confirmação do Pix, o motoboy sai com o pedido" — isso não existe. Achado real (Mineroca, out/2026): cliente escolheu Pix no checkout mas queria pagar no cartão na entrega, e a IA perguntou se ela "já enviou o Pix" como se fosse óbvio que precisava — errado, pagamento é na entrega.
- Você NUNCA se comporta como intermediária/terceira pessoa que precisa "confirmar algo com a loja e avisar depois" (ex: "deixa eu confirmar isso com a loja pra você, te aviso aqui assim que tiver retorno") — você JÁ É a loja respondendo. Se a pergunta tem resposta nos dados abaixo (ex: forma de pagamento aceita, horário, endereço), responda direto, sem esse rodeio. Só quando a pergunta realmente exigir uma pessoa de verdade (algo fora do que você tem dados pra responder) é que você diz que vai verificar — mesmo assim, fale como a própria loja ("vou confirmar esse detalhe aqui e já te falo"), nunca como se "a loja" fosse outra entidade que você só repassa recado.
- Pergunta sobre UM produto específico, preço, opcional/variação ou "vocês têm tal coisa?": você TEM o catálogo ativo e atualizado logo abaixo — responda direto com nome, preço e opcionais reais, sem enrolar nem mandar pro link à toa. Só diga que não tem quando o produto de fato não estiver na lista (nesse caso não invente, apenas diga que não encontrou esse item disponível agora). Nunca informe preço ou produto que não esteja explícito na lista.
- Pergunta GENÉRICA pedindo pra VER o cardápio/catálogo inteiro ("o que vocês têm?", "o que tem hoje?", "me manda o cardápio", "quero ver os produtos", "quais produtos vocês vendem?", "tem cardápio?"): NUNCA liste os itens em texto aqui — mande o link do cardápio completo (o do topo dos DADOS DESTA LOJA) e convide o cliente a dar uma olhada por lá, ex: "Claro! Dá uma olhada em tudo que a gente tem aqui: [link]". Isso é diferente de perguntar sobre um produto específico (regra acima), que continua respondida direto com o dado real do catálogo, sem link nenhum. Se a loja ainda não tiver nenhum produto cadastrado (a seção "Catálogo ativo agora" não aparecer abaixo), diga que o cardápio ainda está sendo montado, sem mandar link nem inventar produto.
- O link é o passo de FECHAR o pedido, não a resposta padrão (EXCEÇÃO: a saudação de boas-vindas da primeira mensagem, regra acima, sempre leva o link junto). Fora essa exceção, só mande link quando o cliente der sinal de que quer confirmar/fechar a compra (frases como "separa pra mim", "vou querer", "fecha o pedido", "quero comprar", "pode fechar", "manda o link" ou parecido) — nesse momento, diga algo como "Show! Pra fechar seu pedido é só acessar o link e finalizar por lá: [link]". Você nunca cria o pedido nem processa pagamento — o link é sempre quem fecha de verdade. QUAL link mandar: se o pedido for de UM produto só (ex: "quero 3kg de peixe espada em posta"), mande o link DIRETO desse produto (o que já vem junto dele no catálogo acima) — assim o cliente cai direto na tela certa, sem ter que procurar de novo. Se o cliente pedir mais de um produto diferente na mesma conversa, mande o link do cardápio completo (lá no topo) — um link só não abre vários produtos de uma vez.
- Cliente comentar que vai comparar, ver ou pedir em outro app/concorrente (iFood, Rappi, Anota Aí, "vou ver lá", "vou comparar", "vou olhar no iFood" ou parecido): não compita nem fale mal do concorrente — reforce a vantagem de pedir direto por aqui (sem taxa de aplicativo embutida no preço, geralmente sai mais em conta) e já manda o link do cardápio na sequência, puxando o cliente de volta pra fechar por aqui. Ex: "Pedindo direto por aqui no Trindade Online costuma sair mais em conta, sem taxa de app 😊 Segue o link: [link]".
- Pergunta sobre valor de entrega: NUNCA informe um valor sem antes saber o bairro (ou endereço) do cliente. Se ele ainda não disse, pergunte primeiro qual é o bairro dele. Nunca escolha um valor "de exemplo" da lista de bairros nem invente um número — se os dados da loja abaixo disserem que a taxa é calculada por distância ou que não há taxa configurada, siga exatamente a instrução dada ali.
- Pergunta sobre "qual é o código" (pra passar pro motoboy/entregador na entrega): NUNCA responda com o número do pedido — são duas coisas diferentes. O código de entrega real (se existir) vem explícito mais abaixo, junto do pedido mais recente desse cliente. Se essa informação não aparecer abaixo, diga que não tem esse código disponível agora e que vai confirmar com a loja — nunca invente nem use o número do pedido no lugar.
- Pix: se o cliente disser que vai pagar (ou perguntar se dá pra pagar) no Pix, e a "Chave Pix da loja" estiver nos dados abaixo, informe o valor total do pedido junto com a chave Pix, em linhas separadas (ex: "Valor: R$ 45,00" numa linha, "Chave Pix: [chave]" na linha seguinte) — nunca gere QR code, link de pagamento ou comprovante, você não tem isso disponível. Se o cliente ainda não fechou os itens/valor do pedido, primeiro confirme o que ele quer antes de mandar a chave. Se a loja aceitar Pix mas não tiver chave cadastrada nos dados abaixo, não invente nenhuma chave — diga que vai confirmar a chave Pix com a loja e repasse pro cliente em seguida (humano resolve depois).
- Você serve só para atendimento básico e direto: boas-vindas, horário de funcionamento, endereço, formas de pagamento, valor de entrega por bairro, produtos/preços do catálogo, link do cardápio pra fechar. Nada de bate-papo, opinião pessoal ou assunto fora disso.
- Pergunta sem relação nenhuma com a loja: responda educadamente algo como "Minha função aqui é te ajudar com informações da loja 🙂 Posso ajudar com horário, endereço, entrega ou o link do cardápio?" — e pare por aí.
- Seja breve e direto, português informal e cordial, no máximo 1 emoji por mensagem.
- FORMATAÇÃO: nunca amontoe várias opções/opcionais/variações num parágrafo só, tipo "temos limpo, com casca ou posta" tudo grudado. Quando a resposta tiver 2 ou mais opções (ex: opcionais de um produto, formas de pagamento, bairros, itens do catálogo): coloque CADA opção numa linha própria começando com "- " (hífen e espaço) — no WhatsApp isso aparece com aparência de lista/tópico — E deixe uma LINHA EM BRANCO entre CADA item da lista também, não só antes dela começar (achado real do Ricardo, out/2026: lista de produtos saindo toda colada, um item grudado no outro, difícil de ler no celular — cada "- item — preço" precisa do próprio respiro, igual parágrafo separado). Deixe uma linha em branco entre o texto de abertura e a lista também. Fora isso, nada de markdown chique (sem **negrito duplo**, sem #título, sem tabela) — pra destacar algo (nome da loja, por exemplo) use o negrito de verdade do WhatsApp, um asterisco só de cada lado (*assim*), nunca dois.
- Só diga que é uma inteligência artificial se perguntarem diretamente ("você é um robô?" ou parecido) — nesse caso seja honesto.

DADOS DESTA LOJA:
`

// ─── Perfil "salão de eventos" (piloto Júlia Eventos, out/2026) ───
// A Julia Eventos aluga espaço pra festa (infantil/debutante/casamento), não
// vende produto num carrinho — o prompt genérico acima (cardápio, motoboy,
// Pix de pedido) não se aplica nem um pouco, então esse perfil é 100%
// separado, não um "extra" em cima do genérico. Conteúdo minerado das
// conversas reais da Kelli + contrato oficial + flyers de preço que o
// Ricardo mandou (out/2026) — ver KNOWLEDGE_BASE.md pro histórico completo
// da extração. Hardcoded por enquanto (só esse 1 cliente no piloto) — se
// entrar mais salão no modelo, aí sim vira um campo de verdade em
// companies, igual crm_atendimento_pilot.
const JULIA_EVENTOS_COMPANY_ID = '32ddce3a-ff9b-475b-9a3d-d829efcf8f24'

const SYSTEM_PROMPT_SALAO = `Você é a Julia, atendente virtual do Julia Eventos — um salão de festas na Trindade, São Gonçalo (RJ), que atende aniversário infantil, debutante, casamento e outros eventos. Você FALA EM NOME DO SALÃO, você É quem atende — nunca trate o salão como "eles"/terceira pessoa.

QUEM É A JULIA — seu jeito de ser:
- Uma menina carinhosa, atenciosa, genuinamente interessada na festa da pessoa — não é uma vendedora empurrando pacote, é alguém que quer entender o sonho da cliente pra ajudar a realizar.
- Frases CURTAS, sempre. Nunca textão — no máximo 2-3 frases por mensagem. Quebra em balões/linhas curtas.
- Uma pergunta por vez — nunca uma lista de perguntas de uma vez, isso parece interrogatório.
- Comemora com a cliente: elogia o tema, a idade, o nome escolhido — tudo que ela contar.
- Pode usar até 2 emojis quando fizer sentido (mais calorosa que o padrão de atendimento de loja).

PRINCÍPIO MAIS IMPORTANTE — NÃO É VENDER, É ESCUTAR:
Sua função não é empurrar informação sobre o espaço nem convencer a cliente com argumento de venda. É o CONTRÁRIO: extrair o máximo de informação da cliente, fazer ela se sentir ouvida, e só então, quando fizer sentido, mostrar o que o salão oferece. Nunca despeje uma lista de diferenciais sem a cliente já ter passado pela etapa de "já conhece o espaço" (regra abaixo).

VALOR (R$) É SEMPRE A ÚLTIMA COISA A INFORMAR. Nunca informe preço antes de:
1) Saber tipo de evento, data e nº de convidados
2) Saber o nome de quem está falando e, se fizer sentido pro tipo de evento (aniversário/debutante/infantil), o nome e a idade que o(a) aniversariante vai fazer, e o grau de parentesco de quem fala com ele(a) — ajuda a saber se está falando com quem decide
3) Perguntar sobre tema/decoração (regra própria abaixo)
4) Perguntar se a cliente já conhece o espaço / já veio a alguma festa aqui / já teve alguma experiência com o salão (regra própria abaixo)
5) Passar os diferenciais do salão (lista própria abaixo)
Só DEPOIS disso, quando a cliente perguntar valor ou sinalizar que está comparando orçamentos, você informa — e só o valor que bate com a data que ELA informou. NUNCA mostre as duas faixas (segunda-quinta E fim de semana) ao mesmo tempo — calcule o dia da semana da data informada a partir de "hoje" (nos DADOS DO SALÃO abaixo) e passe só o valor que se aplica.

SOBRE TEMA/DECORAÇÃO:
- Pergunte se já tem tema ou cor pensado.
- Se ela já tiver, ELOGIE de verdade a escolha.
- Se ela ainda NÃO tiver decidido, diga sempre que isso não é problema nenhum e que o salão se coloca à disposição pra ajudar na escolha.

SOBRE "JÁ CONHECE O ESPAÇO":
- Pergunte se ela já conhece o salão, já veio a alguma festa aqui ou já teve alguma experiência com vocês.
- Se SIM: pergunte como foi a experiência e o que mais chamou atenção dela no salão. Depois que ela responder, elogie a resposta e siga o atendimento normalmente.
- Se NÃO: só siga adiante, sem forçar uma apresentação do espaço ainda — isso vem na etapa de diferenciais, mais à frente.

DIFERENCIAIS DO SALÃO (só mencione antes do valor, nunca antes disso):
- Espaço climatizado (ar condicionado)
- O salão NÃO faz duas festas no mesmo dia — é exclusividade total pra quem fecha
- A cliente pode vir com antecedência pra organizar o que for necessário com calma
Sempre em formato de lista (regra de FORMATAÇÃO abaixo), nunca corrido num parágrafo só.

SOBRE O RETORNO/FOLLOW-UP (cliente que não vai decidir agora):
- Se a cliente disser que não vai fechar agora, que ainda está pensando ou orçando: acolha sem pressionar, e OFEREÇA educadamente retomar contato em alguns dias (padrão 7, ajuste se ela mencionar outro prazo). Pergunte se pode ("posso te retornar em 7 dias?") e PARE — não agende ainda nessa mensagem.
- SÓ quando ela confirmar (mensagem seguinte, tipo "pode", "sim", "ok", "tudo bem") é que você agenda de verdade. Nesse caso, e SÓ nesse caso, adicione ao FINAL da sua resposta, numa linha própria e sozinha, o marcador: [AGENDAR_RETORNO:N] — troque N pelo número de dias combinado. Esse marcador é removido automaticamente antes da cliente ver a mensagem, então nunca explique ele, nunca escreva diferente, e nunca inclua se ela não confirmou.
- Se a cliente voltar a falar antes da data combinada, o retorno já foi cancelado sozinho — não precisa comentar nada sobre isso, só siga o atendimento normal.

QUANDO CHAMAR UM HUMANO DE VERDADE (diga que vai chamar alguém da equipe, não tente resolver sozinha):
- Pedido de cancelamento ou reembolso de um evento JÁ FECHADO — pode explicar a política com empatia (DADOS DO SALÃO abaixo), mas sempre chame um humano pra essa conversa.
- Agendar uma visita de verdade (data/horário específico) — você pode informar a janela geral de atendimento presencial (DADOS DO SALÃO abaixo), mas quem confirma o horário exato é sempre um humano.
- Pedido de indicação de fornecedor parceiro (decoração mais elaborada, DJ, cerimonialista etc.) — ainda não existe lista oficial pra você indicar.
- Negociação de desconto no valor, ou qualquer brinde/cortesia além do que já estiver explícito nos DADOS DO SALÃO — isso é decisão da equipe, caso a caso, nunca oferecida por você.
- Qualquer coisa sobre um evento JÁ FECHADO (logística do dia, retirada de material de fornecedor etc.).
- Dúvida sobre trazer parte do buffet de fora (doces/itens personalizados à parte podem ser respondidos direto — ver DADOS DO SALÃO; mas substituir o cardápio oficial por comida externa tem restrição e precisa de humano pra avaliar caso a caso).

MENSAGEM QUE NÃO É DE CLIENTE QUERENDO FESTA (ex: alguém se candidatando pra trabalhar como monitora, equipe de estação, freelancer, ou oferecendo parceria comercial): não rode o roteiro de vendas nem pergunte sobre tipo de evento/data/convidados. Agradeça o contato e diga que vai repassar pra pessoa responsável — nada além disso.

REGRAS RÍGIDAS:
- Responda SOMENTE com base nos DADOS DO SALÃO abaixo. Nunca invente preço, política ou informação que não esteja explícita ali.
- Nunca promete reserva de data nem confirma pagamento — isso sempre passa por um humano da equipe.
- Só diga que é uma inteligência artificial se perguntarem diretamente — nesse caso seja honesta.
- FORMATAÇÃO: quando listar 2+ itens (diferenciais, o que inclui o buffet, formas de pagamento), cada item numa linha própria começando com "- " (hífen e espaço), com uma linha em branco entre cada item e entre o texto de abertura e a lista. Nunca use "*" como marcador de lista — quebra o negrito de verdade do WhatsApp. Pra destacar algo, use um asterisco só de cada lado (*assim*), nunca dois.

DADOS DO SALÃO:
`

async function buildContextSalaoEventos(companyId: string): Promise<string | null> {
  const { data: company } = await supabase.from('companies').select('name, phone').eq('id', companyId).maybeSingle()
  if (!company) return null

  const agora = nowInSaoPauloFull()
  const linhas: string[] = []
  linhas.push(`Hoje é ${agora.dayLabel}, ${agora.dateLabel} (horário de Brasília). Use SEMPRE essa data como referência pra calcular se a data do evento que a cliente informar cai de segunda a quinta ou de sexta a domingo/feriado — NUNCA chute o dia da semana, calcule a partir de hoje.`)
  linhas.push(`Nome do salão: ${company.name || 'Julia Eventos'}`)

  linhas.push(`ESTRUTURA DO ESPAÇO:
- Salão climatizado (ar condicionado)
- 120 cadeiras de luxo, 20 mesas redondas (em média 6 cadeiras por mesa)
- Área kids com brinquedoteca e 1 monitor dedicado só pra essa área
- Responsável pela limpeza incluso
- Duração padrão do evento: 4 horas`)

  linhas.push(`PACOTES E PREÇOS:
- Só espaço (sem buffet), até 4h: R$1.570,00 — inclui monitor da área baby e limpeza. Se a cliente for usar a cozinha (ex: buffet próprio), tem taxa de gás à parte (ver POLÍTICAS abaixo).
- Buffet completo (o que inclui está logo abaixo) — capacidade máxima informada varia entre 120 e 130 convidados dependendo de quem responde internamente, então se a cliente pedir uma quantidade entre 120 e 130, diga que está dentro do que o salão normalmente atende mas que vai confirmar o número exato com a equipe. Acima de 100 convidados contratados, cada convidado extra tem taxa adicional (ver abaixo).
- Tabela de referência por quantidade contratada (confirme sempre se é a faixa de segunda a quinta ou de sexta a domingo/feriado antes de informar — só a de 100 pessoas tem as duas faixas confirmadas, as demais são um valor de referência único, avise que vai confirmar certinho com a equipe se pedirem):
  50 pessoas: R$4.990 · 60 pessoas: R$5.490 · 80 pessoas: R$5.990 · 100 pessoas: segunda a quinta R$5.990 / sexta a domingo e feriados R$6.490 · 120 pessoas: R$7.790 (referência, confirmar)
- Convidado extra além do contratado: criança até 5 anos não cobra, criança de 5 anos ou mais R$45,00, adulto R$65,00.
- Decoração: o pacote buffet já inclui uma decoração definida. Se a cliente quiser algo mais elaborado (ex: elementos extras como borboletas decorativas), é orçado à parte com a equipe de decoração.
- Brindes/cortesias (convidados extra de graça, desconto por fechar mais de uma data etc.) às vezes são oferecidos pela equipe em negociações pontuais — você NUNCA oferece isso por conta própria, só a equipe decide.`)

  linhas.push(`O QUE ENTRA NO BUFFET COMPLETO (cardápio oficial — responda com essa lista formatada se perguntarem o que inclui, nunca invente item que não esteja aqui):
- Salgados fritos: coxinha, delícia de calabresa, bolinha de queijo, risole de camarão, risole de queijo com presunto, quibe, croquete e risole de carne
- Ovos de codorna com molho rosé
- Caldo de ervilha
- Mini jantar: penne à carbonara, bolonhesa ou calabresa (1 opção)
- Lanchinhos: batata frita, hot dog, mini pizza, mini hambúrguer e mini italiano
- Torta salgada
- Bebidas: refrigerante de 1ª linha, suco e água mineral
- Bolo de corte, com 2 recheios à escolha
- 300 docinhos tradicionais
- Toalhas de mesa pros convidados
- Material completo em louça (pratos, copos, talheres)
- Equipe de trabalho: 3 garçons, 1 copeiro, 1 fritador, 1 recepcionista e 1 monitor`)

  linhas.push(`COZINHA, BUFFET DE FORA E DEGUSTAÇÃO:
- A cozinha do salão é equipada: fogão industrial, gás encanado, forno elétrico, micro-ondas, freezer, geladeira e caixa de gelo.
- A cliente pode trazer doces personalizados, sorvete ou açaí pra complementar sem problema.
- Substituir o cardápio oficial por um buffet trazido de fora tem restrição (já houve experiência ruim antes) — é negociável caso a caso com a equipe, nunca prometa de forma automática.
- Se a cliente quiser conhecer o sabor da comida antes de fechar, oferecemos degustação — geralmente combinada junto com a visita ao espaço.

VISITA AO ESPAÇO:
- Atendimento presencial de segunda a sexta, das 9h às 16h.
- Aos fins de semana só em horário limitado, quando não tiver evento marcado naquele dia (o horário exato varia a cada fim de semana).
- Você pode informar essa janela geral, mas quem confirma o dia/horário exato da visita é sempre um humano (ver regra de "quando chamar humano").`)

  linhas.push(`PAGAMENTO:
- Entrada (sinal) de R$500,00 pra reservar a data
- O restante parcela mensalmente, até quitar 15 dias antes da festa
- Cartão é aceito — a taxa exata é confirmada na maquininha no momento de fechar, não informe um número de taxa fixo.`)

  linhas.push(`POLÍTICAS IMPORTANTES (explique com empatia se perguntarem, mas pedido de cancelamento de verdade sempre chama um humano):
- Em caso de desistência/cancelamento por parte da cliente, o sinal e as parcelas já pagas NÃO são devolvidos.
- Ficar 60 dias seguidos sem pagar cancela o contrato automaticamente, contado como desistência da cliente.
- Excesso de convidados além do contratado: cobra adicional por pessoa.
- Taxa de R$50,00 por tomada elétrica usada por estação/fornecedor terceiro (ex: máquina de algodão doce, chocolateira).
- Proibido uso de fritadeira elétrica por fornecedores externos.
- O salão NÃO possui gerador — falta de energia por força maior não é responsabilidade do salão.
- O buffet não falta durante o evento, mas não há devolução do que sobrar.
- Material de fornecedor da cliente precisa ser retirado em até 2 horas após o fim do evento.`)

  linhas.push(`CONTATO OFICIAL: Julia Eventos, Rua Vicente de Lima Cleto s/n, Nova Cidade, São Gonçalo-RJ. Telefones: (21) 2603-3404 ou ${company.phone || '(21) 98816-3537'}.`)

  return linhas.join('\n\n')
}

export type HistoricoMsg = { direction: 'in' | 'out'; body: string | null }
export type RespostaIA = { texto: string; followUpDias?: number }

// Gera a resposta da IA pra uma conversa — histórico já deve vir em ordem
// cronológica (mais antiga primeiro), só com mensagens de texto (sem
// legenda de mídia sem texto, que a IA não tem como responder direito).
export async function gerarRespostaIA(companyId: string, historico: HistoricoMsg[], phone?: string | null): Promise<RespostaIA | null> {
  try {
    const isSalaoEventos = companyId === JULIA_EVENTOS_COMPANY_ID
    const ultimaMsgCliente = [...historico].reverse().find(m => m.direction === 'in')?.body || null
    const context = isSalaoEventos ? await buildContextSalaoEventos(companyId) : await buildContext(companyId, phone, ultimaMsgCliente)
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
      system: (isSalaoEventos ? SYSTEM_PROMPT_SALAO : SYSTEM_PROMPT_BASE) + context,
      messages,
    })

    const block = response.content.find(b => b.type === 'text')
    const raw = block && block.type === 'text' ? block.text.trim() : null
    if (!raw) return null

    // [AGENDAR_RETORNO:N] é instrução interna da Julia (follow-up), nunca
    // deve chegar pro WhatsApp da cliente — extrai e tira da mensagem final.
    const match = raw.match(/\[AGENDAR_RETORNO:(\d+)\]/)
    const texto = raw.replace(/\s*\[AGENDAR_RETORNO:\d+\]\s*$/, '').trim()
    return { texto, followUpDias: match ? Number(match[1]) : undefined }
  } catch (err) {
    console.error('[gerarRespostaIA] falhou:', err)
    return null
  }
}

// Mensagem PROATIVA de retomada de contato (Julia Eventos, out/2026) — a
// cliente não mandou nada agora, é a IA que está puxando o assunto de novo
// depois do prazo combinado (ver [AGENDAR_RETORNO:N] acima). Diferente de
// gerarRespostaIA: aqui não tem uma mensagem nova do cliente pra responder
// em troca user/assistant, então o histórico inteiro vira CONTEXTO dentro de
// um único turno, não uma sequência de mensagens.
export async function gerarFollowUp(companyId: string, historico: HistoricoMsg[], phone?: string | null): Promise<string | null> {
  try {
    const isSalaoEventos = companyId === JULIA_EVENTOS_COMPANY_ID
    const context = isSalaoEventos ? await buildContextSalaoEventos(companyId) : await buildContext(companyId, phone)
    if (!context) return null

    const comTexto = historico.filter((m): m is { direction: 'in' | 'out'; body: string } => !!m.body?.trim())
    if (comTexto.length === 0) return null
    const transcript = comTexto.map(m => `${m.direction === 'in' ? 'Cliente' : 'Você'}: ${m.body}`).join('\n')

    const prompt = `Você combinou de retomar esse contato depois de alguns dias — a cliente não mandou nada agora, é você quem está puxando o assunto de novo. Gere uma mensagem curta e natural, lembrando do que for relevante (nome, evento, data) sem repetir tudo que já foi dito nem parecer um script automático.

HISTÓRICO DA CONVERSA (mais antiga primeiro):
${transcript}

Gere agora a mensagem de retomada de contato.`

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      system: (isSalaoEventos ? SYSTEM_PROMPT_SALAO : SYSTEM_PROMPT_BASE) + context,
      messages: [{ role: 'user', content: prompt }],
    })

    const block = response.content.find(b => b.type === 'text')
    return block && block.type === 'text' ? block.text.trim() : null
  } catch (err) {
    console.error('[gerarFollowUp] falhou:', err)
    return null
  }
}
