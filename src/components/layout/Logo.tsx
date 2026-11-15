import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

/**
 * Marca D'Luca Connect.
 *
 * O símbolo é construído em camadas para não parecer um quadrado colorido:
 * gradiente diagonal, brilho interno na borda superior e uma sombra colorida
 * (não cinza). O ponto âmbar é o único elemento quente da marca — é o que dá
 * o toque de serviço vivo em vez de corporativo genérico.
 */
export function LogoMark({
  size = 'md',
  variant = 'dark',
  className,
}: {
  size?: 'sm' | 'md' | 'lg'
  variant?: 'dark' | 'light'
  className?: string
}) {
  const dims = { sm: 'h-8 w-8 rounded-[10px]', md: 'h-9 w-9 rounded-xl', lg: 'h-12 w-12 rounded-2xl' }[size]
  const text = { sm: 'text-[13px]', md: 'text-[15px]', lg: 'text-xl' }[size]
  const dot = { sm: 'h-1.5 w-1.5', md: 'h-2 w-2', lg: 'h-2.5 w-2.5' }[size]

  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden',
        'bg-gradient-to-br from-brand-800 via-brand-900 to-ink-950',
        'ring-1 ring-inset ring-white/12',
        'shadow-[0_1px_2px_rgb(11_17_28/0.2),0_6px_14px_-6px_rgb(9_95_77/0.55)]',
        dims,
        className,
      )}
    >
      {/* brilho diagonal — dá a sensação de superfície polida */}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent opacity-70" />
      <span className={cn('relative font-display font-extrabold leading-none tracking-tight text-brand-200', text)}>
        D
      </span>
      {/* ponto âmbar: o único acento quente da interface */}
      <span
        className={cn(
          'absolute -right-0.5 -top-0.5 rounded-full bg-accent-400',
          'ring-2',
          variant === 'light' ? 'ring-ink-950' : 'ring-white',
          dot,
        )}
      />
    </span>
  )
}

export function Logo({
  className,
  variant = 'dark',
  compact = false,
  size = 'md',
}: {
  className?: string
  variant?: 'dark' | 'light'
  compact?: boolean
  size?: 'sm' | 'md' | 'lg'
}) {
  const title = { sm: 'text-[13.5px]', md: 'text-[15px]', lg: 'text-lg' }[size]

  return (
    <Link
      to="/"
      className={cn('group inline-flex items-center gap-2.5 transition-opacity hover:opacity-90', className)}
    >
      <LogoMark size={size} variant={variant} />
      {!compact && (
        <span className="leading-none">
          <span
            className={cn(
              'block font-display font-extrabold tracking-[-0.02em]',
              title,
              variant === 'light' ? 'text-white' : 'text-ink-950',
            )}
          >
            D'Luca{' '}
            <span className={variant === 'light' ? 'text-brand-300' : 'text-brand-700'}>Connect</span>
          </span>
          <span
            className={cn(
              'mt-1 block text-[9.5px] font-semibold uppercase tracking-[0.18em]',
              variant === 'light' ? 'text-white/45' : 'text-ink-400',
            )}
          >
            Transportes
          </span>
        </span>
      )}
    </Link>
  )
}
