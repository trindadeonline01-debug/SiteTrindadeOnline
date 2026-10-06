// Upload de foto a partir de data URI base64 — usado pelos formulários
// públicos (sem login) de cadastro/reenvio de motoboy, onde o único portão
// antes disso é o código verificado por WhatsApp. Até agora a validação
// confiava 100% no que o próprio navegador declarava no prefixo
// `data:image/...` — um `data:image/svg+xml;base64,...` (SVG pode levar
// `<script>` embutido) passava direto, e o conteúdo real do arquivo nunca
// era conferido. Achado em auditoria de segurança, out/2026.
//
// Aqui a validação é pelo CONTEÚDO de verdade: decodifica o base64 e confere
// a ASSINATURA BINÁRIA real do arquivo (os primeiros bytes de cada formato)
// — só aceita se bater com a lista de formato seguro, nunca com o que o
// cliente disse que era.
//
// Antes isso usava `sharp` pra decodificar de verdade (mais rigoroso — abre
// a imagem inteira, não só confere o cabeçalho). Trocado out/2026: desde que
// o `sharp` entrou nessa validação específica (commit daf9078, 03/10),
// NINGUÉM mais conseguiu se cadastrar sozinho como motoboy — toda imagem,
// até foto tirada na hora com câmera de verdade (testado pelo próprio
// Ricardo, iPhone), vinha de volta "arquivo não é uma imagem válida". Causa:
// o binário nativo do `sharp` não carrega nesse bundle serverless específico
// da Vercel — mesma classe de bug já documentada no projeto (opengraph-image
// com Satori/sharp, `FUNCTION_INVOCATION_FAILED` em produção). Checagem de
// assinatura binária é só JavaScript puro, sem binário nativo nenhum — nunca
// tem esse problema, e ainda cumpre o objetivo original da auditoria de
// segurança (conferir o CONTEÚDO real, não confiar no mime declarado — um
// `data:image/svg+xml` continua sendo recusado, porque SVG é texto e não
// bate nenhuma das assinaturas abaixo).
const ALLOWED_FORMATS: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}
const MAX_BYTES = 8 * 1024 * 1024 // 8MB — folga generosa acima do que compressImage.ts já entrega no cliente (~130KB-1MB)

// Detecta o formato real pelos primeiros bytes do arquivo (magic numbers) —
// JPEG sempre começa com FF D8 FF; PNG tem uma assinatura fixa de 8 bytes;
// WebP é um contêiner RIFF com "WEBP" no byte 8.
function detectImageFormat(buf: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpeg'
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47 && buf[4] === 0x0D && buf[5] === 0x0A && buf[6] === 0x1A && buf[7] === 0x0A) return 'png'
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp'
  return null
}

// CNH e documento do veículo às vezes só existem na versão digital oficial
// (CNH Digital / CRLV-e do governo), que é sempre um PDF, nunca uma foto —
// motoboy sem o documento impresso ficava impedido de se cadastrar (achado
// real, out/2026: Thiago Antônio de Freitas, erro "arquivo não é uma imagem
// válida" tentando subir a CNH digital). `allowPdf` libera isso SÓ pra quem
// chama explicitamente (cnh/documento da moto) — selfie e fotos da moto
// continuam exigindo foto de verdade.
//
// Primeira versão desse fix exigia o prefixo `data:application/pdf;base64,`
// exato — e continuou falhando pro Thiago numa segunda tentativa, porque o
// celular dele (Android) não declara esse mimetype certinho dependendo de
// como o PDF foi selecionado/compartilhado (achado real, out/2026). Agora a
// validação pega o base64 de QUALQUER prefixo `data:...;base64,`, sem
// confiar no mimetype declarado pra nada — confere só pelo CONTEÚDO de
// verdade (assinatura binária, `%PDF-` pro PDF ou a de cada formato de
// imagem), igual já era a filosofia daqui.
export async function decodeAndValidateImage(dataUri: unknown, opts?: { allowPdf?: boolean }): Promise<{ buf: Buffer; ext: string; contentType: string } | { error: string }> {
  if (typeof dataUri !== 'string') return { error: 'foto inválida' }

  const match = dataUri.match(/^data:[^;]*;base64,(.+)$/)
  if (!match) return { error: 'foto inválida' }

  let buf: Buffer
  try {
    buf = Buffer.from(match[1], 'base64')
  } catch {
    return { error: 'foto inválida' }
  }
  if (buf.length === 0 || buf.length > MAX_BYTES) return { error: 'foto inválida (tamanho)' }

  if (opts?.allowPdf && buf.subarray(0, 5).toString('latin1') === '%PDF-') {
    return { buf, ext: 'pdf', contentType: 'application/pdf' }
  }

  const format = detectImageFormat(buf)
  if (!format) return { error: 'arquivo não é uma imagem válida' }
  return { buf, ext: format === 'jpeg' ? 'jpg' : format, contentType: ALLOWED_FORMATS[format] }
}
