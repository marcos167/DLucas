import {
  forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes, useEffect,
} from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, ChevronDown, Search, AlertTriangle, CheckCircle2, Info, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ BOTÃO */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle'
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: ReactNode
}
const variantClass: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  subtle: 'btn bg-brand-50 text-brand-800 hover:bg-brand-100',
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, icon, children, disabled, ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        variantClass[variant],
        size === 'sm' && 'px-3 py-1.5 text-[13px]',
        size === 'lg' && 'px-5 py-3 text-[15px]',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  )
})

/* ------------------------------------------------------------------ CAMPOS */
interface FieldProps { label?: string; error?: string; hint?: string; required?: boolean; children: ReactNode; className?: string }
export function Field({ label, error, hint, required, children, className }: FieldProps) {
  return (
    <div className={className}>
      {label && (
        <label className="label">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...rest }, ref) {
    return <input ref={ref} className={cn('input', invalid && 'input-error', className)} {...rest} />
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid, ...rest }, ref) {
    return <textarea ref={ref} rows={3} className={cn('input resize-y', invalid && 'input-error', className)} {...rest} />
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  function Select({ className, invalid, children, ...rest }, ref) {
    return (
      <div className="relative">
        <select ref={ref} className={cn('input appearance-none pr-9', invalid && 'input-error', className)} {...rest}>
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
      </div>
    )
  },
)

export function SearchInput({ value, onChange, placeholder = 'Buscar…', className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input pl-9"
      />
    </div>
  )
}

export function Switch({ checked, onChange, label, description }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description?: string
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition',
          checked ? 'bg-brand-600' : 'bg-ink-300',
        )}
      >
        <span className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
          checked ? 'left-[22px]' : 'left-0.5',
        )} />
      </button>
      <span>
        <span className="block text-sm font-medium text-ink-800">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-ink-500">{description}</span>}
      </span>
    </label>
  )
}

/* ------------------------------------------------------------------ BADGES */
export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('badge', className)}>{children}</span>
}

export function StatusDot({ className }: { className?: string }) {
  return <span className={cn('inline-block h-2 w-2 rounded-full', className)} />
}

/* ------------------------------------------------------------------ CARDS */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('card', className)}>{children}</div>
}

export function CardHeader({ title, description, action, className }: {
  title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-4 py-3.5 sm:px-5', className)}>
      <div>
        <h3 className="font-display text-[15px] font-bold text-ink-950">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-ink-500">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function EmptyState({ title, description, icon, action }: {
  title: string; description?: string; icon?: ReactNode; action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-100 text-ink-400">
        {icon ?? <Inbox className="h-6 w-6" />}
      </div>
      <div>
        <p className="font-semibold text-ink-800">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />
}

/* ------------------------------------------------------------------ MODAL */
export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onClose])

  if (!open) return null
  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size]

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        className={cn(
          'flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-lift sm:rounded-2xl',
          width,
          'animate-fade-up',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
          <div>
            <h2 className="font-display text-base font-bold text-ink-950">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-ink-100 bg-ink-50/60 px-5 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ------------------------------------------------------------------ ALERTAS */
export function Alert({ tone = 'info', title, children }: {
  tone?: 'info' | 'success' | 'warning' | 'danger'
  title?: string
  children?: ReactNode
}) {
  const map = {
    info: { cls: 'border-sky-200 bg-sky-50 text-sky-900', Icon: Info },
    success: { cls: 'border-emerald-200 bg-emerald-50 text-emerald-900', Icon: CheckCircle2 },
    warning: { cls: 'border-amber-200 bg-amber-50 text-amber-900', Icon: AlertTriangle },
    danger: { cls: 'border-red-200 bg-red-50 text-red-900', Icon: AlertTriangle },
  }[tone]
  return (
    <div className={cn('flex gap-2.5 rounded-xl border px-3.5 py-3 text-sm', map.cls)}>
      <map.Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'text-[13px] leading-relaxed opacity-90')}>{children}</div>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ ABAS */
export function Tabs<T extends string>({ tabs, value, onChange }: {
  tabs: { id: T; label: string; count?: number }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition',
            value === t.id ? 'bg-ink-900 text-white shadow-sm' : 'text-ink-600 hover:bg-ink-100',
          )}
        >
          {t.label}
          {t.count != null && (
            <span className={cn(
              'ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
              value === t.id ? 'bg-white/20' : 'bg-ink-200 text-ink-700',
            )}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ PAGINAÇÃO SIMPLES */
export function Pagination({ page, pageSize, total, onPage }: {
  page: number; pageSize: number; total: number; onPage: (p: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 px-4 py-3 text-xs text-ink-500">
      <span>
        {total === 0 ? 'Nenhum registro' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} de ${total}`}
      </span>
      <div className="flex items-center gap-1">
        <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</button>
        <span className="px-2 font-medium text-ink-700">{page}/{pages}</span>
        <button className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Próxima</button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ PROGRESSO */
export function Progress({ value, tone = 'brand' }: { value: number; tone?: 'brand' | 'amber' | 'red' }) {
  const cls = { brand: 'bg-brand-500', amber: 'bg-amber-500', red: 'bg-red-500' }[tone]
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-200">
      <div className={cn('h-full rounded-full transition-all', cls)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}
