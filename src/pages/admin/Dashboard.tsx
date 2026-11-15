import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Activity, AlertTriangle, Bike, CheckCircle2, Clock, Package, Radio, TrendingUp, Wallet, ArrowRight,
} from 'lucide-react'
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Card, CardHeader, EmptyState, Skeleton, StatCard } from '@/components/ui'
import { dashboardMetrics, deliveriesLast7Days, listOrders, ordersByStatus } from '@/lib/api'
import {
  brl, formatDateTime, ORDER_STATUS_CLASS, ORDER_STATUS_LABEL, relativeTime,
} from '@/lib/utils'
import type { OrderStatus } from '@/types'

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#f59e0b', OFFERED: '#0ea5e9', ASSIGNED: '#6366f1', ACCEPTED: '#6366f1',
  PICKING_UP: '#8b5cf6', COLLECTED: '#06b6d4', IN_TRANSIT: '#3b82f6',
  DELIVERED: '#10b981', FAILED: '#ef4444', CANCELLED: '#94a3b8', DRAFT: '#cbd5e1',
}

/** Adaptador fino: mantém a API usada nas chamadas abaixo, delegando o visual ao StatCard. */
function KpiCard({ icon, label, value, hint, tone = 'brand' }: {
  icon: React.ReactNode
  label: string
  value: string | number
  hint?: string
  tone?: 'brand' | 'amber' | 'red' | 'blue'
}) {
  const toneMap = { brand: 'brand', amber: 'accent', red: 'danger', blue: 'neutral' } as const
  return <StatCard icon={icon} label={label} value={value} hint={hint} tone={toneMap[tone]} />
}

export default function Dashboard() {
  const metrics = useQuery({ queryKey: ['dash-metrics'], queryFn: dashboardMetrics, refetchInterval: 30_000 })
  const status = useQuery({ queryKey: ['dash-status'], queryFn: ordersByStatus })
  const week = useQuery({ queryKey: ['dash-week'], queryFn: deliveriesLast7Days })
  const active = useQuery({
    queryKey: ['dash-active-orders'],
    queryFn: () => listOrders({ status: ['PENDING', 'OFFERED', 'ASSIGNED', 'ACCEPTED', 'PICKING_UP', 'COLLECTED', 'IN_TRANSIT'], limit: 8 }),
    refetchInterval: 20_000,
  })

  const pieData = Object.entries(status.data ?? {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: ORDER_STATUS_LABEL[k as OrderStatus] ?? k, key: k, value: v }))

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[104px]" />)
        ) : (
          <>
            <KpiCard icon={<Package className="h-4 w-4" />} label="Pedidos hoje" value={metrics.data?.ordersToday ?? 0} hint="Criados desde 00:00" />
            <KpiCard icon={<Activity className="h-4 w-4" />} label="Em andamento" value={metrics.data?.activeOrders ?? 0} hint="Aguardando despacho até em rota" tone="blue" />
            <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="Entregues hoje" value={metrics.data?.deliveredToday ?? 0} hint="Concluídas com sucesso" />
            <KpiCard icon={<Bike className="h-4 w-4" />} label="Entregadores ativos" value={metrics.data?.couriersActive ?? 0} hint="Disponíveis ou em entrega" tone="amber" />
          </>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card flex items-center justify-between gap-3 p-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">A receber (faturas abertas)</p>
            <p className="kpi-value mt-1">{brl(metrics.data?.outstandingCents ?? 0)}</p>
            <p className="mt-0.5 text-[11.5px] text-ink-500">Somatório de saldos em aberto</p>
          </div>
          <Link to="/app/faturas" className="btn-secondary btn-sm">
            <Wallet className="h-3.5 w-3.5" /> Faturas
          </Link>
        </div>
        <div className="card flex items-center justify-between gap-3 p-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Vencido</p>
            <p className="kpi-value mt-1 text-red-600">{brl(metrics.data?.overdueCents ?? 0)}</p>
            <p className="mt-0.5 text-[11.5px] text-ink-500">Faturas com vencimento ultrapassado</p>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-600">
            <AlertTriangle className="h-4 w-4" />
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Entregas concluídas · últimos 7 dias"
            description="Pedidos com status Entregue, por dia"
            action={<span className="badge bg-brand-50 text-brand-700"><TrendingUp className="h-3 w-3" /> Operação</span>}
          />
          <div className="h-64 px-2 pb-3 pt-4">
            {week.isLoading ? <Skeleton className="h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={week.data ?? []} margin={{ top: 4, right: 16, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22a289" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#22a289" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#67788f' }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#67788f' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #eceef2', fontSize: 12 }}
                    labelStyle={{ fontWeight: 600 }}
                  />
                  <Area type="monotone" dataKey="total" name="Entregas" stroke="#178271" strokeWidth={2} fill="url(#grad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Pedidos por status" description="Criados nos últimos 30 dias" />
          <div className="h-64 px-2 py-2">
            {status.isLoading ? <Skeleton className="h-full" /> : pieData.length === 0 ? (
              <EmptyState title="Sem pedidos" description="Nenhum pedido criado no período." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={46} outerRadius={74} paddingAngle={2}>
                    {pieData.map((d) => <Cell key={d.key} fill={STATUS_COLORS[d.key] ?? '#94a3b8'} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #eceef2', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 pb-4 text-[11px] text-ink-600">
            {pieData.map((d) => (
              <span key={d.key} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLORS[d.key] }} />
                {d.name} ({d.value})
              </span>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Fila operacional"
          description="Pedidos que exigem acompanhamento agora"
          action={<Link to="/app/despacho" className="btn-secondary btn-sm"><Radio className="h-3.5 w-3.5" /> Ir ao despacho</Link>}
        />
        {active.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : (active.data ?? []).length === 0 ? (
          <EmptyState
            title="Nenhum pedido em andamento"
            description="Quando a farmácia criar um pedido, ele aparece aqui para despacho."
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {(active.data ?? []).map((o) => (
              <li key={o.id}>
                <Link to={`/app/pedidos/${o.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-ink-50/70">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12px] font-semibold text-ink-900">{o.code}</span>
                      <span className={`badge ${ORDER_STATUS_CLASS[o.status]}`}>{ORDER_STATUS_LABEL[o.status]}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[12.5px] text-ink-600">
                      {o.pharmacy?.trade_name} → {o.recipient_name} · {o.delivery_district || o.delivery_city}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11.5px] text-ink-500">
                      {o.courier?.full_name ? `Entregador: ${o.courier.full_name}` : 'Sem entregador'}
                    </p>
                    <p className="inline-flex items-center gap-1 text-[11px] text-ink-400">
                      <Clock className="h-3 w-3" /> {relativeTime(o.created_at)}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-ink-300" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="px-1 text-[11px] text-ink-400">
        Atualizado em {formatDateTime(new Date().toISOString())} · recarregamento automático a cada 30 s
      </p>
    </div>
  )
}
