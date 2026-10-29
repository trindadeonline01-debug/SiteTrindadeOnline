// Leitura de código de barras de balança de pesagem (PDV) — não existe
// padrão fixo entre marcas/instalações (Toledo, Filizola, Urano todas
// divergem, confirmado em documentação de PDV real e em fórum de devs que
// bateram no mesmo problema), então em vez de assumir um layout, guarda um
// formato CALIBRADO por loja (ver tela de calibração em /painel/pdv):
// prefixo + quantos dígitos são o código/PLU do produto + quantos são o
// valor (peso em gramas, ou preço em centavos) + 1 dígito verificador no
// fim, que essa função ignora (não recalcula, só descarta).
export interface BalancaConfig {
  prefixo: string
  pluDigits: number
  valorDigits: number
  valorTipo: 'peso' | 'preco'
}

export interface BalancaParsed {
  plu: string
  pesoKg?: number
  precoReais?: number
}

// Não valida um total de dígitos fixo — EAN13 de balança real tem 1-2
// dígitos verificadores/preenchimento no final que a gente não precisa
// conferir, só ignorar (confirmar checksum é trabalho redobrado: se o PLU
// bate com um produto vinculado e o peso faz sentido, já é confirmação
// suficiente). Scanner USB (modo "teclado") às vezes perde o zero à
// esquerda ao digitar rápido — completa com zero antes de validar, em vez
// de rejeitar um código real só porque veio 1 dígito curto.
export function parseBalancaCode(raw: string, config: BalancaConfig): BalancaParsed | null {
  const digits = raw.replace(/\D/g, '')
  const minLen = config.prefixo.length + config.pluDigits + config.valorDigits
  if (digits.length < minLen - 1 || digits.length > minLen + 3) return null
  const padded = digits.length < minLen ? digits.padStart(minLen, '0') : digits
  if (!padded.startsWith(config.prefixo)) return null
  let idx = config.prefixo.length
  const plu = padded.slice(idx, idx + config.pluDigits)
  idx += config.pluDigits
  const valorStr = padded.slice(idx, idx + config.valorDigits)
  const valorNum = parseInt(valorStr, 10)
  if (!Number.isFinite(valorNum)) return null
  return config.valorTipo === 'peso'
    ? { plu, pesoKg: valorNum / 1000 }
    : { plu, precoReais: valorNum / 100 }
}

export const BALANCA_DEFAULT_CONFIG: BalancaConfig = {
  prefixo: '2', pluDigits: 5, valorDigits: 5, valorTipo: 'peso',
}
