import { useEffect, useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { Button, Modal } from '@/components/ui'
import { createBarcodeDetector } from './device'

/** Leitura pela câmera. Só é oferecida quando o navegador tem leitor de código de barras. */
export const cameraScanAvailable = () =>
  createBarcodeDetector() !== null && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

export function ScannerModal({ open, onClose, onCode }: { open: boolean; onClose: () => void; onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [last, setLast] = useState<string | null>(null)
  const handler = useRef(onCode)
  handler.current = onCode

  useEffect(() => {
    if (!open) return
    const detector = createBarcodeDetector()
    let stream: MediaStream | null = null
    let timer = 0
    let stopped = false
    let previous = ''
    let previousAt = 0
    setError(null)
    setLast(null)

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (stopped || !video.current) { stream.getTracks().forEach((track) => track.stop()); return }
        video.current.srcObject = stream
        await video.current.play()
        timer = window.setInterval(async () => {
          if (!detector || !video.current || video.current.readyState < 2) return
          try {
            const [found] = await detector.detect(video.current)
            const code = found?.rawValue?.trim()
            // o mesmo código parado na frente da câmera conta uma vez só
            if (!code || (code === previous && Date.now() - previousAt < 2500)) return
            previous = code
            previousAt = Date.now()
            setLast(code)
            navigator.vibrate?.(60)
            handler.current(code)
          } catch {
            // quadro ilegível: tenta o próximo
          }
        }, 300)
      } catch {
        setError('Não foi possível abrir a câmera. Autorize o acesso ou digite o código.')
      }
    })()

    return () => {
      stopped = true
      window.clearInterval(timer)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [open])

  return (
    <Modal open={open} onClose={onClose} title="Ler etiqueta" description="Aponte a câmera para o código de barras."
      footer={<Button variant="secondary" onClick={onClose}>Concluir</Button>}>
      {error ? (
        <p className="py-6 text-center text-sm text-red-700">{error}</p>
      ) : (
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-xl bg-ink-950">
            <video ref={video} playsInline muted className="aspect-[4/3] w-full object-cover" />
            <div className="pointer-events-none absolute inset-x-6 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
          </div>
          <p className="flex items-center justify-center gap-2 text-[12.5px] text-ink-600">
            <Camera className="h-4 w-4" /> {last ? `Último lido: ${last}` : 'Aguardando leitura…'}
          </p>
        </div>
      )}
    </Modal>
  )
}
