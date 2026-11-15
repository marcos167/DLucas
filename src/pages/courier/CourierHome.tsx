import { useQuery } from '@tanstack/react-query'
import { Link, useOutletContext } from 'react-router-dom'
import { ArrowRight, Bike, CheckCircle2, Clock, MapPin, Package, ShieldCheck, Upload } from 'lucide-react'
import { EmptyState, Skeleton } from '@/components/ui'
import { listOffersForCourier, listOrders } from '@/lib/api'
import { brl, formatDateTime, km, relativeTime } from '@/lib/utils'
import { OrderStatusBadge } from '@/components/dashboard/OrderBits'
import type { Courier } from '@/types'

export default function CourierHome() {
  const { courier } = useOutletContext<{ courier: Courier | null }>()

  const active = useQuery({
    queryKey: ['courier-active-orders', courier?.id],
    queryFn: () => listOrders({
      courierId: courier!.id,
      status: ['ASSIGNED', 'ACCEPTED', 'PICKING_UP', 'COLLECTED', 'IN_TRANSIT'],
      limit: 10,
    }),
    enabled: !!courier?.id,
    refetchInterval: 20_000,
  })

  const offers = useQuery({
    queryKey: ['courier-offers-home', courier?.id],
    queryFn: () => listOffersForCourier(courier!.id),
    enabled: !!courier?.id,
    refetchInterval: 20_000,
  })

  const today = useQuery({
    queryKey: ['courier-today', courier?.id],
    queryFn: () => listOrders({ courierId: courier!.id, status: ['DELIVERED'], limit: 50 }),
    enabled: !!courier?.id,
  })

  const current = active.data?.[0]
  const todayDelivered = (today.data ?? []).filter(
    (o) => o.delivered_at && new Date(o.delivered_at).toDateString() === new Date().toDateString(),
  )
  const todayEarnings = todayDelivered.reduce((s, o) => s + o.courier_payout_cents, 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-3.5">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-400">Entregas hoje</p>
          <p className="font-display text-xl font-bold">{today.isLoading ? '—' : todayDelivered.length}</p>
        </div>
        <div className="card p-3.5">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-400">Repasse hoje</p>
          <p className="font-display text-xl font-bold">{today.isLoading ? '—' : brl(todayEarnings)}</p>
        </div>
      </div>

      {(offers.data ?? []).length > 0 && (
        <Link to="/entregador/ofertas" className="flex items-center gap-3 rounded-2xl bg-ink-950 p-4 text-white">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/20 text-brand-300">
            <Package className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <p className="text-[13px] font-bold">{(offers.data ?? []).length} oferta(s) aguardando resposta</p>
            <p className="text-[11px] text-ink-300">Você tem até 15 minutos para aceitar</p>
          </div>
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}

      <div>
        <h2 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-ink-500">Entrega em andamento</h2>
        {active.isLoading ? (
          <Skeleton className="h-28" />
        ) : !current ? (
          <div className="card">
            <EmptyState
              title="Nenhuma entrega ativa"
              description="Quando a central enviar uma oferta, ela aparece aqui."
              icon={<Bike className="h-6 w-6" />}
            />
          </div>
        ) : (
          <Link to={`/entregador/entrega/${current.id}`} className="card block p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[12px] font-bold text-ink-900">{current.code}</span>
              <OrderStatusBadge status={current.status} />
            </div>
            <div className="mt-2.5 space-y-1.5 text-[12.5px]">
              <p className="flex items-start gap-1.5">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-700" />
                <span><strong>Coleta:</strong> {current.pickup_street}{current.pickup_number ? `, ${current.pickup_number}` : ''} · {current.pickup_district || current.pickup_city}</span>
              </p>
              <p className="flex items-start gap-1.5">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-500" />
                <span><strong>Entrega:</strong> {current.delivery_street}{current.delivery_number ? `, ${current.delivery_number}` : ''} · {current.delivery_district || current.delivery_city}</span>
              </p>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10.5px] text-ink-600">
              <span className="rounded-md bg-ink-100 px-1.5 py-0.5">{current.package_count} vol.</span>
              {current.is_temperature_controlled && <span className="rounded-md bg-cyan-50 px-1.5 py-0.5 text-cyan-800">Refrigerado</span>}
              {current.requires_proof && <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-50 px-1.5 py-0.5 text-amber-800"><Upload className="h-3 w-3" /> Comprovante</span>}
              {current.estimated_distance_km != null && <span className="rounded-md bg-ink-100 px-1.5 py-0.5">{km(current.estimated_distance_km)}</span>}
            </div>
            <p className="mt-2.5 flex items-center justify-between border-t border-ink-100 pt-2.5 text-[12px]">
              <span className="text-ink-500">Repasse</span>
              <span className="font-bold text-brand-800">{brl(current.courier_payout_cents)}</span>
            </p>
          </Link>
        )}
      </div>

      <div className="card p-4">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-900">
          <ShieldCheck className="h-4 w-4 text-brand-700" /> Sua privacidade
        </p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-ink-600">
          O GPS só funciona quando você autoriza na tela de entrega. Sem autorização, a central vê apenas
          o status do pedido — nunca uma localização inventada.
        </p>
        {courier?.current_location_at && courier.location_sharing_enabled && (
          <p className="mt-2 flex items-center gap-1 text-[11px] text-ink-500">
            <Clock className="h-3 w-3" /> Última posição compartilhada: {formatDateTime(courier.current_location_at)} ({relativeTime(courier.current_location_at)})
          </p>
        )}
      </div>

      {todayDelivered.length > 0 && (
        <div>
          <h2 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-ink-500">Concluídas hoje</h2>
          <div className="card divide-y divide-ink-100">
            {todayDelivered.slice(0, 5).map((o) => (
              <Link key={o.id} to={`/entregador/entrega/${o.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="font-mono text-[11.5px] font-semibold">{o.code}</p>
                  <p className="truncate text-[11px] text-ink-500">{o.delivery_district || o.delivery_city}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11.5px] font-semibold text-emerald-700">{brl(o.courier_payout_cents)}</span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
