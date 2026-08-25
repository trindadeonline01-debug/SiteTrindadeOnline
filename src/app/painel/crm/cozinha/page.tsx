import { redirect } from 'next/navigation'

// Catálogo não é CRM — o prefixo /painel/crm/ saiu de tudo (Fase 0.5).
export default function CozinhaRedirect() {
  redirect('/painel/cozinha')
}
