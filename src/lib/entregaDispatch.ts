import { createClient } from '@supabase/supabase-js'
import { moduleActive } from '@/lib/modules'
import { getEntregaPricing, getEntregaFeeForDelivery, todaySaoPaulo, matchBairroInAddress } from '@/lib/entregaPricing'
import {
  sendPlatformWhatsApp, sendMotoboyWhatsApp, sendPlatformWhatsAppImage, sendCustomerWhatsApp, ensureEntregaWebhookRegistered,
} from '@/lib/whatsapp'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.trindadeonline.com.br'

// 45s era pouco tempo pro motoboy ver a mensagem e responder — subiu pra
// 1 minuto (pedido do Ricardo, set/2026) e depois pra 2 minutos (pedido do
// Ricardo, set/2026).
const OFFER_TIMEOUT_MS = 120_000

// Reexportadas de @/lib/whatsapp (módulo sem sharp — ver o porquê lá) só
// pra quem já importava daqui não precisar trocar o caminho do import.
export { sendPlatformWhatsApp, sendMotoboyWhatsApp, sendPlatformWhatsAppImage, sendCustomerWhatsApp, ensureEntregaWebhookRegistered }

// Escolhe um motoboy NUNCA chamado nessa entrega dentro da rodada atual —
// ativo, sem oferta pendente em outra corrida (ocupado) e sem nenhuma
// oferta prévia (qualquer status) nessa RODADA (round_no). Cada motoboy
// recebe até 3 tentativas seguidas (ver offerToNextMotoboy) antes da
// próxima chamada a essa função — ela só entra em cena pra buscar alguém
// NOVO, nunca pra repetir quem já foi tentado (pedido do Ricardo, out/2026:
// "até 3 tentativas, passa pro próximo, não repete quem já esgotou").
// Rodada nova (dispatch_round) só abre de novo via retry MANUAL do lojista
// (🔁 Tentar de novo), que reabre o pool inteiro pra todo mundo de novo.
// Entre os elegíveis, chama primeiro quem está há mais tempo sem corrida
// (round-robin simples — sem geolocalização ainda).
async function pickNextMotoboy(deliveryOrderId: string, roundNo: number): Promise<{ id: string; name: string; phone: string } | null> {
  const { data: active } = await supabase.from('motoboys').select('id, name, phone, priority').eq('active', true).eq('available', true).eq('status', 'aprovado')
  if (!active || active.length === 0) return null

  const { data: pending } = await supabase.from('delivery_offers').select('motoboy_id').eq('status', 'pendente')
  const busy = new Set((pending || []).map(o => o.motoboy_id))

  const { data: tried } = await supabase.from('delivery_offers').select('motoboy_id').eq('delivery_order_id', deliveryOrderId).eq('round_no', roundNo)
  const alreadyTriedThisRound = new Set((tried || []).map(o => o.motoboy_id))

  const eligible = active.filter(m => !busy.has(m.id) && !alreadyTriedThisRound.has(m.id))
  if (eligible.length === 0) return null

  const { data: lastOffers } = await supabase
    .from('delivery_offers').select('motoboy_id, offered_at')
    .in('motoboy_id', eligible.map(m => m.id)).order('offered_at', { ascending: false })
  const lastMap = new Map<string, number>()
  for (const o of lastOffers || []) if (!lastMap.has(o.motoboy_id)) lastMap.set(o.motoboy_id, new Date(o.offered_at).getTime())

  // Motoboy marcado como preferencial (admin → Entregas → Motoboys) sempre
  // vem primeiro, antes do round-robin — pedido do Ricardo, set/2026.
  eligible.sort((a, b) => (b.priority ? 1 : 0) - (a.priority ? 1 : 0) || (lastMap.get(a.id) || 0) - (lastMap.get(b.id) || 0))
  return eligible[0]
}

