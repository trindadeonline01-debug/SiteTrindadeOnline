import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { MOTOBOY_TERMS_SECTIONS, MOTOBOY_TERMS_VERSION } from '@/lib/motoboyTerms'

export interface TermsAcceptanceData {
  nomeDigitado: string
  cpf: string
  phone: string
  ipAddress: string
  userAgent: string
  acceptedAt: Date
}

function wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

// Gera o PDF do Termo de Parceria assinado — documento que a Trindade
// Online guarda como prova de que o motoboy teve ciência das condições
// (ver discussão sobre vínculo empregatício). Pura JS, sem dependência
// nativa — roda em serverless sem problema (lição aprendida com o sharp
// no opengraph-image, ver KNOWLEDGE_BASE.md).
export async function generateTermsPdf(data: TermsAcceptanceData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const pageWidth = 595
  const pageHeight = 842
  const margin = 56
  const maxWidth = pageWidth - margin * 2

  let page = doc.addPage([pageWidth, pageHeight])
  let y = pageHeight - margin

  function ensureSpace(needed: number) {
    if (y - needed < margin) {
      page = doc.addPage([pageWidth, pageHeight])
      y = pageHeight - margin
    }
  }

  function drawTitle(text: string, size: number) {
    ensureSpace(size + 10)
    page.drawText(text, { x: margin, y, size, font: bold, color: rgb(0.08, 0.07, 0.06) })
    y -= size + 10
  }
  function drawParagraph(text: string, size = 10, f = font, color = rgb(0.15, 0.14, 0.13)) {
    const lines = wrapText(text, f, size, maxWidth)
    for (const line of lines) {
      ensureSpace(size + 4)
      page.drawText(line, { x: margin, y, size, font: f, color })
      y -= size + 4
    }
  }

  drawTitle('TRINDADE ONLINE — TERMO DE PARCERIA (MOTOBOY)', 15)
  drawParagraph(`Versão ${MOTOBOY_TERMS_VERSION}`, 9, font, rgb(0.5, 0.45, 0.35))
  y -= 10

  for (const section of MOTOBOY_TERMS_SECTIONS) {
    ensureSpace(30)
    drawParagraph(section.title, 11, bold, rgb(0.5, 0.35, 0))
    drawParagraph(section.body, 10)
    y -= 6
  }

  y -= 10
  ensureSpace(120)
  page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.5, color: rgb(0.7, 0.65, 0.55) })
  y -= 20

  drawTitle('ASSINATURA ELETRÔNICA', 12)
  drawParagraph(`Nome digitado: ${data.nomeDigitado}`, 10, bold)
  drawParagraph(`CPF: ${data.cpf}`)
  drawParagraph(`WhatsApp verificado: ${data.phone}`)
  drawParagraph(`Aceite em: ${data.acceptedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`)
  drawParagraph(`IP registrado: ${data.ipAddress}`)
  drawParagraph(`Dispositivo: ${data.userAgent.slice(0, 90)}`)

  return doc.save()
}
