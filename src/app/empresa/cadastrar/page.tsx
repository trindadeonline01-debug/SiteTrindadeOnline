import { redirect } from 'next/navigation'

// Cadastro de empresa virou um fluxo só em /anunciar (conta + negócio numa
// página, sem o redirect no meio que existia entre /cadastro e esta rota).
export default function EmpresaCadastrarRedirect() {
  redirect('/anunciar')
}
