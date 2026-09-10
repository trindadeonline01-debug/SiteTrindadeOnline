import { supabase } from '@/lib/supabase'
import { qzPrintRaw, buildReceipt, buildKitchenTicket } from '@/lib/qzPrint'

// O checkout insere o pedido e os itens em dois inserts separados — o
// pedido é inserido primeiro, então quem escuta pedido novo (realtime ou
// reimpressão manual logo em seguida) pode pegar o pedido antes dos itens
// terminarem de salvar. Tenta de novo algumas vezes antes de desistir e
// usar o que tiver, em vez de imprimir/mostrar a seção de itens vazia.
export async function fetchPedidoComItensComRetry(pedidoId: string) {
  let data: any = null
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const { data: d } = await supabase.from('loja_pedidos').select('*, itens:loja_pedido_itens(*)').eq('id', pedidoId).single()
    data = d
    if (data?.itens?.length > 0) break
    await new Promise(r => setTimeout(r, 700))
  }
  return data
}

// Imprime as duas vias (recibo do caixa + ticket da cozinha) de um pedido
// recém-chegado. Extraído de /painel/pedidos pra rodar a partir do layout
// do painel (persiste entre navegações) — antes só imprimia sozinho com a
// tela de Pedidos aberta, porque a assinatura de realtime vivia dentro
// daquela página e morria ao trocar de tela (achado real do Ricardo,
// set/2026). Nunca lança — falha de impressão (QZ Tray fechado, impressora
// sem papel etc.) não pode quebrar o resto do app.
export async function autoImprimirPedido(companyName: string, pedidoId: string, printerName: string) {
  if (!printerName) return
  try {
    const data = await fetchPedidoComItensComRetry(pedidoId)
    if (!data) return
    const items = (data.itens || []).map((it: any) => ({ qty: it.qty, name: it.product_name, unitPrice: it.unit_price, options: it.selected_options }))
    const content = buildReceipt({
      companyName,
      pedidoShortId: String(data.order_number ?? data.id.slice(0, 8)),
      createdAt: data.created_at,
      customerName: data.customer_name,
      customerPhone: data.customer_phone,
      deliveryType: data.delivery_type,
      address: data.delivery_address,
      paymentMethod: data.payment_method,
      notes: data.notes,
      items,
      subtotal: data.subtotal,
      deliveryFee: data.delivery_fee || 0,
      total: data.total,
    })
    await qzPrintRaw(printerName, content)
    // Segunda via pra cozinha — sem preço, sem endereço, sem forma de
    // pagamento, só o que precisa pra produzir (KNOWLEDGE_BASE.md).
    const kitchenContent = buildKitchenTicket({
      pedidoShortId: String(data.order_number ?? data.id.slice(0, 8)),
      createdAt: data.created_at,
      deliveryType: data.delivery_type,
      items,
      notes: data.notes,
    })
    await qzPrintRaw(printerName, kitchenContent)
  } catch {}
}
