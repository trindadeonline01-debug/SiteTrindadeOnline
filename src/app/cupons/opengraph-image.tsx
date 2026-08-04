import { sectionOgImage, ogSize, ogContentType } from '@/lib/sectionOgImage'

export const size = ogSize
export const contentType = ogContentType
export const alt = 'Cupons Relâmpago — Trindade Online'

export default function Image() {
  return sectionOgImage('Cupons Relâmpago', 'Descontos por tempo limitado nos comércios da Trindade', '🎟️')
}
