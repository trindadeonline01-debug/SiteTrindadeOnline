import { sectionOgImage, ogSize, ogContentType } from '@/lib/sectionOgImage'

export const size = ogSize
export const contentType = ogContentType
export const alt = 'Empregos na Trindade — Trindade Online'

export default function Image() {
  return sectionOgImage('Empregos na Trindade', 'Vagas de emprego no bairro Trindade e região de São Gonçalo', '💼')
}