// Link de busca do Google Maps a partir do endereço em texto — não temos
// lat/lng geocodado, então usa o formato de busca (funciona igual, abre com
// o pino no endereço certo tanto no app quanto no navegador). Mandado DIRETO
// na mensagem (não mais atrás do redirect curto /e/[id]/[tipo]) — o redirect
// passava pelo nosso domínio antes de chegar no Maps, e o WhatsApp abre link
// de domínio desconhecido no navegador embutido dele em vez de repassar pro
// app de mapas de verdade; o 302 lá dentro só carregava o SITE do Maps, não
// abria o aplicativo. Link cru do Google direto resolve isso (reclamação
// real do Ricardo, out/2026: "não dá pra abrir direto o Google Maps?") — o
// preço é uma URL mais longa na mensagem, aceitável.
export function mapsLink(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

// Nome da loja em linha própria, caixa alta e negrito — o motoboy lê em 3
// segundos quem é quem, em vez de vasculhar o endereço pra reconhecer o
// ponto de retirada (pedido do Ricardo, set/2026). Mensagem enxuta de
// propósito (sem link de mapa, sem nome do cliente) — nesse momento o
// motoboy só está decidindo se aceita ou não, ainda não tem nada disso pra
// usar. `valorMotoboy` (não `order.fee`) porque o que o motoboy recebe já
// sai descontado o corte da plataforma — mostrar a taxa cheia (o que o
// cliente paga) inflava a expectativa (pedido do Ricardo, set/2026).
function offerMessage(order: { pickup_address: string; dropoff_address: string; customer_name: string; fee: number }, companyName: string, prepMin: number, valorMotoboy: number): string {
  const fee = valorMotoboy.toFixed(2).replace('.', ',')
  const lines = ['🏍️ *Tem entrega!*', '', '📍 Retirar em:']
  if (companyName) lines.push(`*${companyName.toUpperCase()}*`)
  lines.push(
    order.pickup_address,
    '',
    // Prazo de preparo em negrito e linha própria — é o que diz pro motoboy
    // até quando ele tem pra chegar na loja (pedido do Ricardo, set/2026).
    `*⏱️ Fica pronto em ${prepMin} min — chega até lá!*`,
    '',
    '🏠 Entregar em:',
    order.dropoff_address,
    '',
    `Você recebe: R$ ${fee}`,
    '',
    'Responde *SIM* ou *NÃO* em até 2 minutos.',
  )
  return lines.join('\n')
}

// 2ª e 3ª tentativa pro MESMO motoboy que não respondeu a tempo — texto
// curto, sem foto, só pra lembrar. Antes a 2ª/3ª chamada repetia a mensagem
// completa de novo pro mesmo motoboy quando o pool esgotava e abria outra
// rodada, o que parecia bug pra quem recebia ("a mesma mensagem de novo",
// Ricardo, out/2026). `identificador` já vem pronto (nº do pedido quando
// veio do cardápio, ou o nome do cliente numa entrega avulsa sem pedido) —
// ver sendOfferMessage. Bairro fica de fora da frase quando o endereço não
// bate com nenhum bairro conhecido (matchBairroInAddress devolve null), em
// vez de inventar um nome.
function offerMessageShort(companyName: string, bairro: string | null, valorMotoboy: number, attemptNo: 2 | 3, identificador: string): string {
  const fee = valorMotoboy.toFixed(2).replace('.', ',')
  const ordinal = attemptNo === 2 ? '2ª' : '3ª'
  const bairroTxt = bairro ? ` pro bairro ${bairro}` : ''
  return `🏍️ *${ordinal} tentativa* — ${identificador} da ${companyName}${bairroTxt}. Você recebe R$ ${fee}. Responde SIM ou NÃO em até 2 minutos.`
}

// Recorta a foto da loja (que geralmente vem quadrada/retrato) pra um
// formato bem mais achatado — 2:1, bem mais estreito de altura do que a
// foto original — porque no WhatsApp uma foto quadrada/retrato ocupa a
// tela toda (reclamação direta do Ricardo, set/2026). `position: 'attention'`
// deixa o sharp escolher o recorte que preserva a parte mais "interessante"
// da imagem (rosto, objeto, texto) em vez de cortar sempre pelo centro.
// Path com timestamp (nunca sobrescreve) — mesma lição do recompress-photos:
// o CDN do Supabase não invalida direito quando o arquivo muda no mesmo link.
const BANNER_WIDTH = 800
const BANNER_HEIGHT = 400
async function buildDeliveryBanner(photoUrl: string, companyId: string): Promise<string | null> {
  try {
    // sharp importado sob demanda, só aqui dentro — não no topo do arquivo.
    // entregaDispatch.ts é importado (estático ou dinâmico) por várias rotas
    // que NUNCA chamam essa função (testar-oferta, webhook, tick...); um
    // import estático de sharp lá em cima crasha o carregamento do módulo
    // inteiro se o binário nativo não sobe naquele bundle específico da
    // Vercel — e isso acontece ANTES de qualquer try/catch conseguir pegar,
    // derrubando a function inteira (mesma família de bug já documentada
    // com opengraph-image.tsx). Import dinâmico aqui dentro faz a falha cair
    // dentro do try/catch de verdade — pior caso, essa função devolve null
    // e a oferta sai só com o texto, sem foto (Ricardo, set/2026 — "Testar
    // oferta" ficava preso em "Enviando..." pra sempre, sem erro nenhum).
    const sharp = (await import('sharp')).default
    const res = await fetch(photoUrl)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const out = await sharp(buf)
      .resize({ width: BANNER_WIDTH, height: BANNER_HEIGHT, fit: 'cover', position: 'attention' })
      .webp({ quality: 78 })
      .toBuffer()
    const path = `banners/${companyId}-${Date.now()}.webp`
    const { error } = await supabase.storage.from('company-photos').upload(path, out, { contentType: 'image/webp', upsert: false })
    if (error) return null
    const { data } = supabase.storage.from('company-photos').getPublicUrl(path)
    return data.publicUrl
  } catch (err) {
    console.error('[buildDeliveryBanner]', err)
    return null
  }
}

function genDeliveryCode(): string { return String(Math.floor(1000 + Math.random() * 9000)) }
// Dois códigos, sempre diferentes: um pra retirada na loja (a loja passa pro
// motoboy pessoalmente na hora de entregar o pacote) e outro pra confirmação
// com o cliente (só esse libera o pagamento). Se fossem o mesmo código, o
// motoboy já saberia o código do cliente assim que retirasse na loja — não
// confirma mais nada de verdade. Pedido do Ricardo, set/2026.
function genDeliveryCodes(): { pickupCode: string; deliveryCode: string } {
  const pickupCode = genDeliveryCode()
  let deliveryCode = genDeliveryCode()
  while (deliveryCode === pickupCode) deliveryCode = genDeliveryCode()
  return { pickupCode, deliveryCode }
}

// Cria a entrega e chama o primeiro motoboy da fila — usado tanto pelo botão
// manual "🏍️ Chamar motoboy" (/painel/pedidos) quanto pelo disparo automático
// assim que o cliente confirma um pedido de entrega no cardápio público
// (/api/loja/registrar-pedido). Não faz checagem de dono/sessão — quem chama
// já validou isso quando fizer sentido (o botão manual valida a sessão antes
// de chegar aqui; o disparo automático roda com o pedido que acabou de ser
// criado de verdade no banco, não com dado vindo direto do navegador).
export async function criarEntregaEChamarMotoboy(opts: {
  companyId: string
  pedidoId?: string | null
  customerName: string
  customerPhone?: string | null
  dropoffAddress: string
  paymentMethod?: string | null
  orderValue?: number | null
}): Promise<{ ok: true; deliveryOrderId: string; deliveryCode: string } | { ok: false; error: string }> {
  const { companyId, pedidoId, customerName, customerPhone, dropoffAddress } = opts
  let { paymentMethod, orderValue } = opts
  if (!customerName?.trim() || !dropoffAddress?.trim()) return { ok: false, error: 'dados faltando' }

  // Entrega vinculada a um pedido do próprio cardápio já tem forma de
  // pagamento e valor lá — reaproveita em vez de pedir de novo (só a
  // "Nova entrega" avulsa, sem pedido_id, exige isso no formulário).
  if (pedidoId && (paymentMethod == null || orderValue == null)) {
    const { data: pedido } = await supabase.from('loja_pedidos').select('payment_method, total').eq('id', pedidoId).maybeSingle()
    if (pedido) {
      if (paymentMethod == null) paymentMethod = pedido.payment_method
      if (orderValue == null) orderValue = pedido.total != null ? Number(pedido.total) : null
    }
  }

  const { data: company } = await supabase.from('companies').select('address, entrega_enabled, trial_modules_until, loja_lat, loja_lng').eq('id', companyId).maybeSingle()
  if (!company) return { ok: false, error: 'empresa não encontrada' }
  if (!moduleActive(company.entrega_enabled, company.trial_modules_until)) return { ok: false, error: 'Módulo de entrega não está ativo pra essa empresa.' }
  if (!company.address?.trim()) return { ok: false, error: 'Cadastre o endereço da loja no perfil antes de chamar motoboy.' }

  const { data: wallet } = await supabase.from('company_delivery_wallet').select('credits, dias_diaria_disponiveis').eq('company_id', companyId).maybeSingle()
  // Preço da corrida calculado por bairro ou distância (igual ao que cada
  // loja já usa pra cobrar o próprio cliente, mas configurado globalmente
  // pelo admin) — é o valor de fato debitado do saldo em R$ da carteira na
  // confirmação (ver src/app/api/entrega/webhook), não mais um fixo do dia.
  const { fee: entregaFee, blocked, reason } = await getEntregaFeeForDelivery(dropoffAddress, { loja_lat: company.loja_lat, loja_lng: company.loja_lng })
  if (blocked) return { ok: false, error: reason || 'Fora da área de entrega da plataforma.' }
  // Diária agora é exigida pra QUALQUER entrega, não só avulsa — Ricardo,
  // set/2026: "cobra a diária independente de qualquer coisa", pedido vindo
  // do cardápio da própria plataforma também consome. A diária em si só é
  // DESCONTADA na confirmação da entrega (ver src/app/api/entrega/webhook),
  // não aqui na criação — aqui só trava se não tiver nenhuma disponível.
  // Crédito pago antecipadamente nunca deixa de ser exigido em nenhum caso
  // — regra inegociável do Ricardo, set/2026.
  if (!wallet?.dias_diaria_disponiveis || wallet.dias_diaria_disponiveis < 1) {
    // dias_diaria_disponiveis vai a 0 assim que a 1ª entrega do dia
    // confirma — é a própria diária de hoje sendo consumida do banco de
    // dias pagos (ver src/app/api/entrega/webhook). Sem essa checagem
    // extra, a 2ª entrega do MESMO dia já pago era bloqueada aqui achando
    // que não tinha diária nenhuma, mesmo a diária de hoje já estando ativa
    // (achado real do Ricardo, set/2026 — Confeitaria da Juju: 2ª entrega
    // do dia negada por "sem diária" mesmo com crédito de sobra).
    const hoje = todaySaoPaulo()
    const { data: entreguesHoje } = await supabase
      .from('delivery_orders').select('id, delivered_at')
      .eq('company_id', companyId).eq('status', 'entregue')
      .order('delivered_at', { ascending: false }).limit(50)
    const diariaJaAtivaHoje = (entreguesHoje || []).some(o =>
      o.delivered_at && new Date(o.delivered_at).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) === hoje
    )
    if (!diariaJaAtivaHoje) {
      return { ok: false, error: 'Sem diária disponível — compra em Entrega no painel.' }
    }
  }
  // Crédito agora é saldo em R$ (não mais contador de entregas) — precisa
  // cobrir o valor real dessa corrida específica, calculado acima.
  if (!wallet?.credits || wallet.credits < entregaFee) return { ok: false, error: 'Sem crédito de entrega suficiente — compra mais em Entrega no painel.' }

  if (pedidoId) {
    // Exclui 'cancelada' — sem isso, depois de cancelar uma chamada o botão
    // "Chamar motoboy" ficava bloqueado pra sempre nesse pedido, achando que
    // já tinha uma entrega em andamento (achado real, out/2026 — Empadaí).
    // A loja pode chamar de novo quando quiser depois de cancelar.
    const { data: existing } = await supabase.from('delivery_orders').select('id').eq('pedido_id', pedidoId).neq('status', 'cancelada').maybeSingle()
    if (existing) return { ok: false, error: 'Esse pedido já tem uma entrega chamada.' }
  }

  const { pickupCode, deliveryCode } = genDeliveryCodes()
  const { data: order, error: insertErr } = await supabase.from('delivery_orders').insert({
    company_id: companyId, pedido_id: pedidoId || null, customer_name: customerName.trim(), customer_phone: customerPhone || null,
    pickup_address: company.address.trim(), dropoff_address: dropoffAddress.trim(), pickup_code: pickupCode, delivery_code: deliveryCode, fee: entregaFee,
    payment_method: paymentMethod || null, order_value: orderValue ?? null,
  }).select('id, delivery_code').single()
  if (insertErr || !order) return { ok: false, error: insertErr?.message || 'falha ao criar entrega' }

  // Entrega avulsa (sem pedido_id) não passa pelo /api/loja/registrar-pedido,
  // que já manda esse aviso pro pedido do cardápio — sem isso aqui, o
  // cliente nunca ficava sabendo do código (achado real, out/2026: Batataria
  // Família B chamou motoboy avulso e o código só aparecia pro lojista
  // dentro do painel, nunca chegava pro cliente de jeito nenhum).
  if (!pedidoId && customerPhone) {
    await sendCustomerWhatsApp(companyId, customerPhone, `🔑 Guarda esse código: *${order.delivery_code}*\nQuando o motoboy chegar, informe esse número pra ele.`)
  }

  await ensureEntregaWebhookRegistered()
  await offerToNextMotoboy(order.id, 1)

  return { ok: true, deliveryOrderId: order.id, deliveryCode: order.delivery_code }
}

