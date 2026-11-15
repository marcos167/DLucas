import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Info, MapPin, RefreshCw, ShieldAlert } from 'lucide-react'
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Skeleton, Tabs } from '@/components/ui'
import DeliveryMap from '@/components/dashboard/DeliveryMap'
import { listAvailableCouriers, listOrders } from '@/lib/api'
import { formatDateTime, isLocationFresh, relativeTime } from '@/lib/utils'
import { OrderStatusBadge } from '@/components/dashboard/OrderBits'
import type { MapPoint } from '@/types/map'

export default function DeliveryMapPage() {
  const [tab, setTab] = useState<'active' | 'delivered'>('active')

  const orders = useQuery({
    queryKey: ['map-orders', tab],
    queryFn: () => listOrders({
      status: tab === 'active'
        ? ['ASSIGNED', 'ACCEPTED', 'PICKING_UP', 'COLLECTED', 'IN_TRANSIT', 'PENDING', 'OFFERED']
        : ['DELIVERED'],
      limit: 60,
    }),
    refetchInterval: 20_000,
  })

  const couriers = useQuery({ queryKey: ['map-couriers'], queryFn: listAvailableCouriers, refetchInterval: 20_000 })

  const pickups: MapPoint[] = useMemo(() => (orders.data ?? [])
    .filter((o) => o.pickup_latitude != null && o.pickup_longitude != null)
    .map((o) => ({ lat: o.pickup_latitude!, lng: o.pickup_longitude!, label: `${o.code} · ${o.unit?.name ?? ''}` })), [orders.data])

  const deliveries: MapPoint[] = useMemo(() => (orders.data ?? [])
    .filter((o) => o.delivery_latitude != null && o.delivery_longitude != null)
    .map((o) => ({ lat: o.delivery_latitude!, lng: o.delivery_longitude!, label: `${o.code} · ${o.recipient_name}` })), [orders.data])

  const mapCouriers = (couriers.data ?? [])
    .filter((c) => c.current_latitude != null && c.current_longitude != null && c.location_sharing_enabled)
    .map((c) => ({
      id: c.id,
      full_name: c.full_name,
      latitude: c.current_latitude!,
      longitude: c.current_longitude!,
      recordedAt: c.current_location_at ?? '',
    }))

  const withoutGps = (couriers.data ?? []).filter((c) => c.status === 'ACTIVE' && !c.location_sharing_enabled)
  const stale = mapCouriers.filter((c) => !isLocationFresh(c.recordedAt, 3))

  return (
    <div className="space-y-4">
      <Alert tone="info" title="Rastreamento com consentimento">
        As posições abaixo vêm do GPS do próprio entregador, que precisa autorizar o compartilhamento na área
        dele. Quando a última posição tem mais de 3 minutos, o mapa a exibe como <strong>última posição conhecida</strong> —
        nunca como tempo real.
      </Alert>

      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader
            title="Mapa operacional"
            description={`${mapCouriers.length} entregador(es) com posição autorizada · ${pickups.length} coleta(s)`}
            action={
              <Button variant="ghost" size="sm" onClick={() => { void orders.refetch(); void couriers.refetch() }} icon={<RefreshCw className="h-3.5 w-3.5" />}>
                Atualizar
              </Button>
            }
          />
          <div className="p-3">
            {orders.isLoading ? (
              <Skeleton className="h-[440px]" />
            ) : (
              <DeliveryMap
                height={440}
                pickups={pickups}
                deliveries={deliveries}
                couriers={mapCouriers}
                showPing
              />
            )}
          </div>
          <div className="flex flex-wrap gap-3 border-t border-ink-100 px-4 py-2.5 text-[11px] text-ink-600">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand-700" /> Coleta</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink-950" /> Destino</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand-600" /> Entregador (posição recente)</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-ink-400" /> Posição antiga</span>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Pedidos no mapa" description="Clique para abrir o pedido" />
            <div className="px-4 pt-3">
              <Tabs
                value={tab}
                onChange={setTab}
                tabs={[{ id: 'active', label: 'Em andamento' }, { id: 'delivered', label: 'Entregues' }]}
              />
            </div>
            <div className="mt-2 max-h-72 overflow-y-auto">
              {(orders.data ?? []).length === 0 ? (
                <EmptyState title="Sem pedidos" description="Nenhum pedido com endereço georreferenciado." icon={<MapPin className="h-6 w-6" />} />
              ) : (
                <ul className="divide-y divide-ink-100">
                  {(orders.data ?? []).map((o) => (
                    <li key={o.id}>
                      <Link to={`/app/pedidos/${o.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-ink-50">
                        <div className="min-w-0">
                          <p className="font-mono text-[11.5px] font-semibold text-brand-800">{o.code}</p>
                          <p className="truncate text-[11.5px] text-ink-600">{o.recipient_name} · {o.delivery_district || o.delivery_city}</p>
                        </div>
                        <OrderStatusBadge status={o.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Entregadores no mapa"
              description="Somente quem autorizou o compartilhamento"
              action={<Badge className="bg-ink-100 text-ink-600">{mapCouriers.length}</Badge>}
            />
            <div className="max-h-64 overflow-y-auto">
              {mapCouriers.length === 0 ? (
                <EmptyState title="Nenhum GPS ativo" description="Nenhum entregador está compartilhando a posição agora." icon={<ShieldAlert className="h-6 w-6" />} />
              ) : (
                <ul className="divide-y divide-ink-100">
                  {mapCouriers.map((c) => {
                    const fresh = isLocationFresh(c.recordedAt, 3)
                    return (
                      <li key={c.id} className="px-4 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[12.5px] font-medium text-ink-900">{c.full_name}</p>
                          <span className={`badge ${fresh ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                            {fresh ? 'Ao vivo' : 'Desatualizado'}
                          </span>
                        </div>
                        <p className="text-[11px] text-ink-500">{relativeTime(c.recordedAt)} · {formatDateTime(c.recordedAt)}</p>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            {stale.length > 0 && (
              <p className="border-t border-ink-100 px-4 py-2.5 text-[11px] text-amber-700">
                {stale.length} posição(ões) com mais de 3 minutos — exibidas como últimas conhecidas.
              </p>
            )}
          </Card>

          {withoutGps.length > 0 && (
            <div className="rounded-xl border border-ink-200 bg-white px-4 py-3">
              <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-800">
                <Info className="h-3.5 w-3.5" /> Sem compartilhamento autorizado ({withoutGps.length})
              </p>
              <p className="mt-1 text-[11px] text-ink-500">
                {withoutGps.map((c) => c.full_name).join(', ')}
              </p>
            </div>
          )}
        </div>
      </div>

      <p className="px-1 text-[11px] text-ink-400">
        Distâncias em linha reta (Haversine). Nenhuma posição é simulada ou extrapolada pela plataforma.
      </p>
    </div>
  )
}
