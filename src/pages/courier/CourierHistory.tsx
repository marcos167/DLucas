import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useOutletContext } from 'react-router-dom'
import { CheckCircle2, History } from 'lucide-react'
import { EmptyState, Skeleton, Tabs } from '@/components/ui'
import { listOrders } from '@/lib/api'
import { brl, formatDateTime } from '@/lib/utils'
import { OrderStatusBadge } from '@/components/dashboard/OrderBits'
import type { Courier } from '@/types'

export default function CourierHistory() {
  const { courier } = useOutletContext<{ courier: Courier | null }>()
  const [tab, setTab] = useState<'delivered' | 'failed'>('delivered')

  const { data, isLoading } = useQuery({
    queryKey: ['courier-history', courier?.id, tab],
    queryFn: () => listOrders({ courierId: courier!.id, status: tab === 'delivered' ? ['DELIVERED'] : ['FAILED'], limit: 100 }),
    enabled: !!courier?.id,
  })

  const orders = useMemo(() => data ?? [], [data])
  const total = useMemo(
    () => orders.filter((o) => o.status === 'DELIVERED').reduce((s, o) => s + o.courier_payout_cents, 0),
    [orders],
  )

  if (!courier) return <EmptyState title="Cadastro pendente" description="Vincule seu cadastro de entregador." />

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-3.5">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-400">Entregas</p>
          <p className="font-display text-xl font-bold">{orders.filter((o) => o.status === 'DELIVERED').length}</p>
        </div>
        <div className="card p-3.5">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-400">Total de repasses</p>
          <p className="font-display text-xl font-bold">{brl(total)}</p>
        </div>
      </div>

      <Tabs
        value={tab} onChange={setTab}
        tabs={[{ id: 'delivered', label: 'Entregues' }, { id: 'failed', label: 'Não entregues' }]}
      />

      {isLoading ? (
        <>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</>
      ) : orders.length === 0 ? (
        <div className="card">
          <EmptyState title="Nada por aqui" description="Suas entregas aparecerão neste histórico." icon={<History className="h-6 w-6" />} />
        </div>
      ) : (
        <div className="card divide-y divide-ink-100">
          {orders.map((o) => (
            <Link key={o.id} to={`/entregador/entrega/${o.id}`} className="flex items-center justify-between gap-2 px-3.5 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="font-mono text-[11.5px] font-bold text-ink-900">{o.code}</p>
                  <OrderStatusBadge status={o.status} />
                </div>
                <p className="truncate text-[11px] text-ink-500">{o.delivery_district || o.delivery_city} · {formatDateTime(o.delivered_at ?? o.updated_at)}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[12px] font-semibold text-brand-800">{brl(o.courier_payout_cents)}</p>
                {o.status === 'DELIVERED' && <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-emerald-600" />}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
