import { createClient } from '@supabase/supabase-js'
import { moduleActive } from '@/lib/modules'
import { getEntregaPricing, getEntregaFeeForDelivery, todaySaoPaulo } from '@/lib/entregaPricing'
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

// Escolhe o próximo motoboy disponível pra uma entrega: ativo, sem oferta
// pendente em outra corrida (ocupado) e que ainda não foi chamado NESSA
// RODADA (round_no) — um motoboy que recusou na rodada 1 volta a ficar
// elegível na rodada 2, é assim que as 3 rodadas conseguem repetir o
// disparo pro pool inteiro (pedido do Ricardo, set/2026). Entre os
// elegíveis, chama primeiro quem está há mais tempo sem corrida
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
// o pino no endereço certo tanto no app quanto no navegador). Exportado pra
// ser usado pelo redirect curto em /e/[id]/[tipo].
export function mapsLink(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

// Link curto (nosso próprio domínio) que redireciona pro Maps de verdade —
// o link cru do Maps com endereço codificado passa de 100 caracteres e
// polui a mensagem/legenda; esse fica na casa de 60, mesmo com o UUID.
// Exportado: usado só na confirmação pós-aceite (webhook.ts) — antes também
// entrava na oferta inicial, mas o motoboy ainda nem decidiu se pega a
// corrida, não faz sentido mandar link de navegação pra esse momento
// (pedido do Ricardo, set/2026: "essa primeira mensagem tem que ser enxuta").
export function shortMapsLink(deliveryOrderId: string, tipo: 'r' | 'd'): string {
  return `${SITE_URL}/e/${deliveryOrderId}/${tipo}`
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
    const { data: existing } = await supabase.from('delivery_orders').select('id').eq('pedido_id', pedidoId).maybeSingle()
    if (existing) return { ok: false, error: 'Esse pedido já tem uma entrega chamada.' }
  }

  const { pickupCode, deliveryCode } = genDeliveryCodes()
  const { data: order, error: insertErr } = await supabase.from('delivery_orders').insert({
    company_id: companyId, pedido_id: pedidoId || null, customer_name: customerName.trim(), customer_phone: customerPhone || null,
    pickup_address: company.address.trim(), dropoff_address: dropoffAddress.trim(), pickup_code: pickupCode, delivery_code: deliveryCode, fee: entregaFee,
    payment_method: paymentMethod || null, order_value: orderValue ?? null,
  }).select('id, delivery_code').single()
  if (insertErr || !order) return { ok: false, error: insertErr?.message || 'falha ao criar entrega' }

  await ensureEntregaWebhookRegistered()
  await offerToNextMotoboy(order.id, 1)

  return { ok: true, deliveryOrderId: order.id, deliveryCode: order.delivery_code }
}

