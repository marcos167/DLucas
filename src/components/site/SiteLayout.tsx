import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ArrowUpRight, Menu, X, MessageCircle } from 'lucide-react'
import { Logo } from '@/components/layout/Logo'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

const links = [
  { to: '/', label: 'Início', end: true },
  { to: '/servicos', label: 'Serviços' },
  { to: '/farmacias', label: 'Para farmácias' },
  { to: '/como-funciona', label: 'Como funciona' },
  { to: '/orcamento', label: 'Orçamento' },
  { to: '/contato', label: 'Contato' },
]

export const WHATSAPP_NUMBER = (import.meta.env.VITE_COMPANY_WHATSAPP as string) || ''
export const whatsappLink = (message: string) =>
  WHATSAPP_NUMBER
    ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
    : ''

export default function SiteLayout() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const { profile, homeRoute } = useAuth()

  useEffect(() => {
    setOpen(false)
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [location.pathname])

  return (
    <div className="site-luxury flex min-h-screen flex-col bg-ink-50">
      <a href="#conteudo" className="skip-link">Pular para o conteúdo</a>
      <header className="sticky top-0 z-40 border-b border-ink-200/70 bg-white/95 text-ink-950 backdrop-blur-xl">
        <div className="container-page flex h-[76px] items-center justify-between gap-5">
          <Logo size="md" />
          <nav className="hidden items-center gap-1 xl:flex" aria-label="Navegação principal">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) => cn(
                  'relative px-3 py-3 text-[12px] font-semibold tracking-[0.04em] transition-colors duration-200',
                  isActive ? 'text-brand-700 after:absolute after:bottom-1 after:left-3 after:right-3 after:h-px after:bg-brand-500' : 'text-ink-700 hover:text-brand-700',
                )}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden items-center gap-5 xl:flex">
            <Link to={profile ? homeRoute : '/entrar'} className="text-[12px] font-semibold text-ink-800 transition hover:text-brand-700">
              {profile ? 'Meu painel' : 'Acessar plataforma'}
            </Link>
            <Link to="/orcamento" className="site-button-ink inline-flex items-center gap-2 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.12em]">
              Solicitar proposta <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center border border-ink-200 text-ink-900 transition hover:border-brand-500 hover:text-brand-700 xl:hidden"
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={open}
            aria-controls="site-mobile-nav"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {open && (
          <nav id="site-mobile-nav" className="border-t border-ink-200 bg-white xl:hidden" aria-label="Navegação móvel">
            <div className="container-page grid gap-1 py-5">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) => cn(
                    'border-b border-ink-200 px-1 py-3 text-sm transition-colors',
                    isActive ? 'text-brand-700' : 'text-ink-800 hover:text-brand-700',
                  )}
                >
                  {link.label}
                </NavLink>
              ))}
              <Link to="/entregadores" className="px-1 py-3 text-sm text-ink-800 hover:text-brand-700">Seja entregador</Link>
              <Link to={profile ? homeRoute : '/entrar'} className="site-button-ink mt-3 inline-flex justify-center px-5 py-3 text-sm font-semibold">
                {profile ? 'Meu painel' : 'Acessar plataforma'}
              </Link>
            </div>
          </nav>
        )}
      </header>

      <main id="conteudo" className="flex-1" tabIndex={-1}>
        <Outlet />
      </main>

      <footer className="border-t border-brand-400/25 bg-ink-950 text-ink-200">
        <div className="container-page grid gap-12 py-16 sm:py-20 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <Logo variant="light" size="lg" />
            <p className="mt-8 max-w-sm font-editorial text-[26px] leading-[1.25] text-ink-50">
              O cuidado continua em cada entrega.
            </p>
            <p className="mt-4 max-w-xs text-sm leading-7 text-ink-300">
              Logística de medicamentos com processos definidos, acompanhamento autorizado e uma plataforma para toda a operação.
            </p>
          </div>
          <div>
            <h2 className="mb-6 text-[10px] font-bold uppercase tracking-[0.22em] text-brand-300">Explore</h2>
            <ul className="space-y-3 text-sm">
              <li><Link to="/servicos" className="transition hover:text-brand-300">Serviços</Link></li>
              <li><Link to="/farmacias" className="transition hover:text-brand-300">Para farmácias</Link></li>
              <li><Link to="/como-funciona" className="transition hover:text-brand-300">Como funciona</Link></li>
              <li><Link to="/empresas" className="transition hover:text-brand-300">Para empresas</Link></li>
            </ul>
          </div>
          <div>
            <h2 className="mb-6 text-[10px] font-bold uppercase tracking-[0.22em] text-brand-300">Plataforma</h2>
            <ul className="space-y-3 text-sm">
              <li><Link to="/entrar" className="transition hover:text-brand-300">Acessar plataforma</Link></li>
              <li><Link to="/entregadores" className="transition hover:text-brand-300">Seja entregador</Link></li>
              <li><Link to="/orcamento" className="transition hover:text-brand-300">Solicitar orçamento</Link></li>
            </ul>
          </div>
          <div>
            <h2 className="mb-6 text-[10px] font-bold uppercase tracking-[0.22em] text-brand-300">Contato</h2>
            <ul className="space-y-3 text-sm">
              <li><Link to="/contato" className="transition hover:text-brand-300">Fale com a equipe</Link></li>
              {WHATSAPP_NUMBER && (
                <li>
                  <a href={whatsappLink("Olá! Gostaria de informações sobre o transporte de medicamentos D'Luca.")} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 transition hover:text-brand-300">
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="container-page flex flex-col gap-3 py-6 text-[11px] tracking-[0.04em] text-ink-300 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} D'Luca Transportes. Todos os direitos reservados.</p>
            <p>Precisão na operação. Cuidado na entrega.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
