// Tipo do produto pra vitrine "Peça agora" da home — independente do nome
// da seção de cardápio de cada lojista (que é texto livre e não bate entre
// empresas diferentes, ex: "Tradicionais" numa hamburgueria x "Bebidas"
// noutra). Lista fixa pra manter consistência entre empresas e permitir
// agrupar corretamente (ver ESPECIFICACAO.md §7).
export const VITRINE_TIPOS: { value: string; label: string; emoji: string }[] = [
  { value: 'Hambúrguer', label: 'Hambúrguer', emoji: '🍔' },
  { value: 'Pizza', label: 'Pizza', emoji: '🍕' },
  { value: 'Porção', label: 'Porção', emoji: '🍟' },
  { value: 'Salgado', label: 'Salgado', emoji: '🥟' },
  { value: 'Prato Feito', label: 'Prato Feito / Marmita', emoji: '🍱' },
  { value: 'Doce', label: 'Doce / Sobremesa', emoji: '🍰' },
  { value: 'Bebida', label: 'Bebida', emoji: '🥤' },
  { value: 'Açaí & Sorvete', label: 'Açaí & Sorvete', emoji: '🍦' },
  { value: 'Peixaria', label: 'Peixaria', emoji: '🐟' },
  { value: 'Padaria', label: 'Padaria', emoji: '🥐' },
  { value: 'Açougue', label: 'Açougue', emoji: '🥩' },
  { value: 'Hortifrúti', label: 'Hortifrúti', emoji: '🥬' },
  { value: 'Mercado', label: 'Mercado', emoji: '🛒' },
  { value: 'Outro', label: 'Outro', emoji: '🍽️' },
]

export function vitrineTipoEmoji(tipo: string | null): string {
  return VITRINE_TIPOS.find(t => t.value === tipo)?.emoji || '🍽️'
}
