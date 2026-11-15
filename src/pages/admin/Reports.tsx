import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Card, CardHeader, EmptyState, Input, Skeleton } from '@/components/ui'
import { listOrders } from '@/lib/api'
import { brl, ORDER_STATUS_LABEL } from '@/lib/utils'
import type { OrderStatus } from '@/types'

export default function Reports() {
  const startDefault = new Date(); startDefault.setDate(1); startDefault.setHours(0, 0, 0, 0)
  const [from, setFrom] = useState(startDefault.toISOString().slice(0, 10))
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))

  const { data, isLoading } = useQuery({
    queryKey: ['reports', from, to],
    queryFn: () => listOrders({
      from: new Date(from).toISOString(),
      to: new Date(`${to}T23:59:59`).toISOString(),
      limit: 1000,
    }),
  })

  const orders = data ?? []

  const byDay = useMemo(() => {
    const map = new Map<string, { day: string; entregues: number; falhas: number }>()
    for (const o of orders) {
      const key = (o.delivered_at ?? o.created_at).slice(0, 10)
      const item = map.get(key) ?? {
        day: new Date(`${key}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        entregues: 0, falhas: 0,
      }
      if (o.status === 'DELIVERED') item.entregues += 1
      if (o.status === 'FAILED' || o.status === 'CANCELLED') item.falhas += 1
      map.set(key, item)
    }
    return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, v]) => v)
  }, [orders])

  const byPharmacy = useMemo(() => {
    const map = new Map<string, { name: string; pedidos: number; valor: number }>()
    for (const o of orders) {
      const name = o.pharmacy?.trade_name ?? '—'
      const item = map.get(name) ?? { name, pedidos: 0, valor: 0 }
      item.pedidos += 1
      item.valor += o.quoted_price_cents
      map.set(name, item)
    }
    return [...map.values()].sort((a, b) => b.valor - a.valor).slice(0, 8)
  }, [orders])

  const byStatus = useMemo(() => {
    const map: Record<string, number> = {}
    for (const o of orders) map[o.status] = (map[o.status] ?? 0) + 1
    return Object.entries(map).map(([k, v]) => ({ name: ORDER_STATUS_LABEL[k as OrderStatus] ?? k, key: k, value: v }))
  }, [orders])

  const byCourier = useMemo(() => {
    const map = new Map<string, { name: string; entregas: number; repasse: number }>()
    for (const o of orders.filter((x) => x.status === 'DELIVERED')) {
      const name = o.courier?.full_name ?? 'Não atribuído'
      const item = map.get(name) ?? { name, entregas: 0, repasse: 0 }
      item.entregas += 1
      item.repasse += o.courier_payout_cents
      map.set(name, item)
    }
    return [...map.values()].sort((a, b) => b.entregas - a.entregas).slice(0, 8)
  }, [orders])

  const delivered = orders.filter((o) => o.status === 'DELIVERED')
  const failed = orders.filter((o) => o.status === 'FAILED' || o.status === 'CANCELLED')
  const revenue = delivered.reduce((s, o) => s + o.quoted_price_cents, 0)
  const payout = delivered.reduce((s, o) => s + o.courier_payout_cents, 0)
  const successRate = orders.length ? Math.round((delivered.length / orders.length) * 100) : 0

  const COLORS = ['#178271', '#0ea5e9', '#6366f1', '#8b5cf6', '#06b6d4', '#3b82f6', '#10b981', '#ef4444', '#94a3b8']

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-medium text-ink-600">Período:</span>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
        <span className="text-xs text-ink-400">até</span>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { l: 'Pedidos', v: orders.length },
          { l: 'Entregues', v: delivered.length },
          { l: 'Taxa de sucesso', v: `${successRate}%` },
          { l: 'Receita', v: brl(revenue) },
          { l: 'Repasses', v: brl(payout) },
        ].map((k) => (
          <div key={k.l} className="card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{k.l}</p>
            <p className="kpi-value mt-1">{isLoading ? '—' : k.v}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Entregas por dia" description="Concluídas x falhas" />
          <div className="h-64 p-2">
            {isLoading ? <Skeleton className="h-full" /> : byDay.length === 0 ? <EmptyState title="Sem dados no período" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={byDay} margin={{ top: 8, right: 16, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#67788f' }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#67788f' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #eceef2', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="entregues" name="Entregues" stroke="#178271" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="falhas" name="Falhas/cancel." stroke="#ef4444" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Receita por farmácia" description="Top 8 no período" />
          <div className="h-64 p-2">
            {isLoading ? <Skeleton className="h-full" /> : byPharmacy.length === 0 ? <EmptyState title="Sem dados" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byPharmacy} margin={{ top: 8, right: 16, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#67788f' }} axisLine={false} tickLine={false} interval={0} angle={-12} textAnchor="end" height={44} />
                  <YAxis tick={{ fontSize: 11, fill: '#67788f' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v / 100}`} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #eceef2', fontSize: 12 }} formatter={(v: number) => brl(v)} />
                  <Bar dataKey="valor" name="Receita" fill="#22a289" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Pedidos por status" description="Distribuição no período" />
          <div className="h-64 p-2">
            {isLoading ? <Skeleton className="h-full" /> : byStatus.length === 0 ? <EmptyState title="Sem dados" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byStatus} dataKey="value" nameKey="name" innerRadius={45} outerRadius={78} paddingAngle={2}>
                    {byStatus.map((d, i) => <Cell key={d.key} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #eceef2', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Entregadores" description="Entregas concluídas e repasses" />
          {isLoading ? <Skeleton className="m-4 h-48" /> : byCourier.length === 0 ? <EmptyState title="Sem entregas concluídas" /> : (
            <ul className="divide-y divide-ink-100">
              {byCourier.map((c) => (
                <li key={c.name} className="flex items-center justify-between px-4 py-2.5 text-[12.5px]">
                  <span className="font-medium text-ink-900">{c.name}</span>
                  <span className="text-ink-600">{c.entregas} entregas · <strong className="text-brand-800">{brl(c.repasse)}</strong></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Margem bruta</p><p className="kpi-value mt-1 text-brand-800">{brl(revenue - payout)}</p></div>
        <div className="card p-4"><p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Ticket médio</p><p className="kpi-value mt-1">{brl(delivered.length ? Math.round(revenue / delivered.length) : 0)}</p></div>
        <div className="card p-4"><p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Falhas / cancelamentos</p><p className="kpi-value mt-1 text-red-600">{failed.length}</p></div>
      </div>
    </div>
  )
}
