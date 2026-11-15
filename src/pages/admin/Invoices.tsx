import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Receipt, Plus, Banknote, Wand2, CircleDollarSign } from 'lucide-react'
import {
  Alert, Button, Card, CardHeader, EmptyState, Field, Input, Modal, SearchInput, Select, Skeleton, StatCard, Textarea,
} from '@/components/ui'
import {
  addInvoiceItem, billableOrders, createInvoice, getInvoice, listInvoices, listPharmacies,
  logAudit, registerPayment, removeInvoiceItem, updateInvoice,
} from '@/lib/api'
import {
  brl, formatDate, INVOICE_STATUS_CLASS, INVOICE_STATUS_LABEL,
} from '@/lib/utils'
import type { Invoice } from '@/types'

export default function Invoices() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [payOpen, setPayOpen] = useState(false)

  const [form, setForm] = useState({
    pharmacy_id: '', due_date: new Date(Date.now() + 15 * 864e5).toISOString().slice(0, 10),
    period_start: new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10),
    period_end: new Date().toISOString().slice(0, 10), discount_cents: '0', notes: '',
  })
  const [payForm, setPayForm] = useState({ amount_cents: '', method: 'PIX', paid_at: new Date().toISOString().slice(0, 10), reference: '', notes: '' })
  const [error, setError] = useState('')

  const invoices = useQuery({ queryKey: ['invoices'], queryFn: () => listInvoices() })
  const pharmacies = useQuery({ queryKey: ['pharmacies'], queryFn: listPharmacies })
  const detail = useQuery({
    queryKey: ['invoice', detailId],
    queryFn: () => getInvoice(detailId!),
    enabled: !!detailId,
  })

  const create = useMutation({
    mutationFn: async () => {
      if (!form.pharmacy_id) throw new Error('Selecione a farmácia')
      const id = await createInvoice({
        number: '', pharmacy_id: form.pharmacy_id, due_date: form.due_date,
        period_start: form.period_start, period_end: form.period_end,
        discount_cents: Number(form.discount_cents) || 0,
        notes: form.notes || null, status: 'OPEN',
      })
      await logAudit('CREATE', 'invoice', id, 'Emitiu nova fatura')
      return id
    },
    onSuccess: (id) => {
      setNewOpen(false); setError('')
      void qc.invalidateQueries({ queryKey: ['invoices'] })
      setDetailId(id)
    },
    onError: (e) => setError((e as Error).message),
  })

  const bill = useMutation({
    mutationFn: async () => {
      if (!detailId || !detail.data) return 0
      const orders = await billableOrders(detail.data.pharmacy_id, detail.data.period_start ?? '1970-01-01', detail.data.period_end ?? '2100-01-01')
      for (const o of orders) {
        await addInvoiceItem({
          invoice_id: detailId,
          order_id: o.id,
          description: `Entrega ${o.code} · ${o.recipient_name} · ${o.delivery_district ?? o.delivery_city}`,
          quantity: 1,
          unit_price_cents: o.quoted_price_cents,
          total_cents: o.quoted_price_cents,
        })
      }
      await logAudit('BILL', 'invoice', detailId, `Faturou ${orders.length} entrega(s)`)
      return orders.length
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['invoice', detailId] })
      void qc.invalidateQueries({ queryKey: ['invoices'] })
    },
  })

  const removeItem = useMutation({
    mutationFn: (id: number) => removeInvoiceItem(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['invoice', detailId] })
      void qc.invalidateQueries({ queryKey: ['invoices'] })
    },
  })

  const pay = useMutation({
    mutationFn: async () => {
      if (!detailId) return
      await registerPayment({
        invoice_id: detailId,
        amount_cents: Number(payForm.amount_cents),
        method: payForm.method,
        paid_at: payForm.paid_at,
        reference: payForm.reference || null,
        notes: payForm.notes || null,
      })
      await logAudit('PAYMENT', 'invoice', detailId, `Registrou pagamento de ${brl(Number(payForm.amount_cents))}`)
    },
    onSuccess: () => {
      setPayOpen(false)
      setPayForm({ amount_cents: '', method: 'PIX', paid_at: new Date().toISOString().slice(0, 10), reference: '', notes: '' })
      void qc.invalidateQueries({ queryKey: ['invoice', detailId] })
      void qc.invalidateQueries({ queryKey: ['invoices'] })
    },
    onError: (e) => setError((e as Error).message),
  })

  const cancel = useMutation({
    mutationFn: async () => {
      if (!detailId) return
      await updateInvoice(detailId, { status: 'CANCELLED' })
      await logAudit('CANCEL', 'invoice', detailId, 'Cancelou fatura')
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['invoice', detailId] })
      void qc.invalidateQueries({ queryKey: ['invoices'] })
    },
  })

  const rows = (invoices.data ?? []).filter((i) => {
    const s = search.toLowerCase()
    const matchSearch = !s || i.number.toLowerCase().includes(s) || (i.pharmacy?.trade_name ?? '').toLowerCase().includes(s)
    return matchSearch && (!statusFilter || i.status === statusFilter)
  })

  const outstanding = rows.filter((i) => !['PAID', 'CANCELLED'].includes(i.status))
    .reduce((s, i) => s + (i.total_cents - i.paid_cents), 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar fatura ou farmácia…" className="w-full sm:w-72" />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full sm:w-48">
          <option value="">Todos os status</option>
          {Object.entries(INVOICE_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <div className="ml-auto"><Button onClick={() => setNewOpen(true)} icon={<Plus className="h-4 w-4" />}>Nova fatura</Button></div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Faturas listadas" value={invoices.isLoading ? '—' : rows.length}
          hint="Conforme os filtros" icon={<Receipt className="h-4 w-4" />} />
        <StatCard label="Saldo em aberto" value={invoices.isLoading ? '—' : brl(outstanding)}
          icon={<CircleDollarSign className="h-4 w-4" />} tone="accent" />
        <StatCard label="Recebido" value={invoices.isLoading ? '—' : brl(rows.reduce((s, i) => s + i.paid_cents, 0))}
          icon={<Banknote className="h-4 w-4" />} />
      </div>

      <Card>
        <CardHeader title="Faturas" description="Emissão, vencimento e pagamentos manuais" />
        {invoices.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState title="Nenhuma fatura" description="Crie uma fatura e fatura as entregas do período."
            icon={<Receipt className="h-6 w-6" />}
            action={<Button onClick={() => setNewOpen(true)} icon={<Plus className="h-4 w-4" />}>Nova fatura</Button>} />
        ) : (
          <div className="table-wrap">
            <table className="table-base">
              <thead><tr><th>Fatura</th><th>Farmácia</th><th>Período</th><th>Vencimento</th><th>Total</th><th>Pago</th><th>Saldo</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((i: Invoice) => (
                  <tr key={i.id}>
                    <td className="font-mono text-[12px] font-semibold">{i.number}</td>
                    <td className="text-[12.5px]">{i.pharmacy?.trade_name ?? '—'}</td>
                    <td className="text-[12px] text-ink-600">{formatDate(i.period_start)} – {formatDate(i.period_end)}</td>
                    <td className="text-[12px]">{formatDate(i.due_date)}</td>
                    <td className="text-[12.5px]">{brl(i.total_cents)}</td>
                    <td className="text-[12.5px] text-emerald-700">{brl(i.paid_cents)}</td>
                    <td className="text-[12.5px] font-semibold">{brl(i.total_cents - i.paid_cents)}</td>
                    <td><span className={`badge ${INVOICE_STATUS_CLASS[i.status]}`}>{INVOICE_STATUS_LABEL[i.status]}</span></td>
                    <td className="text-right"><Button variant="ghost" size="sm" onClick={() => setDetailId(i.id)}>Abrir</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Nova fatura */}
      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Nova fatura" description="Defina o período para faturar entregas" size="md"
        footer={<>
          <Button variant="secondary" onClick={() => setNewOpen(false)}>Cancelar</Button>
          <Button onClick={() => create.mutate()} loading={create.isPending}>Emitir fatura</Button>
        </>}>
        {error && <Alert tone="danger" title="Erro">{error}</Alert>}
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Farmácia" required className="sm:col-span-2">
            <Select value={form.pharmacy_id} onChange={(e) => setForm((f) => ({ ...f, pharmacy_id: e.target.value }))}>
              <option value="">Selecione…</option>
              {(pharmacies.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.trade_name}</option>)}
            </Select>
          </Field>
          <Field label="Início do período"><Input type="date" value={form.period_start} onChange={(e) => setForm((f) => ({ ...f, period_start: e.target.value }))} /></Field>
          <Field label="Fim do período"><Input type="date" value={form.period_end} onChange={(e) => setForm((f) => ({ ...f, period_end: e.target.value }))} /></Field>
          <Field label="Vencimento"><Input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} /></Field>
          <Field label="Desconto (centavos)"><Input type="number" min={0} value={form.discount_cents} onChange={(e) => setForm((f) => ({ ...f, discount_cents: e.target.value }))} /></Field>
          <Field label="Observações" className="sm:col-span-2"><Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></Field>
        </div>
      </Modal>

      {/* Detalhe */}
      <Modal open={!!detailId} onClose={() => setDetailId(null)} size="xl"
        title={detail.data ? `Fatura ${detail.data.number}` : 'Fatura'}
        description={detail.data ? `${detail.data.pharmacy?.trade_name} · vence ${formatDate(detail.data.due_date)}` : undefined}
        footer={<>
          <Button variant="secondary" onClick={() => cancel.mutate()} loading={cancel.isPending}>Cancelar fatura</Button>
          <Button variant="secondary" onClick={() => bill.mutate()} loading={bill.isPending} icon={<Wand2 className="h-4 w-4" />}>
            Faturar entregas do período
          </Button>
          <Button onClick={() => setPayOpen(true)} icon={<Banknote className="h-4 w-4" />}>Registrar pagamento</Button>
        </>}>
        {detail.isLoading || !detail.data ? <Skeleton className="h-48" /> : (
          <div className="space-y-4">
            {error && <Alert tone="danger">{error}</Alert>}
            <div className="flex flex-wrap items-center gap-2">
              <span className={`badge ${INVOICE_STATUS_CLASS[detail.data.status]}`}>{INVOICE_STATUS_LABEL[detail.data.status]}</span>
              <span className="text-[12px] text-ink-500">Emitida em {formatDate(detail.data.issue_date)}</span>
            </div>

            <div className="table-wrap rounded-xl border border-ink-200">
              <table className="table-base">
                <thead><tr><th>Descrição</th><th>Qtd</th><th>Unitário</th><th>Total</th><th /></tr></thead>
                <tbody>
                  {detail.data.items.length === 0 ? (
                    <tr><td colSpan={5} className="py-6 text-center text-[12.5px] text-ink-500">
                      Nenhum item. Use "Faturar entregas do período" para importar as entregas concluídas.
                    </td></tr>
                  ) : detail.data.items.map((it) => (
                    <tr key={it.id}>
                      <td className="text-[12.5px]">{it.description}</td>
                      <td className="text-[12.5px]">{it.quantity}</td>
                      <td className="text-[12.5px]">{brl(it.unit_price_cents)}</td>
                      <td className="text-[12.5px] font-medium">{brl(it.total_cents)}</td>
                      <td className="text-right">
                        <button onClick={() => removeItem.mutate(it.id)} className="text-[11px] font-medium text-red-600 hover:underline">remover</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 text-[13px]">
                <div className="flex justify-between"><span className="text-ink-500">Subtotal</span><span>{brl(detail.data.subtotal_cents)}</span></div>
                <div className="flex justify-between"><span className="text-ink-500">Desconto</span><span>-{brl(detail.data.discount_cents)}</span></div>
                <div className="flex justify-between border-t border-ink-100 pt-1.5 font-semibold"><span>Total</span><span>{brl(detail.data.total_cents)}</span></div>
                <div className="flex justify-between text-emerald-700"><span>Pago</span><span>{brl(detail.data.paid_cents)}</span></div>
                <div className="flex justify-between font-semibold"><span>Saldo</span><span>{brl(detail.data.total_cents - detail.data.paid_cents)}</span></div>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-400">Pagamentos</p>
                {detail.data.payments.length === 0 ? (
                  <p className="text-[12.5px] text-ink-500">Nenhum pagamento registrado.</p>
                ) : (
                  <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200">
                    {detail.data.payments.map((p) => (
                      <li key={p.id} className="flex items-center justify-between px-3 py-2 text-[12.5px]">
                        <span>{formatDate(p.paid_at)} · {p.method}{p.reference ? ` · ${p.reference}` : ''}</span>
                        <span className="font-medium">{brl(p.amount_cents)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Pagamento */}
      <Modal open={payOpen} onClose={() => setPayOpen(false)} title="Registrar pagamento" size="md"
        description="Aceita pagamentos parciais"
        footer={<>
          <Button variant="secondary" onClick={() => setPayOpen(false)}>Cancelar</Button>
          <Button onClick={() => pay.mutate()} loading={pay.isPending} disabled={!payForm.amount_cents}>Registrar</Button>
        </>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valor (centavos)" required hint={`Saldo atual: ${brl(detail.data ? detail.data.total_cents - detail.data.paid_cents : 0)}`}>
            <Input type="number" min={1} value={payForm.amount_cents} onChange={(e) => setPayForm((f) => ({ ...f, amount_cents: e.target.value }))} />
          </Field>
          <Field label="Método">
            <Select value={payForm.method} onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))}>
              <option value="PIX">PIX</option>
              <option value="TRANSFER">Transferência</option>
              <option value="CASH">Dinheiro</option>
              <option value="CARD">Cartão</option>
              <option value="OTHER">Outro</option>
            </Select>
          </Field>
          <Field label="Data do pagamento"><Input type="date" value={payForm.paid_at} onChange={(e) => setPayForm((f) => ({ ...f, paid_at: e.target.value }))} /></Field>
          <Field label="Referência"><Input value={payForm.reference} onChange={(e) => setPayForm((f) => ({ ...f, reference: e.target.value }))} placeholder="ID da transação" /></Field>
          <Field label="Observações" className="sm:col-span-2"><Textarea value={payForm.notes} onChange={(e) => setPayForm((f) => ({ ...f, notes: e.target.value }))} /></Field>
        </div>
      </Modal>
    </div>
  )
}
