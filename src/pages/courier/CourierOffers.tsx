import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  MapPin, Package, Thermometer, Check, X, Clock, AlertTriangle, RefreshCw,
} from 'lucide-react'
import { Alert, Button, EmptyState, Skeleton } from '@/components/ui'
import { listOffersForCourier, respondToOffer } from '@/lib/api'
import { brl, formatDateTime, relativeTime } from '@/lib/utils'
import type { Courier } from '@/types'

export default function CourierOffers() {
  const { courier } = useOutletContext<{ courier: Courier | null }>()
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
      await respondToOffer(id, accept)
      return { accept, id }
    },
    onSuccess: ({ accept, id }) => {
      setBusyId(null)
      void qc.invalidateQueries({ queryKey: ['courier-offers'] })
      void qc.invalidateQueries({ queryKey: ['courier-active-orders'] })
      void qc.invalidateQueries({ queryKey: ['courier-offers-home'] })
      if (accept) {
        const offer = offers.data?.find((o) => o.id === id)
        if (offer) navigate(`/entregador/entrega/${offer.order_id}`)
      } else {
        setFeedback('Oferta recusada. Ela voltou para a central.')
      }
    },
    onError: (e) => { setBusyId(null); setFeedback((e as Error).message) },
  })

  if (!courier) {
    return <EmptyState title="Cadastro pendente" description="Seu cadastro de entregador não está vinculado." />
  }

  const list = offers.data ?? []

  return (
    <div className="space-y-3">
      {feedback && <Alert tone="info">{feedback}</Alert>}

      <div className="flex items-center justify-between">
        <p className="text-[12px] font-bold uppercase tracking-wider text-ink-500">
          Ofertas ativas ({list.length})
        </p>
        <button
          onClick={() => void offers.refetch()}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-ink-600 hover:bg-ink-100"
        >
          <RefreshCw className="h-3 w-3" /> Atualizar
        </button>
      </div>

      {offers.isLoading ? (
        <>{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-44" />)}</>
      ) : list.length === 0 ? (
        <div className="card">
          <EmptyState
            title="Sem ofertas no momento"
            description="Fique disponível para receber ofertas da central. Elas aparecem automaticamente aqui."
            icon={<Package className="h-6 w-6" />}
          />
        </div>
      ) : (
        list.map((offer) => {
          const order = offer.order
          const expired = offer.expires_at ? new Date(offer.expires_at) < new Date() : false
          return (
            <div key={offer.id} className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-ink-100 bg-ink-50/60 px-4 py-2.5">
                <div>
                  <p className="font-mono text-[11.5px] font-bold text-ink-900">{order?.code}</p>
                  <p className="text-[10.5px] text-ink-500">
                    {offer.method === 'AUTO_SUGGESTION' ? 'Sugestão automática' : 'Enviada pela central'} · {relativeTime(offer.created_at)}
                  </p>
                </div>
                <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-800">
                  {brl(order?.courier_payout_cents ?? 0)}
                </span>
              </div>

              <div className="space-y-2.5 p-4">
                <div className="flex gap-2.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
                  <div className="text-[12.5px]">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Coleta</p>
                    <p className="font-medium">{order?.pickup_street}{order?.pickup_number ? `, ${order.pickup_number}` : ''}</p>
                    <p className="text-ink-600">{order?.pharmacy?.trade_name} · {order?.unit?.name}</p>
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
                  <div className="text-[12.5px]">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Entrega</p>
                    <p className="font-medium">{order?.delivery_street}{order?.delivery_number ? `, ${order.delivery_number}` : ''}</p>
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
                  {order?.priority !== 'NORMAL' && (
                    <span className="rounded-md bg-red-50 px-1.5 py-0.5 font-semibold text-red-700">
                      {order?.priority === 'URGENT' ? 'Urgente' : 'Prioridade alta'}
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
                    {expired ? 'Oferta expirada' : `Válida até ${formatDateTime(offer.expires_at)}`}
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
        })
      )}

      <p className="flex items-start gap-1.5 px-1 text-[10.5px] text-ink-400">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
        Ao aceitar, o pedido é vinculado a você. Recusas são registradas e ajudam a central a redistribuir.
      </p>
    </div>
  )
}
