// sort(() => Math.random()-0.5) é um shuffle enviesado — pra listas
// pequenas, mistura pouco e sempre deixa os mesmos no topo. Fisher-Yates
// é o shuffle de verdade, com distribuição uniforme
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
