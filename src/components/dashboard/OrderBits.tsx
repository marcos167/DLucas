import { Clock, MapPin, Package, Thermometer, User } from 'lucide-react'
import {
  ORDER_PRIORITY_CLASS, ORDER_PRIORITY_LABEL, ORDER_STATUS_CLASS, ORDER_STATUS_LABEL,
  formatDateTime, km, relativeTime,
} from '@/lib/utils'
import type { Order, OrderEvent } from '@/types'
import { cn } from '@/lib/utils'

export function OrderStatusBadge({ status, className }: { status: Order['status']; className?: string }) {
  return <span className={cn('badge', ORDER_STATUS_CLASS[status], className)}>{ORDER_STATUS_LABEL[status]}</span>
}

export function PriorityBadge({ priority }: { priority: Order['priority'] }) {
  if (priority === 'NORMAL') return null
  return <span className={cn('badge', ORDER_PRIORITY_CLASS[priority])}>{ORDER_PRIORITY_LABEL[priority]}</span>
}

/** Campos de endereço usados pelo bloco de rota (vale para o pedido completo e para o do entregador). */
type RouteFields = Pick<Order,
  | 'pickup_street' | 'pickup_number' | 'pickup_district' | 'pickup_city' | 'pickup_state'
  | 'delivery_street' | 'delivery_number' | 'delivery_district' | 'delivery_city' | 'delivery_state'>

export function RouteBlock({ order, compact }: { order: RouteFields; compact?: boolean }) {
  return (
    <div className="flex gap-3">
      <div className="mt-1.5 flex flex-col items-center">
        <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />
        <span className="my-1 w-px flex-1 bg-ink-200" style={{ minHeight: compact ? 24 : 42 }} />
        <span className="h-2.5 w-2.5 rounded-full border-2 border-ink-400" />
      </div>
      <div className={cn('grid flex-1 gap-3', compact ? 'text-[12.5px]' : 'text-sm')}>
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-400">Coleta</p>
          <p className="font-medium text-ink-900">
            {order.pickup_street}{order.pickup_number ? `, ${order.pickup_number}` : ''}
          </p>
          <p className="text-ink-600">
            {[order.pickup_district, order.pickup_city, order.pickup_state].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-400">Destino</p>
          <p className="font-medium text-ink-900">
            {order.delivery_street}{order.delivery_number ? `, ${order.delivery_number}` : ''}
          </p>
          <p className="text-ink-600">
            {[order.delivery_district, order.delivery_city, order.delivery_state].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>
    </div>
  )
}

export function OrderMetaChips({ order }: {
  order: Pick<Order, 'package_count' | 'is_temperature_controlled' | 'estimated_distance_km' | 'scheduled_for'>
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="inline-flex items-center gap-1 rounded-lg bg-ink-100 px-2 py-1 text-[11px] font-medium text-ink-700">
        <Package className="h-3 w-3" /> {order.package_count} {order.package_count > 1 ? 'volumes' : 'volume'}
      </span>
      {order.is_temperature_controlled && (
        <span className="inline-flex items-center gap-1 rounded-lg bg-cyan-50 px-2 py-1 text-[11px] font-medium text-cyan-800">
          <Thermometer className="h-3 w-3" /> Refrigerado
        </span>
      )}
      {order.estimated_distance_km != null && (
        <span className="inline-flex items-center gap-1 rounded-lg bg-ink-100 px-2 py-1 text-[11px] font-medium text-ink-700">
          <MapPin className="h-3 w-3" /> {km(order.estimated_distance_km)}
        </span>
      )}
      {order.scheduled_for && (
        <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">
          <Clock className="h-3 w-3" /> {formatDateTime(order.scheduled_for)}
        </span>
      )}
    </div>
  )
}

const EVENT_LABEL: Record<string, string> = {
  ORDER_CREATED: 'Pedido criado',
  STATUS_CHANGED: 'Mudança de status',
  OFFER_SENT: 'Oferta enviada',
  OFFER_ACCEPTED: 'Oferta aceita',
  OFFER_DECLINED: 'Oferta recusada',
  PROOF_UPLOADED: 'Comprovante enviado',
  OCCURRENCE: 'Ocorrência registrada',
  ASSIGNED: 'Entregador atribuído',
}

export function OrderTimeline({ events }: { events: OrderEvent[] }) {
  if (!events.length) {
    return <p className="px-4 py-6 text-center text-sm text-ink-500">Sem eventos registrados.</p>
  }
  return (
    <ol className="relative space-y-0 px-4 py-2">
      {events.map((e, i) => (
        <li key={e.id} className="relative flex gap-3 pb-4 last:pb-2">
          {i < events.length - 1 && <span className="absolute left-[5px] top-4 h-full w-px bg-ink-200" />}
          <span className={cn(
            'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-white',
            e.event === 'STATUS_CHANGED' ? 'bg-brand-600' : 'bg-ink-300',
          )} />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-ink-900">
              {e.description || EVENT_LABEL[e.event] || e.event}
              {e.status && <span className="ml-1.5 text-[11px] font-normal text-ink-500">· {ORDER_STATUS_LABEL[e.status]}</span>}
            </p>
            <p className="inline-flex items-center gap-1 text-[11px] text-ink-400">
              <Clock className="h-3 w-3" /> {formatDateTime(e.created_at)} · {relativeTime(e.created_at)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}

export function CourierChip({ name, phone }: { name?: string | null; phone?: string | null }) {
  if (!name) return <span className="text-xs text-ink-500">Sem entregador</span>
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-700">
      <User className="h-3.5 w-3.5 text-ink-400" /> {name}
      {phone && <span className="text-ink-400">· {phone}</span>}
    </span>
  )
}
