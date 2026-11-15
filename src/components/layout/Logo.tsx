import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

/** A monogram shared by the institutional site and every existing product area. */
export function LogoMark({
  size = 'md', variant = 'dark', className,
}: {
  size?: 'sm' | 'md' | 'lg'
  variant?: 'dark' | 'light'
  className?: string
}) {
  const dims = { sm: 'h-8 w-8 text-[19px]', md: 'h-10 w-10 text-[23px]', lg: 'h-12 w-12 text-[28px]' }[size]
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative flex shrink-0 items-center justify-center border font-editorial leading-none',
        variant === 'light'
          ? 'border-brand-400/70 bg-white/[0.04] text-brand-300'
          : 'border-brand-600/50 bg-ink-950 text-brand-300',
        dims, className,
      )}
    >
      D<span className="absolute bottom-1 right-1 h-1 w-1 rounded-full bg-brand-400" />
    </span>
  )
}

export function Logo({
  className, variant = 'dark', compact = false, size = 'md',
}: {
  className?: string
  variant?: 'dark' | 'light'
  compact?: boolean
  size?: 'sm' | 'md' | 'lg'
}) {
  const title = { sm: 'text-[13px]', md: 'text-[15px]', lg: 'text-[18px]' }[size]
  return (
    <Link to="/" aria-label="D'Luca Connect — início" className={cn('group inline-flex items-center gap-3 transition-opacity hover:opacity-80', className)}>
      <LogoMark size={size} variant={variant} />
      {!compact && (
        <span className="leading-none">
          <span className={cn('block font-display font-bold uppercase tracking-[0.14em]', title, variant === 'light' ? 'text-ink-50' : 'text-ink-950')}>
            D'Luca <span className={variant === 'light' ? 'text-brand-300' : 'text-brand-700'}>Connect</span>
          </span>
          <span className={cn('mt-1.5 block text-[9px] font-semibold uppercase tracking-[0.29em]', variant === 'light' ? 'text-ink-300' : 'text-ink-600')}>
            Transportes
          </span>
        </span>
      )}
    </Link>
  )
}
