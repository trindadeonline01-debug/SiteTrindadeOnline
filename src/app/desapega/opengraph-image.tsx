import { sectionOgImage, ogSize, ogContentType } from '@/lib/sectionOgImage'

export const size = ogSize
export const contentType = ogContentType
export const alt = 'Desapega Trindade — Trindade Online'

export default function Image() {
  return sectionOgImage('Desapega Trindade', 'Compra e venda de produtos usados no bairro Trindade', '🏷️')
}
