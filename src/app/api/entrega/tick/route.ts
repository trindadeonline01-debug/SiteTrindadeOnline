import { NextResponse } from 'next/server'
import { checkExpiredOffers } from '@/lib/entregaDispatch'

// Chamado em polling pelo painel da loja (/painel/crm/entrega) enquanto a
// tela está aberta — repassa ofertas que estouraram o prazo de 45s pro
// próximo motoboy. Complementa o mesmo cheque que já roda a cada mensagem
// recebida no webhook, cobrindo o caso de ninguém responder nada.
export async function GET() {
  await checkExpiredOffers()
  return NextResponse.json({ ok: true })
}
