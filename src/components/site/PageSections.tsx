import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Cabeçalho de página do site.
 *
 * As páginas internas repetiam à mão a mesma estrutura de hero (borda inferior,
 * gradiente, eyebrow, título e subtítulo), com variações acidentais de tamanho e
 * espaçamento entre elas. Centralizar aqui garante que todas respirem igual e
 * que o refinamento visual chegue às páginas internas de uma vez.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  aside,
  className,
}: {
  eyebrow: string
  title: ReactNode
  description?: ReactNode
  /** Botões ou links de ação, exibidos abaixo do texto. */
  actions?: ReactNode
  /** Conteúdo à direita em telas grandes (card de destaque, por exemplo). */
  aside?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('relative overflow-hidden border-b border-ink-200/70', className)}>
      {/* fundo: gradiente suave + grade técnica mascarada */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-50/80 via-white to-white"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgb(18 185 140 / 0.07) 1px, transparent 1px), linear-gradient(to bottom, rgb(18 185 140 / 0.07) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          maskImage: 'radial-gradient(ellipse 60% 55% at 25% 0%, black, transparent 72%)',
          WebkitMaskImage: 'radial-gradient(ellipse 60% 55% at 25% 0%, black, transparent 72%)',
        }}
      />
      {/* halo de marca */}
      <div
        className="pointer-events-none absolute -left-24 -top-32 h-72 w-72 rounded-full bg-brand-300/20 blur-[90px]"
        aria-hidden="true"
      />

      <div
        className={cn(
          'container-page relative py-14 sm:py-16',
          aside ? 'grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:py-20' : 'lg:py-20',
        )}
      >
        <div className="max-w-2xl">
          <p className="eyebrow flex items-center gap-2">
            <span className="h-px w-6 bg-brand-500/50" aria-hidden="true" />
            {eyebrow}
          </p>
          <h1 className="mt-3 font-display text-display-sm text-ink-950 sm:text-display-md">{title}</h1>
          {description && (
            <p className="mt-4 text-[15px] leading-relaxed text-ink-600 sm:text-base">{description}</p>
          )}
          {actions && <div className="mt-8 flex flex-wrap items-center gap-3">{actions}</div>}
        </div>
        {aside && <div className="relative">{aside}</div>}
      </div>
    </header>
  )
}

/**
 * Cartão de recurso/serviço com elevação no hover.
 *
 * O ícone sobe para uma pílula com gradiente e anel; o halo tonal só aparece no
 * hover, o que mantém a grade silenciosa em repouso e responsiva ao ponteiro.
 */
export function FeatureCard({
  icon,
  title,
  children,
  bullets,
  headingLevel = 2,
  className,
}: {
  icon: ReactNode
  title: string
  children?: ReactNode
  bullets?: string[]
  headingLevel?: 2 | 3
  className?: string
}) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2'
  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border border-ink-200/70 bg-white p-6 shadow-card',
        'transition-all duration-200 ease-out hover:-translate-y-1 hover:border-brand-200 hover:shadow-card-hover',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-20 h-20 bg-gradient-to-b from-brand-200/40 to-transparent opacity-0 blur-xl transition-opacity duration-200 group-hover:opacity-100"
      />
      <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100/70 text-brand-700 ring-1 ring-inset ring-brand-200/60 transition-transform duration-200 group-hover:scale-105">
        {icon}
      </div>
      <Heading className="relative mt-4 font-display text-title-sm text-ink-950">{title}</Heading>
      {children && <p className="relative mt-2 text-[13.5px] leading-relaxed text-ink-600">{children}</p>}
      {bullets && bullets.length > 0 && (
        <ul className="relative mt-4 space-y-2 border-t border-ink-100 pt-4">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-2 text-[13px] text-ink-700">
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500 ring-2 ring-brand-100"
                aria-hidden="true"
              />
              {b}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Faixa de chamada final.
 *
 * Fundo escuro em vez do cinza claro anterior: encerra a página com peso e faz o
 * botão de acento ser o único ponto quente da tela.
 */
export function CtaBand({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions: ReactNode
}) {
  return (
    <section className="container-page pb-16 sm:pb-20">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ink-950 via-ink-900 to-[#071019] px-6 py-10 text-white shadow-lift sm:px-10 sm:py-12">
        <div className="bg-grid-subtle pointer-events-none absolute inset-0" aria-hidden="true" />
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-500/25 blur-[80px]"
          aria-hidden="true"
        />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-400/40 to-transparent" aria-hidden="true" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <h2 className="font-display text-title-lg text-white">{title}</h2>
            {description && <p className="mt-2 text-[14px] leading-relaxed text-ink-300">{description}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3">{actions}</div>
        </div>
      </div>
    </section>
  )
}
