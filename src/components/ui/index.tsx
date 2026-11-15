import {
  forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes, useEffect,
} from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, ChevronDown, Search, AlertTriangle, CheckCircle2, Info, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ BOTÃO */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle' | 'accent'
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: ReactNode
}
const variantClass: Record<ButtonVariant, string> = {
  primary: 'btn-primary btn-sheen',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  accent: 'btn-accent btn-sheen',
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
        size === 'sm' && 'btn-sm',
        size === 'lg' && 'btn-lg',
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
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ease-out',
          'ring-1 ring-inset',
          checked
            ? 'bg-brand-600 ring-brand-700/30 shadow-[inset_0_1px_2px_rgb(0_0_0/0.12)]'
            : 'bg-ink-200 ring-ink-300/40',
        )}
      >
        <span className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgb(11_17_28/0.25)] transition-all duration-200 ease-out',
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
export function Badge({ children, className, tone = 'neutral' }: {
  children: ReactNode
  className?: string
  tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'
}) {
  const tones = {
    neutral: 'bg-ink-50 text-ink-600 ring-ink-200',
    brand: 'bg-brand-50 text-brand-700 ring-brand-200',
    success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    warning: 'bg-amber-50 text-amber-700 ring-amber-200',
    danger: 'bg-red-50 text-red-700 ring-red-200',
    info: 'bg-sky-50 text-sky-700 ring-sky-200',
  }[tone]
  return <span className={cn('badge ring-1 ring-inset', tones, className)}>{children}</span>
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
      <div className="min-w-0">
        <h3 className="font-display text-title-sm text-ink-950">{title}</h3>
        {description && <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function EmptyState({ title, description, icon, action }: {
  title: string; description?: string; icon?: ReactNode; action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="relative">
        <span className="absolute inset-0 rounded-2xl bg-brand-500/10 blur-lg" aria-hidden="true" />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-ink-200/70 bg-gradient-to-b from-white to-ink-50 text-ink-400 shadow-card">
          {icon ?? <Inbox className="h-6 w-6" />}
        </div>
      </div>
      <div>
        <p className="font-display text-title-sm text-ink-900">{title}</p>
        {description && <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-500">{description}</p>}
      </div>
      {action}
    </div>
  )
}

/**
 * Cartão de indicador.
 *
 * É o elemento mais visível do painel, então concentra o acabamento:
 * rótulo discreto, valor em escala display, variação com cor semântica e
 * ícone em pílula com fundo tonal. O número usa `tabular` para não dançar
 * quando o valor atualiza em tempo real.
 */
export function StatCard({
  label, value, hint, delta, icon, tone = 'brand', onClick, className,
}: {
  label: string
  value: ReactNode
  hint?: string
  /** Variação percentual ou absoluta. Positivo = verde, negativo = vermelho. */
  delta?: { value: string; positive?: boolean }
  icon?: ReactNode
  tone?: 'brand' | 'accent' | 'neutral' | 'danger'
  onClick?: () => void
  className?: string
}) {
  const toneMap = {
    brand: 'bg-brand-50 text-brand-700 ring-brand-100',
    accent: 'bg-accent-50 text-accent-600 ring-accent-100',
    neutral: 'bg-ink-100 text-ink-600 ring-ink-200',
    danger: 'bg-red-50 text-red-600 ring-red-100',
  }[tone]

  const Wrapper = onClick ? 'button' : 'div'

  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        'group relative w-full overflow-hidden rounded-2xl border border-ink-200/70 bg-white p-4 text-left shadow-card',
        onClick && 'transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-ink-300/70 hover:shadow-card-hover',
        className,
      )}
    >
      {/* halo tonal que aparece no hover — profundidade sem poluir o repouso */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand-500/5 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-500">{label}</p>
          <p className="kpi-value tabular mt-2">{value}</p>
          {delta && (
            <p className={cn(
              'mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold',
              delta.positive === false ? 'text-red-600' : 'text-brand-700',
            )}>
              <span aria-hidden="true">{delta.positive === false ? '▼' : '▲'}</span>
              {delta.value}
            </p>
          )}
          {hint && !delta && <p className="mt-1.5 text-[12px] text-ink-500">{hint}</p>}
        </div>
        {icon && (
          <span className={cn('shrink-0 rounded-xl p-2.5 ring-1 ring-inset transition-transform duration-200 group-hover:scale-105', toneMap)}>
            {icon}
          </span>
        )}
      </div>
    </Wrapper>
  )
}

export function Skeleton({ className }: { className?: string }) {
  // shimmer comunica "carregando"; o pulse puro parece conteúdo vazio
  return <div className={cn('skeleton-shimmer', className)} aria-hidden="true" />
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/55 p-0 backdrop-blur-[3px] animate-fade-in sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'flex max-h-[92vh] w-full flex-col overflow-hidden border border-white/60 bg-white sm:rounded-2xl',
          'shadow-modal animate-scale-in',
          width,
        )}
      >
        {/* cabeçalho com gradiente discreto: separa sem precisar de borda dura */}
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 bg-gradient-to-b from-white to-ink-50/40 px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-title-md text-ink-950">{title}</h2>
            {description && <p className="mt-1 text-[13px] leading-relaxed text-ink-500">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="-mr-1 rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-ink-100 bg-ink-50/60 px-5 py-3.5">
            {footer}
          </div>
        )}
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
