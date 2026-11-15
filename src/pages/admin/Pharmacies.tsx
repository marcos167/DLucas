import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Building2, Pencil, Plus, Store } from 'lucide-react'
import {
  Button, Card, CardHeader, EmptyState, Field, Input, Modal, SearchInput, Select, Skeleton, Textarea,
} from '@/components/ui'
import { listPharmacies, logAudit, upsertPharmacy } from '@/lib/api'
import { fieldErrors, pharmacySchema } from '@/lib/validation'
import { maskCnpj, maskPhone } from '@/lib/utils'
import type { Pharmacy } from '@/types'

const empty = {
  legal_name: '', trade_name: '', cnpj: '', status: 'ACTIVE' as const, email: '', phone: '',
  whatsapp: '', contact_name: '', billing_email: '', city: '', state: '', street: '', number: '',
  district: '', zip_code: '', notes: '',
}

const STATUS_LABEL: Record<string, string> = { PROSPECT: 'Prospect', ACTIVE: 'Ativa', INACTIVE: 'Inativa' }
const STATUS_CLASS: Record<string, string> = {
  PROSPECT: 'bg-amber-100 text-amber-800',
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  INACTIVE: 'bg-ink-200 text-ink-600',
}

export default function Pharmacies() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Pharmacy | null>(null)
  const [form, setForm] = useState<Record<string, string>>(empty)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { data, isLoading } = useQuery({ queryKey: ['pharmacies'], queryFn: listPharmacies })

  const save = useMutation({
    mutationFn: async () => {
      const parsed = pharmacySchema.safeParse(form)
      if (!parsed.success) { setErrors(fieldErrors(parsed.error)); throw new Error('invalid') }
      setErrors({})
      const d = parsed.data
      const payload = {
        ...d,
        cnpj: d.cnpj || null, email: d.email || null, phone: d.phone || null,
        whatsapp: d.whatsapp || null, contact_name: d.contact_name || null,
        billing_email: d.billing_email || null, city: d.city || null,
        state: d.state ? d.state.toUpperCase() : null, street: d.street || null,
        number: d.number || null, district: d.district || null, zip_code: d.zip_code || null,
        notes: d.notes || null,
      }
      const id = await upsertPharmacy(payload, editing?.id)
      await logAudit(editing ? 'UPDATE' : 'CREATE', 'pharmacy', id, `${editing ? 'Atualizou' : 'Cadastrou'} farmácia ${d.trade_name}`)
      return id
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pharmacies'] })
      setOpen(false)
    },
    onError: (e) => { if (!(e instanceof Error && e.message === 'invalid')) setErrors({ _form: (e as Error).message }) },
  })

  function openNew() { setEditing(null); setForm(empty); setErrors({}); setOpen(true) }
  function openEdit(p: Pharmacy) {
    setEditing(p)
    setForm({
      legal_name: p.legal_name, trade_name: p.trade_name, cnpj: p.cnpj ?? '', status: p.status,
      email: p.email ?? '', phone: p.phone ?? '', whatsapp: p.whatsapp ?? '',
      contact_name: p.contact_name ?? '', billing_email: p.billing_email ?? '',
      city: p.city ?? '', state: p.state ?? '', street: p.street ?? '', number: p.number ?? '',
      district: p.district ?? '', zip_code: p.zip_code ?? '', notes: p.notes ?? '',
    })
    setErrors({})
    setOpen(true)
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const filtered = (data ?? []).filter((p) => {
    const s = search.toLowerCase()
    return !s || p.trade_name.toLowerCase().includes(s) || p.legal_name.toLowerCase().includes(s)
      || (p.cnpj ?? '').includes(s) || (p.city ?? '').toLowerCase().includes(s)
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nome, CNPJ ou cidade…" className="w-full sm:w-80" />
        <Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>Nova farmácia</Button>
      </div>

      <Card>
        <CardHeader title={`Farmácias (${filtered.length})`} description="Cadastro comercial e situação" />
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Nenhuma farmácia encontrada"
            description="Cadastre a primeira farmácia cliente para começar a operar."
            icon={<Store className="h-6 w-6" />}
            action={<Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>Cadastrar farmácia</Button>}
          />
        ) : (
          <div className="table-wrap">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Farmácia</th>
                  <th>CNPJ</th>
                  <th>Contato</th>
                  <th>Cidade</th>
                  <th>Status</th>
                  <th className="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <p className="font-semibold text-ink-900">{p.trade_name}</p>
                      <p className="text-[11.5px] text-ink-500">{p.legal_name}</p>
                    </td>
                    <td className="text-[12.5px]">{p.cnpj ?? '—'}</td>
                    <td className="text-[12.5px]">
                      <p>{p.contact_name ?? '—'}</p>
                      <p className="text-ink-500">{p.phone ?? p.email ?? '—'}</p>
                    </td>
                    <td className="text-[12.5px]">{[p.city, p.state].filter(Boolean).join(' / ') || '—'}</td>
                    <td><span className={`badge ${STATUS_CLASS[p.status]}`}>{STATUS_LABEL[p.status]}</span></td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <Link to={`/app/unidades?farmacia=${p.id}`} className="btn-ghost btn-sm" title="Unidades">
                          <Building2 className="h-3.5 w-3.5" />
                        </Link>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(p)} icon={<Pencil className="h-3.5 w-3.5" />}>
                          Editar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Editar farmácia' : 'Nova farmácia'}
        description="Dados comerciais e endereço da sede"
        size="lg"
        footer={<>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>Salvar</Button>
        </>}
      >
        {errors._form && <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{errors._form}</div>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome fantasia" required error={errors.trade_name}>
            <Input value={form.trade_name} onChange={set('trade_name')} invalid={!!errors.trade_name} />
          </Field>
          <Field label="Razão social" required error={errors.legal_name}>
            <Input value={form.legal_name} onChange={set('legal_name')} invalid={!!errors.legal_name} />
          </Field>
          <Field label="CNPJ" error={errors.cnpj}>
            <Input value={form.cnpj} onChange={(e) => setForm((f) => ({ ...f, cnpj: maskCnpj(e.target.value) }))} />
          </Field>
          <Field label="Situação">
            <Select value={form.status} onChange={set('status')}>
              <option value="PROSPECT">Prospect (em negociação)</option>
              <option value="ACTIVE">Ativa</option>
              <option value="INACTIVE">Inativa</option>
            </Select>
          </Field>
          <Field label="Responsável" error={errors.contact_name}>
            <Input value={form.contact_name} onChange={set('contact_name')} />
          </Field>
          <Field label="Telefone">
            <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: maskPhone(e.target.value) }))} />
          </Field>
          <Field label="WhatsApp">
            <Input value={form.whatsapp} onChange={(e) => setForm((f) => ({ ...f, whatsapp: maskPhone(e.target.value) }))} />
          </Field>
          <Field label="E-mail" error={errors.email}>
            <Input type="email" value={form.email} onChange={set('email')} invalid={!!errors.email} />
          </Field>
          <Field label="E-mail de cobrança" error={errors.billing_email}>
            <Input type="email" value={form.billing_email} onChange={set('billing_email')} invalid={!!errors.billing_email} />
          </Field>
          <Field label="CEP"><Input value={form.zip_code} onChange={set('zip_code')} /></Field>
          <Field label="Rua"><Input value={form.street} onChange={set('street')} /></Field>
          <Field label="Número"><Input value={form.number} onChange={set('number')} /></Field>
          <Field label="Bairro"><Input value={form.district} onChange={set('district')} /></Field>
          <Field label="Cidade"><Input value={form.city} onChange={set('city')} /></Field>
          <Field label="UF" error={errors.state}>
            <Input value={form.state} onChange={set('state')} maxLength={2} className="uppercase" />
          </Field>
          <Field label="Observações" className="sm:col-span-2">
            <Textarea value={form.notes} onChange={set('notes')} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
