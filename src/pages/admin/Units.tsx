import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Building2, Pencil, Plus, Power } from 'lucide-react'
import {
  Button, Card, CardHeader, EmptyState, Field, Input, Modal, SearchInput, Select, Skeleton, Switch, Textarea,
} from '@/components/ui'
import { listPharmacies, listUnits, logAudit, upsertUnit } from '@/lib/api'
import { fieldErrors, unitSchema } from '@/lib/validation'
import { maskPhone } from '@/lib/utils'
import type { PharmacyUnit } from '@/types'

const empty = {
  name: '', code: '', phone: '', contact_name: '', street: '', number: '', complement: '',
  district: '', city: '', state: '', zip_code: '', pickup_instructions: '',
}

export default function Units() {
  const qc = useQueryClient()
  const [sp, setSp] = useSearchParams()
  const pharmacyFilter = sp.get('farmacia') ?? ''
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<PharmacyUnit | null>(null)
  const [form, setForm] = useState<Record<string, string>>({ ...empty, pharmacy_id: '' })
  const [isActive, setIsActive] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const pharmacies = useQuery({ queryKey: ['pharmacies'], queryFn: listPharmacies })
  const units = useQuery({ queryKey: ['units', pharmacyFilter], queryFn: () => listUnits(pharmacyFilter || null) })

  const save = useMutation({
    mutationFn: async () => {
      if (!form.pharmacy_id) { setErrors({ pharmacy_id: 'Selecione a farmácia' }); throw new Error('invalid') }
      const parsed = unitSchema.safeParse({ ...form, is_active: isActive })
      if (!parsed.success) { setErrors(fieldErrors(parsed.error)); throw new Error('invalid') }
      setErrors({})
      const payload = { ...parsed.data, pharmacy_id: form.pharmacy_id }
      const id = await upsertUnit(payload, editing?.id)
      await logAudit(editing ? 'UPDATE' : 'CREATE', 'pharmacy_unit', id, `${editing ? 'Atualizou' : 'Criou'} unidade ${parsed.data.name}`)
      return id
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['units'] }); setOpen(false) },
    onError: (e) => { if (!(e instanceof Error && e.message === 'invalid')) setErrors({ _form: (e as Error).message }) },
  })

  const toggleActive = useMutation({
    mutationFn: async (u: PharmacyUnit) => {
      await upsertUnit({ is_active: !u.is_active }, u.id)
      await logAudit('UPDATE', 'pharmacy_unit', u.id, `${u.is_active ? 'Desativou' : 'Reativou'} unidade ${u.name}`)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['units'] }),
  })

  function openNew() {
    setEditing(null)
    setForm({ ...empty, pharmacy_id: pharmacyFilter })
    setIsActive(true); setErrors({}); setOpen(true)
  }
  function openEdit(u: PharmacyUnit) {
    setEditing(u)
    setForm({
      pharmacy_id: u.pharmacy_id, name: u.name, code: u.code ?? '', phone: u.phone ?? '',
      contact_name: u.contact_name ?? '', street: u.street, number: u.number ?? '',
      complement: u.complement ?? '', district: u.district ?? '', city: u.city, state: u.state,
      zip_code: u.zip_code ?? '', pickup_instructions: u.pickup_instructions ?? '',
    })
    setIsActive(u.is_active); setErrors({}); setOpen(true)
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const pharmacyName = (id: string) => (pharmacies.data ?? []).find((p) => p.id === id)?.trade_name ?? '—'
  const filtered = (units.data ?? []).filter((u) => {
    const s = search.toLowerCase()
    return !s || u.name.toLowerCase().includes(s) || u.city.toLowerCase().includes(s)
      || pharmacyName(u.pharmacy_id).toLowerCase().includes(s)
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={pharmacyFilter}
          onChange={(e) => setSp(e.target.value ? { farmacia: e.target.value } : {})}
          className="w-full sm:w-64"
        >
          <option value="">Todas as farmácias</option>
          {(pharmacies.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.trade_name}</option>)}
        </Select>
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar unidade…" className="w-full sm:w-72" />
        <div className="ml-auto"><Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>Nova unidade</Button></div>
      </div>

      <Card>
        <CardHeader title={`Unidades (${filtered.length})`} description="Pontos de coleta cadastrados" />
        {units.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Nenhuma unidade"
            description="Cadastre as filiais para que a farmácia possa escolher a origem do pedido."
            icon={<Building2 className="h-6 w-6" />}
            action={<Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>Cadastrar unidade</Button>}
          />
        ) : (
          <div className="table-wrap">
            <table className="table-base">
              <thead>
                <tr><th>Unidade</th><th>Farmácia</th><th>Endereço</th><th>Contato</th><th>Situação</th><th className="text-right">Ações</th></tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <p className="font-semibold text-ink-900">{u.name}</p>
                      {u.code && <p className="text-[11.5px] text-ink-500">Cód. {u.code}</p>}
                    </td>
                    <td className="text-[12.5px]">{pharmacyName(u.pharmacy_id)}</td>
                    <td className="text-[12.5px]">
                      <p>{u.street}{u.number ? `, ${u.number}` : ''}</p>
                      <p className="text-ink-500">{[u.district, u.city, u.state].filter(Boolean).join(' · ')}</p>
                    </td>
                    <td className="text-[12.5px]">
                      <p>{u.contact_name ?? '—'}</p>
                      <p className="text-ink-500">{u.phone ?? '—'}</p>
                    </td>
                    <td>
                      <span className={`badge ${u.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-ink-200 text-ink-600'}`}>
                        {u.is_active ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => toggleActive.mutate(u)} icon={<Power className="h-3.5 w-3.5" />}>
                          {u.is_active ? 'Desativar' : 'Ativar'}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(u)} icon={<Pencil className="h-3.5 w-3.5" />}>Editar</Button>
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
        title={editing ? 'Editar unidade' : 'Nova unidade'}
        description="Endereço usado como origem das coletas"
        size="lg"
        footer={<>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>Salvar</Button>
        </>}
      >
        {errors._form && <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{errors._form}</div>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Farmácia" required error={errors.pharmacy_id}>
            <Select value={form.pharmacy_id} onChange={set('pharmacy_id')} invalid={!!errors.pharmacy_id}>
              <option value="">Selecione…</option>
              {(pharmacies.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.trade_name}</option>)}
            </Select>
          </Field>
          <Field label="Nome da unidade" required error={errors.name}>
            <Input value={form.name} onChange={set('name')} invalid={!!errors.name} placeholder="Unidade Centro" />
          </Field>
          <Field label="Código interno"><Input value={form.code} onChange={set('code')} /></Field>
          <Field label="Telefone">
            <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: maskPhone(e.target.value) }))} />
          </Field>
          <Field label="Responsável"><Input value={form.contact_name} onChange={set('contact_name')} /></Field>
          <Field label="CEP"><Input value={form.zip_code} onChange={set('zip_code')} /></Field>
          <Field label="Rua" required error={errors.street} className="sm:col-span-2">
            <Input value={form.street} onChange={set('street')} invalid={!!errors.street} />
          </Field>
          <Field label="Número"><Input value={form.number} onChange={set('number')} /></Field>
          <Field label="Complemento"><Input value={form.complement} onChange={set('complement')} /></Field>
          <Field label="Bairro"><Input value={form.district} onChange={set('district')} /></Field>
          <Field label="Cidade" required error={errors.city}>
            <Input value={form.city} onChange={set('city')} invalid={!!errors.city} />
          </Field>
          <Field label="UF" required error={errors.state}>
            <Input value={form.state} onChange={set('state')} maxLength={2} className="uppercase" invalid={!!errors.state} />
          </Field>
          <Field label="Instruções de coleta" className="sm:col-span-2" hint="Visível para o entregador no pedido">
            <Textarea value={form.pickup_instructions} onChange={set('pickup_instructions')} placeholder="Ex.: entrar pela portaria lateral, falar com o farmacêutico." />
          </Field>
          <div className="sm:col-span-2">
            <Switch checked={isActive} onChange={setIsActive} label="Unidade ativa" description="Unidades inativas não aparecem na criação de pedidos." />
          </div>
        </div>
      </Modal>
    </div>
  )
}
