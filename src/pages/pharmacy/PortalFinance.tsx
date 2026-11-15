import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Receipt, Wallet, Download } from 'lucide-react'
import { Card, CardHeader, EmptyState, Modal, Skeleton } from '@/components/ui'
import { getInvoice, listInvoices } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { brl, formatDate, formatDateTime, INVOICE_STATUS_CLASS, INVOICE_STATUS_LABEL } from '@/lib/utils'
import { Button } from '@/components/ui'

export default function PortalFinance() {
  const { profile } = useAuth()
  const pharmacyId = profile?.pharmacy_id ?? null
  const [openId, setOpenId] = useState<string | null>(null)

  const invoices = useQuery({
    queryKey: ['portal-invoices', pharmacyId],
    queryFn: () => listInvoices(pharmacyId),
    enabled: !!pharmacyId,
  })

  const detail = useQuery({
    queryKey: ['portal-invoice', openId],
    queryFn: () => getInvoice(openId!),
    enabled: !!openId,
  })

  const rows = invoices.data ?? []
  const openTotal = rows.filter((i) => !['PAID', 'CANCELLED'].includes(i.status))
    .reduce((s, i) => s + (i.total_cents - i.paid_cents), 0)
  const paidTotal = rows.filter((i) => i.status === 'PAID')
    .reduce((s, i) => s + i.total_cents, 0)

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Faturas</p>
          <p className="kpi-value mt-1">{rows.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Saldo em aberto</p>
          <p className="kpi-value mt-1 text-amber-700">{brl(openTotal)}</p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Total pago</p>
          <p className="kpi-value mt-1 text-emerald-700">{brl(paidTotal)}</p>
        </div>
      </div>

      <Card>
        <CardHeader title="Minhas faturas" description="Somente da sua farmácia" />
        {invoices.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState title="Nenhuma fatura" description="As faturas emitidas pela D'Luca aparecerão aqui." icon={<Receipt className="h-6 w-6" />} />
        ) : (
          <div className="table-wrap">
            <table className="table-base">
              <thead><tr><th>Fatura</th><th>Período</th><th>Vencimento</th><th>Total</th><th>Pago</th><th>Saldo</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id}>
                    <td className="font-mono text-[12px] font-semibold">{i.number}</td>
                    <td className="text-[12px]">{formatDate(i.period_start)} – {formatDate(i.period_end)}</td>
                    <td className="text-[12px]">{formatDate(i.due_date)}</td>
                    <td className="text-[12.5px]">{brl(i.total_cents)}</td>
                    <td className="text-[12.5px] text-emerald-700">{brl(i.paid_cents)}</td>
                    <td className="text-[12.5px] font-semibold">{brl(i.total_cents - i.paid_cents)}</td>
                    <td><span className={`badge ${INVOICE_STATUS_CLASS[i.status]}`}>{INVOICE_STATUS_LABEL[i.status]}</span></td>
                    <td><Button variant="ghost" size="sm" onClick={() => setOpenId(i.id)}>Ver</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="flex items-center gap-1.5 px-1 text-[11px] text-ink-400">
        <Wallet className="h-3 w-3" /> Os pagamentos são registrados manualmente pela equipe financeira da D'Luca.
      </p>

      <Modal open={!!openId} onClose={() => setOpenId(null)} size="lg"
        title={detail.data ? `Fatura ${detail.data.number}` : 'Fatura'}
        description={detail.data ? `Vencimento ${formatDate(detail.data.due_date)}` : undefined}
        footer={<Button variant="secondary" onClick={() => setOpenId(null)}>Fechar</Button>}>
        {detail.isLoading || !detail.data ? <Skeleton className="h-40" /> : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`badge ${INVOICE_STATUS_CLASS[detail.data.status]}`}>{INVOICE_STATUS_LABEL[detail.data.status]}</span>
              <span className="text-[12px] text-ink-500">Emitida em {formatDate(detail.data.issue_date)}</span>
            </div>
            <div className="table-wrap rounded-xl border border-ink-200">
              <table className="table-base">
                <thead><tr><th>Descrição</th><th>Qtd</th><th>Unitário</th><th>Total</th></tr></thead>
                <tbody>
                  {detail.data.items.map((it) => (
                    <tr key={it.id}>
                      <td className="text-[12.5px]">{it.description}</td>
                      <td className="text-[12.5px]">{it.quantity}</td>
                      <td className="text-[12.5px]">{brl(it.unit_price_cents)}</td>
                      <td className="text-[12.5px] font-medium">{brl(it.total_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
                      <span>{formatDateTime(p.paid_at)} · {p.method}</span>
                      <span className="font-medium">{brl(p.amount_cents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="flex items-center gap-1.5 text-[11px] text-ink-400">
              <Download className="h-3 w-3" /> Exportação em PDF será disponibilizada pela central.
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
