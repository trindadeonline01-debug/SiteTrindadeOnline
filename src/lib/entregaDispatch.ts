import { createClient } from '@supabase/supabase-js'
import { moduleActive } from '@/lib/modules'
import { getTodayValues } from '@/lib/entregaPricing'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evo.trindadeonline.com.br'
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || ''
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'Trindade Online'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.trindadeonline.com.br'

const OFFER_TIMEOUT_MS = 45_000

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : '55' + digits
}

// Manda pela instância WhatsApp da PLATAFORMA (Trindade Online) — usado
// pros motoboys e também pra qualquer outro fluxo que precise mandar
// mensagem sem ser pelo número de uma empresa específica (ex: código de
// verificação do cadastro de morador). Nome mantido por compatibilidade
// com quem já importa sendMotoboyWhatsApp.
export async function sendPlatformWhatsApp(phone: string, text: string) {
  try {
    await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(EVOLUTION_INSTANCE)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
      body: JSON.stringify({ number: formatPhone(phone), text }),
    })
  } catch {}
}
export const sendMotoboyWhatsApp = sendPlatformWhatsApp

// Manda mensagem pro CLIENTE pela instância WhatsApp da PRÓPRIA loja (não a
// da plataforma) — mesma conversa do CRM dela, se estiver conectado. Sem
// instância conectada, não tem como mandar; a entrega segue normal mesmo
// assim (o cliente ainda vê o código pelo /perfil).
export async function sendCustomerWhatsApp(companyId: string, phone: string | null | undefined, text: string) {
  if (!phone) return
  try {
    const { data: instance } = await supabase
      .from('crm_whatsapp_instances').select('instance_name, api_key')
      .eq('company_id', companyId).eq('status', 'connected').limit(1).maybeSingle()
    if (!instance) return
    await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(instance.instance_name)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: instance.api_key },
      body: JSON.stringify({ number: formatPhone(phone), text }),
    })
    const { data: contact } = await supabase.from('crm_contacts').select('id').eq('company_id', companyId).eq('phone', phone).maybeSingle()
    if (contact) {
      await supabase.from('crm_messages').insert({ company_id: companyId, contact_id: contact.id, direction: 'out', body: text, status: 'sent', sent_at: new Date().toISOString() })
      await supabase.from('crm_contacts').update({ last_message_at: new Date().toISOString(), last_message_preview: text, last_message_direction: 'out' }).eq('id', contact.id)
    }
  } catch {}
}

