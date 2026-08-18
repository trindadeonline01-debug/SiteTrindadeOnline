import imageCompression from 'browser-image-compression'

// Cada tentativa reduz o tamanho/qualidade — servem de rede de segurança pra
// celulares (principalmente iPhone) onde o worker às vezes falha em fotos
// grandes por limite de memória do canvas. Nunca devolve o arquivo original
// sem comprimir: isso é o que estava enchendo o Storage de foto de 3-4MB.
// As duas últimas tentativas rodam sem web worker: se o worker em si for o
// que está travando (não só o tamanho da imagem), repetir com worker nunca
// ia funcionar — precisa cair pra thread principal em algum ponto.
const FALLBACKS = [
  { maxWidthOrHeight: 800, fileType: undefined as string | undefined, useWebWorker: true },
  { maxWidthOrHeight: 600, fileType: undefined as string | undefined, initialQuality: 0.6, useWebWorker: true },
  { maxWidthOrHeight: 500, fileType: undefined as string | undefined, initialQuality: 0.5, useWebWorker: false },
  { maxWidthOrHeight: 400, fileType: undefined as string | undefined, initialQuality: 0.4, useWebWorker: false },
]

export async function compressImage(file: File, maxSizeMB = 0.25, maxWidthOrHeight = 1000): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  try {
    return await imageCompression(file, {
      maxSizeMB,
      maxWidthOrHeight,
      useWebWorker: true,
      // jpeg em vez de webp: alguns navegadores mobile (Samsung Internet,
      // WebViews Android mais antigos) não conseguem CODIFICAR webp via
      // canvas.toBlob e derrubavam a tentativa principal inteira — jpeg é
      // suportado em praticamente qualquer navegador.
      fileType: 'image/jpeg',
    })
  } catch {
    for (const { useWebWorker, ...opts } of FALLBACKS) {
      try {
        return await imageCompression(file, { maxSizeMB, useWebWorker, ...opts })
      } catch {
        continue
      }
    }
    throw new Error('Não deu pra comprimir essa foto. Tenta outra imagem, ou uma versão menor dela.')
  }
}
