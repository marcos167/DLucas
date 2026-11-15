import { Suspense, useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { MapPin, Repeat, Truck, UserRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn, formatDateTime } from '@/lib/utils'
import { updateCourier } from '@/lib/api'
import { ChangePasswordModal } from '@/components/layout/ChangePasswordModal'
import { Skeleton } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'
import type { Courier } from '@/types'
import { RiderProvider, useRider } from './rider/RiderContext'
import { enableOfflineShell } from './rider/offlineShell'
import { ArchiveDown, Page, type CourierOutlet } from './rider/ui'

/**
 * Casca do aplicativo dos entregadores.
 *
 * Segue o aplicativo original da operação: cinco abas embaixo (Hoje, Mapa,
 * Próximas, Disponíveis, Perfil), sem barra de título, em verde-escuro. O tema
 * é ligado pelo endereço (ver `@/lib/riderTheme`); aqui ficam as abas, os
 * dados do dia e o que as telas compartilham.
 */

const tabs = [
  {
    to: '/entregador', label: 'Hoje', icon: Truck,
    // roteiro, conferência e entrega são desdobramentos do trabalho de hoje
    match: (path: string) => path === '/entregador' || /^\/entregador\/(rotas|conferencia|entrega)(\/|$)/.test(path),
  },
  { to: '/entregador/mapa', label: 'Mapa', icon: MapPin, match: (path: string) => path.startsWith('/entregador/mapa') },
  { to: '/entregador/proximas', label: 'Próximas', icon: Repeat, match: (path: string) => path.startsWith('/entregador/proximas') },
  { to: '/entregador/disponiveis', label: 'Disponíveis', icon: ArchiveDown, match: (path: string) => path.startsWith('/entregador/disponiveis') },
  { to: '/entregador/perfil', label: 'Perfil', icon: UserRound, match: (path: string) => /^\/entregador\/(perfil|historico)(\/|$)/.test(path) },
]

export default function CourierLayout() {
  const { profile, courier, signOut, updatePassword } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const { push } = useToast()
  const [localCourier, setLocalCourier] = useState<Courier | null>(courier)
  const [offerCount, setOfferCount] = useState(0)
  const [pwOpen, setPwOpen] = useState(false)

  useEffect(() => {
    if (profile?.must_change_password) setPwOpen(true)
  }, [profile?.must_change_password])

  useEffect(() => { setLocalCourier(courier) }, [courier])

  // guarda a casca do aplicativo e as telas das abas para abrir sem internet
  useEffect(() => {
    void enableOfflineShell([
      () => import('./RiderRoute'), () => import('./RiderCheck'), () => import('./CourierDelivery'),
      () => import('./CourierMap'), () => import('./rider/RiderMap'), () => import('./CourierUpcoming'),
      () => import('./CourierOffers'), () => import('./CourierProfile'), () => import('./CourierHistory'),
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

  const outlet: CourierOutlet = {
    courier: localCourier,
    setCourier: setLocalCourier,
    offerCount,
    openPassword: () => setPwOpen(true),
    signOut: async () => { await signOut(); navigate('/entrar') },
    toggleAvailability: async () => {
      if (!localCourier) return
      const next: Courier['availability'] = localCourier.availability === 'AVAILABLE' ? 'OFFLINE' : 'AVAILABLE'
      try {
        await updateCourier(localCourier.id, { availability: next })
        setLocalCourier({ ...localCourier, availability: next })
      } catch (cause) {
        push({ tone: 'error', message: 'Não foi possível mudar sua disponibilidade.', detail: cause instanceof Error ? cause.message : undefined })
      }
    },
  }

  return (
    <RiderProvider courierId={localCourier?.id ?? null}>
      <div className="min-h-[100dvh] bg-ink-50 pb-[calc(3.75rem+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] text-ink-900">
        {!localCourier && (
          <Page className="pb-0">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12.5px] text-amber-900">
              Seu usuário ainda não possui cadastro de entregador vinculado. Fale com a central.
              {profile?.created_at && <span className="block text-[11px] text-amber-700">Conta criada em {formatDateTime(profile.created_at)}</span>}
            </div>
          </Page>
        )}

        {/* a aba que ainda está carregando não derruba a casca (nem o tema) */}
        <Suspense fallback={<Page className="space-y-3"><Skeleton className="h-24 w-full rounded-2xl" /><Skeleton className="h-20 w-full rounded-2xl" /></Page>}>
          <Outlet context={outlet} />
        </Suspense>

        <nav
          aria-label="Seções do aplicativo"
          className="fixed inset-x-0 bottom-0 z-20 border-t border-ink-200 bg-white pb-[env(safe-area-inset-bottom)]"
        >
          <div className="mx-auto flex max-w-lg items-stretch">
            {tabs.map((tab) => {
              const active = tab.match(location.pathname)
              return (
                <Link
                  key={tab.to} to={tab.to} aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex h-[3.75rem] min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10.5px] leading-none transition-colors',
                    active ? 'font-semibold text-ink-950' : 'font-medium text-ink-700',
                  )}
                >
                  {active && <span className="absolute top-0 h-[3px] w-7 rounded-b-full bg-brand-700" aria-hidden="true" />}
                  <span className="relative">
                    <tab.icon className={cn('h-6 w-6', active && 'text-brand-700')} strokeWidth={2} aria-hidden="true" />
                    {tab.to === '/entregador' && <UnsentBadge />}
                    {tab.to === '/entregador/disponiveis' && offerCount > 0 && (
                      <TabBadge className="bg-red-500" label={`${offerCount} retirada(s) disponível(is)`}>{offerCount}</TabBadge>
                    )}
                  </span>
                  <span className="max-w-full truncate px-0.5 pb-px">{tab.label}</span>
                </Link>
              )
            })}
          </div>
        </nav>

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

function TabBadge({ className, label, children }: { className: string; label: string; children: number }) {
  return (
    <span
      aria-label={label}
      className={cn('absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white', className)}
    >
      {children}
    </span>
  )
}

/** Registros guardados no aparelho que ainda não chegaram ao servidor (ou precisam de atenção). */
function UnsentBadge() {
  const { pending, attention } = useRider()
  if (pending + attention === 0) return null
  return (
    <TabBadge
      className={attention > 0 ? 'bg-red-500' : 'bg-amber-500'}
      label={attention > 0 ? `${attention} registro(s) precisam de atenção` : `${pending} registro(s) aguardando envio`}
    >
      {pending + attention}
    </TabBadge>
  )
}
