import imageCompression from 'browser-image-compression'

// Cada tentativa reduz o tamanho/qualidade — servem de rede de segurança pra
// celulares (principalmente iPhone) onde o worker às vezes falha em fotos
// grandes por limite de memória do canvas. Nunca devolve o arquivo original
// sem comprimir: isso é o que estava enchendo o Storage de foto de 3-4MB.
const FALLBACKS = [
  { maxWidthOrHeight: 800, fileType: undefined as string | undefined },
  { maxWidthOrHeight: 600, fileType: undefined as string | undefined, initialQuality: 0.6 },
]

export async function compressImage(file: File, maxSizeMB = 0.25, maxWidthOrHeight = 1000): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  try {
    return await imageCompression(file, {
      maxSizeMB,
      maxWidthOrHeight,
      useWebWorker: true,
      fileType: 'image/webp',
    })
  } catch {
    for (const opts of FALLBACKS) {
      try {
        return await imageCompression(file, { maxSizeMB, useWebWorker: true, ...opts })
      } catch {
        continue
      }
    }
    throw new Error('Não deu pra comprimir essa foto. Tenta outra imagem.')
  }
}
