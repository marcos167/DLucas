import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, LocateFixed, Scissors, Send, Shuffle, UserRoundCog, Wand2,
} from 'lucide-react'
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Select, Skeleton } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { errorMessage, useApiMutation } from '@/hooks/useApiMutation'
import { listCouriers } from '@/lib/api'
import { geocodeAddress } from '@/lib/geocode'
import * as api from '@/lib/logistics/api'
import { zipPrefixLabel } from '@/lib/logistics/cep'
import {
  formatDistance, formatDuration, MANIFEST_OUTCOME, MANIFEST_STATUS, PACKAGE_STATUS, ROUTE_STATUS, routeName, STOP_STATUS,
} from '@/lib/logistics/labels'
import { matrixProviderFromEnv, type LatLng } from '@/lib/logistics/matrix'
import {
  addStop, buildStops, moveStop, optimizeStopSequence, organizeRoutes, planMetaPayload, removeStop, toPlanPayload,
  type OrganizeResult, type PlanRoute,
} from '@/lib/logistics/organizer'
import type { PlanPackage, PlanRouteRow } from '@/lib/logistics/types'
import { formatDateTime } from '@/lib/utils'

const provider = () => matrixProviderFromEnv(import.meta.env as Record<string, string | undefined>)
const pointOf = (item: { latitude: number | null; longitude: number | null }): LatLng | null =>
  (item.latitude != null && item.longitude != null ? { lat: item.latitude, lng: item.longitude } : null)

function fromSaved(routes: PlanRouteRow[]): PlanRoute[] {
  return routes.map((route) => ({
    origin: route.origin === 'MANUAL' ? 'MANUAL' : 'AUTO',
    distanceM: route.planned_distance_m ?? 0,
    durationS: route.planned_duration_s ?? 0,
    stops: route.stops.map((stop) => ({
      key: stop.address_key, zip: stop.zip_code, street: stop.street, number: stop.number, district: stop.district,
      city: stop.city, point: pointOf(stop), packageIds: stop.packages.map((pkg) => pkg.id),
      legDistanceM: stop.leg_distance_m, legDurationS: stop.leg_duration_s,
    })),
  }))
}

