import { useQuery } from '@tanstack/react-query'
import { useOutletContext } from 'react-router-dom'
import { Skeleton } from '@/components/ui'
import { listCourierOrders } from '@/lib/api'
import { ACTIVE_ORDER_STATUSES, dayLabel, upcomingDays } from '@/lib/courierDay'
import { todayLocal } from '@/lib/logistics/labels'
import { OrderCard } from './rider/OrderCard'
import { useRider } from './rider/RiderContext'
import { RouteCard } from './rider/RouteCard'
import { OfflineNotice } from './rider/SyncStatus'
import { Page, QuietCalendar, QuietState, SectionTitle, type CourierOutlet } from './rider/ui'

/**
 * Aba "Próximas": o que o despacho já deixou marcado para os próximos dias —
 * roteiros liberados com data futura e entregas avulsas agendadas.
 */
export default function CourierUpcoming() {
  const { courier } = useOutletContext<CourierOutlet>()
  const { day, loading } = useRider()
  const today = todayLocal()

  const active = useQuery({
    queryKey: ['courier-active-orders', courier?.id],
    queryFn: () => listCourierOrders({ courierId: courier!.id, status: ACTIVE_ORDER_STATUSES, limit: 100 }),
    enabled: !!courier?.id,
    refetchInterval: 20_000,
  })

  const days = upcomingDays(day?.routes ?? [], active.data ?? [], today)
  const starting = !!courier && ((loading && !day) || (active.isLoading && !active.data))

  return (
    <Page className="space-y-5">
      <OfflineNotice />
      {starting ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      ) : days.length === 0 ? (
        <QuietState
          className="pb-10 pt-[4.25rem]"
          icon={QuietCalendar}
          title="Calendário em silêncio"
          description="Quando o despacho agendar entregas pros próximos dias, elas aparecem aqui."
        />
      ) : (
        days.map((entry) => (
          <section key={entry.date} className="space-y-2">
            <SectionTitle>{dayLabel(entry.date, today)}</SectionTitle>
            {entry.routes.map((route) => <RouteCard key={route.id} route={route} />)}
            {entry.orders.map((order) => <OrderCard key={order.id} order={order} />)}
          </section>
        ))
      )}
    </Page>
  )
}
