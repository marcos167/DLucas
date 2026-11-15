import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Home, Inbox, History, User, LogOut, Bike, BellRing, Route as RouteIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn, AVAILABILITY_LABEL, formatDateTime } from '@/lib/utils'
import { updateCourier } from '@/lib/api'
import { ChangePasswordModal } from '@/components/layout/ChangePasswordModal'
import type { Courier } from '@/types'
import { RiderProvider, useRider } from './rider/RiderContext'
import { enableOfflineShell } from './rider/offlineShell'

const tabs = [
  { to: '/entregador', label: 'Início', icon: Home, end: true },
  { to: '/entregador/rotas', label: 'Rotas', icon: RouteIcon },
  { to: '/entregador/ofertas', label: 'Ofertas', icon: Inbox },
  { to: '/entregador/historico', label: 'Histórico', icon: History },
  { to: '/entregador/perfil', label: 'Perfil', icon: User },
]

export default function CourierLayout() {
  const { profile, courier, signOut, updatePassword } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [localCourier, setLocalCourier] = useState<Courier | null>(courier)
  const [offerCount, setOfferCount] = useState(0)
  const [pwOpen, setPwOpen] = useState(false)

  useEffect(() => {
    if (profile?.must_change_password) setPwOpen(true)
  }, [profile?.must_change_password])

  useEffect(() => { setLocalCourier(courier) }, [courier])

  // guarda a casca do aplicativo e as telas de rota para abrir sem internet
  useEffect(() => {
    void enableOfflineShell([
      () => import('./RiderRoutes'), () => import('./RiderRoute'), () => import('./RiderCheck'),
    ])
  }, [])

  useEffect(() => {
    if (!courier?.id) return
    const load = async () => {
      const { count } = await supabase
        .from('delivery_offers')
        .select('id', { count: 'exact', head: true })
        .eq('courier_id', courier.id)
        .eq('status', 'PENDING')
      setOfferCount(count ?? 0)
    }
    void load()
    const channel = supabase
      .channel(`courier-offers-${courier.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'delivery_offers', filter: `courier_id=eq.${courier.id}` },
        () => void load())
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [courier?.id])

  const title = location.pathname === '/entregador' ? 'Meu dia'
    : location.pathname.startsWith('/entregador/rotas') ? 'Minhas rotas'
    : location.pathname.startsWith('/entregador/conferencia') ? 'Conferência'
    : location.pathname.startsWith('/entregador/ofertas') ? 'Ofertas'
    : location.pathname.startsWith('/entregador/historico') ? 'Histórico'
    : location.pathname.startsWith('/entregador/perfil') ? 'Perfil'
    : location.pathname.startsWith('/entregador/entrega') ? 'Entrega'
    : 'Entregador'

  async function toggleAvailability(avail: Courier['availability']) {
    if (!localCourier) return
    await updateCourier(localCourier.id, { availability: avail })
    setLocalCourier({ ...localCourier, availability: avail })
  }

  return (
    <RiderProvider courierId={localCourier?.id ?? null}>
    <div className="min-h-screen bg-ink-50 pb-20">
      <header className="sticky top-0 z-20 border-b border-ink-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-lg items-center gap-3 px-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-800 text-[13px] font-extrabold text-brand-200">D</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-ink-950">{title}</p>
            <p className="truncate text-[10.5px] text-ink-500">{profile?.full_name || profile?.email}</p>
          </div>
          {localCourier && (
            <button
              onClick={() => toggleAvailability(localCourier.availability === 'AVAILABLE' ? 'OFFLINE' : 'AVAILABLE')}
              className={cn(
                'rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide',
                localCourier.availability === 'AVAILABLE' ? 'bg-emerald-100 text-emerald-800'
                  : localCourier.availability === 'ON_DELIVERY' ? 'bg-blue-100 text-blue-800'
                  : 'bg-ink-200 text-ink-600',
              )}
            >
              {AVAILABILITY_LABEL[localCourier.availability]}
            </button>
          )}
          <button
            onClick={async () => { await signOut(); navigate('/entrar') }}
            className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100" aria-label="Sair"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-4">
        {location.pathname === '/entregador' && <RoutesShortcut />}
        <Outlet context={{ courier: localCourier, setCourier: setLocalCourier }} />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-ink-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-lg items-stretch">
          {tabs.map((t) => (
            <NavLink
              key={t.to} to={t.to} end={t.end}
              className={({ isActive }) => cn(
                'relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10.5px] font-medium transition',
                isActive ? 'text-brand-800' : 'text-ink-500',
              )}
            >
              <t.icon className="h-5 w-5" />
              {t.label}
              {t.to === '/entregador/rotas' && <UnsentBadge />}
              {t.to === '/entregador/ofertas' && offerCount > 0 && (
                <span className="absolute right-[26%] top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {offerCount}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {!localCourier && (
        <div className="mx-auto max-w-lg px-4 pb-6">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12.5px] text-amber-900">
            Seu usuário ainda não possui cadastro de entregador vinculado. Fale com a central.
            {profile?.created_at && <span className="block text-[11px] text-amber-700">Conta criada em {formatDateTime(profile.created_at)}</span>}
          </div>
        </div>
      )}

      {offerCount > 0 && location.pathname === '/entregador' && (
        <div className="fixed bottom-16 left-0 right-0 z-10 flex justify-center">
          <NavLink to="/entregador/ofertas" className="flex items-center gap-2 rounded-full bg-ink-950 px-4 py-2 text-[12px] font-semibold text-white shadow-lift">
            <BellRing className="h-4 w-4 text-brand-300" /> {offerCount} nova(s) oferta(s)
          </NavLink>
        </div>
      )}

      <div className="fixed bottom-16 right-3 z-0 opacity-[0.03]">
        <Bike className="h-24 w-24" />
      </div>

      <ChangePasswordModal
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        onSubmit={updatePassword}
        forced={!!profile?.must_change_password}
      />
    </div>
    </RiderProvider>
  )
}

/** Atalho na tela inicial quando há roteiros liberados para o dia. */
function RoutesShortcut() {
  const { day } = useRider()
  const open = day?.routes.filter((route) => route.status !== 'COMPLETED').length ?? 0
  if (open === 0) return null
  return (
    <NavLink to="/entregador/rotas" className="mb-4 flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3">
      <RouteIcon className="h-5 w-5 shrink-0 text-brand-800" />
      <span className="min-w-0 flex-1 text-[13px] font-semibold text-ink-950">
        {open} roteiro(s) liberado(s) para você
        <span className="block text-[12px] font-normal text-ink-600">Toque para ver as paradas e conferir os pacotes.</span>
      </span>
    </NavLink>
  )
}

/** Registros guardados no aparelho que ainda não chegaram ao servidor (ou precisam de atenção). */
function UnsentBadge() {
  const { pending, attention } = useRider()
  if (pending + attention === 0) return null
  return (
    <span className={cn(
      'absolute right-[24%] top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white',
      attention > 0 ? 'bg-red-500' : 'bg-amber-500',
    )}>
      {pending + attention}
    </span>
  )
}
