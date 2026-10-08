import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  sendMotoboyWhatsApp, checkExpiredOffers, acceptOfferForMotoboy, declineOfferForMotoboy, confirmCodeForMotoboy,
} from '@/lib/entregaDispatch'

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
        .from('delivery_offers').select('id').eq('motoboy_id', motoboy.id).eq('status', 'pendente')
        .order('offered_at', { ascending: false }).limit(1).maybeSingle()

      if (offer) {
        if (YES.test(norm)) {
          // acceptOfferForMotoboy/declineOfferForMotoboy (entregaDispatch.ts)
          // são a MESMA lógica usada pelo painel do motoboy (out/2026) — só
          // muda quem chama: aqui é o SIM/NÃO do WhatsApp, lá é o botão
          // Aceitar/Recusar. Mensagem de confirmação já sai de dentro da
          // própria função.
          const r = await acceptOfferForMotoboy(motoboy.id)
          if (!r.ok) await sendMotoboyWhatsApp(motoboy.phone, 'Essa corrida não está mais disponível — já foi cancelada ou pega por outro motoboy.')
        } else if (NO.test(norm)) {
          await declineOfferForMotoboy(motoboy.id)
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
        // Motoboy pode ter mais de uma corrida "a_caminho" ao mesmo tempo —
        // aceitou uma corrida nova antes de terminar a anterior (fica
        // disponível pra oferta mesmo no meio de uma entrega). Antes essa
        // busca trazia só a corrida aceita mais recentemente (limit 1), então
        // digitar o código da corrida ANTERIOR (ainda em andamento) comparava
        // contra o código da corrida nova errada e nunca batia (achado real,
        // Ricardo set/2026 — Gustavo no meio de uma entrega, aceitou outra, e
        // o código da primeira parou de confirmar). Agora busca todas as
        // corridas dele em andamento e acha qual delas o código digitado
        // pertence de verdade — o código é que identifica a corrida, nunca
        // "a mais recente".
        const { data: orders } = await supabase
          .from('delivery_orders').select('id, delivery_code, pickup_code, picked_up_at')
          .eq('motoboy_id', motoboy.id).eq('status', 'a_caminho')
          .order('assigned_at', { ascending: false })
        if (!orders || orders.length === 0) continue

        // Pickup_code pode ser nulo numa entrega antiga que já estava em
        // andamento quando essa coluna foi criada — nesse caso só existe o
        // código de entrega mesmo, compara direto com ele (não trava entrega
        // em andamento por falta de dado retroativo).
        const order = orders.find(o => (!!o.pickup_code && !o.picked_up_at) ? norm === o.pickup_code : norm === o.delivery_code)
        if (!order) {
          const mensagem = orders.length > 1
            ? 'Esse código não confere com nenhuma das suas corridas em andamento — confirma e tenta de novo.'
            : 'Esse código não confere — confirma com o cliente e tenta de novo.'
          await sendMotoboyWhatsApp(motoboy.phone, mensagem)
          continue
        }

        // confirmCodeForMotoboy (entregaDispatch.ts) é a MESMA lógica usada
        // pelo painel do motoboy — decide sozinha se é retirada ou entrega e
        // faz todo o lado financeiro (diária, split, carteira) quando for
        // entrega. Mensagens de WhatsApp saem de dentro dela mesma, por isso
        // passa motoboy.phone aqui (o painel não passa).
        const r = await confirmCodeForMotoboy(motoboy.id, order.id, norm, motoboy.phone)
        if (!r.ok) await sendMotoboyWhatsApp(motoboy.phone, 'Esse código não confere — confirma e tenta de novo.')
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
