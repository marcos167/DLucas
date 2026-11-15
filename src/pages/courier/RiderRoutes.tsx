import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, CheckCircle2, ChevronRight, CloudOff, MapPin, PackageCheck, RefreshCw, Route as RouteIcon, ScanLine,
} from 'lucide-react'
import { Alert, Badge, Button, EmptyState, Modal, Progress, Skeleton } from '@/components/ui'
import { zipPrefixLabel } from '@/lib/logistics/cep'
import {
  conflictLabel, describeEntry, MANIFEST_STATUS, ROUTE_STATUS, routeName,
} from '@/lib/logistics/labels'
import { dayProgress } from '@/lib/logistics/offline/queue'
import type { RiderRoute } from '@/lib/logistics/types'
import { formatDateTime, relativeTime } from '@/lib/utils'
import { useRider } from './rider/RiderContext'

function routeCounts(route: RiderRoute) {
  const packages = route.stops.flatMap((stop) => stop.packages)
  const resolved = packages.filter((pkg) => ['DELIVERED', 'FAILED', 'RETURNED'].includes(pkg.status)).length
  return { packages: packages.length, resolved, stopsDone: route.stops.filter((stop) => stop.status !== 'PENDING').length }
}

export default function RiderRoutes() {
  const { day, entries, pending, attention, online, syncing, loading, error, sync, retry, dismiss, courierId } = useRider()
  const [showQueue, setShowQueue] = useState(false)

  if (!courierId) {
    return <Alert tone="warning" title="Cadastro não vinculado">Seu usuário ainda não tem cadastro de entregador. Fale com a central.</Alert>
  }
  if (loading && !day) {
    return <div className="space-y-3"><Skeleton className="h-24 w-full rounded-2xl" /><Skeleton className="h-20 w-full rounded-2xl" /><Skeleton className="h-20 w-full rounded-2xl" /></div>
  }

  const progress = dayProgress(day)
  const routes = day?.routes ?? []
  const active = routes.filter((route) => route.status !== 'COMPLETED')
  const finished = routes.filter((route) => route.status === 'COMPLETED')
  const manifest = day?.manifests.filter((item) => item.status !== 'CLOSED').at(-1) ?? null
  const notLoaded = active.flatMap((route) => route.stops.flatMap((stop) => stop.packages))
    .filter((pkg) => pkg.status === 'ROUTED' || pkg.status === 'RETURNED').length
  const troubled = entries.filter((entry) => entry.state !== 'PENDING')

  return (
    <div className="space-y-4">
      {!online && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12.5px] text-amber-900">
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Sem internet</p>
            <p>Pode continuar: o que você registrar fica guardado neste aparelho e sobe sozinho quando a conexão voltar.</p>
          </div>
        </div>
      )}
      {error && <Alert tone="danger" title="Não foi possível atualizar">{error}</Alert>}

      <button
        type="button" onClick={() => setShowQueue(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-ink-200 bg-white px-4 py-3 text-left"
      >
        <RefreshCw className={`h-4 w-4 shrink-0 text-ink-500 ${syncing ? 'animate-spin' : ''}`} />
        <div className="min-w-0 flex-1 text-[12.5px]">
          <p className="font-semibold text-ink-900">
            {pending > 0 ? `${pending} registro(s) aguardando envio` : attention > 0 ? 'Há registros que precisam de atenção' : 'Tudo enviado'}
          </p>
          <p className="truncate text-ink-500">
            {day ? `Atualizado ${relativeTime(day.fetchedAt)}` : 'Ainda sem dados do servidor'}
          </p>
        </div>
        {attention > 0 && <Badge tone="danger">{attention}</Badge>}
        <ChevronRight className="h-4 w-4 text-ink-400" />
      </button>

      <div className="rounded-2xl border border-ink-200 bg-white p-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Hoje</p>
            <p className="font-display text-2xl font-bold text-ink-950">{progress.delivered}<span className="text-base font-medium text-ink-400"> / {progress.packages} pacotes</span></p>
          </div>
          <p className="text-right text-[12px] text-ink-500">
            {progress.routesDone} de {progress.routes} roteiros<br />{progress.addresses} endereços
          </p>
        </div>
        <div className="mt-3"><Progress value={progress.packages ? ((progress.delivered + progress.failed) / progress.packages) * 100 : 0} /></div>
        <div className="mt-2 flex gap-3 text-[11.5px] text-ink-600">
          <span>{progress.pending} a entregar</span>
          {progress.failed > 0 && <span className="font-semibold text-red-700">{progress.failed} não entregue(s)</span>}
        </div>
      </div>

      {routes.length > 0 && (
        <Link to="/entregador/conferencia" className="flex items-center gap-3 rounded-2xl border border-ink-200 bg-white px-4 py-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-800"><ScanLine className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1 text-[12.5px]">
            <p className="font-semibold text-ink-900">Conferência de pacotes</p>
            <p className="text-ink-500">
              {manifest
                ? `${MANIFEST_STATUS[manifest.status]} · ${manifest.items.length} conferido(s)`
                : notLoaded > 0 ? `${notLoaded} pacote(s) para conferir antes de sair` : 'Nenhuma conferência aberta'}
            </p>
          </div>
          {manifest?.status !== 'DEPARTED' && notLoaded > 0 && <Badge tone="warning">{notLoaded}</Badge>}
          <ChevronRight className="h-4 w-4 text-ink-400" />
        </Link>
      )}

      {routes.length === 0 ? (
        <div className="rounded-2xl border border-ink-200 bg-white">
          <EmptyState
            icon={<RouteIcon className="h-6 w-6" />}
            title="Nenhum roteiro liberado"
            description="Quando a central liberar seus roteiros do dia, eles aparecem aqui."
            action={<Button variant="secondary" size="sm" loading={syncing} onClick={() => void sync()}>Atualizar</Button>}
          />
        </div>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500">Roteiros ({active.length})</h2>
            {active.length === 0 && (
              <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-medium text-emerald-900">
                <CheckCircle2 className="h-4 w-4" /> Todos os roteiros do dia foram concluídos.
              </div>
            )}
            {active.map((route) => <RouteCard key={route.id} route={route} />)}
          </section>
          {finished.length > 0 && (
            <section className="space-y-2">
              <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500">Concluídos ({finished.length})</h2>
              {finished.map((route) => <RouteCard key={route.id} route={route} />)}
            </section>
          )}
        </>
      )}

      <Modal
        open={showQueue} onClose={() => setShowQueue(false)} title="Envio dos registros"
        description={online ? 'Os registros sobem sozinhos; aqui você acompanha.' : 'Sem internet no momento. Nada se perde.'}
        footer={<Button loading={syncing} onClick={() => void sync()} icon={<RefreshCw className="h-4 w-4" />}>Enviar agora</Button>}
      >
        {entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-500">Nenhum registro guardado neste aparelho.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {troubled.concat(entries.filter((entry) => entry.state === 'PENDING')).map((entry) => (
              <li key={entry.id} className="py-3 text-[13px]">
                <div className="flex items-start gap-2">
                  {entry.state === 'PENDING'
                    ? <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
                    : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-900">{describeEntry(entry)}</p>
                    <p className="text-[11.5px] text-ink-500">{formatDateTime(entry.createdAt)}</p>
                    {entry.state === 'CONFLICT' && (
                      <p className="mt-1 text-[12px] text-red-700">
                        {conflictLabel(entry.detail)}.{' '}
                        {entry.op.type === 'ATTEMPT' || entry.op.type === 'PROOF'
                          ? 'O registro foi guardado e a central vai decidir se ele vale.'
                          : 'Nada foi alterado.'}
                      </p>
                    )}
                    {entry.state === 'FAILED' && <p className="mt-1 text-[12px] text-red-700">Não foi aceito: {entry.detail}</p>}
                  </div>
                </div>
                {entry.state !== 'PENDING' && (
                  <div className="mt-2 flex justify-end gap-2">
                    {entry.state === 'FAILED' && <Button size="sm" variant="secondary" onClick={() => void retry(entry.id)}>Tentar de novo</Button>}
                    <Button size="sm" variant="ghost" onClick={() => void dismiss(entry.id)}>
                      {entry.state === 'CONFLICT' ? 'Entendi' : 'Descartar'}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  )
}

function RouteCard({ route }: { route: RiderRoute }) {
  const counts = routeCounts(route)
  const status = ROUTE_STATUS[route.status]
  const first = route.stops.find((stop) => stop.status === 'PENDING') ?? route.stops[0]
  return (
    <Link to={`/entregador/rotas/${route.id}`} className="block rounded-2xl border border-ink-200 bg-white px-4 py-3 active:bg-ink-50">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-950 text-[13px] font-bold text-white">
          {String(route.sequence).padStart(2, '0')}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13.5px] font-semibold text-ink-950">{routeName(route.sequence)}</p>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <p className="mt-0.5 flex items-center gap-1 truncate text-[12px] text-ink-500">
            <MapPin className="h-3 w-3 shrink-0" />
            {first ? `${first.street}${first.number ? `, ${first.number}` : ''}` : 'Sem paradas'}
            {route.zip_prefix && <span className="text-ink-400"> · {zipPrefixLabel(route.zip_prefix)}</span>}
          </p>
        </div>
        <div className="text-right text-[11.5px] text-ink-500">
          <p className="flex items-center justify-end gap-1 font-semibold text-ink-800"><PackageCheck className="h-3.5 w-3.5" />{counts.resolved}/{counts.packages}</p>
          <p>{route.stops.length} parada(s)</p>
        </div>
      </div>
      {route.status === 'IN_PROGRESS' && <div className="mt-2.5"><Progress value={counts.packages ? (counts.resolved / counts.packages) * 100 : 0} /></div>}
    </Link>
  )
}
