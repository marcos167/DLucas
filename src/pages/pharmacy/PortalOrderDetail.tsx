import { useQuery } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useState } from 'react'
import {
  AlertTriangle, ArrowLeft, Bike, CheckCircle2, Clock, FileDown, MapPin, Phone, Radio,
} from 'lucide-react'
import {
  Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Modal, Skeleton, Textarea,
} from '@/components/ui'
import {
  createOccurrence, getOrder, getProofUrl, listLocationsForOrder, listProofs,
} from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import {
  brl, formatDateTime, isLocationFresh, relativeTime,
} from '@/lib/utils'
import { OrderStatusBadge, PriorityBadge, RouteBlock, OrderMetaChips, OrderTimeline } from '@/components/dashboard/OrderBits'

export default function PortalOrderDetail() {
  const { id = '' } = useParams()
  const [sp] = useSearchParams()
  const { profile } = useAuth()
  const [occOpen, setOccOpen] = useState(false)
  const [occDesc, setOccDesc] = useState('')
  const [occType, setOccType] = useState('OTHER')
  const [busy, setBusy] = useState(false)

  const order = useQuery({ queryKey: ['portal-order', id], queryFn: () => getOrder(id), enabled: !!id, refetchInterval: 20_000 })
  const proofs = useQuery({ queryKey: ['portal-proofs', id], queryFn: () => listProofs(id), enabled: !!id })
  const locations = useQuery({
    queryKey: ['portal-order-loc', id],
    queryFn: () => listLocationsForOrder(id),
    enabled: !!id,
    refetchInterval: 20_000,
  })

  if (order.isLoading) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
  if (!order.data) {
    return <EmptyState title="Pedido não encontrado" description="Este pedido não pertence à sua farmácia ou foi removido."
      action={<Link to="/portal/pedidos" className="btn-secondary">Voltar</Link>} />
  }

  const o = order.data
  const last = locations.data?.[0]
  // A farmácia só vê posição quando o entregador autoriza e o pedido está em rota
  const canSeeLocation =
    !!last && ['ACCEPTED', 'PICKING_UP', 'COLLECTED', 'IN_TRANSIT'].includes(o.status)
  const fresh = canSeeLocation && isLocationFresh(last?.recorded_at, 3)

  async function submitOccurrence() {
    if (!occDesc.trim()) return
    setBusy(true)
    try {
      await createOccurrence({
        order_id: o.id,
        pharmacy_id: o.pharmacy_id,
        courier_id: o.courier_id,
        type: occType,
        description: occDesc,
      })
      setOccOpen(false); setOccDesc('')
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/portal/pedidos" className="btn-ghost btn-sm"><ArrowLeft className="h-3.5 w-3.5" /> Pedidos</Link>
        <span className="font-mono text-sm font-semibold text-ink-900">{o.code}</span>
        <OrderStatusBadge status={o.status} />
        <PriorityBadge priority={o.priority} />
        <div className="ml-auto">
          <Button variant="secondary" size="sm" onClick={() => setOccOpen(true)} icon={<AlertTriangle className="h-3.5 w-3.5" />}>
            Registrar ocorrência
          </Button>
        </div>
      </div>

      {sp.get('created') && (
        <Alert tone="success" title="Pedido criado">
          Seu pedido entrou na fila de despacho. Você acompanhará o status aqui.
        </Alert>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Detalhes da entrega" description={`Criado em ${formatDateTime(o.created_at)}`} />
            <div className="p-4">
              <RouteBlock order={o} />
              <div className="mt-4"><OrderMetaChips order={o} /></div>
              <div className="mt-4 grid gap-3 border-t border-ink-100 pt-4 sm:grid-cols-2 text-[13px]">
                <div>
                  <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-400">Destinatário</p>
                  <p className="font-medium">{o.recipient_name}</p>
                  <p className="text-ink-600"><Phone className="mr-1 inline h-3 w-3" />{o.recipient_phone}</p>
                </div>
                <div>
                  <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-400">Valor</p>
                  <p className="font-medium">{brl(o.quoted_price_cents)}</p>
                </div>
              </div>
              {o.delivery_instructions && (
                <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-[12px] text-ink-700">
                  <strong>Instruções:</strong> {o.delivery_instructions}
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Comprovantes" description="Documentos da entrega" />
            {proofs.isLoading ? <Skeleton className="m-4 h-16" /> : (proofs.data ?? []).length === 0 ? (
              <EmptyState title="Sem comprovantes" description="Disponível após a conclusão da entrega." icon={<FileDown className="h-6 w-6" />} />
            ) : (
              <ul className="divide-y divide-ink-100">
                {(proofs.data ?? []).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-[13px] font-medium">{p.file_name ?? p.kind}</p>
                      <p className="text-[11px] text-ink-500">{formatDateTime(p.created_at)}</p>
                    </div>
                    <Button variant="secondary" size="sm" onClick={async () => {
                      const url = await getProofUrl(p.storage_path)
                      if (url) window.open(url, '_blank', 'noreferrer')
                    }}>
                      Baixar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Histórico" description="Etapas registradas" />
            <div className="max-h-80 overflow-y-auto"><OrderTimeline events={o.events ?? []} /></div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Entregador"
              description="Exibido conforme autorização de compartilhamento"
              action={canSeeLocation && (
                <Badge className={fresh ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}>
                  <Radio className="h-3 w-3" /> {fresh ? 'Ao vivo' : 'Desatualizado'}
                </Badge>
              )}
            />
            <div className="p-4">
              {o.courier ? (
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-800 text-xs font-bold text-white">
                    {o.courier.full_name.slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink-900">{o.courier.full_name}</p>
                    <p className="text-[12px] text-ink-500"><Bike className="mr-1 inline h-3 w-3" />{o.courier.availability === 'ON_DELIVERY' ? 'Em entrega' : 'Disponível'}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-ink-500">Aguardando atribuição de entregador.</p>
              )}

              <div className="mt-4 border-t border-ink-100 pt-3">
                {canSeeLocation && last ? (
                  <>
                    <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-800">
                      <MapPin className="h-3.5 w-3.5 text-brand-700" /> Localização compartilhada
                    </p>
                    <p className="mt-1 text-[11.5px] text-ink-600">
                      <Clock className="mr-1 inline h-3 w-3" />
                      Registro de {formatDateTime(last.recorded_at)} ({relativeTime(last.recorded_at)})
                    </p>
                    {!fresh && (
                      <p className="mt-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
                        Última posição conhecida — não é tempo real.
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-ink-400">
                      Lat {last.latitude.toFixed(5)}, Lng {last.longitude.toFixed(5)}
                    </p>
                  </>
                ) : (
                  <p className="text-[11.5px] text-ink-500">
                    A localização do entregador só é exibida quando ele autoriza o compartilhamento
                    durante a entrega.
                  </p>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Linha do tempo de status" />
            <ol className="space-y-2 p-4 text-[12.5px]">
              {[
                { k: 'Criado', v: o.created_at },
                { k: 'Atribuído', v: o.assigned_at },
                { k: 'Aceito', v: o.accepted_at },
                { k: 'Coletado', v: o.collected_at },
                { k: 'Entregue', v: o.delivered_at },
              ].map((i) => (
                <li key={i.k} className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-ink-600">
                    <CheckCircle2 className={`h-3.5 w-3.5 ${i.v ? 'text-brand-600' : 'text-ink-300'}`} /> {i.k}
                  </span>
                  <span className={i.v ? 'text-ink-800' : 'text-ink-400'}>{i.v ? formatDateTime(i.v) : '—'}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      <Modal open={occOpen} onClose={() => setOccOpen(false)} title="Registrar ocorrência" size="md"
        footer={<>
          <Button variant="secondary" onClick={() => setOccOpen(false)}>Cancelar</Button>
          <Button onClick={submitOccurrence} loading={busy} disabled={!occDesc.trim()}>Enviar</Button>
        </>}>
        <div className="space-y-4">
          <Field label="Tipo">
            <select className="input" value={occType} onChange={(e) => setOccType(e.target.value)}>
              <option value="RECIPIENT_ABSENT">Destinatário ausente</option>
              <option value="WRONG_ADDRESS">Endereço incorreto</option>
              <option value="DAMAGED_PACKAGE">Embalagem danificada</option>
              <option value="REFUSED">Recusado</option>
              <option value="DELAY">Atraso</option>
              <option value="OTHER">Outro</option>
            </select>
          </Field>
          <Field label="Descrição" required>
            <Textarea rows={4} value={occDesc} onChange={(e) => setOccDesc(e.target.value)} />
          </Field>
          <p className="text-[11.5px] text-ink-500">
            A ocorrência será enviada para a central e analisada pela equipe de operações
            {profile?.full_name ? ` — registrada por ${profile.full_name}` : ''}.
          </p>
        </div>
      </Modal>
    </div>
  )
}
