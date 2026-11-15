import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Menu, X, MessageCircle, LogIn } from 'lucide-react'
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
    <div className="flex min-h-screen flex-col bg-white">
      <header className="sticky top-0 z-40 border-b border-ink-200/70 bg-white/85 backdrop-blur-md">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          <Logo />
          <nav className="hidden items-center gap-1 lg:flex">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) => cn(
                  'rounded-lg px-3 py-2 text-[13.5px] font-medium transition',
                  isActive ? 'bg-brand-50 text-brand-800' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                )}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            <Link to="/entregadores" className="btn-ghost btn-sm">Seja entregador</Link>
            <Link to={profile ? homeRoute : '/entrar'} className="btn-primary btn-sm">
              <LogIn className="h-4 w-4" />
              {profile ? 'Meu painel' : 'Entrar'}
            </Link>
          </div>
          <button
            className="rounded-lg p-2 text-ink-700 hover:bg-ink-100 lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {open && (
          <div className="border-t border-ink-100 bg-white lg:hidden">
            <div className="container-page grid gap-1 py-3">
              {links.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  className={({ isActive }) => cn(
                    'rounded-lg px-3 py-2.5 text-sm font-medium',
                    isActive ? 'bg-brand-50 text-brand-800' : 'text-ink-700 hover:bg-ink-100',
                  )}
                >
                  {l.label}
                </NavLink>
              ))}
              <Link to="/entregadores" className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-100">
                Seja entregador
              </Link>
              <Link to={profile ? homeRoute : '/entrar'} className="btn-primary mt-2">
                <LogIn className="h-4 w-4" /> {profile ? 'Meu painel' : 'Entrar na plataforma'}
              </Link>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="mt-16 border-t border-ink-200 bg-ink-950 text-ink-300">
        <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo variant="light" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-400">
              Plataforma de logística e transporte de medicamentos para farmácias de manipulação.
              Pedidos, despacho, acompanhamento e financeiro em um só lugar.
            </p>
          </div>
          <div>
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-500">Plataforma</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/servicos" className="hover:text-white">Serviços</Link></li>
              <li><Link to="/farmacias" className="hover:text-white">Para farmácias</Link></li>
              <li><Link to="/como-funciona" className="hover:text-white">Como funciona</Link></li>
              <li><Link to="/entregadores" className="hover:text-white">Seja entregador</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-500">Acesso</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/entrar" className="hover:text-white">Painel administrativo</Link></li>
              <li><Link to="/entrar" className="hover:text-white">Portal da farmácia</Link></li>
              <li><Link to="/entrar" className="hover:text-white">Área do entregador</Link></li>
              <li><Link to="/orcamento" className="hover:text-white">Solicitar orçamento</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-500">Contato</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/contato" className="hover:text-white">Fale com a equipe</Link></li>
              {WHATSAPP_NUMBER && (
                <li>
                  <a href={whatsappLink("Olá! Gostaria de informações sobre o transporte de medicamentos D'Luca.")} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-white">
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 py-5">
          <div className="container-page flex flex-col items-center justify-between gap-2 text-xs text-ink-500 sm:flex-row">
            <p>© {new Date().getFullYear()} D'Luca Transportes. Todos os direitos reservados.</p>
            <p>D'Luca Connect · plataforma de logística em saúde</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
