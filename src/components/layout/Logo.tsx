import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

export function Logo({ className, variant = 'dark', compact = false }: {
  className?: string
  variant?: 'dark' | 'light'
  compact?: boolean
}) {
  return (
    <Link to="/" className={cn('group inline-flex items-center gap-2.5', className)}>
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-brand-800 shadow-sm ring-1 ring-brand-900/10">
        <span className="font-display text-[15px] font-extrabold leading-none text-brand-200">D</span>
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent ring-2 ring-white" />
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className={cn(
            'block font-display text-[15px] font-extrabold tracking-tight',
            variant === 'light' ? 'text-white' : 'text-ink-950',
          )}>
            D'Luca <span className={variant === 'light' ? 'text-brand-300' : 'text-brand-700'}>Connect</span>
          </span>
          <span className={cn(
            'block text-[10px] font-semibold uppercase tracking-[0.14em]',
            variant === 'light' ? 'text-white/50' : 'text-ink-400',
          )}>
            Transportes
          </span>
        </span>
      )}
    </Link>
  )
}
