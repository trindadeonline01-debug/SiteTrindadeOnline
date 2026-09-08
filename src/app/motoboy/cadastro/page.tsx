import type { Metadata } from 'next'
import MotoboyCadastroClient from './MotoboyCadastroClient'

// Página estática (sem dado dinâmico) — por isso metadata fixa em vez de
// generateMetadata. Antes essa rota herdava og:title/og:image genéricos do
// layout raiz (tela da home), por isso o preview no WhatsApp não dizia nada
// sobre motoboy — mesma causa já corrigida em /empresa/[slug]/cardapio.
export const metadata: Metadata = {
  title: 'Seja motoboy parceiro — Trindade Entrega',
  description: 'Cadastro rápido pra rodar como motoboy parceiro do Trindade Entrega — pagamento por corrida, direto no WhatsApp.',
  openGraph: {
    title: 'Seja motoboy parceiro — Trindade Entrega',
    description: 'Cadastro rápido pra rodar como motoboy parceiro do Trindade Entrega — pagamento por corrida, direto no WhatsApp.',
    url: 'https://trindadeonline.com.br/motoboy/cadastro',
    siteName: 'Trindade Online',
    locale: 'pt_BR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Seja motoboy parceiro — Trindade Entrega',
    description: 'Cadastro rápido pra rodar como motoboy parceiro do Trindade Entrega — pagamento por corrida, direto no WhatsApp.',
  },
  alternates: { canonical: 'https://trindadeonline.com.br/motoboy/cadastro' },
}

export default function MotoboyCadastroPage() {
  return <MotoboyCadastroClient />
}