// Monta a mensagem de oferta e manda pro telefone informado — usado tanto
// pelo disparo real (offerToNextMotoboy, que antes registra a oferta em
// delivery_offers) quanto pelo botão de teste do admin (que só quer ver
// como a mensagem chega, sem mexer no estado de nenhuma entrega de
// verdade; por isso sempre testa a 1ª tentativa, nunca passa attemptNo).
// `attemptNo` 1 = mensagem completa de sempre (com foto da loja quando
// tiver); 2 ou 3 = texto curto pro MESMO motoboy que não respondeu a
// tempo (ver offerMessageShort).
async function sendOfferMessage(order: { company_id: string; pickup_address: string; dropoff_address: string; customer_name: string; fee: number; pedido_id?: string | null }, deliveryOrderId: string, motoboyPhone: string, attemptNo: 1 | 2 | 3 = 1): Promise<{ ok: boolean; detail?: string }> {
  const [{ data: company }, { data: photo }, pricing] = await Promise.all([
    supabase.from('companies').select('name, loja_tempo_preparo_min').eq('id', order.company_id).maybeSingle(),
    attemptNo === 1
      ? supabase.from('company_photos').select('url').eq('company_id', order.company_id).order('order').limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    getEntregaPricing(),
  ])
  const valorMotoboy = Math.max(0, Number(order.fee) - pricing.motoboy_corte_plataforma)

  if (attemptNo !== 1) {
    // Identificador do pedido na mensagem curta: nº do pedido quando veio
    // do cardápio, nome do cliente quando é entrega avulsa sem pedido_id
    // (pedido do Ricardo, out/2026).
    let identificador = `pedido do(a) ${order.customer_name}`
    if (order.pedido_id) {
      const { data: pedido } = await supabase.from('loja_pedidos').select('order_number').eq('id', order.pedido_id).maybeSingle()
      if (pedido?.order_number) identificador = `pedido #${pedido.order_number}`
    }
    const bairro = matchBairroInAddress(order.dropoff_address)
    const text = offerMessageShort(company?.name || '', bairro, valorMotoboy, attemptNo, identificador)
    return sendMotoboyWhatsApp(motoboyPhone, text)
  }

  // Mesmo fallback de 20min usado no cálculo de frete (/api/loja/calcular-frete)
  // quando a loja não configurou o próprio tempo de preparo.
  const prepMin = company?.loja_tempo_preparo_min || 20
  const text = offerMessage(order, company?.name || '', prepMin, valorMotoboy)

  // Foto da loja (recortada em banner achatado) como preview visual — se
  // não tiver foto cadastrada, se o recorte falhar, ou se o envio de mídia
  // falhar por qualquer motivo, cai pro texto puro. A oferta PRECISA sair
  // de um jeito ou de outro, a foto é só um extra.
  let sentAsImage = false
  if (photo?.url) {
    const bannerUrl = await buildDeliveryBanner(photo.url, order.company_id)
    sentAsImage = (await sendPlatformWhatsAppImage(motoboyPhone, bannerUrl || photo.url, text)).ok
  }
  // Antes o resultado desse envio era descartado — "Testar oferta" sempre
  // dizia que tinha mandado, mesmo quando a Evolution API falhava de
  // verdade (instância caída, número errado etc). Agora devolve pra quem
  // chamou saber e mostrar o erro real (Ricardo, set/2026 — clicou em
  // "Testar oferta" e não chegou nada, sem nenhum aviso de erro).
  if (!sentAsImage) return sendMotoboyWhatsApp(motoboyPhone, text)
  return { ok: true }
}

