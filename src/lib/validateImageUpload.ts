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
// continuam exigindo foto de verdade.
//
// Primeira versão desse fix exigia o prefixo `data:application/pdf;base64,`
// exato — e continuou falhando pro Thiago numa segunda tentativa, porque o
// celular dele (Android) não declara esse mimetype certinho dependendo de
// como o PDF foi selecionado/compartilhado (achado real, out/2026). Agora a
// validação pega o base64 de QUALQUER prefixo `data:...;base64,`, sem
// confiar no mimetype declarado pra nada — confere só pelo CONTEÚDO de
// verdade (assinatura binária `%PDF-` pro PDF, decodificação real via sharp
// pra imagem), igual já era a filosofia daqui.
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
