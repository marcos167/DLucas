import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Pencil, Plus } from 'lucide-react'
import {
  Button, Card, CardHeader, EmptyState, Field, Input, Modal, Skeleton, Switch, Textarea,
} from '@/components/ui'
import { listUnits, upsertUnit } from '@/lib/api'
import { fieldErrors, unitSchema } from '@/lib/validation'
import { useAuth } from '@/contexts/AuthContext'
import type { PharmacyUnit } from '@/types'

const empty = {
  name: '', code: '', phone: '', contact_name: '', street: '', number: '', complement: '',
  district: '', city: '', state: '', zip_code: '', pickup_instructions: '',
}

export default function PortalUnits() {
  const { profile } = useAuth()
  const pharmacyId = profile?.pharmacy_id ?? ''
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<PharmacyUnit | null>(null)
  const [form, setForm] = useState<Record<string, string>>(empty)
  const [isActive, setIsActive] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const readOnly = profile?.role !== 'PHARMACY_ADMIN'

  const units = useQuery({ queryKey: ['units', pharmacyId], queryFn: () => listUnits(pharmacyId), enabled: !!pharmacyId })

  const save = useMutation({
    mutationFn: async () => {
      const parsed = unitSchema.safeParse({ ...form, is_active: isActive })
      if (!parsed.success) { setErrors(fieldErrors(parsed.error)); throw new Error('invalid') }
      setErrors({})
      await upsertUnit({ ...parsed.data, pharmacy_id: pharmacyId }, editing?.id)
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['units'] }); setOpen(false) },
    onError: (e) => { if (!(e instanceof Error && e.message === 'invalid')) setErrors({ _form: (e as Error).message }) },
  })

  function openNew() { setEditing(null); setForm(empty); setIsActive(true); setErrors({}); setOpen(true) }
  function openEdit(u: PharmacyUnit) {
    setEditing(u)
    setForm({
      name: u.name, code: u.code ?? '', phone: u.phone ?? '', contact_name: u.contact_name ?? '',
      street: u.street, number: u.number ?? '', complement: u.complement ?? '',
      district: u.district ?? '', city: u.city, state: u.state, zip_code: u.zip_code ?? '',
      pickup_instructions: u.pickup_instructions ?? '',
    })
    setIsActive(u.is_active); setErrors({}); setOpen(true)
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-ink-600">
          {readOnly
            ? 'Somente o gestor da farmácia pode editar unidades.'
            : 'Cadastre filiais para escolher a origem das coletas.'}
        </p>
        {!readOnly && <Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>Nova unidade</Button>}
      </div>

      <Card>
        <CardHeader title={`Unidades (${(units.data ?? []).length})`} />
        {units.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : (units.data ?? []).length === 0 ? (
          <EmptyState title="Nenhuma unidade" description="Cadastre a primeira unidade de coleta."
            icon={<Building2 className="h-6 w-6" />}
            action={!readOnly ? <Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>Cadastrar</Button> : undefined} />
        ) : (
          <div className="table-wrap">
            <table className="table-base">
              <thead><tr><th>Unidade</th><th>Endereço</th><th>Contato</th><th>Situação</th>{!readOnly && <th />}</tr></thead>
              <tbody>
                {(units.data ?? []).map((u) => (
                  <tr key={u.id}>
                    <td className="font-medium">{u.name}{u.code ? <span className="ml-1 text-[11px] text-ink-400">({u.code})</span> : null}</td>
                    <td className="text-[12.5px]">
                      <p>{u.street}{u.number ? `, ${u.number}` : ''}</p>
                      <p className="text-ink-500">{[u.district, u.city, u.state].filter(Boolean).join(' · ')}</p>
                    </td>
                    <td className="text-[12.5px]">{u.contact_name ?? '—'}<br /><span className="text-ink-500">{u.phone ?? ''}</span></td>
                    <td>
                      <span className={`badge ${u.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-ink-200 text-ink-600'}`}>
                        {u.is_active ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    {!readOnly && (
                      <td className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(u)} icon={<Pencil className="h-3.5 w-3.5" />}>Editar</Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Editar unidade' : 'Nova unidade'} size="lg"
        footer={<>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>Salvar</Button>
        </>}>
        {errors._form && <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{errors._form}</div>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome" required error={errors.name}><Input value={form.name} onChange={set('name')} invalid={!!errors.name} /></Field>
          <Field label="Código interno"><Input value={form.code} onChange={set('code')} /></Field>
          <Field label="Responsável"><Input value={form.contact_name} onChange={set('contact_name')} /></Field>
          <Field label="Telefone"><Input value={form.phone} onChange={set('phone')} /></Field>
          <Field label="Rua" required error={errors.street} className="sm:col-span-2"><Input value={form.street} onChange={set('street')} invalid={!!errors.street} /></Field>
          <Field label="Número"><Input value={form.number} onChange={set('number')} /></Field>
          <Field label="Complemento"><Input value={form.complement} onChange={set('complement')} /></Field>
          <Field label="Bairro"><Input value={form.district} onChange={set('district')} /></Field>
          <Field label="CEP"><Input value={form.zip_code} onChange={set('zip_code')} /></Field>
          <Field label="Cidade" required error={errors.city}><Input value={form.city} onChange={set('city')} invalid={!!errors.city} /></Field>
          <Field label="UF" required error={errors.state}><Input value={form.state} onChange={set('state')} maxLength={2} className="uppercase" invalid={!!errors.state} /></Field>
          <Field label="Instruções de coleta" className="sm:col-span-2">
            <Textarea value={form.pickup_instructions} onChange={set('pickup_instructions')} />
          </Field>
          <div className="sm:col-span-2">
            <Switch checked={isActive} onChange={setIsActive} label="Unidade ativa" />
          </div>
        </div>
      </Modal>
    </div>
  )
}
