import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell, ChevronDown, LogOut, Menu, X, KeyRound, User as UserIcon,
} from 'lucide-react'
import { Logo } from './Logo'
import { useAuth } from '@/contexts/AuthContext'
import { cn, initials, ROLE_LABEL } from '@/lib/utils'
import { ChangePasswordModal } from '@/components/layout/ChangePasswordModal'
import { supabase } from '@/lib/supabase'
import type { AppNotification } from '@/types'

export interface NavItem {
  to: string
  label: string
  icon: ReactNode
  end?: boolean
  badge?: number
}

export interface NavSection {
  title: string
  items: NavItem[]
}

export function DashboardShell({
  sections, title, subtitle, accent = 'brand', children, mobileNav = 'sidebar',
}: {
  sections: NavSection[]
  title: string
  subtitle?: string
  accent?: 'brand' | 'ink'
  children: ReactNode
  mobileNav?: 'sidebar' | 'bottom'
}) {
  const { profile, signOut, updatePassword } = useAuth()
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [pwOpen, setPwOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => { setOpen(false); setMenu(false); setNotifOpen(false) }, [location.pathname])

  useEffect(() => {
    if (profile?.must_change_password) setPwOpen(true)
  }, [profile?.must_change_password])

  useEffect(() => {
    if (!profile?.id) return
    let active = true
    const load = async () => {
      const { data } = await supabase
        .from('notifications').select('*').eq('user_id', profile.id)
        .order('created_at', { ascending: false }).limit(20)
      if (active) setNotifications((data ?? []) as AppNotification[])
    }
    void load()
    const channel = supabase
      .channel('notifications-feed')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        () => void load())
      .subscribe()
    return () => { active = false; void supabase.removeChannel(channel) }
  }, [profile?.id])

  const unread = notifications.filter((n) => !n.read_at).length

  async function markAllRead() {
    const ids = notifications.filter((n) => !n.read_at).map((n) => n.id)
    if (!ids.length) return
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids)
    setNotifications((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })))
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-4">
        <Logo variant={accent === 'ink' ? 'light' : 'dark'} />
        <button className="rounded-lg p-1.5 text-ink-400 hover:bg-white/10 lg:hidden" onClick={() => setOpen(false)}>
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
        {sections.map((section) => (
          <div key={section.title}>
            <p className={cn(
              'mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-[0.14em]',
              accent === 'ink' ? 'text-white/35' : 'text-ink-400',
            )}>
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => cn(
                      'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium',
                      'transition-all duration-150 ease-out',
                      accent === 'ink'
                        ? isActive
                          ? 'bg-white/[0.09] text-white shadow-inner-light'
                          : 'text-white/60 hover:bg-white/[0.05] hover:text-white'
                        : isActive
                          ? 'bg-brand-50 text-brand-800 shadow-[inset_0_0_0_1px_rgb(18_185_140/0.12)]'
                          : 'text-ink-600 hover:bg-ink-100/70 hover:text-ink-900',
                    )}
                  >
                    {({ isActive }) => (
                      <>
                        {/* barra vertical: marca a seção atual sem pesar */}
                        <span
                          aria-hidden="true"
                          className={cn(
                            'absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full transition-all duration-200 ease-out',
                            isActive ? 'h-4 w-[3px] opacity-100' : 'h-2 w-[3px] opacity-0',
                            accent === 'ink' ? 'bg-brand-400' : 'bg-brand-600',
                          )}
                        />
                        <span
                          className={cn(
                            'shrink-0 transition-colors',
                            isActive
                              ? accent === 'ink' ? 'text-brand-300' : 'text-brand-700'
                              : 'opacity-70 group-hover:opacity-100',
                          )}
                        >
                          {item.icon}
                        </span>
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge ? (
                          <span
                            className={cn(
                              'rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular',
                              accent === 'ink'
                                ? 'bg-brand-500 text-ink-950'
                                : 'bg-brand-600 text-white',
                            )}
                          >
                            {item.badge}
                          </span>
                        ) : null}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className={cn('border-t px-3 py-3', accent === 'ink' ? 'border-white/10' : 'border-ink-200')}>
        <Link
          to="/"
          className={cn(
            'block rounded-lg px-2.5 py-2 text-xs font-medium',
            accent === 'ink' ? 'text-white/60 hover:bg-white/5 hover:text-white' : 'text-ink-500 hover:bg-ink-100',
          )}
        >
          ← Voltar ao site
        </Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-ink-50">
      {/* sidebar desktop */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-30 hidden w-60 border-r lg:block',
        accent === 'ink'
          ? 'border-white/[0.08] bg-gradient-to-b from-ink-950 to-ink-900'
          : 'border-ink-200/70 bg-white shadow-[1px_0_0_0_rgb(11_17_28/0.02)]',
      )}>
        {sidebar}
      </aside>

      {/* drawer mobile */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/50" onClick={() => setOpen(false)} />
          <aside className={cn(
            'absolute inset-y-0 left-0 w-64 shadow-lift',
            accent === 'ink' ? 'bg-ink-950' : 'bg-white',
          )}>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 border-b border-ink-200/70 bg-white/80 backdrop-blur-md">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button className="rounded-lg p-2 text-ink-600 hover:bg-ink-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu">
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-[15px] font-bold tracking-[-0.01em] text-ink-950">{title}</h1>
              {subtitle && <p className="truncate text-[11.5px] leading-tight text-ink-500">{subtitle}</p>}
            </div>

            <div className="relative">
              <button
                onClick={() => { setNotifOpen((v) => !v); if (!notifOpen) void markAllRead() }}
                className="relative rounded-lg p-2 text-ink-600 hover:bg-ink-100"
                aria-label="Notificações"
              >
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-600" />
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-lift">
                  <div className="border-b border-ink-100 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-ink-500">
                    Notificações
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="px-4 py-6 text-center text-xs text-ink-500">Nenhuma notificação.</p>
                    ) : notifications.map((n) => (
                      <div key={n.id} className="border-b border-ink-100 px-4 py-3 last:border-0">
                        <p className="text-[13px] font-semibold text-ink-900">{n.title}</p>
                        {n.body && <p className="mt-0.5 text-xs text-ink-600">{n.body}</p>}
                        {n.link && (
                          <Link to={n.link} className="mt-1 inline-block text-[11px] font-medium text-brand-700 hover:underline">
                            Abrir
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => setMenu((v) => !v)}
                className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-ink-100"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-800 text-[11px] font-bold text-white">
                  {initials(profile?.full_name || profile?.email)}
                </span>
                <span className="hidden text-left sm:block">
                  <span className="block max-w-[140px] truncate text-[13px] font-semibold text-ink-900">
                    {profile?.full_name || profile?.email}
                  </span>
                  <span className="block text-[10.5px] text-ink-500">{ROLE_LABEL[profile?.role ?? '']}</span>
                </span>
                <ChevronDown className="h-4 w-4 text-ink-400" />
              </button>
              {menu && (
                <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-ink-200 bg-white py-1 shadow-lift">
                  <div className="border-b border-ink-100 px-3 py-2">
                    <p className="truncate text-xs font-semibold text-ink-900">{profile?.email}</p>
                    <p className="text-[11px] text-ink-500">{ROLE_LABEL[profile?.role ?? '']}</p>
                  </div>
                  <button onClick={() => { setPwOpen(true); setMenu(false) }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-ink-700 hover:bg-ink-50">
                    <KeyRound className="h-4 w-4" /> Alterar senha
                  </button>
                  <Link to="/" className="flex items-center gap-2 px-3 py-2 text-[13px] text-ink-700 hover:bg-ink-50">
                    <UserIcon className="h-4 w-4" /> Site institucional
                  </Link>
                  <button
                    onClick={async () => { await signOut(); navigate('/entrar') }}
                    className="flex w-full items-center gap-2 border-t border-ink-100 px-3 py-2 text-left text-[13px] font-medium text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4" /> Sair
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className={cn('px-4 py-5 sm:px-6 sm:py-6', mobileNav === 'bottom' && 'pb-24 lg:pb-6')}>{children}</main>
      </div>

      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} onSubmit={updatePassword} forced={!!profile?.must_change_password} />
    </div>
  )
}
