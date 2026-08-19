// Um módulo (Cardápio, CRM, Entrega) fica ativo se o flag real da empresa
// estiver ligado, OU se ela estiver dentro do período de teste liberado
// pelo admin — o teste liga os 3 de uma vez, independente do que cada um
// vale individualmente, e some sozinho quando a data passa (sem cron: é só
// uma comparação de data toda vez que a gente lê).
export function moduleActive(flag: boolean | null | undefined, trialUntil: string | null | undefined): boolean {
  if (flag) return true
  if (trialUntil && new Date(trialUntil).getTime() > Date.now()) return true
  return false
}
