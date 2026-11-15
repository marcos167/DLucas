import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, Camera, CheckCircle2, Clock, MapPin, Navigation, Phone, ShieldCheck, ShieldOff,
  Thermometer, TriangleAlert, Upload, Package, Banknote,
} from 'lucide-react'
import { Alert, Button, Card, EmptyState, Field, Input, Skeleton, Textarea } from '@/components/ui'
import { getOrder, listProofs, pushLocation, updateOrder, uploadProof, createOccurrence, getProofUrl } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useGeolocation } from '@/hooks/useGeolocation'
import { COURIER_FLOW, brl, formatDateTime, relativeTime } from '@/lib/utils'
import { OrderStatusBadge, RouteBlock, OrderTimeline, OrderMetaChips } from '@/components/dashboard/OrderBits'
import type { OrderStatus } from '@/types'

const STEPS: OrderStatus[] = ['ACCEPTED', 'PICKING_UP', 'COLLECTED', 'IN_TRANSIT', 'DELIVERED']

export default function CourierDelivery() {
  const { id = '' } = useParams()
  const { profile, courier, refreshProfile } = useAuth()
  const qc = useQueryClient()

  const [sharing, setSharing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [proofKind, setProofKind] = useState<'DELIVERY' | 'PICKUP'>('DELIVERY')
  const [file, setFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const [occOpen, setOccOpen] = useState(false)
  const [occType, setOccType] = useState('RECIPIENT_ABSENT')
  const [occDesc, setOccDesc] = useState('')
  const lastSent = useRef(0)

  const order = useQuery({ queryKey: ['courier-order', id], queryFn: () => getOrder(id), enabled: !!id, refetchInterval: 20_000 })
  const proofs = useQuery({ queryKey: ['courier-proofs', id], queryFn: () => listProofs(id), enabled: !!id })

  const geo = useGeolocation({ watch: sharing, enabled: sharing })

  // Envia posições reais ao banco somente enquanto o entregador autoriza
  useEffect(() => {
    if (!sharing || !courier) return
    if (geo.status !== 'granted' || !geo.position) return
    const now = Date.now()
    if (now - lastSent.current < 20_000) return
    lastSent.current = now
    void pushLocation({
      courierId: courier.id,
      orderId: id,
      latitude: geo.position.lat,
      longitude: geo.position.lng,
      accuracy: geo.position.accuracy,
    })
  }, [geo.position, geo.status, sharing, courier, id])

  const steps = STEPS.map((s) => ({ status: s, done: order.data ? STEPS.indexOf(order.data.status) >= STEPS.indexOf(s) : false }))
  const next = order.data ? COURIER_FLOW[order.data.status] : undefined

  async function advance(to: OrderStatus) {
    if (!order.data) return
    setBusy(true)
    setMessage('')
    try {
      const patch: Record<string, unknown> = { status: to }
      if (to === 'COLLECTED') patch.collected_at = new Date().toISOString()
      if (to === 'DELIVERED') patch.delivered_at = new Date().toISOString()
      if (to === 'FAILED') patch.cancelled_at = new Date().toISOString()
      // A timeline é gerada automaticamente por trigger no banco.
      await updateOrder(order.data.id, patch)
      await refreshProfile()
      void qc.invalidateQueries({ queryKey: ['courier-order', id] })
      void qc.invalidateQueries({ queryKey: ['courier-active-orders'] })
      setMessage('Etapa atualizada.')
    } catch (e) {
      setMessage((e as Error).message)
    } finally { setBusy(false) }
  }

  async function sendProof() {
    if (!file || !profile || !order.data) return
    if (order.data.requires_proof && proofKind === 'DELIVERY' && !file) return
    setBusy(true)
    try {
      await uploadProof({
        orderId: order.data.id, file, kind: proofKind,
        recipientName: order.data.recipient_name, notes: note, uploadedBy: profile.id,
      })
      setFile(null); setNote('')
      setMessage('Comprovante enviado.')
      void qc.invalidateQueries({ queryKey: ['courier-proofs', id] })
    } catch (e) {
      setMessage((e as Error).message)
    } finally { setBusy(false) }
  }

  async function sendOccurrence() {
    if (!order.data || !occDesc.trim()) return
    setBusy(true)
    try {
      await createOccurrence({
        order_id: order.data.id,
        courier_id: order.data.courier_id,
        pharmacy_id: order.data.pharmacy_id,
        type: occType,
        description: occDesc,
      })
      setOccOpen(false); setOccDesc('')
      setMessage('Ocorrência enviada para a central.')
    } finally { setBusy(false) }
  }

  if (order.isLoading) return <Skeleton className="h-72" />
  if (!order.data) {
    return <EmptyState title="Pedido não encontrado" description="Você não tem acesso a este pedido."
      action={<Link to="/entregador" className="btn-secondary">Voltar</Link>} />
  }

  const o = order.data

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Link to="/entregador" className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100"><ArrowLeft className="h-4 w-4" /></Link>
        <span className="font-mono text-[12px] font-bold text-ink-900">{o.code}</span>
        <OrderStatusBadge status={o.status} />
        <span className="ml-auto text-[11px] font-semibold text-brand-800">{brl(o.courier_payout_cents)}</span>
      </div>

      {message && <Alert tone="success">{message}</Alert>}

      {/* Progresso */}
      <Card className="p-3">
        <div className="flex items-center justify-between">
          {steps.slice(0, 4).map((s, i) => (
            <div key={s.status} className="flex flex-1 items-center">
              <div className="flex flex-col items-center">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                  s.done ? 'bg-brand-600 text-white' : 'bg-ink-200 text-ink-500'
                }`}>{s.done ? '✓' : i + 1}</span>
                <span className="mt-1 w-14 text-center text-[9px] leading-tight text-ink-500">
                  {s.status === 'ACCEPTED' ? 'Aceito' : s.status === 'PICKING_UP' ? 'A caminho' : s.status === 'COLLECTED' ? 'Coletado' : 'Em rota'}
                </span>
              </div>
              {i < 3 && <span className={`mx-0.5 -mt-4 h-0.5 flex-1 ${s.done ? 'bg-brand-400' : 'bg-ink-200'}`} />}
            </div>
          ))}
        </div>
      </Card>

      {/* Rota */}
      <Card className="p-4">
        <RouteBlock order={o} compact />
        <div className="mt-3"><OrderMetaChips order={o} /></div>
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-ink-100 pt-3 text-[12px]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Destinatário</p>
            <p className="font-medium">{o.recipient_name}</p>
            <a href={`tel:${o.recipient_phone.replace(/\D/g, '')}`} className="inline-flex items-center gap-1 text-brand-700">
              <Phone className="h-3 w-3" /> {o.recipient_phone}
            </a>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Farmácia</p>
            <p className="font-medium">{o.pharmacy?.trade_name}</p>
            <p className="text-ink-500">{o.unit?.name}</p>
          </div>
        </div>
        {o.delivery_instructions && (
          <p className="mt-2 rounded-lg bg-ink-50 px-2.5 py-1.5 text-[11.5px] text-ink-700">
            {o.delivery_instructions}
          </p>
        )}
        {o.is_temperature_controlled && (
          <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-cyan-50 px-2.5 py-1.5 text-[11.5px] text-cyan-800">
            <Thermometer className="h-3.5 w-3.5" /> Carga sensível à temperatura — mantenha a refrigeração.
          </p>
        )}
      </Card>

      {/* GPS com consentimento */}
      <Card className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-ink-900">
              {sharing ? <ShieldCheck className="h-4 w-4 text-brand-700" /> : <ShieldOff className="h-4 w-4 text-ink-400" />}
              Compartilhamento de localização
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-ink-600">
              {sharing
                ? 'Autorizado. Sua posição é enviada à central enquanto esta tela estiver aberta.'
                : 'Desativado. A central vê apenas o status da entrega.'}
            </p>
          </div>
          <button
            onClick={() => setSharing((v) => !v)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${sharing ? 'bg-brand-600' : 'bg-ink-300'}`}
            role="switch" aria-checked={sharing}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${sharing ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>

        {sharing && (
          <div className="mt-3 space-y-1.5 rounded-lg bg-ink-50 px-3 py-2 text-[11px]">
            {geo.status === 'requesting' && <p className="text-ink-600">Solicitando permissão do dispositivo…</p>}
            {geo.status === 'denied' && (
              <p className="text-red-700">
                Permissão negada pelo navegador. Autorize a localização nas configurações do dispositivo para compartilhar.
              </p>
            )}
            {geo.status === 'unsupported' && <p className="text-red-700">Este dispositivo não oferece geolocalização.</p>}
            {geo.status === 'unavailable' && <p className="text-amber-700">Sinal de GPS indisponível: {geo.error}</p>}
            {geo.status === 'granted' && geo.position && (
              <>
                <p className="flex items-center gap-1 text-emerald-700">
                  <Navigation className="h-3 w-3" /> Posição obtida (precisão ~{Math.round(geo.position.accuracy)} m)
                </p>
                <p className="text-ink-500">
                  {geo.position.lat.toFixed(5)}, {geo.position.lng.toFixed(5)} ·
                  {' '}{geo.lastUpdate ? new Date(geo.lastUpdate).toLocaleTimeString('pt-BR') : ''}
                </p>
                <p className="text-ink-400">Envio automático a cada ~20 segundos.</p>
              </>
            )}
          </div>
        )}
      </Card>

      {/* Ações */}
      {next && (
        <Button
          className="w-full" size="lg" loading={busy}
          onClick={() => advance(next.next)}
          icon={<CheckCircle2 className="h-4 w-4" />}
        >
          {next.label}
        </Button>
      )}

      {o.status !== 'DELIVERED' && o.status !== 'CANCELLED' && o.status !== 'FAILED' && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setOccOpen(true)} icon={<TriangleAlert className="h-4 w-4" />}>
            Ocorrência
          </Button>
          <Button
            variant="secondary"
            onClick={() => advance('FAILED')}
            loading={busy}
            icon={<TriangleAlert className="h-4 w-4" />}
          >
            Não entregue
          </Button>
        </div>
      )}

      {/* Comprovante */}
      {['COLLECTED', 'IN_TRANSIT', 'DELIVERED'].includes(o.status) && (
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-ink-900">
            <Camera className="h-4 w-4" /> Comprovante
          </p>
          <p className="mt-0.5 text-[11px] text-ink-600">
            {o.requires_proof ? 'Este pedido exige comprovante de entrega.' : 'Envio opcional para este pedido.'}
          </p>
          <div className="mt-3 space-y-2.5">
            <div className="flex gap-2">
              {(['DELIVERY', 'PICKUP'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setProofKind(k)}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-[11.5px] font-medium ${
                    proofKind === k ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-ink-200 text-ink-600'
                  }`}
                >
                  {k === 'DELIVERY' ? 'Entrega' : 'Coleta'}
                </button>
              ))}
            </div>
            <Input
              type="file" accept="image/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observação (opcional)" />
            <Button
              className="w-full" disabled={!file || busy}
              onClick={sendProof}
              loading={busy}
              icon={<Upload className="h-4 w-4" />}
            >
              Enviar comprovante
            </Button>
          </div>

          {(proofs.data ?? []).length > 0 && (
            <ul className="mt-3 divide-y divide-ink-100 border-t border-ink-100 pt-2">
              {(proofs.data ?? []).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-1.5 text-[11.5px]">
                  <span className="truncate text-ink-700">{p.kind === 'PICKUP' ? 'Coleta' : 'Entrega'} · {formatDateTime(p.created_at)}</span>
                  <button
                    className="font-medium text-brand-700"
                    onClick={async () => {
                      const url = await getProofUrl(p.storage_path)
                      if (url) window.open(url, '_blank', 'noreferrer')
                    }}
                  >Abrir</button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {o.status === 'DELIVERED' && (
        <div className="card p-4">
          <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> Entrega concluída
          </p>
          <p className="mt-1 text-[11.5px] text-ink-600">Concluída em {formatDateTime(o.delivered_at)}</p>
          <p className="mt-1 flex items-center justify-between text-[12px]">
            <span className="text-ink-500">Repasse</span>
            <span className="font-bold text-brand-800"><Banknote className="mr-1 inline h-3.5 w-3.5" />{brl(o.courier_payout_cents)}</span>
          </p>
        </div>
      )}

      {occOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-ink-950/50 p-0 sm:items-center sm:justify-center sm:p-4">
          <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 sm:max-w-md sm:rounded-2xl">
            <p className="text-[13px] font-bold text-ink-900">Registrar ocorrência</p>
            <div className="mt-3 space-y-3">
              <Field label="Tipo">
                <select className="input" value={occType} onChange={(e) => setOccType(e.target.value)}>
                  <option value="RECIPIENT_ABSENT">Destinatário ausente</option>
                  <option value="WRONG_ADDRESS">Endereço incorreto</option>
                  <option value="DAMAGED_PACKAGE">Embalagem danificada</option>
                  <option value="REFUSED">Recusado</option>
                  <option value="DELAY">Atraso</option>
                  <option value="ACCIDENT">Acidente</option>
                  <option value="OTHER">Outro</option>
                </select>
              </Field>
              <Field label="Descrição" required>
                <Textarea rows={3} value={occDesc} onChange={(e) => setOccDesc(e.target.value)} />
              </Field>
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setOccOpen(false)}>Cancelar</Button>
              <Button className="flex-1" onClick={sendOccurrence} loading={busy} disabled={!occDesc.trim()}>Enviar</Button>
            </div>
          </div>
        </div>
      )}

      <Card>
        <div className="border-b border-ink-100 px-4 py-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
            <Clock className="mr-1 inline h-3 w-3" /> Histórico
          </p>
        </div>
        <div className="max-h-56 overflow-y-auto">
          <OrderTimeline events={o.events ?? []} />
        </div>
      </Card>

      <p className="flex items-center justify-center gap-1 pb-2 text-[10px] text-ink-400">
        <Package className="h-3 w-3" /> Atualizado {relativeTime(o.updated_at)}
        <MapPin className="ml-2 h-3 w-3" /> Nenhuma posição é simulada
      </p>
    </div>
  )
}
