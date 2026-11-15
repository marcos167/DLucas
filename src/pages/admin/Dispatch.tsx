import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Bike, MapPin, Radio, Sparkles, Send, UserCheck, XCircle, AlertTriangle,
} from 'lucide-react'
import {
  Alert, Badge, Button, Card, CardHeader, EmptyState, Modal, SearchInput, Skeleton, Textarea,
} from '@/components/ui'
import {
  assignOrder, listAvailableCouriers, listOrders, logAudit, offerOrderToCourier, suggestCouriers,
} from '@/lib/api'
import {
  AVAILABILITY_CLASS, AVAILABILITY_LABEL, ORDER_STATUS_LABEL, brl, distanceKm, formatDateTime, km, relativeTime,
} from '@/lib/utils'
import { OrderStatusBadge, PriorityBadge, RouteBlock } from '@/components/dashboard/OrderBits'
import type { Order, Courier } from '@/types'
import { useApiMutation } from '@/hooks/useApiMutation'

export default function Dispatch() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Order | null>(null)
  const [method, setMethod] = useState<'MANUAL' | 'AUTO_SUGGESTION'>('AUTO_SUGGESTION')
  const [chosenCourier, setChosenCourier] = useState<Courier | null>(null)
  const [note, setNote] = useState('')
  const [feedback, setFeedback] = useState('')

  const pending = useQuery({
    queryKey: ['dispatch-queue', search],
    queryFn: () => listOrders({ status: ['PENDING', 'OFFERED'], search: search || undefined, limit: 100 }),
    refetchInterval: 15_000,
  })

  const couriers = useQuery({
    queryKey: ['dispatch-couriers'],
    queryFn: listAvailableCouriers,
    refetchInterval: 20_000,
  })

  const suggestions = useMemo(() => {
    if (!selected) return []
    return suggestCouriers(selected, couriers.data ?? [], 6)
  }, [selected, couriers.data])

  const offer = useApiMutation({
    mutationFn: async () => {
      if (!selected || !chosenCourier) throw new Error('Selecione um entregador.')
      const suggestion = suggestions.find((s) => s.courier.id === chosenCourier.id)
      await offerOrderToCourier({
        orderId: selected.id,
        courierId: chosenCourier.id,
        method,
        score: suggestion?.score ?? null,
        distance: suggestion?.distance ?? null,
        message: note || undefined,
      })
      await logAudit('OFFER', 'order', selected.id, `Enviou oferta de ${selected.code} para ${chosenCourier.full_name}`)
      return chosenCourier.full_name
    },
    onSuccess: (name) => {
      setFeedback(`Oferta enviada para ${name}. O pedido ficará aguardando aceite.`)
      closeModal()
      void qc.invalidateQueries({ queryKey: ['dispatch-queue'] })
      void qc.invalidateQueries({ queryKey: ['orders-list'] })
    },
    successMessage: (name) => `Oferta enviada para ${name}.`,
  })

  const assign = useApiMutation({
    mutationFn: async () => {
      if (!selected || !chosenCourier) throw new Error('Selecione um entregador.')
      await assignOrder({ orderId: selected.id, courierId: chosenCourier.id, method: 'MANUAL', reason: note || undefined })
      await logAudit('ASSIGN', 'order', selected.id, `Atribuiu ${selected.code} diretamente a ${chosenCourier.full_name}`)
      return chosenCourier.full_name
    },
    onSuccess: (name) => {
      setFeedback(`Pedido atribuído diretamente a ${name}.`)
      closeModal()
      void qc.invalidateQueries({ queryKey: ['dispatch-queue'] })
      void qc.invalidateQueries({ queryKey: ['orders-list'] })
    },
    successMessage: (name) => `Pedido atribuído a ${name}.`,
  })

  function openOrder(order: Order) {
    setSelected(order)
    setChosenCourier(null)
    setMethod('AUTO_SUGGESTION')
    setNote('')
    setFeedback('')
  }
  function closeModal() { setSelected(null); setChosenCourier(null) }

  const estimatedDistance = useMemo(() => {
    if (!selected) return null
    if (selected.pickup_latitude != null && selected.delivery_latitude != null
      && selected.pickup_longitude != null && selected.delivery_longitude != null) {
      return distanceKm(
        { lat: selected.pickup_latitude, lng: selected.pickup_longitude },
        { lat: selected.delivery_latitude, lng: selected.delivery_longitude },
      )
    }
    return null
  }, [selected])

  const queue = pending.data ?? []
  const activeCouriers = (couriers.data ?? []).filter((c) => c.status === 'ACTIVE')

  return (
    <div className="space-y-4">
      {feedback && (
        <Alert tone="success" title="Despacho atualizado">{feedback}</Alert>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader
            title="Fila de despacho"
            description="Pedidos aguardando entregador (atualiza a cada 15 s)"
            action={<Badge className="bg-amber-100 text-amber-800">{queue.length} na fila</Badge>}
          />
          <div className="border-b border-ink-100 px-4 py-3">
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar por código ou destinatário…" />
          </div>
          {pending.isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
          ) : queue.length === 0 ? (
            <EmptyState
              title="Fila vazia"
              description="Nenhum pedido aguardando despacho neste momento."
              icon={<Radio className="h-6 w-6" />}
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {queue.map((o) => (
                <li key={o.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/app/pedidos/${o.id}`} className="font-mono text-[12px] font-semibold text-brand-800 hover:underline">{o.code}</Link>
                        <OrderStatusBadge status={o.status} />
                        <PriorityBadge priority={o.priority} />
                      </div>
                      <p className="mt-1 text-[13px] font-medium text-ink-900">
                        {o.pharmacy?.trade_name} <span className="text-ink-400">·</span> {o.unit?.name}
                      </p>
                      <div className="mt-2"><RouteBlock order={o} compact /></div>
                      <p className="mt-2 text-[11.5px] text-ink-500">
                        Destinatário: {o.recipient_name} · {o.recipient_phone} · {o.package_count} vol.
                        {o.is_temperature_controlled ? ' · refrigerado' : ''} · {brl(o.quoted_price_cents)}
                        {' · '}criado {relativeTime(o.created_at)}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => openOrder(o)} icon={<Send className="h-3.5 w-3.5" />}>
                      Despachar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Entregadores disponíveis"
            description={`${activeCouriers.filter((c) => c.availability === 'AVAILABLE').length} disponíveis agora`}
            action={<Link to="/app/entregadores" className="text-[11.5px] font-medium text-brand-700 hover:underline">Gerenciar</Link>}
          />
          {couriers.isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : activeCouriers.length === 0 ? (
            <EmptyState title="Nenhum entregador apto ao despacho" description="Vincule uma conta ativa com papel Entregador em Usuários para enviar ofertas ou atribuir pedidos. Cadastros sem login continuam visíveis em Gerenciar." icon={<Bike className="h-6 w-6" />} />
          ) : (
            <ul className="divide-y divide-ink-100">
              {activeCouriers.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-ink-900">{c.full_name}</p>
                    <p className="text-[11px] text-ink-500">
                      {[c.base_city, c.service_zone].filter(Boolean).join(' · ') || 'Região não informada'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`badge ${AVAILABILITY_CLASS[c.availability]}`}>{AVAILABILITY_LABEL[c.availability]}</span>
                    {c.current_location_at && c.location_sharing_enabled && (
                      <span className="text-[10px] text-ink-400" title={`Última posição: ${formatDateTime(c.current_location_at)}`}>
                        GPS {new Date(c.current_location_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal
        open={!!selected}
        onClose={closeModal}
        size="xl"
        title={selected ? `Despachar ${selected.code}` : ''}
        description="Escolha o entregador por sugestão automática ou manualmente"
        footer={<>
          <Button variant="secondary" onClick={closeModal}>Cancelar</Button>
          <Button
            variant="secondary"
            disabled={!chosenCourier}
            loading={assign.isPending}
            onClick={() => assign.mutate()}
            icon={<UserCheck className="h-4 w-4" />}
          >
            Atribuir direto
          </Button>
          <Button disabled={!chosenCourier} loading={offer.isPending} onClick={() => offer.mutate()} icon={<Send className="h-4 w-4" />}>
            Enviar oferta
          </Button>
        </>}
      >
        {selected && (
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="rounded-xl border border-ink-200 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-ink-400">Pedido</p>
                  <OrderStatusBadge status={selected.status} />
                </div>
                <p className="mt-2 text-sm font-semibold text-ink-900">{selected.pharmacy?.trade_name} · {selected.unit?.name}</p>
                <div className="mt-3"><RouteBlock order={selected} compact /></div>
                <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-ink-100 pt-3 text-[12px]">
                  <div><dt className="text-ink-400">Destinatário</dt><dd className="font-medium">{selected.recipient_name}</dd></div>
                  <div><dt className="text-ink-400">Telefone</dt><dd className="font-medium">{selected.recipient_phone}</dd></div>
                  <div><dt className="text-ink-400">Volumes</dt><dd className="font-medium">{selected.package_count}</dd></div>
                  <div><dt className="text-ink-400">Valor</dt><dd className="font-medium">{brl(selected.quoted_price_cents)}</dd></div>
                  <div><dt className="text-ink-400">Prioridade</dt><dd className="font-medium">{ORDER_STATUS_LABEL[selected.status] ? selected.priority : selected.priority}</dd></div>
                  <div>
                    <dt className="text-ink-400">Distância estimada</dt>
                    <dd className="font-medium">{estimatedDistance != null ? km(estimatedDistance) : '—'}</dd>
                  </div>
                </dl>
                {selected.pickup_instructions && (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] text-amber-900">
                    Instruções de coleta: {selected.pickup_instructions}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-ink-400">Método</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setMethod('AUTO_SUGGESTION')}
                    className={`flex-1 rounded-xl border px-3 py-2 text-left text-[12.5px] transition ${
                      method === 'AUTO_SUGGESTION' ? 'border-brand-500 bg-brand-50' : 'border-ink-200'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 font-semibold text-ink-900">
                      <Sparkles className="h-3.5 w-3.5 text-brand-600" /> Sugestão automática
                    </span>
                    <span className="text-ink-500">Ordena por disponibilidade, região e distância</span>
                  </button>
                  <button
                    onClick={() => setMethod('MANUAL')}
                    className={`flex-1 rounded-xl border px-3 py-2 text-left text-[12.5px] transition ${
                      method === 'MANUAL' ? 'border-brand-500 bg-brand-50' : 'border-ink-200'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 font-semibold text-ink-900">
                      <UserCheck className="h-3.5 w-3.5 text-ink-600" /> Manual
                    </span>
                    <span className="text-ink-500">Escolha livre entre os entregadores</span>
                  </button>
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-400">Mensagem ao entregador (opcional)</p>
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: paciente aguarda, ligar ao chegar." />
              </div>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-400">
                {method === 'AUTO_SUGGESTION' ? 'Sugestões' : 'Entregadores com acesso ativo'}
              </p>
              <div className="max-h-[380px] space-y-2 overflow-y-auto pr-1">
                {(method === 'AUTO_SUGGESTION'
                  ? suggestions.map((s) => ({
                      courier: s.courier, score: s.score, distance: s.distance, reasons: s.reasons,
                    }))
                  : activeCouriers.map((c) => {
                      const dist = c.current_latitude != null && selected.pickup_latitude != null && c.current_longitude != null && selected.pickup_longitude != null
                        ? distanceKm({ lat: c.current_latitude, lng: c.current_longitude }, { lat: selected.pickup_latitude, lng: selected.pickup_longitude })
                        : null
                      return { courier: c, score: null as number | null, distance: dist, reasons: [] as string[] }
                    })
                ).map((s) => {
                  const isSel = chosenCourier?.id === s.courier.id
                  return (
                    <button
                      key={s.courier.id}
                      onClick={() => setChosenCourier(s.courier)}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        isSel ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600/20' : 'border-ink-200 hover:border-ink-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-ink-900">{s.courier.full_name}</p>
                          <p className="text-[11px] text-ink-500">
                            {[s.courier.base_city, s.courier.service_zone].filter(Boolean).join(' · ') || 'Região não informada'}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className={`badge ${AVAILABILITY_CLASS[s.courier.availability]}`}>
                            {AVAILABILITY_LABEL[s.courier.availability]}
                          </span>
                          {s.score != null && <p className="mt-1 text-[10px] font-semibold text-brand-700">score {s.score}</p>}
                        </div>
                      </div>
                      {s.reasons.length > 0 && (
                        <p className="mt-1.5 text-[10.5px] text-ink-500">{s.reasons.join(' · ')}</p>
                      )}
                      {s.distance != null && (
                        <p className="mt-1 inline-flex items-center gap-1 text-[10.5px] text-ink-600">
                          <MapPin className="h-3 w-3" /> {km(s.distance)} até a coleta
                        </p>
                      )}
                    </button>
                  )
                })}
                {method === 'AUTO_SUGGESTION' && suggestions.length === 0 && (
                  <div className="rounded-xl bg-ink-50 p-4 text-center text-xs text-ink-500">
                    <XCircle className="mx-auto mb-1 h-4 w-4" /> Nenhum entregador ativo disponível.
                  </div>
                )}
              </div>
              <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-ink-50 px-3 py-2 text-[11px] text-ink-600">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                A distância é calculada com base na última posição compartilhada. Se o entregador não autoriza o
                GPS, a sugestão considera apenas cidade/região e disponibilidade.
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
