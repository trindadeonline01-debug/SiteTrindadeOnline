import { supabase } from '@/lib/supabase'
import { buildReceipt, buildKitchenTicket, imprimirVias, getViasImpressao } from '@/lib/qzPrint'

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

// Imprime as vias configuradas (cupom completo e/ou via de produção — ver
// companies.impressao_vias_*) de um pedido recém-chegado. Extraído de
// /painel/pedidos pra rodar a partir do layout do painel (persiste entre
// navegações) — antes só imprimia sozinho com a tela de Pedidos aberta
// (achado real do Ricardo, set/2026). Nunca lança — falha de impressão (QZ
// Tray fechado, impressora sem papel etc.) não pode quebrar o resto do app.
//
// Trava contra duplicata (nov/2026, caso Mistura Fina — 4 folhas do mesmo
// pedido): antes de imprimir, "reivindica" o pedido gravando impresso_em só
// se ainda estiver vazio. Painel aberto em 2 aparelhos/abas disputa essa
// linha e só o primeiro imprime. Se a impressão falhar, devolve a vaga pra
// outro aparelho (ou o botão manual) tentar.
export async function autoImprimirPedido(companyName: string, pedidoId: string, printerName: string) {
  if (!printerName) return
  const vias = getViasImpressao()
  if (vias.completa === 0 && vias.producao === 0) return
  let reivindicou = false
  try {
    const { data: claim } = await supabase.from('loja_pedidos').update({ impresso_em: new Date().toISOString() }).eq('id', pedidoId).is('impresso_em', null).select('id')
    if (!claim || claim.length === 0) return // outro aparelho já pegou
    reivindicou = true
    const data = await fetchPedidoComItensComRetry(pedidoId)
    if (!data) throw new Error('pedido não encontrado')
    const items = (data.itens || []).map((it: any) => ({ qty: it.qty, pesoKg: it.peso_kg, name: it.product_name, unitPrice: it.unit_price, options: it.selected_options }))
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
    // Via de produção — sem preço, sem endereço, sem forma de pagamento, só
    // o que precisa pra produzir.
    const kitchenContent = buildKitchenTicket({
      pedidoShortId: String(data.order_number ?? data.id.slice(0, 8)),
      createdAt: data.created_at,
      deliveryType: data.delivery_type,
      items,
      notes: data.notes,
    })
    await imprimirVias(printerName, content, kitchenContent)
  } catch {
    if (reivindicou) await supabase.from('loja_pedidos').update({ impresso_em: null }).eq('id', pedidoId)
  }
}
