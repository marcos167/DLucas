import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, Clock, MapPin, Package, Store } from 'lucide-react'
import { Card, CardHeader, EmptyState, SearchInput, Select, Skeleton, Tabs } from '@/components/ui'
import { listOrders } from '@/lib/api'
import {
  ORDER_STATUS_CLASS, ORDER_STATUS_LABEL, brl, formatDateTime, relativeTime,
} from '@/lib/utils'
import { OrderStatusBadge, PriorityBadge } from '@/components/dashboard/OrderBits'
import type { OrderStatus } from '@/types'

const STATUS_GROUPS = {
  all: [] as OrderStatus[],
  active: ['PENDING', 'OFFERED', 'ASSIGNED', 'ACCEPTED', 'PICKING_UP', 'COLLECTED', 'IN_TRANSIT'] as OrderStatus[],
  done: ['DELIVERED'] as OrderStatus[],
  problem: ['FAILED', 'CANCELLED'] as OrderStatus[],
}

export default function Orders() {
  const [tab, setTab] = useState<keyof typeof STATUS_GROUPS>('all')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['orders-list', tab, search, statusFilter],
    queryFn: () => listOrders({
      status: statusFilter ? [statusFilter] : STATUS_GROUPS[tab],
      search: search || undefined,
      limit: 300,
    }),
    refetchInterval: 30_000,
  })

  const count = (k: keyof typeof STATUS_GROUPS) => (k === 'all' ? undefined : undefined)

  const orders = useMemo(() => data ?? [], [data])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Código, destinatário, endereço…" className="w-full sm:w-80" />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full sm:w-52">
          <option value="">Status (do filtro)</option>
          {Object.entries(ORDER_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Link to="/app/despacho" className="btn-secondary btn-sm ml-auto">Ir para o despacho</Link>
      </div>

      <Tabs
        value={tab}
        onChange={(v) => { setTab(v); setStatusFilter('') }}
        tabs={[
          { id: 'all', label: 'Todos', count: count('all') },
          { id: 'active', label: 'Em andamento' },
          { id: 'done', label: 'Entregues' },
          { id: 'problem', label: 'Problemas' },
        ]}
      />

      <Card>
        <CardHeader
          title={`Pedidos (${orders.length})`}
          description="Lista atualizada automaticamente a cada 30 segundos"
        />
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : orders.length === 0 ? (
          <EmptyState
            title="Nenhum pedido encontrado"
            description="Ajuste os filtros ou aguarde novos pedidos das farmácias."
            icon={<Package className="h-6 w-6" />}
          />
        ) : (
          <div className="table-wrap">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Pedido</th><th>Farmácia / origem</th><th>Destinatário</th>
                  <th>Status</th><th>Entregador</th><th>Valor</th><th>Criado</th><th />
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <Link to={`/app/pedidos/${o.id}`} className="font-mono text-[12px] font-semibold text-brand-800 hover:underline">
                          {o.code}
                        </Link>
                        <PriorityBadge priority={o.priority} />
                      </div>
                    </td>
                    <td className="text-[12.5px]">
                      <p className="flex items-center gap-1 font-medium text-ink-800">
                        <Store className="h-3 w-3 text-ink-400" /> {o.pharmacy?.trade_name ?? '—'}
                      </p>
                      <p className="text-ink-500">{o.unit?.name ?? '—'}</p>
                    </td>
                    <td className="text-[12.5px]">
                      <p className="font-medium text-ink-800">{o.recipient_name}</p>
                      <p className="flex items-center gap-1 text-ink-500">
                        <MapPin className="h-3 w-3" /> {o.delivery_district || o.delivery_city}
                      </p>
                    </td>
                    <td><OrderStatusBadge status={o.status} /></td>
                    <td className="text-[12.5px]">{o.courier?.full_name ?? <span className="text-ink-400">—</span>}</td>
                    <td className="text-[12.5px] font-medium">{brl(o.quoted_price_cents)}</td>
                    <td className="whitespace-nowrap text-[11.5px] text-ink-500">
                      <span title={formatDateTime(o.created_at)} className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {relativeTime(o.created_at)}
                      </span>
                    </td>
                    <td><Link to={`/app/pedidos/${o.id}`} className="text-ink-300 hover:text-brand-700"><ArrowRight className="h-4 w-4" /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-[11px] text-ink-400">
        Legenda: <span className={`badge ${ORDER_STATUS_CLASS.PENDING}`}>Aguardando despacho</span>{' '}
        pedidos sem entregador atribuído aparecem primeiro no despacho.
      </p>
    </div>
  )
}
