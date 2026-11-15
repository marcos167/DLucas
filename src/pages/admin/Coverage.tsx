import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPinned, Plus, Search, Trash2 } from 'lucide-react'
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Select, Skeleton, Switch, Tabs } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { useApiMutation } from '@/hooks/useApiMutation'
import { listCouriers } from '@/lib/api'
import * as api from '@/lib/logistics/api'
import { describeZipRange, formatZip, parseZipRange, rangeContains, rangesOverlap } from '@/lib/logistics/cep'
import {
  DEFAULT_DISTRIBUTION_SETTINGS, type DistributionSettings, type PostalAssignment, type PostalMatch, type PostalRegion,
} from '@/lib/logistics/types'
import type { Courier } from '@/types'

type Tab = 'faixas' | 'parametros'
const COLORS = ['#0f766e', '#b45309', '#1d4ed8', '#7c3aed', '#be123c', '#4d7c0f', '#0e7490', '#64748b']

export default function Coverage() {
  const { profile } = useAuth()
  const canOperate = ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER'].includes(profile?.role ?? '')
  const canConfigure = ['SUPER_ADMIN', 'ADMIN'].includes(profile?.role ?? '')
  const [params, setParams] = useSearchParams()
  const tab = (params.get('aba') as Tab | null) ?? 'faixas'
  const couriers = useQuery({ queryKey: ['couriers'], queryFn: listCouriers })

  return (
    <div className="space-y-4">
      <Tabs<Tab> value={tab} onChange={(next) => setParams({ aba: next }, { replace: true })}
        tabs={[{ id: 'faixas', label: 'Regiões e faixas de CEP' }, { id: 'parametros', label: 'Limites e parâmetros' }]} />
      {tab === 'faixas'
        ? <Ranges couriers={couriers.data ?? []} canOperate={canOperate} />
        : <Parameters couriers={couriers.data ?? []} canOperate={canOperate} canConfigure={canConfigure} />}
    </div>
  )
}

/* ------------------------------------------------------------------ regiões e faixas */

function Ranges({ couriers, canOperate }: { couriers: Courier[]; canOperate: boolean }) {
  const client = useQueryClient()
  const regions = useQuery({ queryKey: ['logistics', 'regions'], queryFn: api.listRegions })
  const ranges = useQuery({ queryKey: ['logistics', 'ranges'], queryFn: api.listAssignments })
  const [editing, setEditing] = useState<PostalRegion | 'new' | null>(null)
  const reload = () => {
    void client.invalidateQueries({ queryKey: ['logistics', 'regions'] })
    void client.invalidateQueries({ queryKey: ['logistics', 'ranges'] })
  }
  const courierName = (id: string | null) => couriers.find((courier) => courier.id === id)?.full_name ?? null
  const active = useMemo(() => {
    const on = new Set((regions.data ?? []).filter((region) => region.is_active).map((region) => region.id))
    return (ranges.data ?? []).filter((range) => range.is_active && on.has(range.region_id))
  }, [regions.data, ranges.data])

  // Empate de verdade: mesma largura e mesma prioridade sobre os mesmos CEPs. A regra de desempate
  // existe, mas ninguém deveria depender dela sem saber.
  const ties = useMemo(() => {
    const found: [PostalAssignment, PostalAssignment][] = []
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i]
        const b = active[j]
        const sameWidth = a.zip_end - a.zip_start === b.zip_end - b.zip_start
        if (rangesOverlap({ start: a.zip_start, end: a.zip_end }, { start: b.zip_start, end: b.zip_end }) && sameWidth && a.priority === b.priority) found.push([a, b])
      }
    }
    return found
  }, [active])
  const regionName = (id: string) => regions.data?.find((region) => region.id === id)?.name ?? '?'

  if (regions.isLoading || ranges.isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />
  if (regions.isError) return <Alert tone="danger" title="Não foi possível carregar a cobertura">{(regions.error as Error).message}</Alert>

  return (
    <div className="space-y-4">
      <ZipTester />
      {ties.length > 0 && (
        <Alert tone="warning" title="Faixas em empate">
          {ties.map(([a, b]) => (
            <span key={`${a.id}-${b.id}`} className="block">
              {describeZipRange(a.zip_start, a.zip_end)} ({regionName(a.region_id)}) e {describeZipRange(b.zip_start, b.zip_end)} ({regionName(b.region_id)})
              cobrem os mesmos CEPs com a mesma prioridade. Aumente a prioridade de uma delas.
            </span>
          ))}
        </Alert>
      )}
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-600">
          Para cada CEP vale a faixa mais específica; no empate, a de maior prioridade. A faixa pode ter um responsável diferente do da região.
        </p>
        {canOperate && <Button onClick={() => setEditing('new')} icon={<Plus className="h-4 w-4" />}>Nova região</Button>}
      </div>

      {(regions.data ?? []).length === 0 ? (
        <Card><EmptyState icon={<MapPinned className="h-6 w-6" />} title="Nenhuma região cadastrada"
          description="Crie uma região, defina o responsável e cadastre as faixas de CEP que ela atende." /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(regions.data ?? []).map((region) => (
            <RegionCard key={region.id} region={region} ranges={(ranges.data ?? []).filter((range) => range.region_id === region.id)}
              others={active.filter((range) => range.region_id !== region.id)} regionName={regionName}
              couriers={couriers} courierName={courierName} canOperate={canOperate} onEdit={() => setEditing(region)} onChanged={reload} />
          ))}
        </div>
      )}
      {editing && <RegionModal region={editing === 'new' ? null : editing} couriers={couriers} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />}
    </div>
  )
}

