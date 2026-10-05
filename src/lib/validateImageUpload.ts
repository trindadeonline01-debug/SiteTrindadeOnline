// Upload de foto a partir de data URI base64 — usado pelos formulários
// públicos (sem login) de cadastro/reenvio de motoboy, onde o único portão
// antes disso é o código verificado por WhatsApp. Até agora a validação
// confiava 100% no que o próprio navegador declarava no prefixo
// `data:image/...` — um `data:image/svg+xml;base64,...` (SVG pode levar
// `<script>` embutido) passava direto, e o conteúdo real do arquivo nunca
// era conferido. Achado em auditoria de segurança, out/2026.
//
// Aqui a validação é pelo CONTEÚDO de verdade: decodifica o base64 e deixa
// o `sharp` (já é dependência do projeto) detectar o formato real pelos
// bytes do arquivo — só aceita o resultado se bater com a lista de formato
// seguro, nunca com o que o cliente disse que era.
const ALLOWED_FORMATS: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}
const MAX_BYTES = 8 * 1024 * 1024 // 8MB — folga generosa acima do que compressImage.ts já entrega no cliente (~130KB-1MB)

// CNH e documento do veículo às vezes só existem na versão digital oficial
// (CNH Digital / CRLV-e do governo), que é sempre um PDF, nunca uma foto —
// motoboy sem o documento impresso ficava impedido de se cadastrar (achado
// real, out/2026: Thiago Antônio de Freitas, erro "arquivo não é uma imagem
// válida" tentando subir a CNH digital). `allowPdf` libera isso SÓ pra quem
// chama explicitamente (cnh/documento da moto) — selfie e fotos da moto
// continuam exigindo foto de verdade. Mesma filosofia da validação de
// imagem acima: confere pelo CONTEÚDO real (assinatura binária `%PDF-`),
// nunca confia só no que o navegador declarou no prefixo `data:`.
export async function decodeAndValidateImage(dataUri: unknown, opts?: { allowPdf?: boolean }): Promise<{ buf: Buffer; ext: string; contentType: string } | { error: string }> {
  if (typeof dataUri !== 'string') return { error: 'foto inválida' }

  if (opts?.allowPdf) {
    const pdfMatch = dataUri.match(/^data:application\/pdf;base64,(.+)$/)
    if (pdfMatch) {
      let pdfBuf: Buffer
      try { pdfBuf = Buffer.from(pdfMatch[1], 'base64') } catch { return { error: 'arquivo inválido' } }
      if (pdfBuf.length === 0 || pdfBuf.length > MAX_BYTES) return { error: 'arquivo inválido (tamanho)' }
      if (pdfBuf.subarray(0, 5).toString('latin1') !== '%PDF-') return { error: 'arquivo não é um PDF válido' }
      return { buf: pdfBuf, ext: 'pdf', contentType: 'application/pdf' }
    }
  }

  const match = dataUri.match(/^data:image\/[\w.+-]+;base64,(.+)$/)
  if (!match) return { error: 'foto inválida' }

  let buf: Buffer
  try {
    buf = Buffer.from(match[1], 'base64')
  } catch {
    return { error: 'foto inválida' }
  }
  if (buf.length === 0 || buf.length > MAX_BYTES) return { error: 'foto inválida (tamanho)' }

  try {
    // Import dinâmico, só aqui dentro do try — sharp usa binário nativo, e
    // um import estático no topo do arquivo derruba o carregamento do
    // módulo inteiro (e qualquer rota que importe esse arquivo, mesmo sem
    // nunca chamar essa função) se o binário não subir naquele bundle
    // específico da Vercel, ANTES de qualquer try/catch conseguir pegar —
    // mesma lição já documentada em buildDeliveryBanner (entregaDispatch.ts).
    const sharp = (await import('sharp')).default
    const meta = await sharp(buf).metadata()
    const format = meta.format
    if (!format || !ALLOWED_FORMATS[format]) return { error: 'formato de foto não aceito — envia jpeg, png ou webp' }
    return { buf, ext: format === 'jpeg' ? 'jpg' : format, contentType: ALLOWED_FORMATS[format] }
  } catch {
    // sharp não conseguiu nem abrir o arquivo como imagem — não é uma foto de verdade
    return { error: 'arquivo não é uma imagem válida' }
  }
}
