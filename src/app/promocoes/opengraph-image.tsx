import { sectionOgImage, ogSize, ogContentType } from '@/lib/sectionOgImage'

export const size = ogSize
export const contentType = ogContentType
export const alt = 'Promoções da Semana — Trindade Online'

export default function Image() {
  return sectionOgImage('Promoções da Semana', 'As melhores ofertas dos comércios do bairro Trindade', '🔥')
}
