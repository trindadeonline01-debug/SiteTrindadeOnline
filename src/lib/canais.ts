// Canais de venda da loja (nov/2026). Cada um tem o próprio fluxo:
//  - delivery: site, WhatsApp e "+ Novo pedido" manual (origin 'balcao') —
//    pedido que a loja prepara e entrega/retira. É o que toca, imprime
//    sozinho, conta no contador e aparece em /painel/pedidos.
//  - PDV ('pdv'): venda de balcão finalizada na hora, em /painel/pdv.
//  - Mesa ('mesa'): rodada de uma comanda, que só fecha no pagamento.
export const ORIGENS_DELIVERY = ['cardapio_publico', 'conversa', 'balcao'] as const
export const ORIGENS_COZINHA = [...ORIGENS_DELIVERY, 'mesa'] as const   // PDV nunca vai pra cozinha
export const isDelivery = (origin: string | null | undefined) => !!origin && (ORIGENS_DELIVERY as readonly string[]).includes(origin)
export const isPdvOuMesa = (origin: string | null | undefined) => origin === 'pdv' || origin === 'mesa'