// Chama um motoboy pra essa entrega — usado na criação, depois de um
// NÃO/expiração, e no retry manual. `roundNo` omitido = lê a rodada atual
// salva em delivery_orders (chamada "de fora", sem contexto de rodada
// ainda — criação da entrega e o retry manual).
//
// `retryMotoboyId` é o pulo do gato do redesenho de out/2026 (Ricardo:
// "a gente está enviando a mesma mensagem de novo"): quando vem preenchido
// (motoboy não respondeu a tempo), tenta mandar a PRÓXIMA tentativa pro
// MESMO motoboy (mensagem curta, 2ª ou 3ª) em vez de já pular pra outro —
// só passa pra alguém novo quando esse motoboy já esgotou as 3 tentativas
// dele nessa rodada. Recusa explícita (NÃO) nunca passa esse parâmetro —
// quem disse não não é chamado de novo pra essa corrida (ver webhook).
//
// Quando ninguém mais está elegível nessa rodada (pickNextMotoboy devolve
// null), a entrega vai pra "sem_motoboy" direto — sem reabrir o pool
// sozinho de novo (isso só acontece via retry MANUAL do lojista,
// retryMotoboyDispatch, que abre uma rodada nova). Antes disso tinha um
// auto-avanço de até 3 rodadas aqui dentro; removido porque misturava os
// dois conceitos (tentativa por motoboy vs. rodada pelo pool inteiro) e é
// exatamente a causa do "mesma mensagem de novo" — a rodada 2 reenviava a
// mensagem completa pro mesmo motoboy que já tinha recebido na rodada 1.
export async function offerToNextMotoboy(deliveryOrderId: string, sequenceNo: number, roundNo?: number, retryMotoboyId?: string) {
  const { data: order } = await supabase
    .from('delivery_orders').select('company_id, pickup_address, dropoff_address, customer_name, fee, status, dispatch_round, pedido_id')
    .eq('id', deliveryOrderId).maybeSingle()
  if (!order || order.status !== 'buscando_motoboy') return

  const round = roundNo ?? order.dispatch_round

  let motoboy: { id: string; name: string; phone: string } | null = null
  let attemptNo: 1 | 2 | 3 = 1
  if (retryMotoboyId) {
    const { count } = await supabase.from('delivery_offers').select('id', { count: 'exact', head: true })
      .eq('delivery_order_id', deliveryOrderId).eq('motoboy_id', retryMotoboyId).eq('round_no', round)
    if ((count || 0) < 3) {
      const { data: m } = await supabase.from('motoboys').select('id, name, phone').eq('id', retryMotoboyId).eq('active', true).eq('available', true).eq('status', 'aprovado').maybeSingle()
      if (m) { motoboy = m; attemptNo = ((count || 0) + 1) as 2 | 3 }
    }
  }
  if (!motoboy) {
    motoboy = await pickNextMotoboy(deliveryOrderId, round)
    attemptNo = 1
  }
  if (!motoboy) {
    // Esgotou todo mundo elegível nessa rodada — antes ficava
    // silenciosamente parado em "buscando_motoboy" pra sempre, sem a loja
    // nunca saber o motivo. Achado real: com só 2 motoboys ativos, basta
    // os 2 esgotarem as tentativas pra esgotar a fila (Ricardo, set/2026).
    // `.eq('status','buscando_motoboy')` na cláusula pra não reabrir uma
    // entrega que a loja cancelou enquanto pickNextMotoboy rodava (ver nota
    // abaixo sobre a corrida com cancelarChamadaMotoboy).
    await supabase.from('delivery_orders').update({ status: 'sem_motoboy' }).eq('id', deliveryOrderId).eq('status', 'buscando_motoboy')
    return
  }

  // Revalida bem perto da escrita final — entre a checagem do topo e aqui,
  // pickNextMotoboy/sendOfferMessage fazem várias idas ao banco, e nesse
  // intervalo a loja pode cancelar a chamada. Sem isso, a oferta saía e o
  // motoboy continuava sendo chamado mesmo depois do cancelamento (achado
  // real, out/2026 — Empadaí: motoboy recebeu o cancelamento e o sistema
  // continuou oferecendo a mesma corrida pra ele).
  const { data: freshOrder } = await supabase.from('delivery_orders').select('status').eq('id', deliveryOrderId).maybeSingle()
  if (freshOrder?.status !== 'buscando_motoboy') return

  const expiresAt = new Date(Date.now() + OFFER_TIMEOUT_MS).toISOString()
  await supabase.from('delivery_offers').insert({
    delivery_order_id: deliveryOrderId, motoboy_id: motoboy.id, sequence_no: sequenceNo, round_no: round, status: 'pendente', expires_at: expiresAt,
  })

  const sent = await sendOfferMessage(order, deliveryOrderId, motoboy.phone, attemptNo)
  // Se o envio falhar de verdade (Evolution fora do ar, etc), a oferta
  // continua pendente e só expira em 2min pro próximo motoboy — sem isso
  // registrado, essa falha nunca aparecia em lugar nenhum pra investigar.
  if (!sent.ok) console.error(`[offerToNextMotoboy] falha ao mandar oferta pro motoboy ${motoboy.id}:`, sent.detail)
}

