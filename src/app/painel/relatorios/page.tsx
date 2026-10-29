import { redirect } from 'next/navigation'

// O dashboard de vendas (filtros, gráficos, bairro) que morava aqui virou
// parte da Visão Geral (/painel) — Ricardo esperava ver esse conteúdo
// direto ao abrir o painel, não teve que entrar embaixo em "Relatórios".
// Esse redirect existe só pra não quebrar link antigo/favorito.
export default function RelatoriosRedirect() {
  redirect('/painel')
}
