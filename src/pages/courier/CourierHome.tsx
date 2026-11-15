import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useOutletContext } from 'react-router-dom'
import { CheckCircle2, ChevronRight, ScanLine, Search, X } from 'lucide-react'
import { Alert, Badge, Progress, Skeleton } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { listCourierOrders } from '@/lib/api'
import {
  ACTIVE_ORDER_STATUSES, firstName, greeting, orderMatches, searchStops, todayOrders, todayRoutes,
} from '@/lib/courierDay'
import { MANIFEST_STATUS, routeName, todayLocal } from '@/lib/logistics/labels'
import { dayProgress } from '@/lib/logistics/offline/queue'
import { AVAILABILITY_LABEL, cn, formatDate } from '@/lib/utils'
import type { RiderRoute } from '@/lib/logistics/types'
import type { Courier, CourierOrder } from '@/types'
import { OrderCard } from './rider/OrderCard'
import { useRider } from './rider/RiderContext'
import { RouteCard } from './rider/RouteCard'
import { OfflineNotice, SyncStatus } from './rider/SyncStatus'
import { ArchiveDown, Page, ParcelBox, QuietState, SectionTitle, type CourierOutlet } from './rider/ui'

/**
 * Aba "Hoje": o trabalho do dia em um lugar só — os roteiros liberados pela
 * distribuição e as entregas avulsas atribuídas pelo despacho.
 */
