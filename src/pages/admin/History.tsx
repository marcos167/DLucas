import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { History as HistoryIcon, Search } from 'lucide-react'
import { Card, CardHeader, EmptyState, Input, SearchInput, Skeleton, Tabs } from '@/components/ui'
import { listOrders } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { brl, formatDateTime, relativeTime } from '@/lib/utils'
import { OrderStatusBadge } from '@/components/dashboard/OrderBits'

export default function History() {
  const [tab, setTab] = useState<'delivered' | 'problem' | 'changes'>('delivered')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const orders = useQuery({
    queryKey: ['history', tab, search, from, to],
    queryFn: () => listOrders({
      status: tab === 'delivered' ? ['DELIVERED'] : ['FAILED', 'CANCELLED'],
      search: search || undefined,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
      limit: 300,
    }),
    enabled: tab !== 'changes',
  })

  const rows = orders.data ?? []
  const totalValue = useMemo(() => rows.reduce((s, o) => s + o.quoted_price_cents, 0), [rows])
  const totalPayout = useMemo(() => rows.reduce((s, o) => s + o.courier_payout_cents, 0), [rows])

  return (
    <div className="space-y-4">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'delivered', label: 'Entregas concluídas' },
          { id: 'problem', label: 'Falhas e cancelamentos' },
          { id: 'changes', label: 'Alterações de atribuição' },
        ]}
      />

      {tab !== 'changes' ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Código, destinatário…" className="w-full sm:w-64" />
            <div className="flex items-center gap-1.5">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
              <span className="text-xs text-ink-400">até</span>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="card p-4"><p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Registros</p><p className="kpi-value mt-1">{rows.length}</p></div>
            <div className="card p-4"><p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Valor cobrado</p><p className="kpi-value mt-1">{brl(totalValue)}</p></div>
            <div className="card p-4"><p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Repasses</p><p className="kpi-value mt-1">{brl(totalPayout)}</p></div>
          </div>

          <Card>
            <CardHeader title="Histórico de entregas" description="Consulte por período" />
            {orders.isLoading ? (
              <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : rows.length === 0 ? (
              <EmptyState title="Nenhum registro" description="Ajuste os filtros de período." icon={<HistoryIcon className="h-6 w-6" />} />
            ) : (
              <div className="table-wrap">
                <table className="table-base">
                  <thead><tr><th>Pedido</th><th>Farmácia</th><th>Destinatário</th><th>Entregador</th><th>Status</th><th>Concluído</th><th>Valor</th></tr></thead>
                  <tbody>
                    {rows.map((o) => (
                      <tr key={o.id}>
                        <td><Link to={`/app/pedidos/${o.id}`} className="font-mono text-[12px] font-semibold text-brand-800 hover:underline">{o.code}</Link></td>
                        <td className="text-[12.5px]">{o.pharmacy?.trade_name ?? '—'}</td>
                        <td className="text-[12.5px]">{o.recipient_name}</td>
                        <td className="text-[12.5px]">{o.courier?.full_name ?? '—'}</td>
                        <td><OrderStatusBadge status={o.status} /></td>
                        <td className="whitespace-nowrap text-[11.5px] text-ink-500">
                          {formatDateTime(o.delivered_at ?? o.cancelled_at ?? o.updated_at)}
                        </td>
                        <td className="text-[12.5px] font-medium">{brl(o.quoted_price_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : (
        <AssignmentHistory />
      )}
    </div>
  )
}

function AssignmentHistory() {
  const { data, isLoading } = useQuery({
    queryKey: ['assignments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_assignments')
        .select('*, order:orders(id, code), courier:couriers!order_assignments_courier_id_fkey(id, full_name)')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw new Error(error.message)
      return data as {
        id: number; method: string; reason: string | null; created_at: string;
        order?: { id: string; code: string }; courier?: { id: string; full_name: string } | null
      }[]
    },
  })

  return (
    <Card>
      <CardHeader title="Alterações de atribuição" description="Histórico de todas as mudanças de entregador" />
      {isLoading ? (
        <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : (data ?? []).length === 0 ? (
        <EmptyState title="Nenhuma alteração" description="As atribuições e reatribuições aparecem aqui." icon={<Search className="h-6 w-6" />} />
      ) : (
        <div className="table-wrap">
          <table className="table-base">
            <thead><tr><th>Pedido</th><th>Entregador</th><th>Método</th><th>Motivo</th><th>Data</th></tr></thead>
            <tbody>
              {(data ?? []).map((a) => (
                <tr key={a.id}>
                  <td>{a.order?.code ? <Link to={`/app/pedidos/${a.order.id}`} className="font-mono text-[12px] font-semibold text-brand-800 hover:underline">{a.order.code}</Link> : '—'}</td>
                  <td className="text-[12.5px]">{a.courier?.full_name ?? 'Removido'}</td>
                  <td className="text-[12px]">{a.method}</td>
                  <td className="text-[12px] text-ink-600">{a.reason ?? '—'}</td>
                  <td className="whitespace-nowrap text-[11.5px] text-ink-500">{relativeTime(a.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
