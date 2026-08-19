import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendMotoboyWhatsApp, sendCustomerWhatsApp, checkExpiredOffers, offerToNextMotoboy } from '@/lib/entregaDispatch'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'Trindade Online'

const YES = /^(sim|s|ok|vou|posso|aceito|topo|👍|bora)\b/
const NO = /^(n[ãa]o|n)\b/

function normalize(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
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
            .from('delivery_orders').select('pickup_address, dropoff_address, customer_name, customer_phone, company_id, delivery_code')
            .eq('id', offer.delivery_order_id).maybeSingle()
          await supabase.from('delivery_orders').update({
            status: 'a_caminho', motoboy_id: motoboy.id, motoboy_name: motoboy.name, motoboy_phone: motoboy.phone,
            assigned_at: new Date().toISOString(),
          }).eq('id', offer.delivery_order_id)
          if (order) {
            await sendMotoboyWhatsApp(
              motoboy.phone,
              `Fechado! Retirar em: ${order.pickup_address}\nEntregar pra ${order.customer_name}: ${order.dropoff_address}\n\nQuando chegar no endereço, o cliente vai te passar um código de 4 dígitos — digita ele aqui pra liberar seu pagamento.\n\nBoa corrida! 🙌`
            )
            await sendCustomerWhatsApp(
              order.company_id, order.customer_phone,
              `🏍️ Seu pedido saiu para entrega!\n\n${motoboy.name} está a caminho.\n\nSeu código de entrega: *${order.delivery_code}*\nMostre esses números pro motoboy quando ele chegar — é assim que a gente confirma a entrega.`
            )
          }
        } else if (NO.test(norm)) {
          await supabase.from('delivery_offers').update({ status: 'recusada', responded_at: new Date().toISOString() }).eq('id', offer.id)
          await offerToNextMotoboy(offer.delivery_order_id, offer.sequence_no + 1)
        } else {
          await sendMotoboyWhatsApp(motoboy.phone, 'Não entendi — responde só *SIM* ou *NÃO* pra essa entrega.')
        }
        continue
      }

      // 2) sem oferta pendente — pode ser o código de 4 dígitos de uma entrega já aceita por ele
      if (/^\d{4}$/.test(norm)) {
        const { data: order } = await supabase
          .from('delivery_orders').select('id, delivery_code, company_id, fee, customer_phone')
          .eq('motoboy_id', motoboy.id).eq('status', 'a_caminho')
          .order('assigned_at', { ascending: false }).limit(1).maybeSingle()
        if (!order) continue

        if (norm === order.delivery_code) {
          await supabase.from('delivery_orders').update({
            status: 'entregue', delivered_at: new Date().toISOString(), payout_status: 'liberado',
          }).eq('id', order.id)

          const { data: wallet } = await supabase.from('company_delivery_wallet').select('credits').eq('company_id', order.company_id).maybeSingle()
          const newCredits = Math.max(0, (wallet?.credits || 0) - 1)
          await supabase.from('company_delivery_wallet').upsert(
            { company_id: order.company_id, credits: newCredits, updated_at: new Date().toISOString() },
            { onConflict: 'company_id' }
          )
          await supabase.from('delivery_credit_ledger').insert({
            company_id: order.company_id, kind: 'consumo', credits_delta: -1, delivery_order_id: order.id,
          })

          const feeLabel = Number(order.fee).toFixed(2).replace('.', ',')
          await sendMotoboyWhatsApp(motoboy.phone, `✅ Código confere! R$ ${feeLabel} liberados. Entra no seu Pix no fechamento.`)
          await sendCustomerWhatsApp(order.company_id, order.customer_phone, `🎉 Pedido entregue! Obrigado pela preferência.`)

          const { data: company } = await supabase.from('companies').select('owner_id, name').eq('id', order.company_id).maybeSingle()
          if (company?.owner_id) {
            fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.trindadeonline.com.br'}/api/push/send`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: '🏍️ Entrega concluída', body: 'O motoboy confirmou a entrega.', target: 'external_user_id', userId: company.owner_id, url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.trindadeonline.com.br'}/painel/crm/entrega` }),
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
