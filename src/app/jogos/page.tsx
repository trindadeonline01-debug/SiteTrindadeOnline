import { redirect } from 'next/navigation'

// "🎮 Jogos" do menu do site: jogos do próprio Trindade Online, com ranking
// geral do bairro (só diversão, sem cashback). A "loja" `trindade-online` é
// um cadastro interno (status suspended, some das listas de empresas) que só
// serve de dono das rodadas e do ranking.
const JOGOS_SITE_SLUG = 'trindade-online'

export default function Page() {
  redirect(`/jogos/${JOGOS_SITE_SLUG}`)
}
