import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bike, CheckCircle2, Pencil, Plus, UserX } from 'lucide-react'
import {
  Button, Card, CardHeader, EmptyState, Field, Input, Modal, SearchInput, Select, Skeleton, Textarea,
} from '@/components/ui'
import { listCouriers, logAudit, upsertCourier } from '@/lib/api'
import { courierSchema, fieldErrors } from '@/lib/validation'
import { AVAILABILITY_CLASS, AVAILABILITY_LABEL, formatDate, formatDateTime, maskCpf, maskPhone } from '@/lib/utils'
import type { Courier } from '@/types'

const empty = {
  full_name: '', phone: '', email: '', cpf: '', cnh_number: '', cnh_category: '',
  vehicle_type: 'MOTORCYCLE', vehicle_plate: '', base_city: '', base_state: '',
  service_zone: '', status: 'PENDING' as const, notes: '',
}

const STATUS_CLASS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800', ACTIVE: 'bg-emerald-100 text-emerald-800',
  SUSPENDED: 'bg-red-100 text-red-700', REJECTED: 'bg-red-100 text-red-700',
  INACTIVE: 'bg-ink-200 text-ink-600',
}
const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente', ACTIVE: 'Ativo', SUSPENDED: 'Suspenso', REJECTED: 'Rejeitado', INACTIVE: 'Inativo',
}