function RegionCard({ region, ranges, others, regionName, couriers, courierName, canOperate, onEdit, onChanged }: {
  region: PostalRegion; ranges: PostalAssignment[]; others: PostalAssignment[]; regionName: (id: string) => string
  couriers: Courier[]; courierName: (id: string | null) => string | null; canOperate: boolean; onEdit: () => void; onChanged: () => void
}) {
  const [text, setText] = useState('')
  const [priority, setPriority] = useState('0')
  const [override, setOverride] = useState('')
  const parsed = parseZipRange(text)
  const add = useApiMutation({
    mutationFn: () => api.saveAssignment({
      region_id: region.id, courier_id: override || null, zip_start: parsed!.start, zip_end: parsed!.end,
      priority: Number(priority) || 0, is_active: true, notes: null,
    }),
    successMessage: 'Faixa cadastrada.',
    onSuccess: () => { setText(''); setPriority('0'); setOverride(''); onChanged() },
  })
  const toggle = useApiMutation({
    mutationFn: (range: PostalAssignment) => api.saveAssignment({
      id: range.id, region_id: range.region_id, courier_id: range.courier_id, zip_start: range.zip_start, zip_end: range.zip_end,
      priority: range.priority, is_active: !range.is_active, notes: range.notes,
    }),
    onSuccess: onChanged,
  })
  const remove = useApiMutation({ mutationFn: (id: string) => api.deleteAssignment(id), successMessage: 'Faixa removida.', onSuccess: onChanged })
  const submit = (event: FormEvent) => { event.preventDefault(); if (parsed) add.mutate() }
  const owner = courierName(region.courier_id)
  // faixas de outras regiões que atendem parte dos mesmos CEPs (a mais específica vence)
  const inside = parsed ? others.filter((other) => rangesOverlap(parsed, { start: other.zip_start, end: other.zip_end })) : []

  return (
    <Card>
      <CardHeader
        title={<span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: region.color }} />{region.name}{!region.is_active && <Badge>Desativada</Badge>}</span>}
        description={owner ? `Responsável: ${owner}` : 'Sem responsável definido: os pacotes desta região viram exceção.'}
        action={canOperate ? <Button size="sm" variant="secondary" onClick={onEdit}>Editar</Button> : undefined}
      />
      <ul className="divide-y divide-ink-100">
        {ranges.length === 0 && <li className="px-4 py-3 text-[13px] text-ink-500 sm:px-5">Nenhuma faixa cadastrada.</li>}
        {ranges.map((range) => (
          <li key={range.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-[13px] sm:px-5">
            <span className={`font-mono font-semibold ${range.is_active ? 'text-ink-900' : 'text-ink-400 line-through'}`}>{describeZipRange(range.zip_start, range.zip_end)}</span>
            {range.priority !== 0 && <Badge tone="info">prioridade {range.priority}</Badge>}
            {range.courier_id && <Badge tone="brand">{courierName(range.courier_id) ?? 'responsável próprio'}</Badge>}
            {canOperate && (
              <span className="ml-auto flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => toggle.mutate(range)}>{range.is_active ? 'Desativar' : 'Ativar'}</Button>
                <button type="button" aria-label="Remover faixa" className="rounded-lg p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600"
                  onClick={() => { if (window.confirm(`Remover a faixa ${describeZipRange(range.zip_start, range.zip_end)}?`)) remove.mutate(range.id) }}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {canOperate && (
        <form onSubmit={submit} className="space-y-2 border-t border-ink-100 p-4 sm:px-5">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Nova faixa" className="min-w-[180px] flex-1"
              error={text.trim() && !parsed ? 'Use um CEP, um prefixo (027) ou uma faixa (02700-000 a 02799-999)' : undefined}>
              <Input value={text} onChange={(event) => setText(event.target.value)} placeholder="027 ou 02700-000 a 02799-999" invalid={!!text.trim() && !parsed} />
            </Field>
            <Field label="Prioridade" className="w-24"><Input value={priority} onChange={(event) => setPriority(event.target.value)} inputMode="numeric" /></Field>
            <Field label="Responsável da faixa" className="w-52">
              <Select value={override} onChange={(event) => setOverride(event.target.value)}>
                <option value="">O da região</option>
                {couriers.filter((courier) => courier.status === 'ACTIVE').map((courier) => <option key={courier.id} value={courier.id}>{courier.full_name}</option>)}
              </Select>
            </Field>
            <Button type="submit" disabled={!parsed} loading={add.isPending}>Adicionar</Button>
          </div>
          {parsed && (
            <p className="text-[12px] text-ink-500">
              Cobre de {formatZip(String(parsed.start).padStart(8, '0'))} a {formatZip(String(parsed.end).padStart(8, '0'))}.
              {inside.map((other) => (
                <span key={other.id} className="block text-amber-800">
                  {rangeContains(parsed, { start: other.zip_start, end: other.zip_end })
                    ? `Dentro dela, ${describeZipRange(other.zip_start, other.zip_end)} continua com ${regionName(other.region_id)} (faixa mais específica).`
                    : `Sobrepõe ${describeZipRange(other.zip_start, other.zip_end)} de ${regionName(other.region_id)}: nos CEPs em comum vale a faixa mais específica.`}
                </span>
              ))}
            </p>
          )}
        </form>
      )}
    </Card>
  )
}

function RegionModal({ region, couriers, onClose, onSaved }: { region: PostalRegion | null; couriers: Courier[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(region?.name ?? '')
  const [courierId, setCourierId] = useState(region?.courier_id ?? '')
  const [color, setColor] = useState(region?.color ?? COLORS[0])
  const [active, setActive] = useState(region?.is_active ?? true)
  const save = useApiMutation({
    mutationFn: () => api.saveRegion({
      id: region?.id, name: name.trim(), description: region?.description ?? null, color, courier_id: courierId || null, is_active: active,
    }),
    successMessage: 'Região salva.', onSuccess: onSaved,
  })
  const remove = useApiMutation({ mutationFn: () => api.deleteRegion(region!.id), successMessage: 'Região removida.', onSuccess: onSaved })
  return (
    <Modal open onClose={onClose} title={region ? 'Editar região' : 'Nova região'}
      footer={(
        <>
          {region && (
            <Button variant="ghost" className="mr-auto" loading={remove.isPending} onClick={() => {
              if (window.confirm(`Remover a região ${region.name} e todas as faixas dela? Pacotes já distribuídos não mudam.`)) remove.mutate()
            }}>Remover região</Button>
          )}
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={name.trim().length < 2} loading={save.isPending} onClick={() => save.mutate()}>Salvar</Button>
        </>
      )}>
      <div className="space-y-3">
        <Field label="Nome" required><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Freguesia do Ó" /></Field>
        <Field label="Responsável" hint="Recebe os pacotes das faixas desta região">
          <Select value={courierId} onChange={(event) => setCourierId(event.target.value)}>
            <option value="">Sem responsável</option>
            {couriers.filter((courier) => courier.status === 'ACTIVE' || courier.id === region?.courier_id)
              .map((courier) => <option key={courier.id} value={courier.id}>{courier.full_name}{courier.status !== 'ACTIVE' ? ' (inativo)' : ''}</option>)}
          </Select>
        </Field>
        <Field label="Cor">
          <div className="flex gap-2">
            {COLORS.map((item) => (
              <button key={item} type="button" aria-label={`Cor ${item}`} onClick={() => setColor(item)}
                className={`h-7 w-7 rounded-full ring-offset-2 ${color === item ? 'ring-2 ring-ink-900' : ''}`} style={{ background: item }} />
            ))}
          </div>
        </Field>
        <Switch checked={active} onChange={setActive} label="Região ativa" description="Desativada, as faixas dela deixam de valer na distribuição." />
      </div>
    </Modal>
  )
}

function ZipTester() {
  const [zip, setZip] = useState('')
  const [result, setResult] = useState<PostalMatch | null>(null)
  const test = useApiMutation({ mutationFn: () => api.resolvePostalCode(zip), onSuccess: setResult })
  const submit = (event: FormEvent) => { event.preventDefault(); if (zip.trim()) test.mutate() }
  return (
    <Card className="p-4 sm:p-5">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <Field label="Testar um CEP" className="w-48"><Input value={zip} onChange={(event) => { setZip(event.target.value); setResult(null) }} placeholder="00000-000" inputMode="numeric" /></Field>
        <Button type="submit" variant="secondary" loading={test.isPending} disabled={!zip.trim()} icon={<Search className="h-4 w-4" />}>Quem atende?</Button>
        {result && (
          <p className="pb-2 text-sm">
            {!result.valid ? <span className="text-red-700">CEP inválido: precisa ter 8 dígitos.</span>
              : !result.matched ? <span className="text-amber-800">Nenhuma faixa cobre este CEP. O pacote viraria exceção.</span>
                : (
                  <span className="text-ink-800">
                    <strong>{result.courier_name ?? 'Sem responsável'}</strong> · região {result.region_name} · faixa{' '}
                    {describeZipRange(result.zip_start ?? 0, result.zip_end ?? 0)}
                    {result.courier_status && result.courier_status !== 'ACTIVE' ? ' · responsável inativo' : ''}
                  </span>
                )}
          </p>
        )}
      </form>
    </Card>
  )
}

/* ------------------------------------------------------------------ limites e parâmetros */

function Parameters({ couriers, canOperate, canConfigure }: { couriers: Courier[]; canOperate: boolean; canConfigure: boolean }) {
  const client = useQueryClient()
  const settings = useQuery({ queryKey: ['logistics', 'settings'], queryFn: api.getDistributionSettings })
  const [form, setForm] = useState<DistributionSettings>(DEFAULT_DISTRIBUTION_SETTINGS)
  const [hub, setHub] = useState({ latitude: '', longitude: '' })
  const [vehicle, setVehicle] = useState('')
  useEffect(() => {
    if (!settings.data) return
    setForm(settings.data)
    setHub({ latitude: settings.data.hub ? String(settings.data.hub.latitude) : '', longitude: settings.data.hub ? String(settings.data.hub.longitude) : '' })
    setVehicle(settings.data.vehicle_limits.MOTORCYCLE ? String(settings.data.vehicle_limits.MOTORCYCLE) : '')
  }, [settings.data])

  const latitude = Number(hub.latitude.replace(',', '.'))
  const longitude = Number(hub.longitude.replace(',', '.'))
  const hubFilled = hub.latitude.trim() !== '' || hub.longitude.trim() !== ''
  const hubValid = !hubFilled || (Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    && hub.latitude.trim() !== '' && hub.longitude.trim() !== '')
  const positive = (value: number) => Number.isFinite(value) && value > 0
  const valid = positive(form.default_daily_package_limit) && positive(form.stops_per_route) && positive(form.packages_per_route)
    && positive(form.service_minutes_per_stop) && (form.max_leg_km === null || positive(form.max_leg_km)) && hubValid
    && (vehicle.trim() === '' || positive(Number(vehicle)))

  const save = useApiMutation({
    mutationFn: () => {
      const vehicleLimits = { ...form.vehicle_limits }
      if (vehicle.trim() === '') delete vehicleLimits.MOTORCYCLE; else vehicleLimits.MOTORCYCLE = Math.round(Number(vehicle))
      return api.saveDistributionSettings({
        ...form,
        default_daily_package_limit: Math.round(form.default_daily_package_limit),
        stops_per_route: Math.round(form.stops_per_route), packages_per_route: Math.round(form.packages_per_route),
        vehicle_limits: vehicleLimits, hub: hubFilled ? { ...(form.hub ?? {}), latitude, longitude } : null,
      })
    },
    successMessage: 'Parâmetros salvos. Valem para as próximas distribuições e roteiros.',
    onSuccess: () => void client.invalidateQueries({ queryKey: ['logistics', 'settings'] }),
  })
  const number = (key: 'default_daily_package_limit' | 'stops_per_route' | 'packages_per_route' | 'service_minutes_per_stop') => ({
    value: Number.isFinite(form[key]) ? String(form[key]) : '', inputMode: 'numeric' as const, disabled: !canConfigure,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value === '' ? Number.NaN : Number(event.target.value) }),
  })

  if (settings.isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader title="Parâmetros da operação" description="São padrões, não travas: o limite de 49 pacotes, por exemplo, pode ser alterado aqui, por lote ou por funcionário." />
        <div className="space-y-4 p-4 sm:p-5">
          {!canConfigure && <Alert tone="info">Somente administradores alteram estes parâmetros.</Alert>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Limite diário de pacotes por funcionário" hint="Usado quando não há limite do funcionário, do veículo ou do lote"><Input {...number('default_daily_package_limit')} /></Field>
            <Field label="Limite para motocicleta" hint="Em branco, vale o limite geral">
              <Input value={vehicle} onChange={(event) => setVehicle(event.target.value)} inputMode="numeric" placeholder="Sem limite próprio" disabled={!canConfigure} />
            </Field>
            <Field label="Paradas por roteiro"><Input {...number('stops_per_route')} /></Field>
            <Field label="Pacotes por roteiro" hint="Um endereço nunca é dividido"><Input {...number('packages_per_route')} /></Field>
            <Field label="Trecho máximo entre paradas (km)" hint="Acima disso abre um roteiro novo. Em branco, sem limite">
              <Input value={form.max_leg_km === null ? '' : String(form.max_leg_km)} inputMode="decimal" disabled={!canConfigure}
                onChange={(event) => setForm({ ...form, max_leg_km: event.target.value.trim() === '' ? null : Number(event.target.value.replace(',', '.')) })} />
            </Field>
            <Field label="Minutos por parada" hint="Para estimar a duração do roteiro"><Input {...number('service_minutes_per_stop')} /></Field>
            <Field label="Central · latitude" hint="Ponto de partida dos roteiros (opcional)" error={!hubValid ? 'Informe latitude e longitude válidas' : undefined}>
              <Input value={hub.latitude} onChange={(event) => setHub({ ...hub, latitude: event.target.value })} inputMode="decimal" placeholder="-23.5505" disabled={!canConfigure} invalid={!hubValid} />
            </Field>
            <Field label="Central · longitude">
              <Input value={hub.longitude} onChange={(event) => setHub({ ...hub, longitude: event.target.value })} inputMode="decimal" placeholder="-46.6333" disabled={!canConfigure} invalid={!hubValid} />
            </Field>
          </div>
          {canConfigure
            ? <Switch checked={form.require_loading_scan} onChange={(value) => setForm({ ...form, require_loading_scan: value })}
                label="Exigir conferência de saída" description="O aplicativo só permite entregar pacotes lidos na saída. Entregas sem conferência aparecem no painel." />
            : <p className="text-sm text-ink-600">Conferência de saída: {form.require_loading_scan ? 'obrigatória' : 'opcional'}.</p>}
          {canConfigure && <Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate()}>Salvar parâmetros</Button>}
        </div>
      </Card>
      <CourierLimits couriers={couriers} canOperate={canOperate} fallback={settings.data?.default_daily_package_limit ?? 49} />
    </div>
  )
}

function CourierLimits({ couriers, canOperate, fallback }: { couriers: Courier[]; canOperate: boolean; fallback: number }) {
  const client = useQueryClient()
  const [values, setValues] = useState<Record<string, string>>({})
  const limits = couriers as (Courier & { daily_package_limit?: number | null })[]
  const save = useApiMutation({
    mutationFn: (input: { id: string; limit: number | null }) => api.setCourierDailyLimit(input.id, input.limit),
    successMessage: 'Limite do funcionário atualizado.',
    onSuccess: (_, input) => { setValues((current) => { const next = { ...current }; delete next[input.id]; return next }); void client.invalidateQueries({ queryKey: ['couriers'] }) },
  })
  const active = limits.filter((courier) => courier.status === 'ACTIVE')
  return (
    <Card>
      <CardHeader title="Limite por funcionário" description={`Tem precedência sobre os demais. Em branco, vale o do veículo, do lote ou o geral (${fallback}).`} />
      {active.length === 0 ? <EmptyState title="Nenhum funcionário ativo" /> : (
        <ul className="divide-y divide-ink-100">
          {active.map((courier) => {
            const stored = courier.daily_package_limit == null ? '' : String(courier.daily_package_limit)
            const value = values[courier.id] ?? stored
            const parsed = value.trim() === '' ? null : Number(value)
            const invalid = parsed !== null && (!Number.isInteger(parsed) || parsed <= 0)
            return (
              <li key={courier.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px] sm:px-5">
                <span className="min-w-0 flex-1 truncate font-medium text-ink-900">{courier.full_name}</span>
                <Input className="w-28" value={value} inputMode="numeric" placeholder={String(fallback)} disabled={!canOperate} invalid={invalid}
                  aria-label={`Limite diário de ${courier.full_name}`}
                  onChange={(event) => setValues({ ...values, [courier.id]: event.target.value })} />
                {canOperate && (
                  <Button size="sm" variant="secondary" disabled={invalid || value === stored} loading={save.isPending && save.variables?.id === courier.id}
                    onClick={() => save.mutate({ id: courier.id, limit: parsed })}>Salvar</Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
