// CHAVE GERAL DO ATENDIMENTO POR IA — desligada a pedido do Ricardo
// (31/out/2026): "não vou mais disponibilizar, pelo menos por enquanto,
// atendimento pela inteligência artificial... nem follow-up. A conexão do
// WhatsApp do lojista só vai servir pros disparos de status de pedido."
//
// Com `true`: o webhook do WhatsApp continua registrando as mensagens, mas NÃO
// responde com IA, NÃO transcreve áudio e NÃO assume/devolve conversa; e todas
// as rotinas de atendimento (resgate de 5min, follow-up de silêncio, follow-up
// de dias, classificação de conversas) respondem na hora sem consultar nada.
// O envio de mensagens de status de pedido NÃO passa por aqui e segue normal.
// Pra religar: trocar pra `false` (e rever as rotinas — a de silêncio precisa
// de limite de idade antes, ver KNOWLEDGE_BASE item 26).
export const ATENDIMENTO_IA_DESLIGADO = true

// Empresas LIBERADAS mesmo com a chave geral desligada (piloto, 31/out/2026,
// pedido do Ricardo: "ativa o atendimento da IA só para a Calçada do Peixe").
// Pra liberar outra loja: acrescentar o id aqui (e deixar crm_ia_enabled ligado
// nela). Pra desligar o piloto: esvaziar a lista.
export const ATENDIMENTO_IA_EMPRESAS_LIBERADAS: string[] = [
  'd3373bd7-fa9b-490f-a077-c8f2980028c1', // Calçada do Peixe
]

export function iaLiberadaParaEmpresa(companyId: string | null | undefined): boolean {
  return !ATENDIMENTO_IA_DESLIGADO || (!!companyId && ATENDIMENTO_IA_EMPRESAS_LIBERADAS.includes(companyId))
}

export function iaAtiva(company: { id?: string | null; crm_ia_enabled?: boolean | null } | null | undefined): boolean {
  return iaLiberadaParaEmpresa(company?.id) && !!company?.crm_ia_enabled
}
