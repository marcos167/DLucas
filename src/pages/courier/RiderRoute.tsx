import { useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowDown, ArrowLeft, ArrowUp, Camera, CheckCircle2, CloudUpload, MapPin, Navigation, Phone, Snowflake, XCircle,
} from 'lucide-react'
import { Alert, Badge, Button, Field, Input, Modal, Select, Textarea } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'
import { formatZip } from '@/lib/logistics/cep'
import {
  formatDistance, mapsLinks, PACKAGE_STATUS, ROUTE_STATUS, routeName, STOP_STATUS, todayLocal,
} from '@/lib/logistics/labels'
import { newId, type QueueOp } from '@/lib/logistics/offline/queue'
import type { RiderPackage, RiderRoute as Route, RiderStop } from '@/lib/logistics/types'
import { OCCURRENCE_TYPE_LABEL, cn } from '@/lib/utils'
import type { OccurrenceType } from '@/types'
import { compressPhoto, currentPosition } from './rider/device'
import { useRider } from './rider/RiderContext'
import { Page } from './rider/ui'

const OPEN_STATUSES = ['ROUTED', 'LOADED', 'FAILED']
const FAILURE_REASONS: OccurrenceType[] = ['RECIPIENT_ABSENT', 'WRONG_ADDRESS', 'REFUSED', 'DAMAGED_PACKAGE', 'OTHER']

interface Target { stop: RiderStop; packages: RiderPackage[]; outcome: 'DELIVERED' | 'FAILED' }

export default function RiderRoute() {
  const { routeId } = useParams()
  const { day, record, online, loading } = useRider()
  const { push } = useToast()
  const [target, setTarget] = useState<Target | null>(null)
  const route = day?.routes.find((candidate) => candidate.id === routeId)

  if (!route) {
    return (
      <Page className="space-y-3">
        <BackLink />
        <Alert tone={loading ? 'info' : 'warning'} title={loading ? 'Carregando roteiro…' : 'Roteiro indisponível'}>
          {!loading && 'Este roteiro não está mais na sua lista. Ele pode ter sido concluído em outro dia ou passado para outra pessoa.'}
        </Alert>
      </Page>
    )
  }

  const status = ROUTE_STATUS[route.status]
  const requireScan = day?.config.require_loading_scan ?? true
  const notLoaded = route.stops.flatMap((stop) => stop.packages).filter((pkg) => pkg.status === 'ROUTED').length
  const pendingStops = route.stops.filter((stop) => stop.status === 'PENDING')

  async function start() {
    await record({ type: 'START_ROUTE', routeId: route!.id, occurredAt: new Date().toISOString() })
    push({ tone: 'success', message: `${routeName(route!.sequence)} iniciado.` })
  }

  async function move(stopId: string, direction: -1 | 1) {
    const order = pendingStops.map((stop) => stop.id)
    const index = order.indexOf(stopId)
    const swap = index + direction
    if (index < 0 || swap < 0 || swap >= order.length) return
    ;[order[index], order[swap]] = [order[swap], order[index]]
    await record({ type: 'REORDER', routeId: route!.id, stopIds: order })
  }

  return (
    <Page className="space-y-3">
      <BackLink />
      <div className="rounded-2xl border border-ink-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-lg font-bold text-ink-950">{routeName(route.sequence)}</h1>
            <p className="text-[12px] text-ink-500">
              {route.stops.length} parada(s) · {route.stops.reduce((sum, stop) => sum + stop.packages.length, 0)} pacote(s)
              {route.planned_distance_m ? ` · ${formatDistance(route.planned_distance_m)}` : ''}
            </p>
          </div>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        {route.status === 'RELEASED' && (
          <Button className="mt-3 w-full" size="lg" onClick={() => void start()} icon={<Navigation className="h-4 w-4" />}>
            Iniciar roteiro
          </Button>
        )}
        {requireScan && notLoaded > 0 && route.status !== 'COMPLETED' && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-900">
            {notLoaded} pacote(s) deste roteiro ainda não foram conferidos na saída.{' '}
            <Link to="/entregador/conferencia" className="font-semibold underline">Conferir agora</Link>
          </div>
        )}
      </div>

      {route.stops.map((stop) => (
        <StopCard
          key={stop.id} stop={stop} requireScan={requireScan}
          canMoveUp={stop.status === 'PENDING' && pendingStops[0]?.id !== stop.id}
          canMoveDown={stop.status === 'PENDING' && pendingStops.at(-1)?.id !== stop.id}
          onMove={(direction) => void move(stop.id, direction)}
          onAct={(packages, outcome) => setTarget({ stop, packages, outcome })}
        />
      ))}

      {target && (
        <AttemptSheet route={route} target={target} online={online} onClose={() => setTarget(null)} />
      )}
    </Page>
  )
}