// Self-heal do webhook da instância da PLATAFORMA (não é por empresa —
// é a mesma usada pros disparos do admin) pra receber as respostas dos
// motoboys. Só registra uma vez; guarda o "já registrei" em settings.
export async function ensureEntregaWebhookRegistered() {
  try {
    const { data } = await supabase.from('settings').select('value').eq('key', 'entrega_webhook_registered').maybeSingle()
    if (data?.value === 'true') return
    const res = await fetch(`${EVOLUTION_URL}/webhook/set/${encodeURIComponent(EVOLUTION_INSTANCE)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
      body: JSON.stringify({
        webhook: { enabled: true, url: `${SITE_URL}/api/entrega/webhook`, byEvents: false, base64: false, events: ['MESSAGES_UPSERT'] },
      }),
    })
    if (res.ok) await supabase.from('settings').upsert({ key: 'entrega_webhook_registered', value: 'true' }, { onConflict: 'key' })
  } catch {}
}

// Escolhe o próximo motoboy disponível pra uma entrega: ativo, sem oferta
// pendente em outra corrida (ocupado) e que ainda não foi chamado nessa
// mesma entrega. Entre os elegíveis, chama primeiro quem está há mais
// tempo sem corrida (round-robin simples — sem geolocalização ainda).
async function pickNextMotoboy(deliveryOrderId: string): Promise<{ id: string; name: string; phone: string } | null> {
  const { data: active } = await supabase.from('motoboys').select('id, name, phone').eq('active', true).eq('available', true).eq('status', 'aprovado')
  if (!active || active.length === 0) return null

  const { data: pending } = await supabase.from('delivery_offers').select('motoboy_id').eq('status', 'pendente')
  const busy = new Set((pending || []).map(o => o.motoboy_id))

  const { data: tried } = await supabase.from('delivery_offers').select('motoboy_id').eq('delivery_order_id', deliveryOrderId)
  const alreadyTried = new Set((tried || []).map(o => o.motoboy_id))

  const eligible = active.filter(m => !busy.has(m.id) && !alreadyTried.has(m.id))
  if (eligible.length === 0) return null

  const { data: lastOffers } = await supabase
    .from('delivery_offers').select('motoboy_id, offered_at')
    .in('motoboy_id', eligible.map(m => m.id)).order('offered_at', { ascending: false })
  const lastMap = new Map<string, number>()
  for (const o of lastOffers || []) if (!lastMap.has(o.motoboy_id)) lastMap.set(o.motoboy_id, new Date(o.offered_at).getTime())

  eligible.sort((a, b) => (lastMap.get(a.id) || 0) - (lastMap.get(b.id) || 0))
  return eligible[0]
}

// Link de busca do Google Maps a partir do endereço em texto — não temos
// lat/lng geocodado, então usa o formato de busca (funciona igual, abre com
// o pino no endereço certo tanto no app quanto no navegador).
function mapsLink(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

function offerMessage(order: { pickup_address: string; dropoff_address: string; customer_name: string; fee: number }): string {
  const fee = Number(order.fee).toFixed(2).replace('.', ',')
  return [
    '🏍️ *Tem entrega!*',
    '',
    `📍 Retirar em: ${order.pickup_address}`,
    mapsLink(order.pickup_address),
    '',
    `🏠 Entregar pra ${order.customer_name}: ${order.dropoff_address}`,
    mapsLink(order.dropoff_address),
    '',
    `Taxa: R$ ${fee}`,
    '',
    'Responde *SIM* ou *NÃO* em até 45s.',
  ].join('\n')
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

  const { data: company } = await supabase.from('companies').select('address, entrega_enabled, trial_modules_until').eq('id', companyId).maybeSingle()
  if (!company) return { ok: false, error: 'empresa não encontrada' }
  if (!moduleActive(company.entrega_enabled, company.trial_modules_until)) return { ok: false, error: 'Módulo de entrega não está ativo pra essa empresa.' }
  if (!company.address?.trim()) return { ok: false, error: 'Cadastre o endereço da loja no perfil antes de chamar motoboy.' }

  const { data: wallet } = await supabase.from('company_delivery_wallet').select('credits, daily_paid_until').eq('company_id', companyId).maybeSingle()
  const { entrega: entregaFee, today } = await getTodayValues()
  if (!wallet?.daily_paid_until || wallet.daily_paid_until < today) return { ok: false, error: 'Diária de hoje ainda não foi paga — ativa em Entrega no painel.' }
  if (!wallet?.credits || wallet.credits < 1) return { ok: false, error: 'Sem crédito de entrega — compra mais em Entrega no painel.' }

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

// Chama o próximo motoboy disponível pra essa entrega — usado na criação e
// depois de um NÃO/expiração. Se ninguém estiver livre, a entrega fica
// esperando (a loja vê "aguardando aceite") até algum motoboy ficar livre.
export async function offerToNextMotoboy(deliveryOrderId: string, sequenceNo: number) {
  const { data: order } = await supabase
    .from('delivery_orders').select('pickup_address, dropoff_address, customer_name, fee, status')
    .eq('id', deliveryOrderId).maybeSingle()
  if (!order || order.status !== 'buscando_motoboy') return

  const motoboy = await pickNextMotoboy(deliveryOrderId)
  if (!motoboy) return

  const expiresAt = new Date(Date.now() + OFFER_TIMEOUT_MS).toISOString()
  await supabase.from('delivery_offers').insert({
    delivery_order_id: deliveryOrderId, motoboy_id: motoboy.id, sequence_no: sequenceNo, status: 'pendente', expires_at: expiresAt,
  })
  await sendMotoboyWhatsApp(motoboy.phone, offerMessage(order))
}

// Varre ofertas que estouraram o prazo sem resposta, marca como expiradas
// e repassa pro próximo motoboy — chamado tanto pelo webhook (toda vez que
// um motoboy manda mensagem) quanto pelo polling do painel da loja, já que
// não dá pra confiar só num cron de minuto em minuto pra um prazo de 45s.
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
