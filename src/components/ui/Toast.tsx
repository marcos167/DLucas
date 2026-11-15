import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastItem {
  id: number
  tone: ToastTone
  message: string
  /** Texto complementar opcional, exibido em linha separada. */
  detail?: string
}

interface ToastState {
  push: (t: { tone?: ToastTone; message: string; detail?: string }) => void
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastState | undefined>(undefined)

const toneMap = {
  success: { cls: 'border-emerald-200 bg-emerald-50 text-emerald-900', Icon: CheckCircle2 },
  error: { cls: 'border-red-200 bg-red-50 text-red-900', Icon: AlertTriangle },
  info: { cls: 'border-sky-200 bg-sky-50 text-sky-900', Icon: Info },
} as const

/** Duração na tela. Erros ficam mais tempo porque costumam ser lidos. */
const DURATION = { success: 4000, info: 4000, error: 6000 } as const

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback<ToastState['push']>(({ tone = 'info', message, detail }) => {
    const id = ++seq.current
    // no máximo 4 na tela; o mais antigo sai para não cobrir a interface
    setItems((list) => [...list.slice(-3), { id, tone, message, detail }])
    timers.current.set(id, setTimeout(() => dismiss(id), DURATION[tone]))
  }, [dismiss])

  // limpa os timers pendentes ao desmontar
  useEffect(() => {
    const map = timers.current
    return () => {
      map.forEach((t) => clearTimeout(t))
      map.clear()
    }
  }, [])

  const value = useMemo<ToastState>(() => ({ push, dismiss }), [push, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
          role="region"
          aria-label="Notificações"
        >
          {items.map((t) => {
            const { cls, Icon } = toneMap[t.tone]
            return (
              <div
                key={t.id}
                role={t.tone === 'error' ? 'alert' : 'status'}
                aria-live={t.tone === 'error' ? 'assertive' : 'polite'}
                className={cn(
                  'pointer-events-auto flex w-full max-w-sm gap-2.5 rounded-xl border px-3.5 py-3 text-sm shadow-lg',
                  'animate-toast-in',
                  cls,
                )}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{t.message}</p>
                  {t.detail && (
                    <p className="mt-0.5 text-[13px] leading-relaxed opacity-90">{t.detail}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Fechar notificação"
                  className="mt-0.5 shrink-0 rounded p-0.5 opacity-60 transition hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast deve ser usado dentro de <ToastProvider>')
  return ctx
}
