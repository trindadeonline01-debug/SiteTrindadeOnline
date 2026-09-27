import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendMotoboyWhatsApp, sendCustomerWhatsApp, checkExpiredOffers, offerToNextMotoboy, shortMapsLink } from '@/lib/entregaDispatch'
import { todaySaoPaulo, getEntregaPricing } from '@/lib/entregaPricing'
import { formatPhoneDisplay } from '@/lib/phone'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'Trindade Online'

const YES = /^(sim|s|ok|vou|posso|aceito|topo|👍|bora)\b/
const NO = /^(n[ãa]o|n)\b/
const PAY_LABEL: Record<string, string> = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão' }

function normalize(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Mensagem de confirmação, mandada só depois do motoboy aceitar (SIM) — nesse
// momento ele já pode ter tudo que precisa pra fazer a corrida de verdade,
// diferente da oferta inicial (enxuta de propósito, ver offerMessage em
// entregaDispatch.ts). Achado real, set/2026: motoboy leva a maquininha do
// próprio estabelecimento pro cliente pagar na entrega — sem nome, WhatsApp
// do cliente, valor do pedido e forma de pagamento aqui, ele chega sem saber
// quem procurar nem quanto/como cobrar.
async function buildAcceptedMessage(order: {
  pickup_address: string; dropoff_address: string; customer_name: string; customer_phone: string | null
  company_id: string; pedido_id: string | null; fee: number
}, deliveryOrderId: string): Promise<string> {
  const [{ data: company }, pricing] = await Promise.all([
    supabase.from('companies').select('name').eq('id', order.company_id).maybeSingle(),
    getEntregaPricing(),
  ])
  const valorMotoboy = Math.max(0, Number(order.fee) - pricing.motoboy_corte_plataforma)

  const lines = ['✅ *Corrida confirmada!*', '']
  lines.push('📍 *RETIRAR NA LOJA*')
  if (company?.name) lines.push(`• ${company.name.toUpperCase()}`)
  lines.push(`• ${order.pickup_address}`, `• 🗺️ ${shortMapsLink(deliveryOrderId, 'r')}`, '')

  lines.push('🏠 *ENTREGAR PARA*')
  lines.push(`• ${order.customer_name}`)
  if (order.customer_phone) lines.push(`• 📱 ${formatPhoneDisplay(order.customer_phone)}`)
  lines.push(`• ${order.dropoff_address}`, `• 🗺️ ${shortMapsLink(deliveryOrderId, 'd')}`, '')

  // Valor e forma de pagamento do PEDIDO (o que o cliente deve pra loja, não
  // a taxa da corrida) só existem quando a entrega veio de um pedido de
  // verdade (pedido_id) — avulsa (chamada manual sem pedido vinculado) não
  // tem esse dado pra mostrar.
  if (order.pedido_id) {
    const { data: pedido } = await supabase
      .from('loja_pedidos').select('payment_method, payment_status, total').eq('id', order.pedido_id).maybeSingle()
    if (pedido) {
      const metodo = PAY_LABEL[pedido.payment_method || ''] || pedido.payment_method || '—'
      lines.push('💳 *PAGAMENTO*')
      if (pedido.payment_status === 'pago') {
        lines.push('• ✅ Já pago — não precisa cobrar nada', `• _(${metodo})_`)
      } else {
        lines.push(`• 💵 Cobrar *R$ ${Number(pedido.total).toFixed(2).replace('.', ',')}* na entrega`, `• _(${metodo})_`)
      }
      lines.push('')
    }
  }

  lines.push(`💰 *SUA CORRIDA:* R$ ${valorMotoboy.toFixed(2).replace('.', ',')}`, '')
  lines.push('🔑 *CÓDIGOS*')
  lines.push('• Na loja: peça o código de retirada e digite aqui')
  lines.push('• Na entrega: o cliente passa outro código — digite aqui pra liberar seu pagamento', '')
  lines.push('Boa corrida! 🙌')
  return lines.join('\n')
}

// Webhook da instância da PLATAFORMA (a mesma usada pelos disparos do
// admin) — só escuta respostas de motoboy: SIM/NÃO pra uma oferta pendente,
// ou o código de 4 dígitos pra confirmar uma entrega já aceita. Qualquer
// outra mensagem nesse número (ou de quem não é motoboy) é ignorada.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const instanceName: string | undefined = body?.instance
    const event: string = (body?.event || '').toLowerCase()
    const data = body?.data
    if (instanceName !== EVOLUTION_INSTANCE) return NextResponse.json({ ok: true })

    // Reboca ofertas estouradas toda vez que esse webhook é chamado — não dá
    // pra confiar só num cron de minuto em minuto pra um prazo de 45s.
    await checkExpiredOffers()

    if (!event.includes('messages.upsert') && !event.includes('messages_upsert')) return NextResponse.json({ ok: true })

    const msgs: any[] = Array.isArray(data?.messages) ? data.messages : Array.isArray(data) ? data : data ? [data] : []
    for (const msg of msgs) {
      const remoteJid: string = msg?.key?.remoteJid || ''
      if (!remoteJid || remoteJid.includes('@g.us') || msg?.key?.fromMe) continue
      const phone = remoteJid.split('@')[0]
      const text: string | null = msg?.message?.conversation || msg?.message?.extendedTextMessage?.text || null
      if (!text) continue
      const norm = normalize(text)

      const { data: motoboy } = await supabase.from('motoboys').select('id, name, phone').eq('phone', phone).maybeSingle()
      if (!motoboy) continue

      // 1) tem oferta pendente esperando resposta dele?
      const { data: offer } = await supabase
        .from('delivery_offers').select('id, delivery_order_id, sequence_no')
        .eq('motoboy_id', motoboy.id).eq('status', 'pendente')
        .order('offered_at', { ascending: false }).limit(1).maybeSingle()

      if (offer) {
        if (YES.test(norm)) {
          await supabase.from('delivery_offers').update({ status: 'aceita', responded_at: new Date().toISOString() }).eq('id', offer.id)
          const { data: order } = await supabase
            .from('delivery_orders').select('pickup_address, dropoff_address, customer_name, customer_phone, company_id, pedido_id, fee')
            .eq('id', offer.delivery_order_id).maybeSingle()
          await supabase.from('delivery_orders').update({
            status: 'a_caminho', motoboy_id: motoboy.id, motoboy_name: motoboy.name, motoboy_phone: motoboy.phone,
            assigned_at: new Date().toISOString(),
          }).eq('id', offer.delivery_order_id)
          // O cliente só é avisado "saiu para entrega" (com o código) quando
          // a LOJA de fato marca o pedido como saiu_entrega, não quando o
          // motoboy aceita a corrida aqui — aceitar só significa que ele foi
          // buscar, o pedido pode nem estar pronto ainda (bug real, Ricardo
          // set/2026: cliente recebeu "saiu para entrega" com o pedido ainda
          // em preparo). Ver /api/loja/status-pedido, que já cobre isso.
          if (order) {
            await sendMotoboyWhatsApp(motoboy.phone, await buildAcceptedMessage(order, offer.delivery_order_id))
          }
        } else if (NO.test(norm)) {
          await supabase.from('delivery_offers').update({ status: 'recusada', responded_at: new Date().toISOString() }).eq('id', offer.id)
          await offerToNextMotoboy(offer.delivery_order_id, offer.sequence_no + 1)
        } else {
          await sendMotoboyWhatsApp(motoboy.phone, 'Não entendi — responde só *SIM* ou *NÃO* pra essa entrega.')
        }
        continue
      }

      // 2) sem oferta pendente — pode ser um dos dois códigos de 4 dígitos
      // de uma entrega já aceita por ele: primeiro o de RETIRADA (a loja
      // passa pro motoboy pessoalmente, na hora de entregar o pacote a ele),
      // só depois o do CLIENTE (só esse libera o pagamento). Pedido do
      // Ricardo, set/2026 — sem essa ordem, o motoboy aprende o código do
      // cliente já na retirada e a confirmação de entrega vira formalidade.
      if (/^\d{4}$/.test(norm)) {
        const { data: order } = await supabase
          .from('delivery_orders').select('id, delivery_code, pickup_code, picked_up_at, company_id, fee, customer_phone, pedido_id')
          .eq('motoboy_id', motoboy.id).eq('status', 'a_caminho')
          .order('assigned_at', { ascending: false }).limit(1).maybeSingle()
        if (!order) continue

        // Pickup_code pode ser nulo numa entrega antiga que já estava em
        // andamento quando essa coluna foi criada — nesse caso só existe o
        // código de entrega mesmo, segue direto pra ele (não trava entrega
        // em andamento por falta de dado retroativo).
        const precisaConfirmarRetirada = !!order.pickup_code && !order.picked_up_at
        if (precisaConfirmarRetirada) {
          if (norm === order.pickup_code) {
            await supabase.from('delivery_orders').update({ picked_up_at: new Date().toISOString() }).eq('id', order.id)
            await sendMotoboyWhatsApp(motoboy.phone, '✅ Retirada confirmada! Segue pro cliente — quando entregar, peça o código dele pra liberar seu pagamento.')
          } else {
            await sendMotoboyWhatsApp(motoboy.phone, 'Esse código não confere — confirma o código de retirada com o lojista e tenta de novo.')
          }
          continue
        }

        if (norm === order.delivery_code) {
          const pricing = await getEntregaPricing()
          // Diária e escalonamento por volume: contam TODA entrega
          // confirmada hoje pra essa empresa, não só avulsa — Ricardo,
          // set/2026: "cobra a diária independente de qualquer coisa".
          // Checa isso ANTES de marcar esse pedido como entregue, senão ele
          // mesmo já apareceria como "de hoje" na consulta (dia sem entrega
          // nenhuma não pode gastar a diária — reverte sozinho pro dia
          // seguinte porque simplesmente nunca desconta).
          const hoje = todaySaoPaulo()
          const { data: confirmadasHoje } = await supabase
            .from('delivery_orders')
            .select('id, delivered_at')
            .eq('company_id', order.company_id)
            .eq('status', 'entregue')
            .order('delivered_at', { ascending: false })
            .limit(200)
          const countHoje = (confirmadasHoje || []).filter(o =>
            o.delivered_at && new Date(o.delivered_at).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) === hoje
          ).length
          const diariaConsumidaAgora = countHoje === 0
          // Essa é a Nª confirmada do dia (1-based, contando essa mesma) —
          // a diária já cobre as `diaria_inclui` primeiras; a partir da
          // próxima, cada uma cobra um extra fixo (escalonamento por
          // volume, Ricardo set/2026: "quem usa mais paga mais").
          const numeroDoDia = countHoje + 1
          const extraVolume = numeroDoDia > pricing.diaria_inclui ? pricing.diaria_extra_valor : 0

          await supabase.from('delivery_orders').update({
            status: 'entregue', delivered_at: new Date().toISOString(), payout_status: 'liberado',
          }).eq('id', order.id)

          // Pedido do Ricardo, set/2026: código do cliente confirmado pelo
          // motoboy já fecha o pedido lá na loja também, sem precisar de
          // ninguém tocar em nada — "saiu para entrega" pula direto pra
          // "entregue" e o pagamento é dado como recebido (motoboy cobrou na
          // entrega, seja cartão, pix ou dinheiro — mesma regra que já vale
          // quando a própria loja marca "entregue" na mão: não existe
          // gateway automático aqui, o pagamento sempre acontece na hora).
          if (order.pedido_id) {
            await supabase.from('loja_pedidos').update({
              status: 'entregue', payment_status: 'pago', updated_at: new Date().toISOString(),
            }).eq('id', order.pedido_id)
          }

          // Crédito é saldo em R$ (não mais contador de entregas) — desconta
          // o valor real dessa corrida (order.fee, calculado por bairro/km na
          // criação) mais o extra de volume, quando houver.
          const { data: wallet } = await supabase.from('company_delivery_wallet').select('credits, dias_diaria_disponiveis').eq('company_id', order.company_id).maybeSingle()
          const fee = Number(order.fee) || 0
          const newCredits = Math.max(0, (wallet?.credits || 0) - fee - extraVolume)
          const walletUpdate: Record<string, any> = { company_id: order.company_id, credits: newCredits, updated_at: new Date().toISOString() }
          if (diariaConsumidaAgora) walletUpdate.dias_diaria_disponiveis = Math.max(0, (wallet?.dias_diaria_disponiveis || 0) - 1)
          await supabase.from('company_delivery_wallet').upsert(walletUpdate, { onConflict: 'company_id' })
          await supabase.from('delivery_credit_ledger').insert({
            company_id: order.company_id, kind: 'consumo', amount: -fee, credits_delta: -fee, delivery_order_id: order.id,
          })
          if (diariaConsumidaAgora) {
            await supabase.from('delivery_credit_ledger').insert({
              company_id: order.company_id, kind: 'diaria_consumo', credits_delta: 0, delivery_order_id: order.id,
            })
          }
          if (extraVolume > 0) {
            await supabase.from('delivery_credit_ledger').insert({
              company_id: order.company_id, kind: 'diaria_extra_volume', amount: -extraVolume, credits_delta: -extraVolume, delivery_order_id: order.id,
            })
          }

          // Repasse ao motoboy já sai com o corte da plataforma retido —
          // motoboy_payouts (admin) soma isso na hora de gerar o repasse.
          const valorMotoboy = Math.max(0, fee - pricing.motoboy_corte_plataforma)
          const feeLabel = valorMotoboy.toFixed(2).replace('.', ',')
          await sendMotoboyWhatsApp(motoboy.phone, `✅ Código confere! R$ ${feeLabel} liberados. Entra no seu Pix no fechamento.`)
          await sendCustomerWhatsApp(order.company_id, order.customer_phone, `🎉 Pedido entregue! Obrigado pela preferência.`)

          const { data: company } = await supabase.from('companies').select('owner_id, name').eq('id', order.company_id).maybeSingle()
          if (company?.owner_id) {
            fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.trindadeonline.com.br'}/api/push/send`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: '🏍️ Entrega concluída', body: 'O motoboy confirmou a entrega.', target: 'external_user_id', userId: company.owner_id, url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.trindadeonline.com.br'}/painel/entrega` }),
            }).catch(() => {})
          }
        } else {
          await sendMotoboyWhatsApp(motoboy.phone, 'Esse código não confere — confirma com o cliente e tenta de novo.')
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}

export async function GET() {
  return NextResponse.json({ ok: true })
}
