// Normaliza telefone pro formato usado como chave em crm_contacts.phone e
// pra mandar pra Evolution API — só dígitos, sempre com o DDI 55 na frente.
// Sem isso o mesmo cliente vira duas linhas diferentes no CRM dependendo de
// quem cria o contato primeiro: pedido feito pelo site usa o telefone cru do
// perfil (sem DDI), enquanto mensagem recebida no WhatsApp usa o JID da
// Evolution (que já vem com 55) — duas "chaves" pro mesmo número, duas
// conversas separadas pra quem devia ser uma só.
export function normalizePhone(raw: string | null | undefined): string {
  let digits = (raw || '').replace(/\D/g, '')
  digits = digits.replace(/^0+/, '')
  if (digits && !digits.startsWith('55')) digits = '55' + digits
  return digits
}
