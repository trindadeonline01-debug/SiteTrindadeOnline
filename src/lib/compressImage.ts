import imageCompression from 'browser-image-compression'

export async function compressImage(file: File, maxSizeMB = 0.4, maxWidthOrHeight = 1200): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  try {
    return await imageCompression(file, {
      maxSizeMB,
      maxWidthOrHeight,
      useWebWorker: true,
      fileType: 'image/webp'
    })
  } catch {
    return file
  }
}