// Reenvia a mensagem de uma entrega já existente (qualquer status) pro
// telefone informado, sem criar oferta nem mexer no fluxo real — só pra
// visualizar como a mensagem chega no WhatsApp. Usado pelo botão
// "📨 Testar oferta" no admin (Entregas → Motoboys).
export async function sendTestOfferMessage(deliveryOrderId: string, motoboyPhone: string): Promise<{ ok: boolean; error?: string }> {
  const { data: order } = await supabase
    .from('delivery_orders').select('company_id, pickup_address, dropoff_address, customer_name, fee')
    .eq('id', deliveryOrderId).maybeSingle()
  if (!order) return { ok: false, error: 'entrega não encontrada' }
  const sent = await sendOfferMessage(order, deliveryOrderId, motoboyPhone)
  if (!sent.ok) return { ok: false, error: sent.detail || 'falha ao mandar pro WhatsApp' }
  return { ok: true }
}

// Botão "🔁 Tentar de novo" em /painel/entrega, só aparece quando o status é
// sem_motoboy (esgotou todo mundo elegível na rodada atual). Cada clique
// abre 1 rodada nova (dispatch_round++) — como pickNextMotoboy só exclui
// quem já tem oferta NESSA rodada, todo mundo (inclusive quem já recusou
// ou esgotou as 3 tentativas na rodada anterior) volta a ficar elegível.
// Se essa rodada nova também não encontrar ninguém, volta direto pra
// sem_motoboy de novo (offerToNextMotoboy não reabre rodada sozinho —
// isso só acontece aqui, por ação manual do lojista).
export async function retryMotoboyDispatch(deliveryOrderId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: order } = await supabase.from('delivery_orders').select('status, dispatch_round').eq('id', deliveryOrderId).maybeSingle()
  if (!order) return { ok: false, error: 'entrega não encontrada' }
  if (order.status !== 'sem_motoboy') return { ok: false, error: 'essa entrega não está aguardando novo motoboy' }

  const { count } = await supabase.from('delivery_offers').select('id', { count: 'exact', head: true }).eq('delivery_order_id', deliveryOrderId)
  const nextRound = (order.dispatch_round || 1) + 1
  await supabase.from('delivery_orders').update({ status: 'buscando_motoboy', dispatch_round: nextRound }).eq('id', deliveryOrderId)
  await offerToNextMotoboy(deliveryOrderId, (count || 0) + 1, nextRound)
  return { ok: true }
}

