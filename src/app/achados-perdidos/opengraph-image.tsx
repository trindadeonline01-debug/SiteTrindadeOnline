import { sectionOgImage, ogSize, ogContentType } from '@/lib/sectionOgImage'

export const size = ogSize
export const contentType = ogContentType
export const alt = 'Achados & Perdidos — Trindade Online'

export default function Image() {
  return sectionOgImage('Achados & Perdidos', 'Ajude a devolver ou encontrar o que foi perdido na Trindade', '🔎')
}
