// Detecta, em mensagem do CLIENTE, o pedido explícito pra parar de receber
// mensagens automáticas (docs/DESENHO_FOLLOWUP.md, decisão 6). De propósito
// ESTRITO: "chega" sozinho NÃO conta ("quando chega meu pedido?"). Errar pra
// menos é aceitável (a política do follow-up ainda ignora conversa com tom de
// reclamação); errar pra mais cala um cliente que só queria saber da entrega.
const PADROES: RegExp[] = [
  /\b(pare|parar|para)\s+de\s+(me\s+)?(mandar|enviar|chamar|escrever|falar)/i,
  /\b(n[ãa]o|nao)\s+(me\s+)?(mande|envie|chame|escreva)\b/i,
  /\b(n[ãa]o|nao)\s+quero\s+(mais\s+)?(receber|mensagem|mensagens|contato|saber)/i,
  /\b(me\s+)?(tire|tira|remova|remove|retire|exclua|exclui)\s+(me\s+)?(d[aeo]s?|desta|dessa|desse|deste)\s+(lista|contatos?|conversa|grupo)/i,
  /\bsair\s+da\s+lista\b/i,
  /\bchega\s+de\s+(mensagem|mensagens|propaganda|spam|lembrete|lembretes)/i,
  /\bdescadastr/i,
  /\b(spam|propaganda)\b.*\b(para|pare|chega)\b/i,
]

export function detectaPedidoParaParar(texto: string | null | undefined): boolean {
  const t = (texto || '').trim()
  if (!t) return false
  // Mensagem curta que é só a palavra de comando ("parar", "sair", "stop").
  if (/^(parar|pare|sair|stop|cancelar\s+mensagens?)[\s.!]*$/i.test(t)) return true
  return PADROES.some(re => re.test(t))
}