export default function CourierHome() {
  const { courier, offerCount, toggleAvailability } = useOutletContext<CourierOutlet>()
  const { profile } = useAuth()
  const { day, pending, attention, loading, error } = useRider()
  const [query, setQuery] = useState('')
  const today = todayLocal()

  const active = useQuery({
    queryKey: ['courier-active-orders', courier?.id],
    queryFn: () => listCourierOrders({ courierId: courier!.id, status: ACTIVE_ORDER_STATUSES, limit: 100 }),
    enabled: !!courier?.id,
    refetchInterval: 20_000,
  })
  const delivered = useQuery({
    queryKey: ['courier-today', courier?.id],
    queryFn: () => listCourierOrders({ courierId: courier!.id, status: ['DELIVERED'], limit: 50 }),
    enabled: !!courier?.id,
  })

  const allRoutes = day?.routes ?? []
  const routes = todayRoutes(allRoutes, today)
  const openRoutes = routes.filter((route) => route.status !== 'COMPLETED')
  const finishedRoutes = routes.filter((route) => route.status === 'COMPLETED')
  const orders = todayOrders(active.data ?? [], today)
  const doneOrders = (delivered.data ?? []).filter((order) => order.delivered_at && todayLocal(new Date(order.delivered_at)) === today)

  const progress = dayProgress(day ? { ...day, routes } : null)
  const manifest = day?.manifests.filter((item) => item.status !== 'CLOSED').at(-1) ?? null
  const notLoaded = openRoutes.flatMap((route) => route.stops.flatMap((stop) => stop.packages))
    .filter((pkg) => pkg.status === 'ROUTED' || pkg.status === 'RETURNED').length

  const starting = !!courier && ((loading && !day) || (active.isLoading && !active.data))
  const nothing = routes.length === 0 && orders.length === 0 && doneOrders.length === 0
  const searching = query.trim().length > 0
  const name = firstName(courier?.full_name || profile?.full_name)

  return (
    <>
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-3.5">
          <h1 className="min-w-0 truncate font-editorial text-[20px] font-medium leading-tight text-ink-950">
            {greeting()}{name ? `, ${name}` : ''}.
          </h1>
          {courier && <AvailabilityPill courier={courier} onToggle={toggleAvailability} />}
        </div>
      </header>

      <div className="border-b border-ink-200 bg-white/50">
        <div className="mx-auto max-w-lg px-4 py-2">
          <label className="relative block">
            <span className="sr-only">Buscar nas suas entregas</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-ink-400" aria-hidden="true" />
            <input
              type="search" inputMode="search" enterKeyHint="search" autoComplete="off"
              value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder="Protocolo, endereço, farmácia…"
              className="h-11 w-full rounded-xl border border-ink-200 bg-ink-50 pl-10 pr-10 text-[14.5px] text-ink-950 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-0 [&::-webkit-search-cancel-button]:hidden"
            />
            {searching && (
              <button
                type="button" onClick={() => setQuery('')} aria-label="Limpar busca"
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-500 active:bg-ink-100"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
        </div>
      </div>

      <Page className="space-y-4">
        <OfflineNotice />
        {error && <Alert tone="danger" title="Não foi possível atualizar">{error}</Alert>}

        {offerCount > 0 && !searching && (
          <Link to="/entregador/disponiveis" className="flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3">
            <ArchiveDown className="h-5 w-5 shrink-0 text-brand-800" aria-hidden="true" />
            <span className="min-w-0 flex-1 text-[13px] font-semibold text-ink-950">
              {offerCount === 1 ? '1 retirada disponível para você' : `${offerCount} retiradas disponíveis para você`}
              <span className="block text-[12px] font-normal text-ink-600">Toque para ver e responder.</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" />
          </Link>
        )}

        {searching ? (
          <SearchResults query={query} orders={active.data ?? []} routes={allRoutes} today={today} />
        ) : starting ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </div>
        ) : (
          <>
            {(routes.length > 0 || pending + attention > 0) && <SyncStatus />}

            {nothing && (
              <QuietState
                className="pb-10 pt-16"
                icon={ParcelBox}
                title="Hoje começa em silêncio"
                description="Aguarde o despacho cadastrar suas entregas do dia."
              />
            )}

            {routes.length > 0 && (
              <>
                <div className="rounded-2xl border border-ink-200 bg-white p-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Roteiros de hoje</p>
                      <p className="font-display text-2xl font-bold text-ink-950">
                        {progress.delivered}<span className="text-base font-medium text-ink-400"> / {progress.packages} pacotes</span>
                      </p>
                    </div>
                    <p className="text-right text-[12px] text-ink-500">
                      {progress.routesDone} de {progress.routes} roteiros<br />{progress.addresses} endereços
                    </p>
                  </div>
                  <div className="mt-3">
                    <Progress value={progress.packages ? ((progress.delivered + progress.failed) / progress.packages) * 100 : 0} />
                  </div>
                  <div className="mt-2 flex gap-3 text-[11.5px] text-ink-600">
                    <span>{progress.pending} a entregar</span>
                    {progress.failed > 0 && <span className="font-semibold text-red-700">{progress.failed} não entregue(s)</span>}
                  </div>
                </div>

                <Link to="/entregador/conferencia" className="flex items-center gap-3 rounded-2xl border border-ink-200 bg-white px-4 py-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-800"><ScanLine className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1 text-[12.5px]">
                    <p className="font-semibold text-ink-900">Conferência de pacotes</p>
                    <p className="text-ink-500">
                      {manifest
                        ? `${MANIFEST_STATUS[manifest.status]} · ${manifest.items.length} conferido(s)`
                        : notLoaded > 0 ? `${notLoaded} pacote(s) para conferir antes de sair` : 'Nenhuma conferência aberta'}
                    </p>
                  </div>
                  {manifest?.status !== 'DEPARTED' && notLoaded > 0 && <Badge tone="warning">{notLoaded}</Badge>}
                  <ChevronRight className="h-4 w-4 text-ink-400" />
                </Link>

                <section className="space-y-2">
                  <SectionTitle>Roteiros ({openRoutes.length})</SectionTitle>
                  {openRoutes.length === 0 && (
                    <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-medium text-emerald-900">
                      <CheckCircle2 className="h-4 w-4" /> Todos os roteiros do dia foram concluídos.
                    </div>
                  )}
                  {openRoutes.map((route) => <RouteCard key={route.id} route={route} />)}
                </section>
              </>
            )}

            {orders.length > 0 && (
              <section className="space-y-2">
                <SectionTitle>Entregas ({orders.length})</SectionTitle>
                {orders.map((order) => <OrderCard key={order.id} order={order} />)}
              </section>
            )}

            {finishedRoutes.length > 0 && (
              <section className="space-y-2">
                <SectionTitle>Roteiros concluídos ({finishedRoutes.length})</SectionTitle>
                {finishedRoutes.map((route) => <RouteCard key={route.id} route={route} />)}
              </section>
            )}

            {doneOrders.length > 0 && (
              <section className="space-y-2">
                <SectionTitle>Entregas concluídas hoje ({doneOrders.length})</SectionTitle>
                <div className="divide-y divide-ink-100 rounded-2xl border border-ink-200 bg-white">
                  {doneOrders.map((order) => (
                    <Link key={order.id} to={`/entregador/entrega/${order.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="font-mono text-[11.5px] font-semibold text-ink-900">{order.code}</p>
                        <p className="truncate text-[11px] text-ink-500">{order.delivery_district || order.delivery_city}</p>
                      </div>
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </Page>
    </>
  )
}

/** Busca em tudo o que o entregador tem em mãos: entregas avulsas e paradas dos roteiros, de hoje e dos próximos dias. */
function SearchResults({ query, orders, routes, today }: {
  query: string
  orders: CourierOrder[]
  routes: RiderRoute[]
  today: string
}) {
  const foundOrders = orders.filter((order) => orderMatches(order, query))
  const foundStops = searchStops(routes, query)
  if (foundOrders.length === 0 && foundStops.length === 0) {
    return (
      <p className="px-4 py-12 text-center text-[14px] text-ink-500">
        Nada encontrado para “{query.trim()}” nas suas entregas.
      </p>
    )
  }
  return (
    <>
      {foundOrders.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>Entregas ({foundOrders.length})</SectionTitle>
          {foundOrders.map((order) => <OrderCard key={order.id} order={order} />)}
        </section>
      )}
      {foundStops.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>Paradas dos roteiros ({foundStops.length})</SectionTitle>
          <div className="divide-y divide-ink-100 rounded-2xl border border-ink-200 bg-white">
            {foundStops.map(({ route, stop, packages }) => (
              <Link key={stop.id} to={`/entregador/rotas/${route.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-ink-50">
                <span className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold',
                  stop.status === 'PENDING' ? 'bg-brand-100 text-brand-900' : 'bg-ink-100 text-ink-500',
                )}>{stop.sequence}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-ink-950">{stop.street}{stop.number ? `, ${stop.number}` : ''}</p>
                  <p className="truncate text-[12px] text-ink-500">
                    {routeName(route.sequence)}{route.route_date !== today ? ` · ${formatDate(route.route_date)}` : ''}
                    {' · '}{packages.map((pkg) => pkg.tracking_code).join(', ')}
                  </p>
                  <p className="truncate text-[12px] text-ink-500">{[...new Set(packages.map((pkg) => pkg.recipient_name))].join(', ')}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

/** Disponibilidade para receber retiradas; um toque alterna entre disponível e offline. */
function AvailabilityPill({ courier, onToggle }: { courier: Courier; onToggle: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const available = courier.availability === 'AVAILABLE'
  return (
    <button
      type="button" disabled={busy}
      onClick={async () => { setBusy(true); try { await onToggle() } finally { setBusy(false) } }}
      aria-label={`Disponibilidade: ${AVAILABILITY_LABEL[courier.availability]}. Toque para ficar ${available ? 'offline' : 'disponível'}.`}
      // a pílula tem a altura do original (28 px); a área de toque se estende além dela
      className="relative inline-flex h-7 shrink-0 items-center gap-2 rounded-full bg-ink-200/70 px-3 text-[12.5px] font-medium text-ink-950 transition-colors before:absolute before:-inset-2 before:content-[''] active:bg-ink-200 disabled:opacity-60"
    >
      <span className={cn(
        'h-2 w-2 rounded-full',
        available ? 'bg-emerald-600' : courier.availability === 'ON_DELIVERY' ? 'bg-sky-600' : 'bg-ink-400',
      )} />
      {AVAILABILITY_LABEL[courier.availability]}
    </button>
  )
}
