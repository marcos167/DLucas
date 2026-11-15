import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useOutletContext } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, History } from 'lucide-react'
import { Skeleton } from '@/components/ui'
import { listCourierOrders } from '@/lib/api'
import { formatDateTime } from '@/lib/utils'
import { OrderStatusBadge } from '@/components/dashboard/OrderBits'
import { Chip, Page, QuietState, SectionTitle, type CourierOutlet } from './rider/ui'

/** Histórico das entregas avulsas do entregador (aberto a partir do Perfil). Sem valores. */
export default function CourierHistory() {
  const { courier } = useOutletContext<CourierOutlet>()
  const [tab, setTab] = useState<'delivered' | 'failed'>('delivered')

  const { data, isLoading } = useQuery({
    queryKey: ['courier-history', courier?.id, tab],
    queryFn: () => listCourierOrders({ courierId: courier!.id, status: tab === 'delivered' ? ['DELIVERED'] : ['FAILED'], limit: 100 }),
    enabled: !!courier?.id,
  })
  const orders = data ?? []

  return (
    <Page className="space-y-3">
      <Link to="/entregador/perfil" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-600">
        <ArrowLeft className="h-4 w-4" /> Perfil
      </Link>
      <h1 className="font-display text-lg font-bold text-ink-950">Histórico de entregas</h1>

      <div className="flex gap-2" role="group" aria-label="Situação">
        <Chip active={tab === 'delivered'} onClick={() => setTab('delivered')}>Entregues</Chip>
        <Chip active={tab === 'failed'} onClick={() => setTab('failed')}>Não entregues</Chip>
      </div>

      {isLoading && courier ? (
        <>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}</>
      ) : orders.length === 0 ? (
        <QuietState
          className="pb-10 pt-16" muted icon={History}
          description={tab === 'delivered' ? 'As entregas que você concluir aparecem aqui.' : 'Nenhuma entrega sem sucesso registrada.'}
        />
      ) : (
        <>
          <SectionTitle>{orders.length === 1 ? '1 entrega' : `${orders.length} entregas`}</SectionTitle>
          <div className="divide-y divide-ink-100 rounded-2xl border border-ink-200 bg-white">
            {orders.map((o) => (
              <Link key={o.id} to={`/entregador/entrega/${o.id}`} className="flex items-center justify-between gap-2 px-3.5 py-3 active:bg-ink-50">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-mono text-[11.5px] font-bold text-ink-900">{o.code}</p>
                    <OrderStatusBadge status={o.status} />
                  </div>
                  <p className="truncate text-[11px] text-ink-500">{o.delivery_district || o.delivery_city} · {formatDateTime(o.delivered_at ?? o.updated_at)}</p>
                </div>
                {o.status === 'DELIVERED' && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
              </Link>
            ))}
          </div>
        </>
      )}
    </Page>
  )
}
