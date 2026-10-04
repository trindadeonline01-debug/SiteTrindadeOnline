import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { moduleActive } from '@/lib/modules'
import { normalizePhone } from '@/lib/phone'
import { notifyOwnerNewOrder, sendCustomerWhatsApp } from '@/lib/whatsapp'
import { buildOwnerMessage } from '@/lib/orderMessages'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PAY_LABEL: Record<string, string> = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão' }

type OrderItem = { name: string; qty: number; unitPrice: number; modifiers?: { name: string; price: number }[] }
type OrderInfo = {
  items: OrderItem[]
  subtotal: number; deliveryFee: number; total: number
  paymentMethod: string | null; deliveryType: string | null; address: string | null; notes: string | null
  orderNumber: number | string | null; pedidoId: string | null
}

function itemLines(items: OrderItem[]): string[] {
  const fmt = (n: number) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',')
  return items.map(it => {
    const mods = (it.modifiers || []).map(m => m.name).join(', ')
    return `• ${it.qty}x ${it.name}${mods ? ` (${mods})` : ''} — ${fmt(it.unitPrice * it.qty)}`
  })
}

// Mensagem que o CLIENTE recebe, confirmando o pedido dele.
function buildCustomerMessage(opts: OrderInfo): string {
  const fmt = (n: number) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',')
  const parts = ['🧾 *Pedido recebido!*']
  if (opts.orderNumber != null) parts.push(`📦 Pedido nº ${opts.orderNumber}`)
  parts.push('', ...itemLines(opts.items), '', `Subtotal: ${fmt(opts.subtotal)}`)
  if (opts.deliveryFee > 0) parts.push(`Taxa de entrega: ${fmt(opts.deliveryFee)}`)
  parts.push(`*Total: ${fmt(opts.total)}*`, '')
  if (opts.paymentMethod) {
    parts.push(`💳 Pagamento: ${PAY_LABEL[opts.paymentMethod] || opts.paymentMethod}`)
    // Sem isso o cliente não tem como saber que o site não cobra nada agora
    // — reforça o mesmo aviso já mostrado na tela de checkout (Ricardo, set/2026).
    parts.push(opts.deliveryType === 'entrega' ? '_(cobrado na entrega, não é pago agora)_' : '_(cobrado na retirada, não é pago agora)_')
  }
  parts.push(opts.deliveryType === 'entrega' && opts.address ? `🚚 Entrega: ${opts.address}` : '🏪 Retirada no local')
  if (opts.notes) parts.push(`📝 Obs: ${opts.notes}`)
  parts.push('', 'Assim que confirmarmos, te avisamos por aqui!')
  // Link de acompanhamento — pedido do Ricardo, set/2026: cliente vê o
  // status ao vivo e pode pedir cancelamento sem precisar falar com
  // ninguém, sem precisar estar logado (o id na URL já é a credencial).
  if (opts.pedidoId) {
    const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.trindadeonline.com.br'
    parts.push('', `📲 Acompanhe aqui: ${site}/pedido/${opts.pedidoId}`)
  }
  return parts.join('\n')
}

