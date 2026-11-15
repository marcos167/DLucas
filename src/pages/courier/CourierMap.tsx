import { lazy, Suspense, useMemo, useState, type ComponentType } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useOutletContext } from 'react-router-dom'
import { Map as MapIcon, MapPin, Navigation, RefreshCw, X } from 'lucide-react'
import { Skeleton } from '@/components/ui'
import { listCourierOrders } from '@/lib/api'
import {
  ACTIVE_ORDER_STATUSES, DAY_WINDOWS, mapData, type DayWindow, type MapPlace, type MapPoint,
} from '@/lib/courierDay'
import { todayLocal } from '@/lib/logistics/labels'
import { cn } from '@/lib/utils'
import { useRider } from './rider/RiderContext'
import type { RiderMapProps } from './rider/RiderMap'
import { OfflineNotice } from './rider/SyncStatus'
import { Chip, Page, PillButton, QuietState, SectionTitle, type CourierOutlet } from './rider/ui'

/** Sem o desenho do mapa (primeira abertura sem internet), os pontos continuam acessíveis em lista. */
function MapUnavailable({ points }: RiderMapProps) {
  return (
    <div className="h-full overflow-y-auto bg-ink-50 p-4">
      <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12.5px] text-amber-900">
        O mapa precisa de internet para abrir. Enquanto isso, use a lista e o aplicativo de navegação.
      </p>
      <PlaceList places={points} />
    </div>
  )
}

const RiderMap = lazy(async (): Promise<{ default: ComponentType<RiderMapProps> }> => {
  try {
    return await import('./rider/RiderMap')
  } catch {
    return { default: MapUnavailable }
  }
})

/**
 * Aba "Mapa": onde estão as entregas em aberto, por período.
 * Mostra as paradas pendentes dos roteiros e as entregas avulsas em andamento.
 */
export default function CourierMap() {
  const { courier } = useOutletContext<CourierOutlet>()
  const { day, loading, syncing, sync } = useRider()
  const [period, setPeriod] = useState<DayWindow>('today')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const today = todayLocal()

  const active = useQuery({
    queryKey: ['courier-active-orders', courier?.id],
    queryFn: () => listCourierOrders({ courierId: courier!.id, status: ACTIVE_ORDER_STATUSES, limit: 100 }),
    enabled: !!courier?.id,
    refetchInterval: 20_000,
  })

  const data = useMemo(
    () => mapData(day?.routes ?? [], active.data ?? [], period, today),
    [day, active.data, period, today],
  )
  const selected = data.points.find((point) => point.id === selectedId) ?? null
  const starting = !!courier && ((loading && !day) || (active.isLoading && !active.data))
  const empty = data.points.length === 0 && data.unplaced.length === 0
  const refreshing = syncing || active.isFetching

  return (
    <div className="flex min-h-[calc(100dvh-3.75rem-env(safe-area-inset-bottom)-env(safe-area-inset-top))] flex-col">
      <div className="border-b border-ink-200">
        <div className="mx-auto flex max-w-lg gap-2 overflow-x-auto px-3 py-2" role="group" aria-label="Período">
          {DAY_WINDOWS.map((option) => (
            <Chip key={option.id} active={period === option.id} onClick={() => { setPeriod(option.id); setSelectedId(null) }}>
              {option.label}
            </Chip>
          ))}
        </div>
      </div>

      {starting ? (
        <Page className="w-full flex-1"><Skeleton className="h-[52dvh] w-full rounded-2xl" /></Page>
      ) : empty ? (
        <div className="flex flex-1 flex-col">
          <Page className="w-full empty:hidden"><OfflineNotice /></Page>
          <QuietState
            className="flex-1 justify-center pb-20"
            muted icon={MapIcon}
            description="Sem entregas ativas no momento. Pegue uma em Disponíveis ou aguarde uma atribuição."
            action={(
              <PillButton
                disabled={refreshing}
                onClick={() => { void sync(); void active.refetch() }}
                icon={<RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />}
              >
                Atualizar
              </PillButton>
            )}
          />
        </div>
      ) : (
        <>
          {data.points.length > 0 && (
            <div className={cn('relative', data.unplaced.length > 0 ? 'h-[52dvh] min-h-[300px]' : 'min-h-[320px] flex-1')}>
              <div className="absolute inset-0">
                <Suspense fallback={<div className="skeleton h-full w-full !rounded-none" />}>
                  <RiderMap points={data.points} selectedId={selectedId} onSelect={setSelectedId} />
                </Suspense>
              </div>
              {selected && <SelectedCard point={selected} onClose={() => setSelectedId(null)} />}
            </div>
          )}
          {data.unplaced.length > 0 && (
            <Page className="w-full space-y-2">
              <SectionTitle>Sem ponto no mapa ({data.unplaced.length})</SectionTitle>
              <p className="px-1 text-[12.5px] text-ink-500">
                Estes endereços ainda não têm localização registrada. Abra pelo aplicativo de navegação.
              </p>
              <PlaceList places={data.unplaced} />
            </Page>
          )}
        </>
      )}
    </div>
  )
}

