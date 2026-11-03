import { redirect } from 'next/navigation'

// O caixa agora é de cada canal e abre dentro da tela dele (botão "Caixa" no PDV e
// nas Mesas). Os fechamentos aparecem em Vendas por canal. Redirect só pra não
// quebrar link antigo.
export default function CaixaRedirect() {
  redirect('/painel/vendas')
}
