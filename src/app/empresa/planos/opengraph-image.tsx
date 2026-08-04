import { sectionOgImage, ogSize, ogContentType } from '@/lib/sectionOgImage'

export const size = ogSize
export const contentType = ogContentType
export const alt = 'Planos para sua empresa — Trindade Online'

export default function Image() {
  return sectionOgImage('Planos para sua empresa', 'Fique visível pros moradores da Trindade e atraia mais clientes', '💛')
}
