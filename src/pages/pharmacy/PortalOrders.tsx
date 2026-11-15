import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, Package, PlusCircle } from 'lucide-react'
import { Card, CardHeader, EmptyState, SearchInput, Select, Skeleton, Tabs } from '@/components/ui'
import { listOrders } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { brl, formatDateTime, relativeTime } from '@/lib/utils'
import { OrderStatusBadge, PriorityBadge } from '@/components/dashboard/OrderBits'
import type { OrderStatus } from '@/types'

const GROUPS: Record<string, OrderStatus[]> = {
  active: ['PENDING', 'OFFERED', 'ASSIGNED', 'ACCEPTED', 'PICKING_UP', 'COLLECTED', 'IN_TRANSIT'],
  delivered: ['DELIVERED'],
  closed: ['FAILED', 'CANCELLED'],
}

export default function PortalOrders() {
  const { profile } = useAuth()
  const pharmacyId = profile?.pharmacy_id ?? null
  const [tab, setTab] = useState<'all' | 'active' | 'delivered' | 'closed'>('all')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['portal-orders', pharmacyId, tab, search, status],
    queryFn: () => listOrders({
      pharmacyId,
      status: status ? [status] : (GROUPS[tab] ?? []),
      search: search || undefined,
      limit: 200,
    }),
    enabled: !!pharmacyId,
    refetchInterval: 30_000,
  })

  const orders = data ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Código, destinatário…" className="w-full sm:w-72" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full sm:w-52">
          <option value="">Status</option>
          <option value="PENDING">Aguardando despacho</option>
          <option value="OFFERED">Ofertado</option>
          <option value="ASSIGNED">Atribuído</option>
          <option value="ACCEPTED">Aceito</option>
          <option value="PICKING_UP">A caminho da coleta</option>
          <option value="COLLECTED">Coletado</option>
          <option value="IN_TRANSIT">Em rota</option>
          <option value="DELIVERED">Entregue</option>
          <option value="FAILED">Falhou</option>
          <option value="CANCELLED">Cancelado</option>
        </Select>
        <div className="ml-auto">
          <Link to="/portal/novo-pedido" className="btn-primary"><PlusCircle className="h-4 w-4" /> Novo pedido</Link>
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={(v) => { setTab(v); setStatus('') }}
        tabs={[
          { id: 'all', label: 'Todos' },
          { id: 'active', label: 'Em andamento' },
          { id: 'delivered', label: 'Entregues' },
          { id: 'closed', label: 'Encerrados' },
        ]}
      />

      <Card>
        <CardHeader title={`Pedidos (${orders.length})`} description="Somente da sua farmácia" />
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : orders.length === 0 ? (
          <EmptyState
            title="Nenhum pedido"
            description="Crie o primeiro pedido de entrega."
            icon={<Package className="h-6 w-6" />}
            action={<Link to="/portal/novo-pedido" className="btn-primary btn-sm">Novo pedido</Link>}
          />
        ) : (
          <div className="table-wrap">
            <table className="table-base">
              <thead>
                <tr><th>Pedido</th><th>Unidade</th><th>Destinatário</th><th>Status</th><th>Entregador</th><th>Valor</th><th>Criado</th><th /></tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <Link to={`/portal/pedidos/${o.id}`} className="font-mono text-[12px] font-semibold text-brand-800 hover:underline">{o.code}</Link>
                        <PriorityBadge priority={o.priority} />
                      </div>
                    </td>
                    <td className="text-[12.5px]">{o.unit?.name ?? '—'}</td>
                    <td className="text-[12.5px]">
                      <p className="font-medium">{o.recipient_name}</p>
                      <p className="text-ink-500">{o.delivery_district || o.delivery_city}</p>
                    </td>
                    <td><OrderStatusBadge status={o.status} /></td>
                    <td className="text-[12.5px]">{o.courier?.full_name ?? <span className="text-ink-400">—</span>}</td>
                    <td className="text-[12.5px]">{brl(o.quoted_price_cents)}</td>
                    <td className="whitespace-nowrap text-[11px] text-ink-500">{relativeTime(o.created_at)}</td>
                    <td><Link to={`/portal/pedidos/${o.id}`} className="text-ink-300 hover:text-brand-700"><ArrowRight className="h-4 w-4" /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="px-1 text-[11px] text-ink-400">
        Atualizado em {formatDateTime(new Date().toISOString())} · recarregamento automático a cada 30 s
      </p>
    </div>
  )
}