// Monta a mensagem de oferta (texto + foto da loja quando tiver) e manda pro
// telefone informado — usado tanto pelo disparo real (offerToNextMotoboy,
// que antes registra a oferta em delivery_offers) quanto pelo botão de
// teste do admin (que só quer ver como a mensagem chega, sem mexer no
// estado de nenhuma entrega de verdade).
async function sendOfferMessage(order: { company_id: string; pickup_address: string; dropoff_address: string; customer_name: string; fee: number }, deliveryOrderId: string, motoboyPhone: string): Promise<{ ok: boolean; detail?: string }> {
  const [{ data: company }, { data: photo }, pricing] = await Promise.all([
    supabase.from('companies').select('name, loja_tempo_preparo_min').eq('id', order.company_id).maybeSingle(),
    supabase.from('company_photos').select('url').eq('company_id', order.company_id).order('order').limit(1).maybeSingle(),
    getEntregaPricing(),
  ])
  // Mesmo fallback de 20min usado no cálculo de frete (/api/loja/calcular-frete)
  // quando a loja não configurou o próprio tempo de preparo.
  const prepMin = company?.loja_tempo_preparo_min || 20
  const valorMotoboy = Math.max(0, Number(order.fee) - pricing.motoboy_corte_plataforma)
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

// Quantas rodadas completas pelo pool inteiro de motoboys antes de
// desistir e mostrar o botão manual "🔁 Tentar de novo" pro lojista.
// Pedido do Ricardo, set/2026: antes desistia na primeira rodada.
const MAX_DISPATCH_ROUNDS = 3

// Chama o próximo motoboy disponível pra essa entrega — usado na criação e
// depois de um NÃO/expiração. `roundNo` omitido = lê a rodada atual salva
// em delivery_orders (chamada "de fora", sem contexto de rodada ainda —
// criação da entrega e o retry manual). Quando a rodada esgota sem
// ninguém aceitar, avança pra próxima rodada sozinho (até MAX_DISPATCH_ROUNDS);
// só depois disso a entrega fica esperando de vez ("sem_motoboy") e a loja
// vê o botão de tentar de novo.
export async function offerToNextMotoboy(deliveryOrderId: string, sequenceNo: number, roundNo?: number) {
  const { data: order } = await supabase
    .from('delivery_orders').select('company_id, pickup_address, dropoff_address, customer_name, fee, status, dispatch_round')
    .eq('id', deliveryOrderId).maybeSingle()
  if (!order || order.status !== 'buscando_motoboy') return

  const round = roundNo ?? order.dispatch_round
  const motoboy = await pickNextMotoboy(deliveryOrderId, round)
  if (!motoboy) {
    // Ninguém elegível nessa rodada (todo motoboy ativo já foi chamado
    // nela, sem aceitar, ou nenhum motoboy ativo existe). Ainda não é hora
    // de desistir se sobrarem rodadas — repete o disparo pro pool inteiro.
    if (round < MAX_DISPATCH_ROUNDS) {
      const nextRound = round + 1
      await supabase.from('delivery_orders').update({ dispatch_round: nextRound }).eq('id', deliveryOrderId)
      await offerToNextMotoboy(deliveryOrderId, sequenceNo, nextRound)
      return
    }
    // Esgotou as 3 rodadas — antes ficava silenciosamente parado em
    // "buscando_motoboy" pra sempre, sem a loja nunca saber o motivo. Achado
    // real: com só 2 motoboys ativos, basta os 2 não responderem pra
    // esgotar a fila (Ricardo, set/2026).
    await supabase.from('delivery_orders').update({ status: 'sem_motoboy' }).eq('id', deliveryOrderId)
    return
  }

  const expiresAt = new Date(Date.now() + OFFER_TIMEOUT_MS).toISOString()
  await supabase.from('delivery_offers').insert({
    delivery_order_id: deliveryOrderId, motoboy_id: motoboy.id, sequence_no: sequenceNo, round_no: round, status: 'pendente', expires_at: expiresAt,
  })

  const sent = await sendOfferMessage(order, deliveryOrderId, motoboy.phone)
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
// sem_motoboy (já esgotou as MAX_DISPATCH_ROUNDS automáticas). Cada clique
// abre mais 1 rodada nova pro pool inteiro — se essa rodada também não
// encontrar ninguém, volta direto pra sem_motoboy (o número da rodada já
// passou de MAX_DISPATCH_ROUNDS, então offerToNextMotoboy não tenta mais
// rodadas sozinho e devolve o controle pro lojista de novo).
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

// Varre ofertas que estouraram o prazo sem resposta, marca como expiradas
// e repassa pro próximo motoboy — chamado tanto pelo webhook (toda vez que
// um motoboy manda mensagem) quanto pelo polling do painel da loja, já que
// não dá pra confiar só num cron de minuto em minuto pra um prazo de 2min.
export async function checkExpiredOffers() {
  const nowIso = new Date().toISOString()
  const { data: expired } = await supabase
    .from('delivery_offers').select('id, delivery_order_id, sequence_no, round_no, motoboy_id')
    .eq('status', 'pendente').lt('expires_at', nowIso)
  for (const o of expired || []) {
    await supabase.from('delivery_offers').update({ status: 'expirada', responded_at: new Date().toISOString() }).eq('id', o.id)
    const { data: motoboy } = await supabase.from('motoboys').select('phone').eq('id', o.motoboy_id).maybeSingle()
    if (motoboy?.phone) await sendMotoboyWhatsApp(motoboy.phone, 'Tempo esgotado — repassei essa corrida pro próximo motoboy. Fica de olho na próxima!')
    await offerToNextMotoboy(o.delivery_order_id, o.sequence_no + 1, o.round_no)
  }
}