// Botão "Cancelar" em /painel/pedidos — cobre as 3 fases em que uma
// entrega ainda pode ser desistida: "ainda chamando" (buscando_motoboy),
// "já aceitou, motoboy a caminho" (a_caminho) e "esgotou todo mundo, sem
// ninguém aceitar" (sem_motoboy). Essa última faltava até agora — achado
// real do Ricardo, out/2026 (Peixaria Trindade, pedido #19): depois que a
// fila de motoboys esgota, só sobrava o botão "🔁 Solicitar de novo" lá em
// cima, nenhum jeito de desistir se o cliente não quisesse mais esperar.
// Avisa quem precisa saber que a corrida caiu: motoboy com oferta
// pendente (fase 1) ou o motoboy já designado (fase 2) — em sem_motoboy
// não tem nenhum dos dois (é exatamente por isso que chegou nesse estado),
// então os dois avisos abaixo já caem fora sozinhos, sem precisar de
// nenhuma ramificação extra pra esse caso.
export async function cancelarChamadaMotoboy(deliveryOrderId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: order } = await supabase.from('delivery_orders').select('status, motoboy_phone').eq('id', deliveryOrderId).maybeSingle()
  if (!order) return { ok: false, error: 'entrega não encontrada' }
  if (order.status !== 'buscando_motoboy' && order.status !== 'a_caminho' && order.status !== 'sem_motoboy') {
    return { ok: false, error: 'essa entrega não pode mais ser cancelada' }
  }

  await supabase.from('delivery_orders').update({ status: 'cancelada' }).eq('id', deliveryOrderId)

  const { data: pending } = await supabase
    .from('delivery_offers').select('id, motoboy_id')
    .eq('delivery_order_id', deliveryOrderId).eq('status', 'pendente')
  for (const o of pending || []) {
    await supabase.from('delivery_offers').update({ status: 'expirada', responded_at: new Date().toISOString() }).eq('id', o.id)
    const { data: motoboy } = await supabase.from('motoboys').select('phone').eq('id', o.motoboy_id).maybeSingle()
    if (motoboy?.phone) await sendMotoboyWhatsApp(motoboy.phone, '❌ Essa chamada foi cancelada pela loja — não precisa buscar essa entrega.')
  }

  if (order.status === 'a_caminho' && order.motoboy_phone) {
    await sendMotoboyWhatsApp(order.motoboy_phone, '❌ Essa corrida foi cancelada pela loja — pode desconsiderar, não precisa buscar nem entregar.')
  }

  return { ok: true }
}

