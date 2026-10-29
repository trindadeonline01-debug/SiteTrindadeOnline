import { supabase } from '../supabase';
import { printFormatted } from '../../modules/thermal-printer-loja';
import { getSavedPrinterAddress, getSavedPrintConfig } from '../printerConfig';
import { buildReceipt, buildKitchenTicket } from './receipt';

// Mesmo motivo de src/lib/autoprint.ts no site: o checkout insere o pedido
// e os itens em 2 inserts separados — quem reage ao pedido novo pode pegar
// o pedido antes dos itens terminarem de salvar. Tenta de novo antes de
// desistir.
async function fetchPedidoComItensComRetry(pedidoId: string) {
  let data: any = null;
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const { data: d } = await supabase.from('loja_pedidos').select('*, itens:loja_pedido_itens(*)').eq('id', pedidoId).single();
    data = d;
    if (data?.itens?.length > 0) break;
    await new Promise(r => setTimeout(r, 700));
  }
  return data;
}

// Nunca lança — falha de impressão (Bluetooth desconectado, impressora sem
// papel etc.) não pode travar o resto do app. Igual ao site.
export async function autoImprimirPedido(companyName: string, pedidoId: string): Promise<{ ok: boolean; erro?: string }> {
  try {
    const address = await getSavedPrinterAddress();
    const config = await getSavedPrintConfig();
    const data = await fetchPedidoComItensComRetry(pedidoId);
    if (!data) return { ok: false, erro: 'Pedido não encontrado ainda' };

    const items = (data.itens || []).map((it: any) => ({
      qty: it.qty, pesoKg: it.peso_kg, name: it.product_name, unitPrice: it.unit_price, options: it.selected_options,
    }));

    const receipt = buildReceipt({
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
    }, config.charsPerLine);
    await printFormatted(receipt, address, config);

    // Segunda via pra cozinha — sem preço/endereço/pagamento, só o
    // necessário pra produzir.
    const kitchen = buildKitchenTicket({
      pedidoShortId: String(data.order_number ?? data.id.slice(0, 8)),
      createdAt: data.created_at,
      deliveryType: data.delivery_type,
      items,
      notes: data.notes,
    }, config.charsPerLine);
    await printFormatted(kitchen, address, config);

    return { ok: true };
  } catch (e: any) {
    return { ok: false, erro: e?.message || 'Falha ao imprimir' };
  }
}
