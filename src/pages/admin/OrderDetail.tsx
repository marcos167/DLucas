import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, Bike, Clock, FileCheck2, History, MapPin, Package, Phone, RefreshCcw,
  Thermometer, User, XCircle, AlertTriangle, Radio,
} from 'lucide-react'
import {
  Alert, Badge, Button, Card, CardHeader, Field, Input, Modal, Select, Skeleton, Textarea, EmptyState,
} from '@/components/ui'
import DeliveryMap from '@/components/dashboard/DeliveryMap'
import {
  assignOrder, createOccurrence, getOrder, getProofUrl, listLocationsForOrder, listProofs,
  listCouriers, logAudit, updateOrder, uploadProof,
} from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import {
  brl, formatDateTime, isLocationFresh, km, relativeTime, ORDER_STATUS_LABEL,
} from '@/lib/utils'
import { OrderStatusBadge, PriorityBadge, RouteBlock, OrderMetaChips, OrderTimeline } from '@/components/dashboard/OrderBits'
import type { OrderStatus } from '@/types'

const NEXT_STEPS: Record<string, { next: OrderStatus; label: string }[]> = {
  PENDING: [{ next: 'CANCELLED', label: 'Cancelar pedido' }],
  OFFERED: [{ next: 'PENDING', label: 'Voltar para fila' }, { next: 'CANCELLED', label: 'Cancelar pedido' }],
  ASSIGNED: [{ next: 'CANCELLED', label: 'Cancelar pedido' }],
  ACCEPTED: [{ next: 'CANCELLED', label: 'Cancelar pedido' }],
  PICKING_UP: [{ next: 'CANCELLED', label: 'Cancelar pedido' }],
  COLLECTED: [],
  IN_TRANSIT: [{ next: 'FAILED', label: 'Registrar falha' }],
}

