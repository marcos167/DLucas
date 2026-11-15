import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, CheckCircle2, Loader2, MapPin, Search, Thermometer,
} from 'lucide-react'
import {
  Alert, Button, Card, CardHeader, Field, Input, Select, Switch, Textarea, EmptyState,
} from '@/components/ui'
import { createOrder, listContracts, listUnits } from '@/lib/api'
import { orderSchema, fieldErrors } from '@/lib/validation'
import { useAuth } from '@/contexts/AuthContext'
import { distanceKm, maskPhone, brl } from '@/lib/utils'
import { destinationAddressKey, destinationForAddress, geocodeAddress, type GeocodedDestination } from '@/lib/geocode'
import type { Contract, PharmacyUnit } from '@/types'

export default function NewOrder() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const pharmacyId = profile?.pharmacy_id ?? ''

  const units = useQuery({ queryKey: ['units', pharmacyId], queryFn: () => listUnits(pharmacyId), enabled: !!pharmacyId })
  const contracts = useQuery({ queryKey: ['contracts', pharmacyId], queryFn: () => listContracts(pharmacyId), enabled: !!pharmacyId })

  const activeContract: Contract | undefined = useMemo(
    () => (contracts.data ?? []).find((c) => c.status === 'ACTIVE'),
    [contracts.data],
  )

  const [form, setForm] = useState({
    unit_id: '', priority: 'NORMAL',
    pickup_street: '', pickup_number: '', pickup_district: '', pickup_city: '', pickup_state: '',
    pickup_instructions: '',
    recipient_name: '', recipient_phone: '', recipient_document: '',
    delivery_street: '', delivery_number: '', delivery_complement: '', delivery_district: '',
    delivery_city: '', delivery_state: '', delivery_zip_code: '', delivery_instructions: '',
    package_count: '1', package_description: '', scheduled_for: '',
  })
  const [temperature, setTemperature] = useState(false)
  const [requiresProof, setRequiresProof] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState('')
  const [geocodeState, setGeocodeState] = useState<'idle' | 'loading' | 'ok' | 'fail'>('idle')
  const [destination, setDestination] = useState<GeocodedDestination | null>(null)
  const [pickup, setPickup] = useState<GeocodedDestination | null>(null)
  const formRef = useRef(form)
  formRef.current = form
  const locateRequest = useRef(0)

  const selectedUnit: PharmacyUnit | undefined = (units.data ?? []).find((u) => u.id === form.unit_id)
  const validDestination = destinationForAddress(destination, form)
  const destinationChanged = destination != null && validDestination == null
  const pickupKey = [form.unit_id, form.pickup_street, form.pickup_number, form.pickup_district,
    form.pickup_city, form.pickup_state].map((part) => part.trim().toLocaleLowerCase('pt-BR')).join('|')
  const pickupCoords = pickup?.addressKey === pickupKey ? pickup : null

  // Preenche o endereço de coleta a partir da unidade selecionada
  useEffect(() => {
    if (!selectedUnit) return
    setForm((f) => ({
      ...f,
      pickup_street: selectedUnit.street,
      pickup_number: selectedUnit.number ?? '',
      pickup_district: selectedUnit.district ?? '',
      pickup_city: selectedUnit.city,
      pickup_state: selectedUnit.state,
      pickup_instructions: selectedUnit.pickup_instructions ?? f.pickup_instructions,
    }))
  }, [selectedUnit])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const next = { ...formRef.current, [k]: e.target.value }
    formRef.current = next
    setForm(next)
  }

  async function locate() {
    const snapshot = formRef.current
    const request = ++locateRequest.current
    const addressKey = destinationAddressKey(snapshot)
    const currentPickupKey = [snapshot.unit_id, snapshot.pickup_street, snapshot.pickup_number,
      snapshot.pickup_district, snapshot.pickup_city, snapshot.pickup_state]
      .map((part) => part.trim().toLocaleLowerCase('pt-BR')).join('|')
    setGeocodeState('loading')
    const pickupQuery = [
      snapshot.pickup_street, snapshot.pickup_number, snapshot.pickup_district,
      snapshot.pickup_city, snapshot.pickup_state, 'Brasil',
    ].filter(Boolean).join(', ')
    const deliveryQuery = [
      snapshot.delivery_street, snapshot.delivery_number, snapshot.delivery_district,
      snapshot.delivery_city, snapshot.delivery_state, 'Brasil',
    ].filter(Boolean).join(', ')

    const [p, d] = await Promise.all([
      selectedUnit?.latitude != null && selectedUnit.longitude != null ? Promise.resolve(null) : geocodeAddress(pickupQuery),
      geocodeAddress(deliveryQuery),
    ])
    // Edits or a newer lookup invalidate the entire old response.
    const latest = formRef.current
    const latestPickupKey = [latest.unit_id, latest.pickup_street, latest.pickup_number,
      latest.pickup_district, latest.pickup_city, latest.pickup_state]
      .map((part) => part.trim().toLocaleLowerCase('pt-BR')).join('|')
    if (request !== locateRequest.current || addressKey !== destinationAddressKey(latest) || currentPickupKey !== latestPickupKey) {
      if (request === locateRequest.current) setGeocodeState('idle')
      return
    }
    setPickup(p ? { lat: p.lat, lng: p.lng, addressKey: currentPickupKey } : null)
    setDestination(d ? { lat: d.lat, lng: d.lng, addressKey } : null)
    setGeocodeState(d || p ? 'ok' : 'fail')
  }

  // A origem de cobrança é sempre a coordenada cadastrada da unidade, não
  // uma coordenada de coleta informada pelo navegador. O banco arredonda km
  // a duas casas antes de calcular o adicional do contrato.
  const estimatedKm = selectedUnit?.latitude != null && selectedUnit?.longitude != null && validDestination
    ? Number(distanceKm(
        { lat: selectedUnit.latitude, lng: selectedUnit.longitude }, validDestination,
      ).toFixed(2))
    : null

  const price = useMemo(() => {
    if (!activeContract) return { total: 0, breakdown: [] as string[] }
    let total = activeContract.base_price_cents
    const breakdown = [`Base ${brl(activeContract.base_price_cents)}`]
    if (estimatedKm != null && estimatedKm > Number(activeContract.included_km)) {
      const extra = estimatedKm - Number(activeContract.included_km)
      const extraCents = Math.round(extra * activeContract.price_per_extra_km_cents)
      total += extraCents
      breakdown.push(`+${extra.toFixed(1)} km excedentes ${brl(extraCents)}`)
    }
    if (form.priority === 'URGENT' && activeContract.urgency_fee_cents) {
      total += activeContract.urgency_fee_cents
      breakdown.push(`Urgência ${brl(activeContract.urgency_fee_cents)}`)
    }
    if (form.priority === 'HIGH' && activeContract.urgency_fee_cents) {
      const half = Math.round(activeContract.urgency_fee_cents / 2)
      total += half
      breakdown.push(`Prioridade alta ${brl(half)}`)
    }
    if (temperature && activeContract.temperature_fee_cents) {
      total += activeContract.temperature_fee_cents
      breakdown.push(`Refrigerado ${brl(activeContract.temperature_fee_cents)}`)
    }
    return { total, breakdown }
  }, [activeContract, estimatedKm, form.priority, temperature])

  const create = useMutation({
    mutationFn: async () => {
      const parsed = orderSchema.safeParse({
        ...form,
        package_count: form.package_count,
        is_temperature_controlled: temperature,
        requires_proof: requiresProof,
        pickup_state: form.pickup_state.toUpperCase(),
        delivery_state: form.delivery_state.toUpperCase(),
      })
      if (!parsed.success) { setErrors(fieldErrors(parsed.error)); throw new Error('invalid') }
      setErrors({})
      const d = parsed.data
      const created = await createOrder({
        pharmacy_id: pharmacyId,
        unit_id: d.unit_id,
        priority: d.priority,
        status: 'PENDING',
        created_by: profile?.id,
        pickup_street: d.pickup_street,
        pickup_number: d.pickup_number || null,
        pickup_district: d.pickup_district || null,
        pickup_city: d.pickup_city,
        pickup_state: d.pickup_state.toUpperCase(),
        pickup_instructions: d.pickup_instructions || null,
        pickup_latitude: selectedUnit?.latitude ?? pickupCoords?.lat ?? null,
        pickup_longitude: selectedUnit?.longitude ?? pickupCoords?.lng ?? null,
        recipient_name: d.recipient_name,
        recipient_phone: d.recipient_phone,
        recipient_document: d.recipient_document || null,
        delivery_street: d.delivery_street,
        delivery_number: d.delivery_number || null,
        delivery_complement: d.delivery_complement || null,
        delivery_district: d.delivery_district || null,
        delivery_city: d.delivery_city,
        delivery_state: d.delivery_state.toUpperCase(),
        delivery_zip_code: d.delivery_zip_code || null,
        delivery_instructions: d.delivery_instructions || null,
        delivery_latitude: validDestination?.lat ?? null,
        delivery_longitude: validDestination?.lng ?? null,
        package_count: d.package_count,
        package_description: d.package_description || null,
        is_temperature_controlled: temperature,
        requires_proof: requiresProof,
        scheduled_for: d.scheduled_for ? new Date(d.scheduled_for).toISOString() : null,
        quoted_price_cents: price.total,
        courier_payout_cents: activeContract?.courier_payout_cents ?? 0,
        contract_id: activeContract?.id ?? null,
        estimated_distance_km: estimatedKm != null ? Number(estimatedKm.toFixed(2)) : null,
      })
      return created
    },
    onSuccess: (order) => {
      void qc.invalidateQueries({ queryKey: ['portal-active'] })
      void qc.invalidateQueries({ queryKey: ['orders-list'] })
      navigate(`/portal/pedidos/${order.id}?created=1`)
    },
    onError: (e) => { if (!(e instanceof Error && e.message === 'invalid')) setServerError((e as Error).message) },
  })

  const activeUnits = (units.data ?? []).filter((u) => u.is_active)

  if (units.isLoading) {
    return <div className="skeleton h-64" />
  }

  if (activeUnits.length === 0) {
    return (
      <EmptyState
        title="Nenhuma unidade ativa"
        description="Para criar pedidos é necessário ter ao menos uma unidade de coleta cadastrada."
        icon={<MapPin className="h-6 w-6" />}
        action={<Link to="/portal/unidades" className="btn-primary">Cadastrar unidade</Link>}
      />
    )
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
      <div className="space-y-4">
        {serverError && <Alert tone="danger" title="Não foi possível criar o pedido">{serverError}</Alert>}
        {errors._form && <Alert tone="danger">{errors._form}</Alert>}
        {!activeContract && (
          <Alert tone="warning" title="Sem contrato ativo">
            Sua farmácia não possui contrato ativo cadastrado. O pedido pode ser criado, mas o valor será
            definido pela central financeira.
          </Alert>
        )}

        <Card>
          <CardHeader title="Origem da coleta" description="Unidade e endereço onde o entregador retira" />
          <div className="space-y-4 p-4">
            <Field label="Unidade" required error={errors.unit_id}>
              <Select value={form.unit_id} onChange={set('unit_id')} invalid={!!errors.unit_id}>
                <option value="">Selecione a unidade…</option>
                {activeUnits.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} — {u.city}/{u.state}</option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-6">
              <Field label="Rua" required error={errors.pickup_street} className="sm:col-span-4">
                <Input value={form.pickup_street} onChange={set('pickup_street')} invalid={!!errors.pickup_street} />
              </Field>
              <Field label="Número" className="sm:col-span-2">
                <Input value={form.pickup_number} onChange={set('pickup_number')} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-4">
              <Field label="Bairro" className="sm:col-span-2"><Input value={form.pickup_district} onChange={set('pickup_district')} /></Field>
              <Field label="Cidade" required error={errors.pickup_city}>
                <Input value={form.pickup_city} onChange={set('pickup_city')} invalid={!!errors.pickup_city} />
              </Field>
              <Field label="UF" required error={errors.pickup_state}>
                <Input value={form.pickup_state} onChange={set('pickup_state')} maxLength={2} className="uppercase" invalid={!!errors.pickup_state} />
              </Field>
            </div>
            <Field label="Instruções de coleta" hint="Ex.: horário de funcionamento, portaria">
              <Textarea rows={2} value={form.pickup_instructions} onChange={set('pickup_instructions')} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Destino e destinatário" description="Para quem a entrega será feita" />
          <div className="space-y-4 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome do destinatário" required error={errors.recipient_name}>
                <Input value={form.recipient_name} onChange={set('recipient_name')} invalid={!!errors.recipient_name} />
              </Field>
              <Field label="Telefone" required error={errors.recipient_phone}>
                <Input value={form.recipient_phone} onChange={(e) => setForm((f) => ({ ...f, recipient_phone: maskPhone(e.target.value) }))} invalid={!!errors.recipient_phone} inputMode="tel" placeholder="(11) 90000-0000" />
              </Field>
              <Field label="Documento (opcional)"><Input value={form.recipient_document} onChange={set('recipient_document')} /></Field>
              <Field label="CEP"><Input value={form.delivery_zip_code} onChange={set('delivery_zip_code')} /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-6">
              <Field label="Rua" required error={errors.delivery_street} className="sm:col-span-4">
                <Input value={form.delivery_street} onChange={set('delivery_street')} invalid={!!errors.delivery_street} />
              </Field>
              <Field label="Número" className="sm:col-span-2"><Input value={form.delivery_number} onChange={set('delivery_number')} /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Complemento"><Input value={form.delivery_complement} onChange={set('delivery_complement')} /></Field>
              <Field label="Bairro"><Input value={form.delivery_district} onChange={set('delivery_district')} /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-4">
              <Field label="Cidade" required error={errors.delivery_city} className="sm:col-span-2">
                <Input value={form.delivery_city} onChange={set('delivery_city')} invalid={!!errors.delivery_city} />
              </Field>
              <Field label="UF" required error={errors.delivery_state}>
                <Input value={form.delivery_state} onChange={set('delivery_state')} maxLength={2} className="uppercase" invalid={!!errors.delivery_state} />
              </Field>
              <div className="flex items-end">
                <Button
                  type="button" variant="secondary" className="w-full"
                  onClick={() => void locate()}
                  loading={geocodeState === 'loading'}
                  icon={<Search className="h-4 w-4" />}
                >
                  Localizar
                </Button>
              </div>
            </div>
            {validDestination && (
              <p className="flex items-center gap-1.5 text-[11.5px] text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> Endereço de destino localizado para o mapa.
              </p>
            )}
            {(destinationChanged || (geocodeState === 'fail' && !validDestination)) && (
              <p className="flex items-center gap-1.5 text-[11.5px] text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" /> Localize novamente o endereço após alterações ou se a consulta falhar.
                O pedido pode ser criado sem coordenadas de destino.
              </p>
            )}
            <Field label="Instruções de entrega">
              <Textarea rows={2} value={form.delivery_instructions} onChange={set('delivery_instructions')} placeholder="Ex.: entregar na portaria, falar com o responsável." />
            </Field>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Carga e prioridade" />
          <div className="space-y-4 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Volumes" required error={errors.package_count}>
                <Input type="number" min={1} value={form.package_count} onChange={set('package_count')} invalid={!!errors.package_count} />
              </Field>
              <Field label="Prioridade">
                <Select value={form.priority} onChange={set('priority')}>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">Alta</option>
                  <option value="URGENT">Urgente</option>
                </Select>
              </Field>
            </div>
            <Field label="Descrição da carga">
              <Input value={form.package_description} onChange={set('package_description')} placeholder="Ex.: fórmula manipulada, 2 potes" />
            </Field>
            <Field label="Agendar para (opcional)">
              <Input type="datetime-local" value={form.scheduled_for} onChange={set('scheduled_for')} />
            </Field>
            <div className="space-y-3 rounded-xl bg-ink-50 p-3">
              <Switch checked={temperature} onChange={setTemperature} label="Item sensível à temperatura"
                description="Sinaliza ao entregador que a carga exige cuidado com refrigeração." />
              <Switch checked={requiresProof} onChange={setRequiresProof} label="Exigir comprovante de entrega"
                description="O entregador deverá anexar uma foto/assinatura ao concluir." />
            </div>
          </div>
        </Card>

        {activeContract && (
          <Card>
            <CardHeader title="Valor estimado" description={`Contrato: ${activeContract.name}`} />
            <div className="space-y-1.5 p-4 text-[13px]">
              {price.breakdown.map((b) => <p key={b} className="text-ink-600">{b}</p>)}
              <div className="mt-2 flex items-center justify-between border-t border-ink-100 pt-2">
                <span className="text-ink-500">Total estimado</span>
                <span className="font-display text-lg font-bold text-ink-950">{brl(price.total)}</span>
              </div>
              {estimatedKm != null && (
                <p className="text-[11px] text-ink-400">Distância estimada: {estimatedKm.toFixed(1)} km (linha reta). Valor conferido ao criar o pedido.</p>
              )}
              {estimatedKm == null && (
                <p className="text-[11px] text-ink-400">
                  Sem coordenadas da unidade e do destino, não é possível estimar o adicional por distância. O valor é conferido ao criar o pedido.
                </p>
              )}
            </div>
          </Card>
        )}

        <Card className="p-4">
          <Button className="w-full" size="lg" loading={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Criar pedido
          </Button>
          <p className="mt-2 text-center text-[11px] text-ink-500">
            O pedido entra na fila de despacho da central D'Luca.
          </p>
          {temperature && (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-cyan-700">
              <Thermometer className="h-3 w-3" /> Marcado como sensível à temperatura
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}
