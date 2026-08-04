import { sectionOgImage, ogSize, ogContentType } from '@/lib/sectionOgImage'

export const size = ogSize
export const contentType = ogContentType
export const alt = 'Imóveis na Trindade — Trindade Online'

export default function Image() {
  return sectionOgImage('Imóveis na Trindade', 'Casas e apartamentos pra alugar ou comprar no bairro Trindade', '🏠')
}