function BackLink() {
  return (
    <Link to="/entregador" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-600">
      <ArrowLeft className="h-4 w-4" /> Hoje
    </Link>
  )
}

function StopCard({ stop, requireScan, canMoveUp, canMoveDown, onMove, onAct }: {
  stop: RiderStop
  requireScan: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onMove: (direction: -1 | 1) => void
  onAct: (packages: RiderPackage[], outcome: 'DELIVERED' | 'FAILED') => void
}) {
  const links = mapsLinks(stop)
  const status = STOP_STATUS[stop.status]
  const deliverable = (pkg: RiderPackage) => OPEN_STATUSES.includes(pkg.status) && !(requireScan && pkg.status === 'ROUTED')
  const open = stop.packages.filter(deliverable)

  return (
    <article className={cn('rounded-2xl border bg-white', stop.status === 'PENDING' ? 'border-ink-200' : 'border-ink-100 opacity-90')}>
      <header className="flex items-start gap-3 px-4 pt-3.5">
        <span className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold',
          stop.status === 'PENDING' ? 'bg-brand-100 text-brand-900' : 'bg-ink-100 text-ink-500',
        )}>{stop.sequence}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-snug text-ink-950">{stop.street}{stop.number ? `, ${stop.number}` : ''}</p>
          <p className="text-[12px] text-ink-500">
            {[stop.district, stop.city].filter(Boolean).join(' · ')}
            {stop.zip_code && <>{' · '}<span className="whitespace-nowrap">CEP {formatZip(stop.zip_code)}</span></>}
          </p>
          {stop.leg_distance_m != null && <p className="text-[11.5px] text-ink-400">{formatDistance(stop.leg_distance_m)} desde a parada anterior</p>}
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={status.tone}>{status.label}</Badge>
          {(canMoveUp || canMoveDown) && (
            <div className="flex gap-1">
              <button type="button" disabled={!canMoveUp} onClick={() => onMove(-1)} aria-label="Fazer esta parada antes"
                className="rounded-lg border border-ink-200 p-1.5 text-ink-600 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
              <button type="button" disabled={!canMoveDown} onClick={() => onMove(1)} aria-label="Fazer esta parada depois"
                className="rounded-lg border border-ink-200 p-1.5 text-ink-600 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
            </div>
          )}
        </div>
      </header>

      {stop.status === 'PENDING' && (
        <div className="mt-3 grid grid-cols-2 gap-2 px-4">
          <a href={links.waze} target="_blank" rel="noreferrer" className="btn-secondary btn-sm justify-center"><Navigation className="h-3.5 w-3.5" /> Waze</a>
          <a href={links.google} target="_blank" rel="noreferrer" className="btn-secondary btn-sm justify-center"><MapPin className="h-3.5 w-3.5" /> Google Maps</a>
        </div>
      )}

      <ul className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
        {stop.packages.map((pkg) => {
          const info = PACKAGE_STATUS[pkg.status]
          return (
            <li key={pkg.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold text-ink-900">{pkg.recipient_name}</p>
                  <p className="font-mono text-[11.5px] text-ink-500">{pkg.tracking_code}{pkg.complement ? ` · ${pkg.complement}` : ''}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={info.tone}>{info.label}</Badge>
                  {pkg.pendingSync && <span className="flex items-center gap-1 text-[10.5px] text-ink-400"><CloudUpload className="h-3 w-3" /> aguardando envio</span>}
                </div>
              </div>
              {pkg.is_temperature_controlled && (
                <p className="mt-1 flex items-center gap-1 text-[11.5px] font-medium text-sky-700"><Snowflake className="h-3 w-3" /> Manter refrigerado</p>
              )}
              {pkg.delivery_instructions && <p className="mt-1 text-[12px] text-ink-600">{pkg.delivery_instructions}</p>}
              {OPEN_STATUSES.includes(pkg.status) && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {deliverable(pkg) ? (
                    <>
                      <Button size="sm" onClick={() => onAct([pkg], 'DELIVERED')} icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
                        {pkg.status === 'FAILED' ? 'Entregar agora' : 'Entregar'}
                      </Button>
                      {pkg.status !== 'FAILED' && (
                        <Button size="sm" variant="secondary" onClick={() => onAct([pkg], 'FAILED')} icon={<XCircle className="h-3.5 w-3.5" />}>Não entregue</Button>
                      )}
                    </>
                  ) : (
                    <span className="text-[12px] text-amber-800">Confira este pacote na saída antes de entregar.</span>
                  )}
                  {pkg.recipient_phone && (
                    <a href={`tel:${pkg.recipient_phone.replace(/\D/g, '')}`} className="btn-ghost btn-sm ml-auto"><Phone className="h-3.5 w-3.5" /> Ligar</a>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {open.filter((pkg) => pkg.status !== 'FAILED').length > 1 && (
        <div className="border-t border-ink-100 p-3">
          <Button className="w-full" onClick={() => onAct(open.filter((pkg) => pkg.status !== 'FAILED'), 'DELIVERED')} icon={<CheckCircle2 className="h-4 w-4" />}>
            Entregar os {open.filter((pkg) => pkg.status !== 'FAILED').length} pacotes deste endereço
          </Button>
        </div>
      )}
    </article>
  )
}

function AttemptSheet({ route, target, online, onClose }: { route: Route; target: Target; online: boolean; onClose: () => void }) {
  const { record, store, courierId } = useRider()
  const { push } = useToast()
  const delivered = target.outcome === 'DELIVERED'
  const [recipient, setRecipient] = useState('')
  const [document, setDocument] = useState('')
  const [reason, setReason] = useState<OccurrenceType>('RECIPIENT_ABSENT')
  const [notes, setNotes] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo])
  const codes = target.packages.map((pkg) => pkg.tracking_code).join(', ')

  async function confirm() {
    if (delivered && recipient.trim().length < 2) { setError('Informe quem recebeu.'); return }
    if (!delivered && reason === 'OTHER' && notes.trim().length < 3) { setError('Descreva o que aconteceu.'); return }
    if (!courierId) return
    setSaving(true)
    setError(null)
    try {
      // a foto é preparada antes de qualquer registro: se falhar, nada fica pela metade
      const blob = photo ? await compressPhoto(photo) : null
      const position = await currentPosition()
      const occurredAt = new Date().toISOString()
      const attempts = target.packages.map((pkg): QueueOp & { type: 'ATTEMPT' } => ({
        type: 'ATTEMPT', attemptId: newId(), packageId: pkg.id, routeId: route.id, stopId: target.stop.id,
        outcome: target.outcome, failureReason: delivered ? null : reason, notes: notes.trim() || null,
        recipientName: delivered ? recipient.trim() : null, recipientDocument: delivered ? document.trim() || null : null,
        latitude: position?.latitude ?? null, longitude: position?.longitude ?? null, occurredAt,
      }))
      if (blob) {
        const blobKey = `proof:${attempts[0].attemptId}`
        await store.putBlob(blobKey, blob)
        for (const attempt of attempts) await record(attempt)
        await record({
          type: 'PROOF', blobKey,
          storagePath: `couriers/${courierId}/${todayLocal()}/${attempts[0].attemptId}.${blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'}`,
          mimeType: blob.type || 'image/jpeg', sizeBytes: blob.size,
          proofs: attempts.map((attempt) => ({ proofId: newId(), attemptId: attempt.attemptId })),
        })
      } else {
        for (const attempt of attempts) await record(attempt)
      }
      push({
        tone: delivered ? 'success' : 'info',
        message: delivered ? 'Entrega registrada.' : 'Tentativa registrada.',
        detail: online ? undefined : 'Guardado no aparelho. Será enviado quando a internet voltar.',
      })
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível guardar o registro neste aparelho.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open onClose={saving ? () => undefined : onClose}
      title={delivered ? 'Confirmar entrega' : 'Registrar tentativa sem sucesso'}
      description={`${target.stop.street}${target.stop.number ? `, ${target.stop.number}` : ''} · ${codes}`}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Voltar</Button>
          <Button variant={delivered ? 'primary' : 'danger'} loading={saving} onClick={() => void confirm()}>
            {delivered ? `Confirmar ${target.packages.length > 1 ? `${target.packages.length} entregas` : 'entrega'}` : 'Registrar'}
          </Button>
        </>
      )}
    >
      <div className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}
        {delivered ? (
          <>
            <Field label="Quem recebeu" required>
              <Input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Nome de quem recebeu" autoComplete="off" />
            </Field>
            <Field label="Documento" hint="Opcional">
              <Input value={document} onChange={(event) => setDocument(event.target.value)} placeholder="RG ou CPF" inputMode="numeric" autoComplete="off" />
            </Field>
          </>
        ) : (
          <Field label="Motivo" required>
            <Select value={reason} onChange={(event) => setReason(event.target.value as OccurrenceType)}>
              {FAILURE_REASONS.map((item) => <option key={item} value={item}>{OCCURRENCE_TYPE_LABEL[item]}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Observação" hint={delivered ? 'Opcional' : undefined}>
          <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={delivered ? 'Ex.: deixado na portaria' : 'O que aconteceu?'} />
        </Field>
        <div>
          <input
            ref={fileInput} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
          />
          {preview ? (
            <div className="flex items-center gap-3">
              <img src={preview} alt="Foto do comprovante" className="h-20 w-20 rounded-xl object-cover" />
              <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()}>Trocar foto</Button>
            </div>
          ) : (
            <Button variant="secondary" className="w-full" onClick={() => fileInput.current?.click()} icon={<Camera className="h-4 w-4" />}>
              Tirar foto do comprovante
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
