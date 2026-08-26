import sharp from 'sharp'

// Busca uma foto do Storage e devolve como data URI JPEG, pra usar dentro de
// um opengraph-image.tsx (next/og / Satori).
//
// Duas coisas precisam ser tratadas explicitamente, senão a imagem do preview
// sai em branco sem erro visível:
// 1. O fetch precisa de timeout e verificação de content-type — o fetch
//    interno do Satori é uma caixa preta, sem isso não dá pra saber se
//    falhou por timeout ou resposta inesperada.
// 2. O Satori não decodifica .webp de forma confiável — e o reparo
//    automático de foto quebrada da plataforma reconverte praticamente toda
//    foto de empresa pra webp (pra economizar espaço no Storage), então a
//    maioria das fotos reais bate nesse problema. Resolve decodificando com
//    sharp (mesma lib já usada no reparo/recompressão) e reencodando pra
//    JPEG, formato que o Satori sempre aceita.
export async function fetchImageAsDataUri(url: string, timeoutMs = 5000): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.startsWith('image/')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength === 0) return null
    const jpeg = await sharp(buf).rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer()
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`
  } catch {
    return null
  }
}
