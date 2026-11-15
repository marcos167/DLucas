import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Shared institutional page header, preserving each page's content and actions. */
export function PageHeader({ eyebrow, title, description, actions, aside, className }: {
  eyebrow: string
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  aside?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('relative isolate overflow-hidden bg-ink-950 text-ink-50', className)}>
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-40" aria-hidden="true" style={{
        backgroundImage: 'radial-gradient(ellipse at 80% 0%, rgb(198 166 107 / 0.17), transparent 55%), linear-gradient(to right, rgb(198 166 107 / 0.055) 1px, transparent 1px)',
        backgroundSize: 'auto, 90px 90px',
      }} />
      <div className={cn('container-page relative py-20 sm:py-28 lg:py-32', aside && 'grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]')}>
        <div className="max-w-3xl">
          <p className="site-kicker !text-brand-300">{eyebrow}</p>
          <h1 className="mt-6 font-display text-[clamp(2.65rem,5vw,5.5rem)] font-medium leading-[1.1] tracking-[-0.055em] text-ink-50">{title}</h1>
          {description && <p className="mt-7 max-w-2xl text-[15px] leading-8 text-ink-200 sm:text-[17px]">{description}</p>}
          {actions && <div className="mt-9 flex flex-wrap items-center gap-3">{actions}</div>}
        </div>
        {aside && <div className="relative">{aside}</div>}
      </div>
      <div className="absolute bottom-0 left-0 h-px w-full bg-gradient-to-r from-brand-400/60 via-brand-400/10 to-transparent" aria-hidden="true" />
    </header>
  )
}

export function FeatureCard({ icon, title, children, bullets, headingLevel = 2, className }: {
  icon: ReactNode
  title: string
  children?: ReactNode
  bullets?: string[]
  headingLevel?: 2 | 3
  className?: string
}) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2'
  return (
    <div className={cn(
      'group relative flex flex-col overflow-hidden border border-ink-200 bg-white p-7 shadow-card',
      'transition-all duration-300 ease-out hover:-translate-y-1 hover:border-brand-400/60 hover:shadow-card-hover',
      className,
    )}>
      <div className="flex h-12 w-12 items-center justify-center border border-brand-400/40 text-brand-700 transition-colors group-hover:bg-brand-50">{icon}</div>
      <Heading className="mt-10 font-display text-[21px] font-medium tracking-[-0.035em] text-ink-950">{title}</Heading>
      {children && <p className="mt-3 text-[14px] leading-7 text-ink-600">{children}</p>}
      {bullets && bullets.length > 0 && (
        <ul className="mt-7 space-y-3 border-t border-ink-200 pt-6">
          {bullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-3 text-[13px] text-ink-700">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand-600" aria-hidden="true" />
              {bullet}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function CtaBand({ title, description, actions }: {
  title: string
  description?: string
  actions: ReactNode
}) {
  return (
    <section className="container-page pb-20 sm:pb-28">
      <div className="relative overflow-hidden border border-brand-400/30 bg-ink-950 px-7 py-10 text-ink-50 sm:px-12 sm:py-14">
        <div className="pointer-events-none absolute -right-10 -top-16 h-64 w-64 rounded-full bg-brand-400/10 blur-[90px]" aria-hidden="true" />
        <div className="relative flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <p className="site-kicker !text-brand-300">Vamos conversar</p>
            <h2 className="mt-4 font-display text-[clamp(1.6rem,3vw,2.5rem)] font-medium tracking-[-0.04em] text-ink-50">{title}</h2>
            {description && <p className="mt-3 text-[14px] leading-7 text-ink-200">{description}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3">{actions}</div>
        </div>
      </div>
    </section>
  )
}
