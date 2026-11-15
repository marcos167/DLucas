import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  MapPin, Package, Thermometer, Check, X, Clock, AlertTriangle,
} from 'lucide-react'
import { Alert, Button, Skeleton } from '@/components/ui'
import { listOffersForCourier, respondToOffer } from '@/lib/api'
import { formatDateTime, relativeTime } from '@/lib/utils'
import { Page, type CourierOutlet } from './rider/ui'

/**
 * Aba "Disponíveis": retiradas que a central ofereceu a este entregador e que
 * ele pode aceitar ou recusar. Sem valores: entregadores têm salário fixo.
 */
export default function CourierOffers() {
  const { courier } = useOutletContext<CourierOutlet>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [feedback, setFeedback] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const offers = useQuery({
    queryKey: ['courier-offers', courier?.id],
    queryFn: () => listOffersForCourier(courier!.id),
    enabled: !!courier?.id,
    refetchInterval: 15_000,
  })

  const respond = useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      setBusyId(id)
      const row = await respondToOffer(id, accept)
      return { accept, id, orderId: row.order_id }
    },
    onSuccess: ({ accept, orderId }) => {
      setBusyId(null)
      void qc.invalidateQueries({ queryKey: ['courier-offers'] })
      void qc.invalidateQueries({ queryKey: ['courier-active-orders'] })
      if (accept) {
        navigate(`/entregador/entrega/${orderId}`)
      } else {
        setFeedback('Retirada recusada. Ela voltou para a central.')
      }
    },
    onError: (e) => { setBusyId(null); setFeedback((e as Error).message) },
  })

  const list = offers.data ?? []
  const loading = !!courier && offers.isLoading

  return (
    <Page className="space-y-3">
      {feedback && <Alert tone="info">{feedback}</Alert>}
      {offers.isError && !offers.data && (
        <Alert tone="danger" title="Não foi possível consultar as retiradas">{(offers.error as Error).message}</Alert>
      )}

      {/* a lista se atualiza sozinha a cada 15 s; como no original, sem botão de atualizar */}
      <div className="flex h-10 items-center gap-2.5 rounded-xl border border-ink-200 bg-white px-3.5">
        <Package className="h-4 w-4 shrink-0 text-brand-700" strokeWidth={1.75} aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-950" role="status">
          {loading ? 'Procurando retiradas…'
            : list.length === 0 ? 'Nenhuma retirada disponível agora'
            : list.length === 1 ? '1 retirada disponível agora'
            : `${list.length} retiradas disponíveis agora`}
        </p>
      </div>

      {loading ? (
        <Skeleton className="h-44 w-full rounded-2xl" />
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink-200 px-6 py-5 text-center text-xs leading-normal text-ink-600">
          Volte mais tarde — assim que a central lançar uma retirada para você, ela aparece aqui.
        </div>
      ) : (
        <>
          {list.map((offer) => {
            const order = offer.order
            const expired = offer.expires_at ? new Date(offer.expires_at) < new Date() : false
            return (
              <div key={offer.id} className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
                <div className="border-b border-ink-100 bg-ink-50/60 px-4 py-2.5">
                  <p className="font-mono text-[11.5px] font-bold text-ink-900">{order?.code}</p>
                  <p className="text-[10.5px] text-ink-500">
                    {offer.method === 'AUTO_SUGGESTION' ? 'Sugestão automática' : 'Enviada pela central'} · {relativeTime(offer.created_at)}
                  </p>
                </div>

                <div className="space-y-2.5 p-4">
                  <div className="flex gap-2.5">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
                    <div className="text-[12.5px]">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Coleta</p>
                      <p className="font-medium text-ink-950">{order?.pickup_street}{order?.pickup_number ? `, ${order.pickup_number}` : ''}</p>
                      <p className="text-ink-600">{[order?.pharmacy?.trade_name, order?.unit?.name].filter(Boolean).join(' · ')}</p>
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
                    <div className="text-[12.5px]">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Entrega</p>
                      <p className="font-medium text-ink-950">{order?.delivery_street}{order?.delivery_number ? `, ${order.delivery_number}` : ''}</p>
                      <p className="text-ink-600">{[order?.delivery_district, order?.delivery_city].filter(Boolean).join(' · ')}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 text-[10.5px]">
                    <span className="rounded-md bg-ink-100 px-1.5 py-0.5 text-ink-700">{order?.package_count} volume(s)</span>
                    {order?.is_temperature_controlled && (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-cyan-50 px-1.5 py-0.5 text-cyan-800">
                        <Thermometer className="h-3 w-3" /> Refrigerado
                      </span>
                    )}
                    {order && order.priority !== 'NORMAL' && (
                      <span className="rounded-md bg-red-50 px-1.5 py-0.5 font-semibold text-red-700">
                        {order.priority === 'URGENT' ? 'Urgente' : 'Prioridade alta'}
                      </span>
                    )}
                    {offer.distance_to_pickup_km != null && (
                      <span className="rounded-md bg-ink-100 px-1.5 py-0.5 text-ink-700">
                        {Number(offer.distance_to_pickup_km).toFixed(1)} km da coleta
                      </span>
                    )}
                  </div>

                  {order?.package_description && (
                    <p className="rounded-lg bg-ink-50 px-2.5 py-1.5 text-[11.5px] text-ink-700">
                      Carga: {order.package_description}
                    </p>
                  )}
                  {order?.pickup_instructions && (
                    <p className="rounded-lg bg-brand-50 px-2.5 py-1.5 text-[11.5px] text-brand-900">
                      Coleta: {order.pickup_instructions}
                    </p>
                  )}
                  {offer.message && (
                    <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11.5px] text-amber-900">
                      Central: {offer.message}
                    </p>
                  )}

                  {offer.expires_at && (
                    <p className={`flex items-center gap-1 text-[10.5px] ${expired ? 'text-red-600' : 'text-ink-500'}`}>
                      <Clock className="h-3 w-3" />
                      {expired ? 'Prazo para aceitar encerrado' : `Válida até ${formatDateTime(offer.expires_at)}`}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <Button
                      variant="secondary"
                      onClick={() => respond.mutate({ id: offer.id, accept: false })}
                      loading={busyId === offer.id && respond.isPending}
                      icon={<X className="h-4 w-4" />}
                    >
                      Recusar
                    </Button>
                    <Button
                      onClick={() => respond.mutate({ id: offer.id, accept: true })}
                      loading={busyId === offer.id && respond.isPending}
                      icon={<Check className="h-4 w-4" />}
                      disabled={expired}
                    >
                      Aceitar
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}

          <p className="flex items-start gap-1.5 px-1 text-[10.5px] text-ink-400">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            Ao aceitar, a entrega é vinculada a você. Recusas são registradas e ajudam a central a redistribuir.
          </p>
        </>
      )}
    </Page>
  )
}