/** O que dá para fazer com um ponto: abrir a tela dele no aplicativo ou ir até lá pelo navegador de rotas. */
function PlaceActions({ place, primary }: { place: MapPlace; primary?: boolean }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <Link to={place.href} className={cn(primary ? 'btn-primary' : 'btn-secondary', 'btn-sm col-span-2 justify-center')}>
        {place.kind === 'stop' ? 'Abrir roteiro' : 'Abrir entrega'}
      </Link>
      <a href={place.nav.waze} target="_blank" rel="noreferrer" className="btn-secondary btn-sm justify-center whitespace-nowrap">
        <Navigation className="h-3.5 w-3.5" /> Waze
      </a>
      <a href={place.nav.google} target="_blank" rel="noreferrer" className="btn-secondary btn-sm justify-center whitespace-nowrap">
        <MapPin className="h-3.5 w-3.5" /> Google Maps
      </a>
    </div>
  )
}

function PlaceBadge({ place }: { place: MapPlace }) {
  return (
    <span className={cn(
      'flex h-9 w-9 shrink-0 items-center justify-center font-bold tracking-tight',
      place.label.length > 3 ? 'text-[11px]' : 'text-[13px]',
      place.kind === 'stop' ? 'rounded-full bg-brand-100 text-brand-900' : 'rounded-lg bg-ink-100 text-ink-800',
    )}>{place.label}</span>
  )
}

/** Detalhe do ponto tocado no mapa, com os caminhos para agir. */
function SelectedCard({ point, onClose }: { point: MapPoint; onClose: () => void }) {
  return (
    // fica acima do crédito do mapa, que precisa continuar legível
    <div className="absolute inset-x-3 bottom-8 z-[1000] mx-auto max-w-lg rounded-2xl border border-ink-200 bg-white p-3.5 shadow-lift">
      <div className="flex items-start gap-3">
        <PlaceBadge place={point} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-snug text-ink-950">{point.title}</p>
          <p className="truncate text-[12px] text-ink-500">{point.subtitle}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar" className="-mr-1 -mt-1 rounded-full p-1.5 text-ink-500 active:bg-ink-100">
          <X className="h-4 w-4" />
        </button>
      </div>
      <PlaceActions place={point} primary />
    </div>
  )
}

function PlaceList({ places }: { places: MapPlace[] }) {
  return (
    <ul className="space-y-2">
      {places.map((place) => (
        <li key={place.id} className="rounded-2xl border border-ink-200 bg-white p-3.5">
          <div className="flex items-start gap-3">
            <PlaceBadge place={place} />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold leading-snug text-ink-950">{place.title}</p>
              <p className="truncate text-[12px] text-ink-500">{place.subtitle}</p>
            </div>
          </div>
          <PlaceActions place={place} />
        </li>
      ))}
    </ul>
  )
}