export default function Couriers() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Courier | null>(null)
  const [form, setForm] = useState<Record<string, string>>(empty)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { data, isLoading } = useQuery({ queryKey: ['couriers'], queryFn: listCouriers })

  const save = useMutation({
    mutationFn: async () => {
      const parsed = courierSchema.safeParse(form)
      if (!parsed.success) { setErrors(fieldErrors(parsed.error)); throw new Error('invalid') }
      setErrors({})
      const d = parsed.data
      const payload = {
        ...d,
        email: d.email || null, cpf: d.cpf || null, cnh_number: d.cnh_number || null,
        cnh_category: d.cnh_category || null, vehicle_plate: d.vehicle_plate || null,
        base_city: d.base_city || null, base_state: d.base_state ? d.base_state.toUpperCase() : null,
        service_zone: d.service_zone || null, notes: d.notes || null,
        approved_at: d.status === 'ACTIVE' ? new Date().toISOString() : null,
      }
      const id = await upsertCourier(payload, editing?.id)
      await logAudit(editing ? 'UPDATE' : 'CREATE', 'courier', id, `${editing ? 'Atualizou' : 'Cadastrou'} entregador ${d.full_name}`)
      return id
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['couriers'] }); setOpen(false) },
    onError: (e) => { if (!(e instanceof Error && e.message === 'invalid')) setErrors({ _form: (e as Error).message }) },
  })

  const setStatus = useMutation({
    mutationFn: async ({ c, status }: { c: Courier; status: Courier['status'] }) => {
      await upsertCourier({ status, approved_at: status === 'ACTIVE' ? new Date().toISOString() : c.approved_at }, c.id)
      await logAudit('UPDATE', 'courier', c.id, `Alterou status de ${c.full_name} para ${STATUS_LABEL[status]}`)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['couriers'] }),
  })

  function openNew() { setEditing(null); setForm(empty); setErrors({}); setOpen(true) }
  function openEdit(c: Courier) {
    setEditing(c)
    setForm({
      full_name: c.full_name, phone: c.phone, email: c.email ?? '', cpf: c.cpf ?? '',
      cnh_number: c.cnh_number ?? '', cnh_category: c.cnh_category ?? '', vehicle_type: c.vehicle_type,
      vehicle_plate: c.vehicle_plate ?? '', base_city: c.base_city ?? '', base_state: c.base_state ?? '',
      service_zone: c.service_zone ?? '', status: c.status, notes: c.notes ?? '',
    })
    setErrors({}); setOpen(true)
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const filtered = (data ?? []).filter((c) => {
    const s = search.toLowerCase()
    const matchSearch = !s || c.full_name.toLowerCase().includes(s) || c.phone.includes(s)
      || (c.base_city ?? '').toLowerCase().includes(s) || (c.vehicle_plate ?? '').toLowerCase().includes(s)
    return matchSearch && (!statusFilter || c.status === statusFilter)
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar entregador…" className="w-full sm:w-72" />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full sm:w-48">
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <div className="ml-auto"><Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>Novo entregador</Button></div>
      </div>

      <Card>
        <CardHeader title={`Entregadores (${filtered.length})`} description="Situação cadastral e disponibilidade atual" />
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Nenhum entregador"
            description="Aprove candidaturas ou cadastre um entregador manualmente."
            icon={<Bike className="h-6 w-6" />}
            action={<Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>Cadastrar entregador</Button>}
          />
        ) : (
          <div className="table-wrap">
            <table className="table-base">
              <thead>
                <tr><th>Entregador</th><th>Veículo</th><th>Região</th><th>Disponibilidade</th><th>Status</th><th>Localização</th><th className="text-right">Ações</th></tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <p className="font-semibold text-ink-900">{c.full_name}</p>
                      <p className="text-[11.5px] text-ink-500">{c.phone}{c.cpf ? ` · ${c.cpf}` : ''}</p>
                    </td>
                    <td className="text-[12.5px]">
                      <p>{c.vehicle_type === 'MOTORCYCLE' ? 'Motocicleta' : c.vehicle_type}</p>
                      <p className="text-ink-500">{c.vehicle_plate ?? '—'}</p>
                    </td>
                    <td className="text-[12.5px]">{[c.base_city, c.base_state].filter(Boolean).join(' / ') || '—'}<br />
                      <span className="text-ink-500">{c.service_zone ?? ''}</span>
                    </td>
                    <td><span className={`badge ${AVAILABILITY_CLASS[c.availability]}`}>{AVAILABILITY_LABEL[c.availability]}</span></td>
                    <td><span className={`badge ${STATUS_CLASS[c.status]}`}>{STATUS_LABEL[c.status]}</span></td>
                    <td className="text-[11.5px] text-ink-600">
                      {c.location_sharing_enabled ? (
                        c.current_location_at ? (
                          <span title={formatDateTime(c.current_location_at)}>
                            Compartilhando<br /><span className="text-ink-400">{formatDateTime(c.current_location_at)}</span>
                          </span>
                        ) : <span className="text-ink-400">Autorizado, sem registro</span>
                      ) : <span className="text-ink-400">Não autorizado</span>}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        {c.status !== 'ACTIVE' && (
                          <Button variant="ghost" size="sm" onClick={() => setStatus.mutate({ c, status: 'ACTIVE' })} icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
                            Aprovar
                          </Button>
                        )}
                        {c.status === 'ACTIVE' && (
                          <Button variant="ghost" size="sm" onClick={() => setStatus.mutate({ c, status: 'SUSPENDED' })} icon={<UserX className="h-3.5 w-3.5" />}>
                            Suspender
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => openEdit(c)} icon={<Pencil className="h-3.5 w-3.5" />}>Editar</Button>
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
        open={open} onClose={() => setOpen(false)}
        title={editing ? 'Editar entregador' : 'Novo entregador'}
        description="Dados cadastrais e região de atuação"
        size="lg"
        footer={<>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>Salvar</Button>
        </>}
      >
        {errors._form && <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{errors._form}</div>}
        {editing && (
          <p className="mb-3 rounded-xl bg-ink-50 px-3 py-2 text-xs text-ink-600">
            Cadastrado em {formatDate(editing.created_at)} · vínculo de acesso:
            {' '}{editing.profile_id ? 'usuário vinculado' : 'sem usuário de login'}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome completo" required error={errors.full_name} className="sm:col-span-2">
            <Input value={form.full_name} onChange={set('full_name')} invalid={!!errors.full_name} />
          </Field>
          <Field label="Telefone" required error={errors.phone}>
            <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: maskPhone(e.target.value) }))} invalid={!!errors.phone} />
          </Field>
          <Field label="E-mail" error={errors.email}>
            <Input type="email" value={form.email} onChange={set('email')} invalid={!!errors.email} />
          </Field>
          <Field label="CPF">
            <Input value={form.cpf} onChange={(e) => setForm((f) => ({ ...f, cpf: maskCpf(e.target.value) }))} />
          </Field>
          <Field label="Situação">
            <Select value={form.status} onChange={set('status')}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="CNH"><Input value={form.cnh_number} onChange={set('cnh_number')} /></Field>
          <Field label="Categoria CNH"><Input value={form.cnh_category} onChange={set('cnh_category')} placeholder="A / AB" /></Field>
          <Field label="Tipo de veículo">
            <Select value={form.vehicle_type} onChange={set('vehicle_type')}>
              <option value="MOTORCYCLE">Motocicleta</option>
              <option value="BICYCLE">Bicicleta</option>
              <option value="CAR">Carro</option>
              <option value="VAN">Van</option>
            </Select>
          </Field>
          <Field label="Placa"><Input value={form.vehicle_plate} onChange={set('vehicle_plate')} className="uppercase" /></Field>
          <Field label="Cidade base"><Input value={form.base_city} onChange={set('base_city')} /></Field>
          <Field label="UF base"><Input value={form.base_state} onChange={set('base_state')} maxLength={2} className="uppercase" /></Field>
          <Field label="Zona / bairros de atuação" className="sm:col-span-2">
            <Input value={form.service_zone} onChange={set('service_zone')} placeholder="Ex.: Zona Sul, Centro, Pinheiros" />
          </Field>
          <Field label="Observações" className="sm:col-span-2">
            <Textarea value={form.notes} onChange={set('notes')} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
