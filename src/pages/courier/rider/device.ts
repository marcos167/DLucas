/** Recursos do aparelho usados pelo aplicativo do entregador: foto e posição. */

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 10 * 1024 * 1024

/**
 * Reduz a foto antes de guardar: o comprovante precisa ser legível, não
 * enorme, e o envio costuma acontecer em rede móvel fraca.
 */
export async function compressPhoto(file: File, maxSide = 1600, quality = 0.72): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('canvas indisponível')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (blob && blob.size > 0) return blob
  } catch {
    // aparelho sem suporte a redimensionar esta imagem: usa o arquivo original, se couber
  }
  if (ACCEPTED.includes(file.type) && file.size <= MAX_BYTES) return file
  throw new Error('Não foi possível usar esta foto. Tire outra com a câmera do aparelho.')
}

/** Posição atual, se o aparelho responder rápido. Nunca bloqueia o registro. */
export function currentPosition(timeoutMs = 3500): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) { resolve(null); return }
    const timer = window.setTimeout(() => resolve(null), timeoutMs)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(timer)
        resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude })
      },
      () => { window.clearTimeout(timer); resolve(null) },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: timeoutMs },
    )
  })
}

interface DetectedCode { rawValue: string }
interface Detector { detect(source: CanvasImageSource): Promise<DetectedCode[]> }
type DetectorConstructor = new (options?: { formats?: string[] }) => Detector

/** Leitor de código de barras do próprio navegador (Android/Chrome). `null` quando não existe. */
export function createBarcodeDetector(): Detector | null {
  const Constructor = (globalThis as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector
  if (!Constructor) return null
  try {
    return new Constructor({ formats: ['code_128', 'code_39', 'ean_13', 'itf', 'qr_code', 'data_matrix'] })
  } catch {
    return null
  }
}
