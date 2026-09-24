import { createClient } from '@supabase/supabase-js'
import { moduleActive } from '@/lib/modules'
import { getEntregaPricing, getEntregaFeeForDelivery } from '@/lib/entregaPricing'
import {
  sendPlatformWhatsApp, sendMotoboyWhatsApp, sendPlatformWhatsAppImage, sendCustomerWhatsApp, ensureEntregaWebhookRegistered,
} from '@/lib/whatsapp'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.trindadeonline.com.br'

// 45s era pouco tempo pro motoboy ver a mensagem e responder — subiu pra
// 1 minuto (pedido do Ricardo, set/2026).
const OFFER_TIMEOUT_MS = 60_000

// Reexportadas de @/lib/whatsapp (módulo sem sharp — ver o porquê lá) só
// pra quem já importava daqui não precisar trocar o caminho do import.
export { sendPlatformWhatsApp, sendMotoboyWhatsApp, sendPlatformWhatsAppImage, sendCustomerWhatsApp, ensureEntregaWebhookRegistered }

// Escolhe o próximo motoboy disponível pra uma entrega: ativo, sem oferta
// pendente em outra corrida (ocupado) e que ainda não foi chamado nessa
// mesma entrega. Entre os elegíveis, chama primeiro quem está há mais
// tempo sem corrida (round-robin simples — sem geolocalização ainda).
async function pickNextMotoboy(deliveryOrderId: string, opts?: { ignoreAlreadyTried?: boolean }): Promise<{ id: string; name: string; phone: string } | null> {
  const { data: active } = await supabase.from('motoboys').select('id, name, phone, priority').eq('active', true).eq('available', true).eq('status', 'aprovado')
  if (!active || active.length === 0) return null

  const { data: pending } = await supabase.from('delivery_offers').select('motoboy_id').eq('status', 'pendente')
  const busy = new Set((pending || []).map(o => o.motoboy_id))

  const { data: tried } = await supabase.from('delivery_offers').select('motoboy_id').eq('delivery_order_id', deliveryOrderId)
  const alreadyTried = new Set((tried || []).map(o => o.motoboy_id))

  const eligible = active.filter(m => !busy.has(m.id) && (opts?.ignoreAlreadyTried || !alreadyTried.has(m.id)))
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
function shortMapsLink(deliveryOrderId: string, tipo: 'r' | 'd'): string {
  return `${SITE_URL}/e/${deliveryOrderId}/${tipo}`
}

// Nome da loja em linha própria, caixa alta e negrito — o motoboy lê em 3
// segundos quem é quem, em vez de vasculhar o endereço pra reconhecer o
// ponto de retirada (pedido do Ricardo, set/2026). Endereço e link também
// cada um na sua linha — nada dividendo espaço com o rótulo antes.
function offerMessage(order: { pickup_address: string; dropoff_address: string; customer_name: string; fee: number }, deliveryOrderId: string, companyName: string, prepMin: number): string {
  const fee = Number(order.fee).toFixed(2).replace('.', ',')
  const lines = ['🏍️ *Tem entrega!*', '', '📍 Retirar em:']
  if (companyName) lines.push(`*${companyName.toUpperCase()}*`)
  lines.push(
    order.pickup_address,
    shortMapsLink(deliveryOrderId, 'r'),
    '',
    // Prazo de preparo em negrito e linha própria — é o que diz pro motoboy
    // até quando ele tem pra chegar na loja (pedido do Ricardo, set/2026).
    `*⏱️ Fica pronto em ${prepMin} min — chega até lá!*`,
    '',
    `🏠 Entregar pra ${order.customer_name}:`,
    order.dropoff_address,
    shortMapsLink(deliveryOrderId, 'd'),
    '',
    `Taxa: R$ ${fee}`,
    '',
    'Responde *SIM* ou *NÃO* em até 1 minuto.',
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
}): Promise<{ ok: true; deliveryOrderId: string; deliveryCode: string } | { ok: false; error: string }> {
  const { companyId, pedidoId, customerName, customerPhone, dropoffAddress } = opts
  if (!customerName?.trim() || !dropoffAddress?.trim()) return { ok: false, error: 'dados faltando' }

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
  // Pedido com pedido_id nasceu na própria plataforma (checkout do cardápio
  // ou "Novo Pedido" no painel) — exige só crédito carregado, sem diária.
  // Sem pedido_id é solicitação avulsa (tela "+ Nova entrega", pedido vindo
  // de fora), que continua exigindo ter diária disponível + crédito como
  // sempre foi — mas a diária só é DESCONTADA na confirmação da entrega
  // (ver src/app/api/entrega/webhook), não aqui na criação. Crédito pago
  // antecipadamente nunca deixa de ser exigido em nenhum caso — regra
  // inegociável do Ricardo, set/2026.
  if (!pedidoId && (!wallet?.dias_diaria_disponiveis || wallet.dias_diaria_disponiveis < 1)) {
    return { ok: false, error: 'Sem diária disponível — compra em Entrega no painel.' }
  }
  // Crédito agora é saldo em R$ (não mais contador de entregas) — precisa
  // cobrir o valor real dessa corrida específica, calculado acima.
  if (!wallet?.credits || wallet.credits < entregaFee) return { ok: false, error: 'Sem crédito de entrega suficiente — compra mais em Entrega no painel.' }

  if (pedidoId) {
    const { data: existing } = await supabase.from('delivery_orders').select('id').eq('pedido_id', pedidoId).maybeSingle()
    if (existing) return { ok: false, error: 'Esse pedido já tem uma entrega chamada.' }
  }

  const { data: order, error: insertErr } = await supabase.from('delivery_orders').insert({
    company_id: companyId, pedido_id: pedidoId || null, customer_name: customerName.trim(), customer_phone: customerPhone || null,
    pickup_address: company.address.trim(), dropoff_address: dropoffAddress.trim(), delivery_code: genDeliveryCode(), fee: entregaFee,
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
  const [{ data: company }, { data: photo }] = await Promise.all([
    supabase.from('companies').select('name, loja_tempo_preparo_min').eq('id', order.company_id).maybeSingle(),
    supabase.from('company_photos').select('url').eq('company_id', order.company_id).order('order').limit(1).maybeSingle(),
  ])
  // Mesmo fallback de 20min usado no cálculo de frete (/api/loja/calcular-frete)
  // quando a loja não configurou o próprio tempo de preparo.
  const prepMin = company?.loja_tempo_preparo_min || 20
  const text = offerMessage(order, deliveryOrderId, company?.name || '', prepMin)

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

// Chama o próximo motoboy disponível pra essa entrega — usado na criação e
// depois de um NÃO/expiração. Se ninguém estiver livre, a entrega fica
// esperando (a loja vê "aguardando aceite") até algum motoboy ficar livre.
export async function offerToNextMotoboy(deliveryOrderId: string, sequenceNo: number, opts?: { ignoreAlreadyTried?: boolean }) {
  const { data: order } = await supabase
    .from('delivery_orders').select('company_id, pickup_address, dropoff_address, customer_name, fee, status')
    .eq('id', deliveryOrderId).maybeSingle()
  if (!order || order.status !== 'buscando_motoboy') return

  const motoboy = await pickNextMotoboy(deliveryOrderId, opts)
  if (!motoboy) {
    // Ninguém elegível (todo mundo recusou/expirou, ou nenhum motoboy ativo
    // sobrou pra tentar) — antes ficava silenciosamente parado em
    // "buscando_motoboy" pra sempre, sem a loja nunca saber o motivo. Achado
    // real: com só 2 motoboys ativos, basta os 2 não responderem pra
    // esgotar a fila (Ricardo, set/2026).
    await supabase.from('delivery_orders').update({ status: 'sem_motoboy' }).eq('id', deliveryOrderId)
    return
  }

  const expiresAt = new Date(Date.now() + OFFER_TIMEOUT_MS).toISOString()
  await supabase.from('delivery_offers').insert({
    delivery_order_id: deliveryOrderId, motoboy_id: motoboy.id, sequence_no: sequenceNo, status: 'pendente', expires_at: expiresAt,
  })

  const sent = await sendOfferMessage(order, deliveryOrderId, motoboy.phone)
  // Se o envio falhar de verdade (Evolution fora do ar, etc), a oferta
  // continua pendente e só expira em 1min pro próximo motoboy — sem isso
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
// sem_motoboy. Reabre a busca ignorando quem já foi tentado antes nessa
// mesma entrega — sem isso, um motoboy que recusou primeiro nunca mais
// seria considerado, mesmo se agora estivesse livre de novo.
export async function retryMotoboyDispatch(deliveryOrderId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: order } = await supabase.from('delivery_orders').select('status').eq('id', deliveryOrderId).maybeSingle()
  if (!order) return { ok: false, error: 'entrega não encontrada' }
  if (order.status !== 'sem_motoboy') return { ok: false, error: 'essa entrega não está aguardando novo motoboy' }

  const { count } = await supabase.from('delivery_offers').select('id', { count: 'exact', head: true }).eq('delivery_order_id', deliveryOrderId)
  await supabase.from('delivery_orders').update({ status: 'buscando_motoboy' }).eq('id', deliveryOrderId)
  await offerToNextMotoboy(deliveryOrderId, (count || 0) + 1, { ignoreAlreadyTried: true })
  return { ok: true }
}

// Varre ofertas que estouraram o prazo sem resposta, marca como expiradas
// e repassa pro próximo motoboy — chamado tanto pelo webhook (toda vez que
// um motoboy manda mensagem) quanto pelo polling do painel da loja, já que
// não dá pra confiar só num cron de minuto em minuto pra um prazo de 1min.
export async function checkExpiredOffers() {
  const nowIso = new Date().toISOString()
  const { data: expired } = await supabase
    .from('delivery_offers').select('id, delivery_order_id, sequence_no, motoboy_id')
    .eq('status', 'pendente').lt('expires_at', nowIso)
  for (const o of expired || []) {
    await supabase.from('delivery_offers').update({ status: 'expirada', responded_at: new Date().toISOString() }).eq('id', o.id)
    const { data: motoboy } = await supabase.from('motoboys').select('phone').eq('id', o.motoboy_id).maybeSingle()
    if (motoboy?.phone) await sendMotoboyWhatsApp(motoboy.phone, 'Tempo esgotado — repassei essa corrida pro próximo motoboy. Fica de olho na próxima!')
    await offerToNextMotoboy(o.delivery_order_id, o.sequence_no + 1)
  }
}
