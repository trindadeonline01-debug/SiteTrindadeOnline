// Busca uma foto do Storage e devolve como data URI, pra usar dentro de um
// opengraph-image.tsx (next/og / Satori).
//
// Por que não passar a URL direto pro <img src>: o fetch interno do Satori é
// uma caixa preta — se travar, der timeout ou não conseguir decodificar o
// formato, a imagem inteira sai em branco no preview do link, sem erro
// visível nem stack trace nosso pra depurar. Buscando aqui a gente enxerga
// e trata cada causa: timeout, formato não suportado (webp costuma falhar
// no Satori) e resposta que não é imagem de verdade.
export async function fetchImageAsDataUri(url: string, timeoutMs = 4000): Promise<string | null> {
  if (/\.webp(\?|$)/i.test(url)) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.startsWith('image/') || contentType.includes('webp')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength === 0) return null
    return `data:${contentType};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}
