import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Wallet, Plus, Banknote } from 'lucide-react'
import {
  Button, Card, CardHeader, EmptyState, Field, Input, Modal, Select, Skeleton, StatCard, Textarea,
} from '@/components/ui'
import { createPayout, listCouriers, listPayouts, listOrders, logAudit } from '@/lib/api'
import { brl, formatDate } from '@/lib/utils'
import { useApiMutation } from '@/hooks/useApiMutation'

export default function Payouts() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'PENDING' | 'PAID'>('PENDING')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ courier_id: '', order_id: '', amount_cents: '', notes: '' })

  const payouts = useQuery({ queryKey: ['payouts'], queryFn: listPayouts })
  const couriers = useQuery({ queryKey: ['couriers'], queryFn: listCouriers })
  const delivered = useQuery({
    queryKey: ['payout-orders'],
    queryFn: () => listOrders({ status: ['DELIVERED'], limit: 100 }),
  })

  const create = useApiMutation({
    mutationFn: async () => {
      await createPayout({
        courier_id: form.courier_id,
        order_id: form.order_id || null,
        amount_cents: Number(form.amount_cents),
        notes: form.notes || null,
        status: 'PENDING',
      })
      await logAudit('CREATE', 'payout', null, `Lançou repasse de ${brl(Number(form.amount_cents))}`)
    },
    onSuccess: () => {
      setOpen(false)
      setForm({ courier_id: '', order_id: '', amount_cents: '', notes: '' })
      void qc.invalidateQueries({ queryKey: ['payouts'] })
    },
    successMessage: 'Repasse lançado.',
  })

  const rows = (payouts.data ?? []).filter((p) => (tab === 'PENDING' ? p.status !== 'PAID' : p.status === 'PAID'))
  const total = rows.reduce((s, p) => s + p.amount_cents, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          {(['PENDING', 'PAID'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-xl px-3.5 py-2 text-sm font-medium ${tab === t ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100'}`}>
              {t === 'PENDING' ? 'A pagar' : 'Pagos'}
            </button>
          ))}
        </div>
        <Button onClick={() => setOpen(true)} icon={<Plus className="h-4 w-4" />}>Novo repasse</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Lançamentos" value={payouts.isLoading ? '—' : rows.length}
          hint={tab === 'PENDING' ? 'A pagar' : 'Pagos'} icon={<Wallet className="h-4 w-4" />} />
        <StatCard label="Total" value={payouts.isLoading ? '—' : brl(total)}
          icon={<Banknote className="h-4 w-4" />} tone={tab === 'PENDING' ? 'accent' : 'brand'} />
      </div>

      <Card>
        <CardHeader title="Repasses a entregadores" description="Controle manual de valores por entrega" />
        {payouts.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState title="Nenhum repasse" description="Lance os valores devidos aos entregadores." icon={<Wallet className="h-6 w-6" />} />
        ) : (
          <div className="table-wrap">
            <table className="table-base">
              <thead><tr><th>Entregador</th><th>Pedido</th><th>Valor</th><th>Status</th><th>Referência</th><th>Pago em</th></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.courier?.full_name ?? '—'}</td>
                    <td className="font-mono text-[11.5px] text-ink-600">{p.order_id?.slice(0, 8) ?? '—'}</td>
                    <td className="text-[12.5px] font-semibold">{brl(p.amount_cents)}</td>
                    <td><span className={`badge ${p.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' : p.status === 'APPROVED' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'}`}>{p.status}</span></td>
                    <td className="text-[12px] text-ink-500">{p.reference_period ? formatDate(p.reference_period) : '—'}</td>
                    <td className="text-[12px] text-ink-500">{p.paid_at ? formatDate(p.paid_at) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Novo repasse" size="md"
        footer={<>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!form.courier_id || !form.amount_cents}>Lançar</Button>
        </>}>
        <div className="space-y-4">
          <Field label="Entregador" required>
            <Select value={form.courier_id} onChange={(e) => setForm((f) => ({ ...f, courier_id: e.target.value }))}>
              <option value="">Selecione…</option>
              {(couriers.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </Select>
          </Field>
          <Field label="Pedido relacionado (opcional)">
            <Select value={form.order_id} onChange={(e) => {
              const o = (delivered.data ?? []).find((d) => d.id === e.target.value)
              setForm((f) => ({
                ...f,
                order_id: e.target.value,
                amount_cents: o ? String(o.courier_payout_cents) : f.amount_cents,
                courier_id: o?.courier_id ?? f.courier_id,
              }))
            }}>
              <option value="">—</option>
              {(delivered.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.code} · {o.courier?.full_name ?? 'sem entregador'}</option>)}
            </Select>
          </Field>
          <Field label="Valor (centavos)" required><Input type="number" min={1} value={form.amount_cents} onChange={(e) => setForm((f) => ({ ...f, amount_cents: e.target.value }))} /></Field>
          <Field label="Observações"><Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></Field>
        </div>
      </Modal>
    </div>
  )
}
