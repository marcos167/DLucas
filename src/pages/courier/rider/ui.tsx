import type { ButtonHTMLAttributes, ComponentType, ReactNode, SVGProps } from 'react'
import { cn } from '@/lib/utils'
import type { Courier } from '@/types'

/**
 * Peças visuais do aplicativo dos entregadores.
 *
 * O desenho segue o aplicativo original da operação: fundo verde-escuro,
 * telas vazias com um ícone grande e uma frase, filtros e ações em pílula.
 * As cores vêm do tema `theme-rider` (ver `tailwind.config.ts`).
 */

/** O que o `CourierLayout` entrega às telas pelo `Outlet`. */
export interface CourierOutlet {
  courier: Courier | null
  setCourier: (courier: Courier) => void
  /** ofertas aguardando resposta */
  offerCount: number
  toggleAvailability: () => Promise<void>
  openPassword: () => void
  signOut: () => Promise<void>
}

type Icon = ComponentType<SVGProps<SVGSVGElement> & { strokeWidth?: number | string }>

/** Tela sem nada para mostrar: ícone grande, uma frase e, se fizer sentido, uma ação. */
export function QuietState({ icon: IconComponent, title, description, action, muted, className }: {
  icon: Icon
  title?: string
  description: string
  action?: ReactNode
  /** ícone apagado, para quando a frase é só um aviso */
  muted?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center px-8 text-center', className)}>
      {/* como no original: desenho grande de traço fino quando há título, pequeno e apagado quando é só um aviso */}
      <IconComponent
        className={muted ? 'h-12 w-12 text-ink-400' : 'h-[5.25rem] w-[5.25rem] text-ink-950'}
        strokeWidth={muted ? 1.5 : 0.55}
        aria-hidden="true"
      />
      {title && <p className="mt-4 text-[15px] font-semibold text-ink-950">{title}</p>}
      <p className={cn('max-w-[19.5rem] text-[13px] leading-normal text-ink-600', title ? 'mt-2.5' : 'mt-4')}>{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Filtro em pílula; o escolhido fica preenchido. */
export function Chip({ active, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <button
      type="button" aria-pressed={active}
      className={cn(
        'h-[2.625rem] shrink-0 rounded-full px-3 text-xs transition-colors',
        active ? 'bg-brand-700 font-medium text-white' : 'border border-ink-200 text-ink-600 active:bg-ink-100',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

/** Ação secundária em pílula com contorno. */
export function PillButton({ icon, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border border-ink-200 px-3 text-[13px] font-medium text-ink-950',
        'transition-colors active:bg-ink-100 disabled:opacity-50',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500', className)}>{children}</h2>
}

/** Conteúdo de uma aba, na largura de leitura do aplicativo. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto max-w-lg px-4 py-4', className)}>{children}</div>
}

type DrawingProps = SVGProps<SVGSVGElement> & { strokeWidth?: number | string }

function Drawing({ strokeWidth = 2, children, ...rest }: DrawingProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...rest}
    >
      {children}
    </svg>
  )
}

/** Caixa de encomenda com a fita tracejada: o desenho de "Hoje começa em silêncio". */
export function ParcelBox(props: DrawingProps) {
  return (
    <Drawing {...props}>
      <path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7L12 2.5Z" />
      <path d="M3.5 7 12 11.5 20.5 7" />
      <path d="M12 11.5v10" />
      <path d="m7.75 4.75 8.5 4.5" strokeDasharray="0.9 1.2" />
    </Drawing>
  )
}

/** Calendário com os dias em pontos: o desenho de "Calendário em silêncio". */
export function QuietCalendar(props: DrawingProps) {
  return (
    <Drawing {...props}>
      <rect x="3" y="4.5" width="18" height="16.5" rx="1.5" />
      <path d="M7.5 2.5v4M16.5 2.5v4M3 9h18" />
      <g fill="currentColor" stroke="none">
        <circle cx="8.25" cy="13" r="0.8" />
        <circle cx="12" cy="13" r="0.8" />
        <circle cx="15.75" cy="13" r="0.8" />
        <circle cx="8.25" cy="16.75" r="0.8" opacity="0.45" />
        <circle cx="12" cy="16.75" r="0.8" opacity="0.45" />
      </g>
    </Drawing>
  )
}

/** Caixa com seta para baixo: o ícone da aba "Disponíveis" (retiradas que o entregador pode pegar). */
export function ArchiveDown(props: DrawingProps) {
  return (
    <Drawing {...props}>
      <rect width="20" height="5" x="2" y="3" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M12 11v6" />
      <path d="m9 14 3 3 3-3" />
    </Drawing>
  )
}