export default function OrderDetail() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const [assignOpen, setAssignOpen] = useState(false)
  const [occOpen, setOccOpen] = useState(false)
  const [proofOpen, setProofOpen] = useState(false)
  const [courierId, setCourierId] = useState('')
  const [occType, setOccType] = useState('OTHER')
  const [occDesc, setOccDesc] = useState('')
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [proofNote, setProofNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const order = useQuery({ queryKey: ['order', id], queryFn: () => getOrder(id), enabled: !!id })
  const couriers = useQuery({ queryKey: ['couriers'], queryFn: listCouriers })
  const locations = useQuery({
    queryKey: ['order-locations', id],
    queryFn: () => listLocationsForOrder(id),
    enabled: !!id,
    refetchInterval: 20_000,
  })
  const proofs = useQuery({ queryKey: ['order-proofs', id], queryFn: () => listProofs(id), enabled: !!id })

  const setStatus = useMutation({
    mutationFn: async ({ status, reason }: { status: OrderStatus; reason?: string }) => {
      await updateOrder(id, {
        status,
        ...(status === 'CANCELLED' ? { cancelled_at: new Date().toISOString(), cancel_reason: reason ?? 'Cancelado pela central' } : {}),
        ...(status === 'FAILED' ? { cancel_reason: reason ?? 'Falha na entrega' } : {}),
      })
      await logAudit('STATUS', 'order', id, `Alterou status para ${ORDER_STATUS_LABEL[status]}`)
    },
    onSuccess: () => {
      setMessage('Status atualizado.')
      void qc.invalidateQueries({ queryKey: ['order', id] })
      void qc.invalidateQueries({ queryKey: ['orders-list'] })
    },
  })

  const assign = useMutation({
    mutationFn: async () => {
      if (!courierId) throw new Error('Selecione o entregador')
      await assignOrder({ orderId: id, courierId, method: 'REASSIGNMENT', reason: 'Atribuição pelo detalhe do pedido' })
      await logAudit('ASSIGN', 'order', id, 'Atribuiu entregador manualmente')
    },
    onSuccess: () => {
      setAssignOpen(false); setMessage('Entregador atribuído.')
      void qc.invalidateQueries({ queryKey: ['order', id] })
    },
  })

  async function submitOccurrence() {
    if (!occDesc.trim()) return
    setBusy(true)
    try {
      await createOccurrence({
        order_id: id,
        pharmacy_id: order.data?.pharmacy_id,
        courier_id: order.data?.courier_id,
        type: occType,
        description: occDesc,
      })
      await logAudit('OCCURRENCE', 'order', id, 'Registrou ocorrência')
      setOccOpen(false); setOccDesc(''); setMessage('Ocorrência registrada.')
    } finally { setBusy(false) }
  }

  async function submitProof() {
    if (!proofFile || !profile) return
    setBusy(true)
    try {
      await uploadProof({ orderId: id, file: proofFile, notes: proofNote, uploadedBy: profile.id })
      setProofOpen(false); setProofFile(null); setProofNote(''); setMessage('Comprovante enviado.')
      void qc.invalidateQueries({ queryKey: ['order-proofs', id] })
    } finally { setBusy(false) }
  }

  if (order.isLoading) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
  }
  if (!order.data) {
    return <EmptyState title="Pedido não encontrado" description="Ele pode ter sido removido ou você não tem acesso."
      action={<Link to="/app/pedidos" className="btn-secondary">Voltar aos pedidos</Link>} />
  }

  const o = order.data
  const courier = o.courier
  const lastLoc = locations.data?.[0]
  const pickups = o.pickup_latitude != null && o.pickup_longitude != null
    ? [{ lat: o.pickup_latitude, lng: o.pickup_longitude, label: o.unit?.name ?? 'Coleta' }] : []
  const deliveries = o.delivery_latitude != null && o.delivery_longitude != null
    ? [{ lat: o.delivery_latitude, lng: o.delivery_longitude, label: o.recipient_name }] : []
  const livePoints = lastLoc
    ? [{ id: o.courier_id ?? 'x', full_name: courier?.full_name ?? 'Entregador', latitude: lastLoc.latitude, longitude: lastLoc.longitude, recordedAt: lastLoc.recorded_at }]
    : []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/app/pedidos" className="btn-ghost btn-sm"><ArrowLeft className="h-3.5 w-3.5" /> Pedidos</Link>
        <span className="text-ink-300">/</span>
        <span className="font-mono text-sm font-semibold text-ink-900">{o.code}</span>
        <OrderStatusBadge status={o.status} />
        <PriorityBadge priority={o.priority} />
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setOccOpen(true)} icon={<AlertTriangle className="h-3.5 w-3.5" />}>Ocorrência</Button>
          <Button variant="secondary" size="sm" onClick={() => setProofOpen(true)} icon={<FileCheck2 className="h-3.5 w-3.5" />}>Comprovante</Button>
          <Button size="sm" onClick={() => setAssignOpen(true)} icon={<Bike className="h-3.5 w-3.5" />}>
            {o.courier_id ? 'Reatribuir' : 'Atribuir entregador'}
          </Button>
        </div>
      </div>

      {message && <Alert tone="success">{message}</Alert>}

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Rota da entrega" description={`Criado em ${formatDateTime(o.created_at)}`} />
            <div className="p-4">
              <RouteBlock order={o} />
              <div className="mt-4"><OrderMetaChips order={o} /></div>
              <div className="mt-4 grid gap-3 border-t border-ink-100 pt-4 sm:grid-cols-2">
                <div>
                  <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-400">Destinatário</p>
                  <p className="text-sm font-medium">{o.recipient_name}</p>
                  <p className="text-[12.5px] text-ink-600">{o.recipient_phone}</p>
                  {o.recipient_document && <p className="text-[12px] text-ink-500">Doc: {o.recipient_document}</p>}
                </div>
                <div>
                  <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-400">Farmácia</p>
                  <p className="text-sm font-medium">{o.pharmacy?.trade_name}</p>
                  <p className="text-[12.5px] text-ink-600">{o.unit?.name}</p>
                </div>
              </div>
              {(o.pickup_instructions || o.delivery_instructions) && (
                <div className="mt-3 space-y-2">
                  {o.pickup_instructions && (
                    <p className="rounded-lg bg-brand-50 px-3 py-2 text-[12px] text-brand-900">
                      <strong>Instruções de coleta:</strong> {o.pickup_instructions}
                    </p>
                  )}
                  {o.delivery_instructions && (
                    <p className="rounded-lg bg-ink-50 px-3 py-2 text-[12px] text-ink-700">
                      <strong>Instruções de entrega:</strong> {o.delivery_instructions}
                    </p>
                  )}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Rastreamento"
              description="Posições autorizadas pelo entregador"
              action={lastLoc && (
                <Badge className={isLocationFresh(lastLoc.recorded_at) ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}>
                  <Radio className="h-3 w-3" /> {isLocationFresh(lastLoc.recorded_at) ? 'Ao vivo' : 'Desatualizado'}
                </Badge>
              )}
            />
            <div className="p-3">
              {pickups.length === 0 && deliveries.length === 0 && livePoints.length === 0 ? (
                <EmptyState title="Sem coordenadas" description="Este pedido não possui endereços georreferenciados e o entregador não compartilhou posição." icon={<MapPin className="h-6 w-6" />} />
              ) : (
                <DeliveryMap height={320} pickups={pickups} deliveries={deliveries} couriers={livePoints} showPing />
              )}
            </div>
            {lastLoc && (
              <p className="border-t border-ink-100 px-4 py-2.5 text-[11.5px] text-ink-600">
                <Clock className="mr-1 inline h-3 w-3" />
                Última posição registrada {relativeTime(lastLoc.recorded_at)} ({formatDateTime(lastLoc.recorded_at)})
                {lastLoc.accuracy_m != null && ` · precisão ~${Math.round(lastLoc.accuracy_m)} m`}
                {!isLocationFresh(lastLoc.recorded_at) && ' · exibida como última posição conhecida'}
              </p>
            )}
            {!lastLoc && (
              <p className="border-t border-ink-100 px-4 py-2.5 text-[11.5px] text-ink-500">
                Nenhuma posição registrada. O entregador precisa autorizar o compartilhamento de localização.
              </p>
            )}
          </Card>

          <Card>
            <CardHeader title="Comprovantes" description="Documentos enviados na coleta/entrega" />
            {proofs.isLoading ? <Skeleton className="m-4 h-20" /> : (proofs.data ?? []).length === 0 ? (
              <EmptyState title="Nenhum comprovante" description="O entregador envia o comprovante ao concluir a entrega." icon={<FileCheck2 className="h-6 w-6" />} />
            ) : (
              <ul className="divide-y divide-ink-100">
                {(proofs.data ?? []).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-[13px] font-medium text-ink-900">{p.file_name ?? p.storage_path}</p>
                      <p className="text-[11px] text-ink-500">{p.kind} · {formatDateTime(p.created_at)}· {p.notes ?? ''}</p>
                    </div>
                    <Button
                      variant="secondary" size="sm"
                      onClick={async () => {
                        const url = await getProofUrl(p.storage_path)
                        if (url) window.open(url, '_blank', 'noreferrer')
                      }}
                    >
                      Abrir
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Entregador" description="Responsável pela execução" />
            <div className="p-4">
              {courier ? (
                <>
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-800 text-xs font-bold text-white">
                      {courier.full_name.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-ink-900">{courier.full_name}</p>
                      <p className="text-[12px] text-ink-500"><Phone className="mr-1 inline h-3 w-3" />{courier.phone}</p>
                    </div>
                  </div>
                  <dl className="mt-3 space-y-1.5 border-t border-ink-100 pt-3 text-[12px]">
                    <div className="flex justify-between"><dt className="text-ink-500">Atribuído em</dt><dd>{formatDateTime(o.assigned_at)}</dd></div>
                    <div className="flex justify-between"><dt className="text-ink-500">Aceite</dt><dd>{formatDateTime(o.accepted_at)}</dd></div>
                    <div className="flex justify-between"><dt className="text-ink-500">Coleta</dt><dd>{formatDateTime(o.collected_at)}</dd></div>
                    <div className="flex justify-between"><dt className="text-ink-500">Entrega</dt><dd>{formatDateTime(o.delivered_at)}</dd></div>
                    <div className="flex justify-between"><dt className="text-ink-500">Repasse</dt><dd>{brl(o.courier_payout_cents)}</dd></div>
                  </dl>
                </>
              ) : (
                <p className="text-sm text-ink-500">Nenhum entregador atribuído.</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Valores" description="Snapshot do contrato" />
            <div className="space-y-1.5 p-4 text-[13px]">
              <div className="flex justify-between"><span className="text-ink-500">Valor cobrado</span><span className="font-semibold">{brl(o.quoted_price_cents)}</span></div>
              <div className="flex justify-between"><span className="text-ink-500">Repasse entregador</span><span>{brl(o.courier_payout_cents)}</span></div>
              <div className="flex justify-between border-t border-ink-100 pt-1.5"><span className="text-ink-500">Margem bruta</span><span className="font-semibold text-brand-800">{brl(o.quoted_price_cents - o.courier_payout_cents)}</span></div>
            </div>
          </Card>

          {Object.keys(NEXT_STEPS).includes(o.status) && (NEXT_STEPS[o.status] ?? []).length > 0 && (
            <Card>
              <CardHeader title="Ações de status" description="Atualizações da central" />
              <div className="flex flex-wrap gap-2 p-4">
                {(NEXT_STEPS[o.status] ?? []).map((s) => (
                  <Button
                    key={s.next}
                    variant={s.next === 'CANCELLED' || s.next === 'FAILED' ? 'danger' : 'secondary'}
                    size="sm"
                    onClick={() => setStatus.mutate({ status: s.next })}
                    loading={setStatus.isPending}
                    icon={s.next === 'CANCELLED' ? <XCircle className="h-3.5 w-3.5" /> : <RefreshCcw className="h-3.5 w-3.5" />}
                  >
                    {s.label}
                  </Button>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Histórico do pedido" description="Timeline e alterações" action={<History className="h-4 w-4 text-ink-400" />} />
            <div className="max-h-[420px] overflow-y-auto">
              <OrderTimeline events={o.events ?? []} />
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-2 text-[12px]">
            <div className="card p-3"><p className="text-ink-500">Criado</p><p className="font-medium">{relativeTime(o.created_at)}</p></div>
            <div className="card p-3"><p className="text-ink-500">Atualizado</p><p className="font-medium">{relativeTime(o.updated_at)}</p></div>
          </div>
        </div>
      </div>

      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title="Atribuir entregador" size="md"
        footer={<>
          <Button variant="secondary" onClick={() => setAssignOpen(false)}>Cancelar</Button>
          <Button onClick={() => assign.mutate()} loading={assign.isPending}>Confirmar atribuição</Button>
        </>}>
        <Field label="Entregador" required hint="A atribuição direta não exige aceite — use com critério.">
          <Select value={courierId} onChange={(e) => setCourierId(e.target.value)}>
            <option value="">Selecione…</option>
            {(couriers.data ?? []).filter((c) => c.status === 'ACTIVE').map((c) => (
              <option key={c.id} value={c.id}>{c.full_name} — {c.availability === 'AVAILABLE' ? 'disponível' : c.availability === 'ON_DELIVERY' ? 'em entrega' : 'offline'}</option>
            ))}
          </Select>
        </Field>
        <p className="mt-3 text-[12px] text-ink-500">
          <User className="mr-1 inline h-3 w-3" /> A alteração fica registrada no histórico de atribuições.
        </p>
      </Modal>

      <Modal open={occOpen} onClose={() => setOccOpen(false)} title="Registrar ocorrência" size="md"
        footer={<>
          <Button variant="secondary" onClick={() => setOccOpen(false)}>Cancelar</Button>
          <Button onClick={submitOccurrence} loading={busy} disabled={!occDesc.trim()}>Registrar</Button>
        </>}>
        <div className="space-y-4">
          <Field label="Tipo">
            <Select value={occType} onChange={(e) => setOccType(e.target.value)}>
              <option value="RECIPIENT_ABSENT">Destinatário ausente</option>
              <option value="WRONG_ADDRESS">Endereço incorreto</option>
              <option value="DAMAGED_PACKAGE">Embalagem danificada</option>
              <option value="REFUSED">Recusado</option>
              <option value="DELAY">Atraso</option>
              <option value="ACCIDENT">Acidente</option>
              <option value="OTHER">Outro</option>
            </Select>
          </Field>
          <Field label="Descrição" required>
            <Textarea rows={4} value={occDesc} onChange={(e) => setOccDesc(e.target.value)} placeholder="Descreva o que aconteceu…" />
          </Field>
        </div>
      </Modal>

      <Modal open={proofOpen} onClose={() => setProofOpen(false)} title="Enviar comprovante" size="md"
        footer={<>
          <Button variant="secondary" onClick={() => setProofOpen(false)}>Cancelar</Button>
          <Button onClick={submitProof} loading={busy} disabled={!proofFile}>Enviar</Button>
        </>}>
        <div className="space-y-4">
          <Field label="Arquivo" hint="Imagem ou PDF, até 10 MB">
            <Input type="file" accept="image/*,application/pdf" onChange={(e) => setProofFile(e.target.files?.[0] ?? null)} />
          </Field>
          <Field label="Observação">
            <Textarea rows={2} value={proofNote} onChange={(e) => setProofNote(e.target.value)} />
          </Field>
          <p className="text-[12px] text-ink-500">O arquivo é armazenado em bucket privado e acessado por URL assinada.</p>
        </div>
      </Modal>

      <p className="flex items-center gap-1.5 px-1 text-[11px] text-ink-400">
        <Package className="h-3 w-3" /> {o.package_description ?? 'Sem descrição de carga'}
        {o.is_temperature_controlled && <><Thermometer className="ml-2 h-3 w-3" /> item sensível à temperatura</>}
        {o.estimated_distance_km != null && <><MapPin className="ml-2 h-3 w-3" /> {km(o.estimated_distance_km)}</>}
      </p>
    </div>
  )
}