// Chamado (fire-and-forget) logo após um pedido ser criado no cardápio público
// ou lançado avulso no painel. Roda com service role porque o cliente final não
// tem permissão de escrita em crm_contacts/loja_produtos (RLS restringe ao dono).
export async function POST(req: NextRequest) {
  try {
    const {
      companyId, pedidoId, phone: rawPhone, name, address, total, items,
      subtotal, deliveryFee, paymentMethod, deliveryType, notes,
      // true quando quem chamou (criar-pedido, cardápio público) JÁ mandou o
      // aviso pro dono direto, no próprio processo — evita duplicar (ver
      // comentário mais abaixo, e o comentário em criar-pedido/route.ts).
      skipOwnerNotify,
    } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'companyId obrigatório' }, { status: 400 })
    const phone = rawPhone ? normalizePhone(rawPhone) : null

    if (phone) {
      const { data: existing } = await supabase
        .from('crm_contacts').select('total_orders, total_spent, address')
        .eq('company_id', companyId).eq('phone', phone).maybeSingle()
      await supabase.from('crm_contacts').upsert({
        company_id: companyId, phone, name: name || null,
        address: address || existing?.address || null,
        last_purchase_at: new Date().toISOString(),
        total_orders: (existing?.total_orders || 0) + 1,
        total_spent: Number(existing?.total_spent || 0) + Number(total || 0),
      }, { onConflict: 'company_id,phone' })
    }

    // Contador "total_pedidos" de cada produto — antes fazia 1 leitura + 1
    // gravação POR ITEM, em sequência (pedido de 5 itens = 10 idas ao banco
    // uma esperando a outra, achado numa auditoria de performance, set/2026).
    // Agora: 1 leitura só (todos os produtos de uma vez) + gravações em
    // paralelo. Soma as quantidades por produto antes de ler — se o mesmo
    // produto aparecer 2x no carrinho (variações diferentes), sem isso as
    // duas gravações partiriam do mesmo valor lido e uma pisaria na outra.
    if (Array.isArray(items)) {
      const qtyByProduto = new Map<string, number>()
      for (const it of items) {
        if (!it?.produtoId || !it?.qty) continue
        qtyByProduto.set(it.produtoId, (qtyByProduto.get(it.produtoId) || 0) + Number(it.qty))
      }
      if (qtyByProduto.size > 0) {
        const { data: produtos } = await supabase.from('loja_produtos').select('id, total_pedidos').in('id', [...qtyByProduto.keys()])
        await Promise.all((produtos || []).map(p =>
          supabase.from('loja_produtos').update({ total_pedidos: (p.total_pedidos || 0) + (qtyByProduto.get(p.id) || 0) }).eq('id', p.id)
        ))
      }
    }

    // Confirmação do pedido por WhatsApp de verdade — só quando a loja tem o
    // CRM ativo e conectado, e a gente recebeu os itens com nome/preço (o
    // avulso, o pedido pela conversa e o checkout público mandam isso;
    // chamadas antigas sem esses campos simplesmente pulam essa parte, sem
    // quebrar o resto da rota).
    if (Array.isArray(items) && items.length > 0 && items.every((it: any) => it.name && it.unitPrice != null)) {
      const { data: company } = await supabase.from('companies').select('owner_id, crm_whatsapp_enabled, trial_modules_until').eq('id', companyId).maybeSingle()
      if (company && moduleActive(company.crm_whatsapp_enabled, company.trial_modules_until)) {
        const { data: pedidoRow } = pedidoId
          ? await supabase.from('loja_pedidos').select('order_number').eq('id', pedidoId).maybeSingle()
          : { data: null }
        const orderInfo = {
          items, subtotal: Number(subtotal ?? total ?? 0), deliveryFee: Number(deliveryFee || 0), total: Number(total || 0),
          paymentMethod: paymentMethod || null, deliveryType: deliveryType || null, address: address || null, notes: notes || null,
          orderNumber: pedidoRow?.order_number ?? null, pedidoId: pedidoId || null,
        }

        // Pro cliente — antes só mandava se a loja tivesse instância própria
        // CONECTADA (checava isso antes de entrar aqui); loja sem WhatsApp
        // escaneado não mandava "Pedido recebido!" pra ninguém, de jeito
        // nenhum (achado real, out/2026: JBurger sem escanear, cliente não
        // recebeu nada). sendCustomerWhatsApp (lib/whatsapp.ts) já resolve
        // sozinha — usa a instância da loja se tiver, senão cai pro número
        // da plataforma — não precisa mais checar "instance" aqui antes.
        if (phone) {
          await sendCustomerWhatsApp(companyId, phone, buildCustomerMessage(orderInfo))
        }

        // Pro dono — notifyOwnerNewOrder (lib/whatsapp.ts) também já resolve
        // sozinha (perfil ou número escaneado, sempre via instância da
        // plataforma) — mesmo motivo, não depende de "instance" aqui.
        // Pulado quando criar-pedido (cardápio público) já mandou direto —
        // achado real, out/2026 (Michelly Bem Doce): esse aviso dependia
        // de criar-pedido chamar ESSA rota via fetch servidor-pra-servidor
        // pra sair, e esse fetch podia falhar calado, sem log nenhum
        // (ver notifyOwnerNewOrder em src/lib/whatsapp.ts pro raciocínio
        // completo). Continua vivo aqui pro avulso/balcão (chamado direto
        // de /painel/pedidos, sem esse salto), que não tem outro jeito de
        // mandar esse aviso.
        if (!skipOwnerNotify) {
          const ownerText = buildOwnerMessage({ ...orderInfo, customerName: name || 'Cliente', customerPhone: phone || null })
          const result = await notifyOwnerNewOrder(companyId, ownerText)
          if (!result.ok) console.error('[registrar-pedido] aviso pro dono falhou:', result.detail)
        }
      }
    }

    // O motoboy da PLATAFORMA (Trindade Entrega) NÃO é mais chamado aqui, na
    // criação do pedido — pedido do Ricardo, out/2026: "vamos chamar o
    // motoboy só quando o pedido for pra em preparo... aí a gente já sabe
    // que a pessoa já viu, já solicitou". Antes esse disparo acontecia
    // imediatamente ao cair o pedido, antes de a loja sequer aceitar. Quem
    // chama agora é só o cliente (painel/pedidos e painel/cozinha), no
    // exato momento em que o status vira "em_preparo" — maybeAutoChamarMotoboy
    // nos dois, acionado tanto pelo aceite manual quanto pelo avanço de
    // status. Continua respeitando a chavinha `entrega_chamada_automatica`
    // (lida ali no cliente, não aqui).

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[registrar-pedido] falha geral:', err?.message || err)
    return NextResponse.json({ error: 'falha ao registrar' }, { status: 500 })
  }
}