export default function CourierRoutes() {
  const { batchId = '', courierId = '' } = useParams()
  const { profile } = useAuth()
  const { push } = useToast()
  const canOperate = ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER'].includes(profile?.role ?? '')
  const plan = useQuery({
    queryKey: ['logistics', 'plan', batchId, courierId],
    queryFn: () => api.courierPlan(batchId, courierId), refetchInterval: 30_000,
  })
  const settings = useQuery({ queryKey: ['logistics', 'settings'], queryFn: api.getDistributionSettings })
  const couriers = useQuery({ queryKey: ['couriers'], queryFn: listCouriers })

  const [draft, setDraft] = useState<PlanRoute[] | null>(null)
  const [meta, setMeta] = useState<OrganizeResult['meta'] | null>(null)
  const [options, setOptions] = useState({ stops: '2', packages: '4', legKm: '1.5' })
  const [working, setWorking] = useState<string | null>(null)
  const [transfer, setTransfer] = useState<PlanRouteRow | null>(null)

  useEffect(() => {
    if (settings.data) {
      setOptions({
        stops: String(settings.data.stops_per_route), packages: String(settings.data.packages_per_route),
        legKm: settings.data.max_leg_km == null ? '' : String(settings.data.max_leg_km),
      })
    }
  }, [settings.data])

  const start: LatLng | null = settings.data?.hub ? { lat: settings.data.hub.latitude, lng: settings.data.hub.longitude } : null
  const packages = useMemo(() => plan.data?.packages ?? [], [plan.data])
  const byId = useMemo(() => new Map(packages.map((pkg) => [pkg.id, pkg])), [packages])
  const savedDrafts = useMemo(() => (plan.data?.routes ?? []).filter((route) => route.status === 'DRAFT'), [plan.data])
  const liveRoutes = (plan.data?.routes ?? []).filter((route) => route.status !== 'DRAFT')
  const plannable = useMemo(
    () => packages.filter((pkg) => pkg.status === 'ASSIGNED' || (pkg.status === 'ROUTED' && pkg.route_status === 'DRAFT')),
    [packages],
  )
  const editing = draft ?? fromSaved(savedDrafts)
  const placed = new Set(editing.flatMap((route) => route.stops.flatMap((stop) => stop.packageIds)))
  const outside = plannable.filter((pkg) => !placed.has(pkg.id))
  const unlocated = plannable.filter((pkg) => pkg.latitude == null || pkg.longitude == null)
  // os rascunhos são numerados depois do último roteiro já liberado (transferências deixam lacunas)
  const liveCount = Math.max(0, ...liveRoutes.map((route) => route.sequence))

  const edit = (next: PlanRoute[]) => { setDraft(next); setMeta(null) }
  const refetch = () => plan.refetch()

  async function generate() {
    const number = (value: string, fallback: number) => (Number(value.replace(',', '.')) > 0 ? Number(value.replace(',', '.')) : fallback)
    setWorking('Organizando os roteiros…')
    try {
      const result = await organizeRoutes(plannable, {
        stopsPerRoute: Math.round(number(options.stops, 2)), packagesPerRoute: Math.round(number(options.packages, 4)),
        maxLegKm: options.legKm.trim() === '' ? null : number(options.legKm, 1.5), start,
      }, provider())
      setDraft(result.routes)
      setMeta(result.meta)
      if (result.meta.fallbackUsed) push({ tone: 'info', message: 'O serviço de mapas não respondeu; as distâncias foram estimadas em linha reta.' })
    } catch (cause) {
      push({ tone: 'error', message: errorMessage(cause).message })
    } finally {
      setWorking(null)
    }
  }

  async function locate() {
    const groups = new Map<string, PlanPackage[]>()
    for (const pkg of unlocated) groups.set(pkg.address_key, [...(groups.get(pkg.address_key) ?? []), pkg])
    const list = [...groups.values()].slice(0, 40)
    let found = 0
    try {
      for (const [index, group] of list.entries()) {
        setWorking(`Localizando endereço ${index + 1} de ${list.length}…`)
        const [first] = group
        const result = await geocodeAddress([`${first.street}${first.number ? `, ${first.number}` : ''}`, first.district, first.city, first.zip_code, 'Brasil'].filter(Boolean).join(', '))
        if (result) {
          found++
          for (const pkg of group) await api.updatePackageAddress(pkg.id, { latitude: result.lat, longitude: result.lng, geocode_source: 'NOMINATIM' })
        }
        // o serviço público de endereços aceita uma consulta por segundo
        if (index < list.length - 1) await new Promise((resolve) => setTimeout(resolve, 1100))
      }
      push({ tone: found === list.length ? 'success' : 'info', message: `${found} de ${list.length} endereço(s) localizado(s).`,
        detail: found < list.length ? 'Os demais entram no roteiro pela proximidade do CEP.' : undefined })
      await refetch()
    } catch (cause) {
      push({ tone: 'error', message: errorMessage(cause).message })
    } finally {
      setWorking(null)
    }
  }

  const save = useApiMutation({
    mutationFn: () => api.saveRoutePlan(batchId, courierId, toPlanPayload(editing), planMetaPayload(meta)),
    successMessage: (result) => `${result.routes} roteiro(s) salvo(s) com ${result.packages} pacote(s).`,
    onSuccess: () => { setDraft(null); setMeta(null); void refetch() },
  })
  const changeStatus = useApiMutation({
    mutationFn: (input: { ids: string[]; action: 'RELEASE' | 'UNRELEASE' | 'CANCEL' }) => api.setRoutesStatus(input.ids, input.action),
    successMessage: (result, input) => {
      const verb = input.action === 'RELEASE' ? 'liberado(s)' : input.action === 'UNRELEASE' ? 'recolhido(s)' : 'cancelado(s)'
      return `${result.changed} roteiro(s) ${verb}${result.skipped ? ` · ${result.skipped} não puderam ser alterados (já em uso)` : ''}.`
    },
    onSuccess: () => void refetch(),
  })
  const optimize = useApiMutation({
    mutationFn: async (route: PlanRouteRow) => {
      const pending = route.stops.filter((stop) => stop.status === 'PENDING')
      const result = await optimizeStopSequence(pending.map((stop) => ({ id: stop.id, zip: stop.zip_code, point: pointOf(stop) })), start, provider())
      return api.reorderRouteStops(route.id, result.order, {
        algorithm: result.algorithm, provider: result.provider, fallback_used: result.fallbackUsed,
        distance_m: Math.round(result.distanceM), duration_s: Math.round(result.durationS), legs: result.legs,
      })
    },
    successMessage: 'Ordem das paradas pendentes recalculada.',
    onSuccess: () => void refetch(),
  })
  const forceClose = useApiMutation({
    mutationFn: (input: { id: string; note: string }) => api.closeManifest(input.id, true, input.note),
    successMessage: 'Conferência fechada com a divergência anotada.',
    onSuccess: () => void refetch(),
  })

  function shift(routeIndex: number, stopIndex: number, direction: -1 | 1) {
    const route = editing[routeIndex]
    const target = stopIndex + direction
    if (target >= 0 && target < route.stops.length) { edit(moveStop(editing, { route: routeIndex, stop: stopIndex }, { route: routeIndex, stop: target }, start)); return }
    const neighbour = routeIndex + direction
    if (neighbour >= 0 && neighbour < editing.length) {
      edit(moveStop(editing, { route: routeIndex, stop: stopIndex }, { route: neighbour, stop: direction === 1 ? 0 : editing[neighbour].stops.length }, start))
    }
  }
  function detach(routeIndex: number, stopIndex: number) {
    const { routes, removed } = removeStop(editing, { route: routeIndex, stop: stopIndex }, start)
    if (removed) edit(addStop(routes, removed, 'new', start))
  }

  if (plan.isLoading) return <Skeleton className="h-72 w-full rounded-2xl" />
  if (plan.isError || !plan.data?.courier) {
    return <Alert tone="danger" title="Não foi possível carregar os roteiros">{plan.isError ? (plan.error as Error).message : 'Funcionário não encontrado.'}</Alert>
  }
  const courier = plan.data.courier
  const over = packages.length > courier.limit

  return (
    <div className="space-y-4">
      <Link to={`/app/distribuicao?lote=${batchId}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> Voltar ao lote
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-xl font-bold text-ink-950">{courier.full_name}</h2>
        <Badge tone={over ? 'danger' : 'neutral'}>{packages.length} / {courier.limit} pacotes</Badge>
        {!courier.has_login && <Badge tone="warning">Sem acesso ao aplicativo</Badge>}
        {courier.status !== 'ACTIVE' && <Badge tone="danger">Inativo</Badge>}
      </div>
      {!courier.has_login && (
        <Alert tone="warning" title="Este funcionário não tem login">
          Os roteiros podem ser montados e liberados, mas ele só os verá no aplicativo depois que um usuário for vinculado ao cadastro.
        </Alert>
      )}

      <Card>
        <CardHeader
          title={`Planejamento · ${plannable.length} pacote(s) a roteirizar`}
          description="Gere os roteiros automaticamente e ajuste à mão o que for preciso. Só o que está em rascunho é substituído; roteiros liberados não mudam."
        />
        <div className="space-y-4 p-4 sm:p-5">
          {canOperate && plannable.length > 0 && (
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Paradas por roteiro" className="w-36"><Input value={options.stops} inputMode="numeric" onChange={(event) => setOptions({ ...options, stops: event.target.value })} /></Field>
              <Field label="Pacotes por roteiro" className="w-36"><Input value={options.packages} inputMode="numeric" onChange={(event) => setOptions({ ...options, packages: event.target.value })} /></Field>
              <Field label="Trecho máximo (km)" className="w-40"><Input value={options.legKm} inputMode="decimal" placeholder="Sem limite" onChange={(event) => setOptions({ ...options, legKm: event.target.value })} /></Field>
              <Button onClick={() => void generate()} loading={working !== null} icon={<Wand2 className="h-4 w-4" />}>Gerar roteiros</Button>
              {unlocated.length > 0 && (
                <Button variant="secondary" onClick={() => void locate()} disabled={working !== null} icon={<LocateFixed className="h-4 w-4" />}>
                  Localizar {new Set(unlocated.map((pkg) => pkg.address_key)).size} endereço(s) no mapa
                </Button>
              )}
            </div>
          )}
          {working && <p className="text-sm text-ink-600">{working}</p>}
          {unlocated.length > 0 && !working && (
            <p className="text-[12.5px] text-ink-500">
              {unlocated.length} pacote(s) sem posição no mapa: entram no roteiro pela proximidade do CEP, sem distância calculada.
              A localização consulta o serviço público de endereços (OpenStreetMap).
            </p>
          )}

          {draft && (
            <Alert tone="info" title="Alterações ainda não salvas">
              {meta
                ? `${editing.length} roteiro(s), ${meta.stops} parada(s), ${meta.packages} pacote(s) · ${formatDistance(meta.totalDistanceM)} · ${formatDuration(meta.totalDurationS)} de deslocamento estimado.`
                : `${editing.length} roteiro(s) ajustado(s) manualmente.`}
            </Alert>
          )}

          {editing.length === 0 ? (
            <EmptyState
              title={plannable.length === 0 ? 'Nada a roteirizar' : 'Nenhum roteiro em rascunho'}
              description={plannable.length === 0 ? 'Todos os pacotes deste funcionário já estão em roteiros liberados.' : 'Use “Gerar roteiros” para montar o dia.'}
            />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {editing.map((route, routeIndex) => (
                <div key={routeIndex} className="rounded-2xl border border-ink-200 bg-white">
                  <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-3.5 py-2.5">
                    <p className="text-sm font-semibold text-ink-950">{routeName(liveCount + routeIndex + 1)}</p>
                    <p className="text-[11.5px] text-ink-500">
                      {route.stops.length} parada(s) · {route.stops.reduce((sum, stop) => sum + stop.packageIds.length, 0)} pacote(s)
                      {route.distanceM > 0 ? ` · ${formatDistance(route.distanceM)}` : ''}{route.origin === 'MANUAL' ? ' · manual' : ''}
                    </p>
                  </div>
                  <ol className="divide-y divide-ink-100">
                    {route.stops.map((stop, stopIndex) => (
                      <li key={stop.key} className="flex items-start gap-2 px-3.5 py-2.5 text-[12.5px]">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[11px] font-bold text-ink-700">{stopIndex + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-ink-900">{stop.street}{stop.number ? `, ${stop.number}` : ''}</p>
                          <p className="text-ink-500">
                            {stop.packageIds.map((id) => byId.get(id)?.tracking_code ?? '?').join(', ')}
                            {stop.legDistanceM != null ? ` · ${formatDistance(stop.legDistanceM)}` : stop.point ? '' : ' · sem posição no mapa'}
                          </p>
                        </div>
                        {canOperate && (
                          <div className="flex shrink-0 gap-0.5">
                            <IconButton label="Antes" onClick={() => shift(routeIndex, stopIndex, -1)} disabled={routeIndex === 0 && stopIndex === 0}><ArrowUp className="h-3.5 w-3.5" /></IconButton>
                            <IconButton label="Depois" onClick={() => shift(routeIndex, stopIndex, 1)}
                              disabled={routeIndex === editing.length - 1 && stopIndex === route.stops.length - 1}><ArrowDown className="h-3.5 w-3.5" /></IconButton>
                            <IconButton label="Separar em um roteiro novo" onClick={() => detach(routeIndex, stopIndex)} disabled={route.stops.length === 1}><Scissors className="h-3.5 w-3.5" /></IconButton>
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}

          {outside.length > 0 && editing.length > 0 && (
            <Alert tone="warning" title={`${outside.length} pacote(s) fora dos roteiros`}>
              <span className="block">Ficaram sem roteiro neste planejamento. Gere de novo ou inclua cada endereço em um roteiro novo:</span>
              <span className="mt-2 flex flex-wrap gap-1.5">
                {buildStops(outside).map((stop) => (
                  <button key={stop.key} type="button" className="btn-secondary btn-sm" disabled={!canOperate} onClick={() => edit(addStop(editing, stop, 'new', start))}>
                    + {stop.street}{stop.number ? `, ${stop.number}` : ''} ({stop.packageIds.length})
                  </button>
                ))}
              </span>
            </Alert>
          )}

          {canOperate && (
            <div className="flex flex-wrap gap-2">
              {draft && (
                <>
                  <Button loading={save.isPending} onClick={() => save.mutate()}>Salvar roteiros</Button>
                  <Button variant="ghost" onClick={() => { setDraft(null); setMeta(null) }}>Descartar alterações</Button>
                </>
              )}
              {!draft && savedDrafts.length > 0 && (
                <>
                  <Button loading={changeStatus.isPending} icon={<Send className="h-4 w-4" />}
                    onClick={() => changeStatus.mutate({ ids: savedDrafts.map((route) => route.id), action: 'RELEASE' })}>
                    Liberar {savedDrafts.length} roteiro(s) para o entregador
                  </Button>
                  <Button variant="ghost" onClick={() => {
                    if (window.confirm('Apagar os roteiros em rascunho? Os pacotes continuam com o funcionário.')) {
                      changeStatus.mutate({ ids: savedDrafts.map((route) => route.id), action: 'CANCEL' })
                    }
                  }}>Apagar rascunhos</Button>
                </>
              )}
            </div>
          )}
        </div>
      </Card>

      {liveRoutes.length > 0 && (
        <Card>
          <CardHeader title={`Roteiros liberados (${liveRoutes.length})`} description="O entregador vê estes roteiros no aplicativo. Para mudar o conteúdo, recolha o roteiro antes." />
          <div className="divide-y divide-ink-100">
            {liveRoutes.map((route) => {
              const pending = route.stops.filter((stop) => stop.status === 'PENDING').length
              const status = ROUTE_STATUS[route.status]
              return (
                <div key={route.id} className="px-4 py-3.5 sm:px-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-ink-950">{routeName(route.sequence)}</p>
                    <Badge tone={status.tone}>{status.label}</Badge>
                    <span className="text-[12px] text-ink-500">
                      {route.zip_prefix ? `${zipPrefixLabel(route.zip_prefix)} · ` : ''}{route.stop_count} parada(s) · {route.package_count} pacote(s)
                      {route.planned_distance_m ? ` · ${formatDistance(route.planned_distance_m)}` : ''}
                      {route.transferred_from_name ? ` · recebido de ${route.transferred_from_name}` : ''}
                      {route.started_at ? ` · iniciado ${formatDateTime(route.started_at)}` : ''}
                    </span>
                    {canOperate && (
                      <span className="ml-auto flex flex-wrap gap-1.5">
                        {pending > 1 && (
                          <Button size="sm" variant="ghost" loading={optimize.isPending && optimize.variables?.id === route.id} onClick={() => optimize.mutate(route)}
                            icon={<ArrowUpDown className="h-3.5 w-3.5" />}>Otimizar ordem</Button>
                        )}
                        {(route.status === 'RELEASED' || route.status === 'IN_PROGRESS') && (
                          <Button size="sm" variant="secondary" onClick={() => setTransfer(route)} icon={<UserRoundCog className="h-3.5 w-3.5" />}>Transferir</Button>
                        )}
                        {route.status === 'RELEASED' && (
                          <Button size="sm" variant="ghost" onClick={() => changeStatus.mutate({ ids: [route.id], action: 'UNRELEASE' })} icon={<Shuffle className="h-3.5 w-3.5" />}>Recolher</Button>
                        )}
                      </span>
                    )}
                  </div>
                  <ol className="mt-2 space-y-1 text-[12.5px]">
                    {route.stops.map((stop) => (
                      <li key={stop.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-mono text-ink-400">{stop.sequence}.</span>
                        <span className="font-medium text-ink-800">{stop.street}{stop.number ? `, ${stop.number}` : ''}</span>
                        {stop.sequence !== stop.planned_sequence && <span className="text-[11px] text-ink-400">(planejado: {stop.planned_sequence}º)</span>}
                        {stop.status !== 'PENDING' && <Badge tone={STOP_STATUS[stop.status].tone}>{STOP_STATUS[stop.status].label}</Badge>}
                        <span className="text-ink-500">
                          {stop.packages.map((pkg) => `${pkg.tracking_code} (${PACKAGE_STATUS[pkg.status].label.toLowerCase()})`).join(', ')}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {plan.data.manifests.length > 0 && (
        <Card>
          <CardHeader title="Conferências de saída e retorno" description="O que saiu com o funcionário e que fim levou cada pacote." />
          <div className="divide-y divide-ink-100">
            {plan.data.manifests.map((manifest) => {
              const open = manifest.items.filter((item) => item.outcome === 'OPEN')
              return (
                <div key={manifest.id} className="px-4 py-3.5 text-[13px] sm:px-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink-950">Viagem {manifest.trip_number}</p>
                    <Badge tone={manifest.status === 'CLOSED' ? 'neutral' : 'brand'}>{MANIFEST_STATUS[manifest.status]}</Badge>
                    <span className="text-[12px] text-ink-500">
                      {manifest.items.length} conferido(s) · aberta {formatDateTime(manifest.opened_at)}
                      {manifest.departed_at ? ` · saída ${formatDateTime(manifest.departed_at)}` : ''}{manifest.closed_at ? ` · fechada ${formatDateTime(manifest.closed_at)}` : ''}
                    </span>
                    {canOperate && manifest.status !== 'CLOSED' && (
                      <Button size="sm" variant="ghost" className="ml-auto" loading={forceClose.isPending} onClick={() => {
                        const note = window.prompt(open.length > 0
                          ? `Fechar com ${open.length} pacote(s) em aberto (${open.map((item) => item.tracking_code).join(', ')})? Descreva a divergência:`
                          : 'Fechar a conferência pelo funcionário? Observação:')
                        if (note !== null && (open.length === 0 || note.trim())) forceClose.mutate({ id: manifest.id, note: note.trim() })
                      }}>Fechar pela central</Button>
                    )}
                  </div>
                  {manifest.divergence_note && <p className="mt-1 text-amber-800">Divergência: {manifest.divergence_note}</p>}
                  <p className="mt-1.5 flex flex-wrap gap-1.5">
                    {manifest.items.map((item) => (
                      <Badge key={item.package_id} tone={MANIFEST_OUTCOME[item.outcome].tone}>{item.tracking_code} · {MANIFEST_OUTCOME[item.outcome].label}</Badge>
                    ))}
                  </p>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {transfer && (
        <TransferModal route={transfer} currentCourierId={courierId} couriers={couriers.data ?? []}
          onClose={() => setTransfer(null)} onDone={() => { setTransfer(null); void refetch() }} />
      )}
    </div>
  )
}

function IconButton({ label, children, ...rest }: { label: string; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" title={label} aria-label={label} {...rest}
      className="rounded-lg border border-ink-200 p-1 text-ink-600 hover:bg-ink-50 disabled:opacity-30">{children}</button>
  )
}

function TransferModal({ route, currentCourierId, couriers, onClose, onDone }: {
  route: PlanRouteRow; currentCourierId: string
  couriers: { id: string; full_name: string; status: string }[]; onClose: () => void; onDone: () => void
}) {
  const [target, setTarget] = useState('')
  const [reason, setReason] = useState('')
  const partial = route.status === 'IN_PROGRESS'
  const transfer = useApiMutation({
    mutationFn: () => api.transferRoute(route.id, target, reason.trim() || null),
    successMessage: (result) => `${result.packages} pacote(s) transferido(s)${result.partial ? ' em um roteiro novo; o que já foi feito ficou no original' : ''}.`,
    onSuccess: onDone,
  })
  return (
    <Modal open onClose={onClose} title={`Transferir ${routeName(route.sequence)}`}
      description={partial
        ? 'Roteiro em andamento: só os pacotes ainda não resolvidos passam para a outra pessoa, em um roteiro novo. Pacotes que já saíram precisam ser conferidos de novo por quem receber.'
        : 'O roteiro inteiro passa para a outra pessoa. Se algo já estava conferido, quem receber confere de novo.'}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={!target} loading={transfer.isPending} onClick={() => transfer.mutate()}>Transferir</Button>
        </>
      )}>
      <div className="space-y-3">
        <Field label="Novo responsável" required>
          <Select value={target} onChange={(event) => setTarget(event.target.value)}>
            <option value="">Selecione…</option>
            {couriers.filter((courier) => courier.status === 'ACTIVE' && courier.id !== currentCourierId)
              .map((courier) => <option key={courier.id} value={courier.id}>{courier.full_name}</option>)}
          </Select>
        </Field>
        <Field label="Motivo" hint="Fica no histórico do roteiro e dos pacotes">
          <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ex.: veículo quebrou" />
        </Field>
      </div>
    </Modal>
  )
}
