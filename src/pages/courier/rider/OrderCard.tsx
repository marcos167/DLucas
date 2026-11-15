import { Link } from 'react-router-dom'
import { Clock, MapPin, Upload } from 'lucide-react'
import { OrderStatusBadge } from '@/components/dashboard/OrderBits'
import { formatDateTime, km } from '@/lib/utils'
import type { CourierOrder } from '@/types'

/** Entrega avulsa atribuída ao entregador: de onde sai, para onde vai e o que exige. Sem valores. */
export function OrderCard({ order }: { order: CourierOrder }) {
  return (
    <Link to={`/entregador/entrega/${order.id}`} className="block rounded-2xl border border-ink-200 bg-white p-4 active:bg-ink-50">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[12px] font-bold text-ink-900">{order.code}</span>
        <OrderStatusBadge status={order.status} />
      </div>
      <div className="mt-2.5 space-y-1.5 text-[12.5px] text-ink-800">
        <p className="flex items-start gap-1.5">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-700" />
          <span>
            <strong className="font-semibold text-ink-950">Coleta:</strong> {order.pickup_street}{order.pickup_number ? `, ${order.pickup_number}` : ''}
            {' · '}{order.pharmacy?.trade_name ?? order.unit?.name ?? order.pickup_district ?? order.pickup_city}
          </span>
        </p>
        <p className="flex items-start gap-1.5">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-500" />
          <span>
            <strong className="font-semibold text-ink-950">Entrega:</strong> {order.delivery_street}{order.delivery_number ? `, ${order.delivery_number}` : ''}
            {' · '}{order.delivery_district || order.delivery_city}
          </span>
        </p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10.5px] text-ink-600">
        <span className="rounded-md bg-ink-100 px-1.5 py-0.5">{order.package_count} vol.</span>
        {order.is_temperature_controlled && <span className="rounded-md bg-cyan-50 px-1.5 py-0.5 text-cyan-800">Refrigerado</span>}
        {order.requires_proof && (
          <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-50 px-1.5 py-0.5 text-amber-800"><Upload className="h-3 w-3" /> Comprovante</span>
        )}
        {order.priority !== 'NORMAL' && (
          <span className="rounded-md bg-red-50 px-1.5 py-0.5 font-semibold text-red-700">{order.priority === 'URGENT' ? 'Urgente' : 'Prioridade alta'}</span>
        )}
        {order.estimated_distance_km != null && <span className="rounded-md bg-ink-100 px-1.5 py-0.5">{km(order.estimated_distance_km)}</span>}
        {order.scheduled_for && (
          <span className="inline-flex items-center gap-0.5 rounded-md bg-ink-100 px-1.5 py-0.5"><Clock className="h-3 w-3" /> {formatDateTime(order.scheduled_for)}</span>
        )}
      </div>
    </Link>
  )
}