// Varre ofertas que estouraram o prazo sem resposta e marca como expiradas
// — chamado tanto pelo webhook (toda vez que um motoboy manda mensagem)
// quanto pelo polling do painel da loja e pelo pg_cron de minuto em minuto,
// já que não dá pra confiar só num cron 1x/dia pra um prazo de 2min.
//
// Decide pra onde vai cada expiração: se o motoboy que não respondeu ainda
// não esgotou as 3 tentativas dele nessa rodada, manda a próxima (2ª/3ª,
// texto curto) pro MESMO motoboy — sem avisar "repassei pro próximo", já
// que não repassou nada ainda. Só avisa isso e chama offerToNextMotoboy
// sem retryMotoboyId (ou seja, busca alguém NOVO) quando esse motoboy já
// esgotou as 3 (pedido do Ricardo, out/2026).
export async function checkExpiredOffers() {
  const nowIso = new Date().toISOString()
  const { data: expired } = await supabase
    .from('delivery_offers').select('id, delivery_order_id, sequence_no, round_no, motoboy_id')
    .eq('status', 'pendente').lt('expires_at', nowIso)
  for (const o of expired || []) {
    await supabase.from('delivery_offers').update({ status: 'expirada', responded_at: new Date().toISOString() }).eq('id', o.id)
    const { count } = await supabase.from('delivery_offers').select('id', { count: 'exact', head: true })
      .eq('delivery_order_id', o.delivery_order_id).eq('motoboy_id', o.motoboy_id).eq('round_no', o.round_no)
    const esgotouEsseMotoboy = (count || 0) >= 3
    if (esgotouEsseMotoboy) {
      const { data: motoboy } = await supabase.from('motoboys').select('phone').eq('id', o.motoboy_id).maybeSingle()
      if (motoboy?.phone) await sendMotoboyWhatsApp(motoboy.phone, 'Tempo esgotado — repassei essa corrida pro próximo motoboy. Fica de olho na próxima!')
      await offerToNextMotoboy(o.delivery_order_id, o.sequence_no + 1, o.round_no)
    } else {
      await offerToNextMotoboy(o.delivery_order_id, o.sequence_no + 1, o.round_no, o.motoboy_id)
    }
  }
}
