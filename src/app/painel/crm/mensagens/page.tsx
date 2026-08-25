import { redirect } from 'next/navigation'

// Catálogo não é CRM — o prefixo /painel/crm/ saiu de tudo (Fase 0.5).
export default function MensagensRedirect() {
  redirect('/painel/mensagens')
}
