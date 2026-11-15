import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Pencil, Plus } from 'lucide-react'
import {
  Button, Card, CardHeader, EmptyState, Field, Input, Modal, SearchInput, Select, Skeleton, Textarea,
} from '@/components/ui'
import { listContracts, listPharmacies, logAudit, upsertContract } from '@/lib/api'
import { contractSchema, fieldErrors } from '@/lib/validation'
import { CONTRACT_STATUS_LABEL, brl, formatDate } from '@/lib/utils'
import type { Contract } from '@/types'

const empty = {
  pharmacy_id: '', name: '', status: 'ACTIVE', base_price_cents: '0', included_km: '10',
  price_per_extra_km_cents: '0', courier_payout_cents: '0', urgency_fee_cents: '0',
  temperature_fee_cents: '0', billing_cycle: 'MONTHLY', payment_terms_days: '15',
  starts_on: new Date().toISOString().slice(0, 10), ends_on: '', notes: '',
}

export default function Contracts() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Contract | null>(null)
  const [form, setForm] = useState<Record<string, string>>(empty)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const contracts = useQuery({ queryKey: ['contracts'], queryFn: () => listContracts() })
  const pharmacies = useQuery({ queryKey: ['pharmacies'], queryFn: listPharmacies })

  const save = useMutation({
    mutationFn: async () => {
      const parsed = contractSchema.safeParse(form)
      if (!parsed.success) { setErrors(fieldErrors(parsed.error)); throw new Error('invalid') }
      setErrors({})
      const d = parsed.data
      await upsertContract({
        ...d, ends_on: d.ends_on || null, notes: d.notes || null,
      }, editing?.id)
      await logAudit(editing ? 'UPDATE' : 'CREATE', 'contract', editing?.id ?? null, `${editing ? 'Atualizou' : 'Criou'} contrato ${d.name}`)
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['contracts'] }); setOpen(false) },
    onError: (e) => { if (!(e instanceof Error && e.message === 'invalid')) setErrors({ _form: (e as Error).message }) },
  })

  function openNew() { setEditing(null); setForm(empty); setErrors({}); setOpen(true) }
  function openEdit(c: Contract) {
    setEditing(c)
    setForm({
      pharmacy_id: c.pharmacy_id, name: c.name, status: c.status,
      base_price_cents: String(c.base_price_cents), included_km: String(c.included_km),
      price_per_extra_km_cents: String(c.price_per_extra_km_cents),
      courier_payout_cents: String(c.courier_payout_cents),
      urgency_fee_cents: String(c.urgency_fee_cents),
      temperature_fee_cents: String(c.temperature_fee_cents),
      billing_cycle: c.billing_cycle, payment_terms_days: String(c.payment_terms_days),
      starts_on: c.starts_on, ends_on: c.ends_on ?? '', notes: c.notes ?? '',
    })
    setErrors({}); setOpen(true)
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const filtered = (contracts.data ?? []).filter((c) => {
    const s = search.toLowerCase()
    return !s || c.name.toLowerCase().includes(s) || (c.pharmacy?.trade_name ?? '').toLowerCase().includes(s)
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar contrato…" className="w-full sm:w-72" />
        <div className="ml-auto"><Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>Novo contrato</Button></div>
      </div>

      <Card>
        <CardHeader title={`Contratos (${filtered.length})`} description="Tabela comercial por farmácia" />
        {contracts.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState title="Nenhum contrato" description="Cadastre a tabela comercial para calcular valores automaticamente."
            icon={<FileText className="h-6 w-6" />}
            action={<Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>Novo contrato</Button>} />
        ) : (
          <div className="table-wrap">
            <table className="table-base">
              <thead><tr><th>Contrato</th><th>Farmácia</th><th>Base</th><th>Km incluído</th><th>Km extra</th><th>Repasse</th><th>Vigência</th><th>Status</th><th /></tr></thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.name}</td>
                    <td className="text-[12.5px]">{c.pharmacy?.trade_name ?? '—'}</td>
                    <td className="text-[12.5px]">{brl(c.base_price_cents)}</td>
                    <td className="text-[12.5px]">{Number(c.included_km)} km</td>
                    <td className="text-[12.5px]">{brl(c.price_per_extra_km_cents)}</td>
                    <td className="text-[12.5px]">{brl(c.courier_payout_cents)}</td>
                    <td className="text-[12px] text-ink-500">{formatDate(c.starts_on)} → {c.ends_on ? formatDate(c.ends_on) : 'sem fim'}</td>
                    <td>
                      <span className={`badge ${c.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : c.status === 'SUSPENDED' ? 'bg-amber-100 text-amber-800' : 'bg-ink-200 text-ink-600'}`}>
                        {CONTRACT_STATUS_LABEL[c.status]}
                      </span>
                    </td>
                    <td className="text-right"><Button variant="ghost" size="sm" onClick={() => openEdit(c)} icon={<Pencil className="h-3.5 w-3.5" />}>Editar</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Editar contrato' : 'Novo contrato'} size="lg"
        footer={<>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>Salvar</Button>
        </>}>
        {errors._form && <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{errors._form}</div>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Farmácia" required error={errors.pharmacy_id}>
            <Select value={form.pharmacy_id} onChange={set('pharmacy_id')} invalid={!!errors.pharmacy_id}>
              <option value="">Selecione…</option>
              {(pharmacies.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.trade_name}</option>)}
            </Select>
          </Field>
          <Field label="Nome do contrato" required error={errors.name}>
            <Input value={form.name} onChange={set('name')} invalid={!!errors.name} placeholder="Tabela padrão 2026" />
          </Field>
          <Field label="Valor base (centavos)" hint="Ex.: 2500 = R$ 25,00">
            <Input type="number" min={0} value={form.base_price_cents} onChange={set('base_price_cents')} />
          </Field>
          <Field label="Km incluídos"><Input type="number" min={0} step="0.1" value={form.included_km} onChange={set('included_km')} /></Field>
          <Field label="Valor por km extra (centavos)"><Input type="number" min={0} value={form.price_per_extra_km_cents} onChange={set('price_per_extra_km_cents')} /></Field>
          <Field label="Repasse ao entregador (centavos)"><Input type="number" min={0} value={form.courier_payout_cents} onChange={set('courier_payout_cents')} /></Field>
          <Field label="Taxa de urgência (centavos)"><Input type="number" min={0} value={form.urgency_fee_cents} onChange={set('urgency_fee_cents')} /></Field>
          <Field label="Taxa refrigerado (centavos)"><Input type="number" min={0} value={form.temperature_fee_cents} onChange={set('temperature_fee_cents')} /></Field>
          <Field label="Ciclo de cobrança">
            <Select value={form.billing_cycle} onChange={set('billing_cycle')}>
              <option value="MONTHLY">Mensal</option>
              <option value="BIWEEKLY">Quinzenal</option>
              <option value="ON_DEMAND">Sob demanda</option>
            </Select>
          </Field>
          <Field label="Prazo de pagamento (dias)"><Input type="number" min={0} value={form.payment_terms_days} onChange={set('payment_terms_days')} /></Field>
          <Field label="Início" required error={errors.starts_on}><Input type="date" value={form.starts_on} onChange={set('starts_on')} invalid={!!errors.starts_on} /></Field>
          <Field label="Término"><Input type="date" value={form.ends_on} onChange={set('ends_on')} /></Field>
          <Field label="Situação">
            <Select value={form.status} onChange={set('status')}>
              {Object.entries(CONTRACT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Observações" className="sm:col-span-2"><Textarea value={form.notes} onChange={set('notes')} /></Field>
        </div>
      </Modal>
    </div>
  )
}
