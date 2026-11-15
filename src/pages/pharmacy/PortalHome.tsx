import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  ArrowRight, CheckCircle2, Clock, Package, PlusCircle, Truck, AlertTriangle, Receipt,
} from 'lucide-react'
import { Card, CardHeader, EmptyState, Skeleton } from '@/components/ui'
import { listInvoices, listOrders } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { brl, formatDateTime, relativeTime, INVOICE_STATUS_CLASS, INVOICE_STATUS_LABEL } from '@/lib/utils'
import { OrderStatusBadge } from '@/components/dashboard/OrderBits'

export default function PortalHome() {
  const { profile } = useAuth()
  const pharmacyId = profile?.pharmacy_id ?? null

  const active = useQuery({
    queryKey: ['portal-active', pharmacyId],
    queryFn: () => listOrders({
      pharmacyId,
      status: ['PENDING', 'OFFERED', 'ASSIGNED', 'ACCEPTED', 'PICKING_UP', 'COLLECTED', 'IN_TRANSIT'],
      limit: 30,
    }),
    enabled: !!pharmacyId,
    refetchInterval: 20_000,
  })

  const recent = useQuery({
    queryKey: ['portal-recent', pharmacyId],
    queryFn: () => listOrders({ pharmacyId, status: ['DELIVERED', 'FAILED', 'CANCELLED'], limit: 6 }),
    enabled: !!pharmacyId,
  })

  const invoices = useQuery({
    queryKey: ['portal-invoices', pharmacyId],
    queryFn: () => listInvoices(pharmacyId),
    enabled: !!pharmacyId,
  })

  const openInvoices = (invoices.data ?? []).filter((i) => i.status !== 'PAID' && i.status !== 'CANCELLED')
  const balance = openInvoices.reduce((s, i) => s + (i.total_cents - i.paid_cents), 0)

  if (!pharmacyId) {
    return (
      <EmptyState
        title="Farmácia não vinculada"
        description="Seu usuário ainda não está vinculado a uma farmácia. Fale com o administrador da D'Luca."
      />
    )
  }

  const kpis = [
    { icon: <Clock className="h-4 w-4" />, label: 'Em andamento', value: active.data?.length ?? 0, tone: 'bg-blue-50 text-blue-700' },
    { icon: <Truck className="h-4 w-4" />, label: 'Entregas concluídas', value: recent.data?.filter((o) => o.status === 'DELIVERED').length ?? 0, tone: 'bg-emerald-50 text-emerald-700' },
    { icon: <Receipt className="h-4 w-4" />, label: 'Saldo em aberto', value: brl(balance), tone: 'bg-amber-50 text-amber-700' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-ink-950">
            Olá, {profile?.full_name?.split(' ')[0] || 'bem-vindo'}
          </h2>
          <p className="text-[13px] text-ink-500">Acompanhe aqui as entregas da sua farmácia.</p>
        </div>
        <Link to="/portal/novo-pedido" className="btn-primary">
          <PlusCircle className="h-4 w-4" /> Novo pedido
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {kpis.map((k) => (
          <div key={k.label} className="card flex items-center justify-between p-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{k.label}</p>
              <p className="kpi-value mt-1">{active.isLoading ? '—' : k.value}</p>
            </div>
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${k.tone}`}>{k.icon}</span>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader
          title="Entregas em andamento"
          description="Atualizado automaticamente"
          action={<Link to="/portal/pedidos" className="btn-secondary btn-sm">Ver todos <ArrowRight className="h-3.5 w-3.5" /></Link>}
        />
        {active.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : (active.data ?? []).length === 0 ? (
          <EmptyState
            title="Nenhuma entrega em andamento"
            description="Crie um pedido para solicitar uma coleta."
            icon={<Package className="h-6 w-6" />}
            action={<Link to="/portal/novo-pedido" className="btn-primary btn-sm"><PlusCircle className="h-3.5 w-3.5" /> Criar pedido</Link>}
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {(active.data ?? []).map((o) => (
              <li key={o.id}>
                <Link to={`/portal/pedidos/${o.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-ink-50/70">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12px] font-semibold text-ink-900">{o.code}</span>
                      <OrderStatusBadge status={o.status} />
                    </div>
                    <p className="mt-0.5 truncate text-[12.5px] text-ink-600">
                      {o.unit?.name} → {o.recipient_name} · {o.delivery_district || o.delivery_city}
                    </p>
                  </div>
                  <div className="text-right text-[11px] text-ink-500">
                    <p>{o.courier?.full_name ? `Entregador: ${o.courier.full_name}` : 'Aguardando entregador'}</p>
                    <p className="text-ink-400">{relativeTime(o.created_at)}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-ink-300" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Últimas entregas" description="Concluídas ou encerradas" action={<Link to="/portal/pedidos" className="text-[11.5px] font-medium text-brand-700 hover:underline">Histórico</Link>} />
          {(recent.data ?? []).length === 0 ? (
            <EmptyState title="Sem histórico ainda" description="As entregas concluídas aparecem aqui." />
          ) : (
            <ul className="divide-y divide-ink-100">
              {(recent.data ?? []).map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="font-mono text-[11.5px] font-semibold text-ink-800">{o.code}</p>
                    <p className="truncate text-[11.5px] text-ink-500">{o.recipient_name}</p>
                  </div>
                  <div className="text-right">
                    <OrderStatusBadge status={o.status} />
                    <p className="mt-0.5 text-[10.5px] text-ink-400">{formatDateTime(o.delivered_at ?? o.updated_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Financeiro"
            description="Faturas em aberto"
            action={<Link to="/portal/financeiro" className="text-[11.5px] font-medium text-brand-700 hover:underline">Ver tudo</Link>}
          />
          {openInvoices.length === 0 ? (
            <EmptyState title="Nenhuma fatura em aberto" description="Você está em dia." icon={<CheckCircle2 className="h-6 w-6" />} />
          ) : (
            <ul className="divide-y divide-ink-100">
              {openInvoices.slice(0, 4).map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <div>
                    <p className="text-[12.5px] font-semibold text-ink-900">{i.number}</p>
                    <p className="text-[11px] text-ink-500">Vence {formatDateTime(i.due_date)}</p>
                  </div>
                  <div className="text-right">
                    <span className={`badge ${INVOICE_STATUS_CLASS[i.status]}`}>{INVOICE_STATUS_LABEL[i.status]}</span>
                    <p className="mt-0.5 text-[12px] font-semibold">{brl(i.total_cents - i.paid_cents)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {openInvoices.length > 0 && (
            <p className="flex items-center gap-1.5 border-t border-ink-100 px-4 py-2.5 text-[11px] text-ink-500">
              <AlertTriangle className="h-3 w-3 text-amber-500" /> Pagamentos são registrados pela equipe financeira da D'Luca.
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}
