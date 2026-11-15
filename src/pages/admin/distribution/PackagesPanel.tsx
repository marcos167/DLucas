import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Hand, PackageX, UserCheck } from 'lucide-react'
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, Pagination, SearchInput, Select, Skeleton } from '@/components/ui'
import { useApiMutation } from '@/hooks/useApiMutation'
import * as api from '@/lib/logistics/api'
import { formatZip } from '@/lib/logistics/cep'
import { EXCEPTION_REASON, PACKAGE_STATUS } from '@/lib/logistics/labels'
import type { BatchOverview, ExceptionReason, PackageStatus } from '@/lib/logistics/types'
import type { Courier } from '@/types'
import { PackageDetailModal } from './PackageDetailModal'

const PAGE_SIZE = 50
const FILTERABLE: PackageStatus[] = ['RECEIVED', 'EXCEPTION', 'ASSIGNED', 'ROUTED', 'LOADED', 'DELIVERED', 'FAILED', 'RETURNED', 'CANCELLED']

/** Lista de pacotes do lote com seleção e ações em grupo. `exceptions` fixa o filtro nas pendências. */
export function PackagesPanel({ batchId, couriers, overview, canOperate, exceptions = false, onChanged }: {
  batchId: string
  couriers: Courier[]
  overview: BatchOverview | undefined
  canOperate: boolean
  exceptions?: boolean
  onChanged: () => void
}) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<PackageStatus | ''>('')
  const [courierId, setCourierId] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [assigning, setAssigning] = useState(false)
  const [detail, setDetail] = useState<string | null>(null)

  useEffect(() => { setPage(1); setSelected(new Set()) }, [batchId, search, status, courierId, exceptions])

  const query = useQuery({
    queryKey: ['logistics', 'packages', batchId, exceptions, search, status, courierId, page],
    queryFn: () => api.listPackages(batchId, {
      statuses: exceptions ? ['EXCEPTION'] : status ? [status] : undefined,
      courier_id: courierId || null, search: search.trim() || undefined,
      limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
    }),
    placeholderData: (previous) => previous,
  })
  const items = query.data?.items ?? []
  const ids = [...selected]
  const done = () => { setSelected(new Set()); void query.refetch(); onChanged() }

  const hold = useApiMutation({
    mutationFn: (release: boolean) => api.holdPackages(ids, !release, null),
    successMessage: (result, release) => `${result.changed} pacote(s) ${release ? 'devolvido(s) à distribuição' : 'retido(s) para revisão'}${result.skipped ? ` · ${result.skipped} ignorado(s)` : ''}.`,
    onSuccess: done,
  })
  const cancel = useApiMutation({
    mutationFn: (reason: string) => api.cancelPackages(ids, reason),
    successMessage: (result) => `${result.cancelled} pacote(s) cancelado(s)${result.skipped ? ` · ${result.skipped} não podem ser cancelados` : ''}.`,
    onSuccess: done,
  })

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const allOnPage = items.length > 0 && items.every((item) => selected.has(item.id))
  const reasons = Object.entries(overview?.totals.exceptions ?? {}) as [ExceptionReason, number][]

  return (
    <div className="space-y-3">
      {exceptions && reasons.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {reasons.map(([reason, count]) => (
            <div key={reason} className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
              <p className="text-[13px] font-semibold text-amber-950">{count} · {EXCEPTION_REASON[reason].label}</p>
              <p className="text-[12px] text-amber-900">{EXCEPTION_REASON[reason].help}</p>
            </div>
          ))}
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 p-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Código, destinatário ou CEP" className="min-w-[220px] flex-1" />
          {!exceptions && (
            <div className="w-48">
              <Select value={status} onChange={(event) => setStatus(event.target.value as PackageStatus | '')}>
                <option value="">Todas as situações</option>
                {FILTERABLE.map((item) => <option key={item} value={item}>{PACKAGE_STATUS[item].label}</option>)}
              </Select>
            </div>
          )}
          {!exceptions && (
            <div className="w-52">
              <Select value={courierId} onChange={(event) => setCourierId(event.target.value)}>
                <option value="">Todos os responsáveis</option>
                {couriers.map((courier) => <option key={courier.id} value={courier.id}>{courier.full_name}</option>)}
              </Select>
            </div>
          )}
        </div>

        {canOperate && selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 bg-brand-50/60 px-3 py-2 text-[13px]">
            <span className="font-semibold text-ink-900">{selected.size} selecionado(s)</span>
            <Button size="sm" onClick={() => setAssigning(true)} icon={<UserCheck className="h-3.5 w-3.5" />}>Atribuir a…</Button>
            {exceptions
              ? <Button size="sm" variant="secondary" loading={hold.isPending} onClick={() => hold.mutate(true)}>Devolver à distribuição</Button>
              : <Button size="sm" variant="secondary" loading={hold.isPending} onClick={() => hold.mutate(false)} icon={<Hand className="h-3.5 w-3.5" />}>Reter para revisão</Button>}
            <Button
              size="sm" variant="ghost" loading={cancel.isPending} icon={<PackageX className="h-3.5 w-3.5" />}
              onClick={() => {
                const reason = window.prompt(`Cancelar ${selected.size} pacote(s)? Informe o motivo:`)
                if (reason && reason.trim()) cancel.mutate(reason.trim())
              }}
            >Cancelar pacotes</Button>
          </div>
        )}

        {query.isLoading ? (
          <div className="space-y-2 p-4"><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /></div>
        ) : query.isError ? (
          <div className="p-4"><Alert tone="danger" title="Não foi possível carregar os pacotes">{(query.error as Error).message}</Alert></div>
        ) : items.length === 0 ? (
          <EmptyState
            title={exceptions ? 'Nenhuma exceção pendente' : 'Nenhum pacote encontrado'}
            description={exceptions ? 'Todos os pacotes do lote têm responsável.' : 'Importe um romaneio ou ajuste os filtros.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  {canOperate && (
                    <th className="w-8">
                      <input type="checkbox" aria-label="Selecionar todos da página" checked={allOnPage}
                        onChange={() => setSelected(allOnPage ? new Set() : new Set(items.map((item) => item.id)))} />
                    </th>
                  )}
                  <th>Código</th><th>Destinatário</th><th>Endereço</th><th>CEP</th><th>Situação</th><th>Responsável</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="cursor-pointer" onClick={() => setDetail(item.id)}>
                    {canOperate && (
                      <td onClick={(event) => event.stopPropagation()}>
                        <input type="checkbox" aria-label={`Selecionar ${item.tracking_code}`} checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
                      </td>
                    )}
                    <td className="font-mono text-[12.5px] font-semibold">{item.tracking_code}</td>
                    <td>{item.recipient_name}</td>
                    <td className="text-ink-600">
                      {item.street}{item.number ? `, ${item.number}` : ''}{item.complement ? ` · ${item.complement}` : ''}
                      {item.district && <span className="block text-[11.5px] text-ink-400">{item.district}</span>}
                    </td>
                    <td className="whitespace-nowrap font-mono text-[12.5px]">
                      {item.zip_code ? formatZip(item.zip_code) : <span className="text-red-600">{item.zip_raw || 'sem CEP'}</span>}
                    </td>
                    <td>
                      <Badge tone={PACKAGE_STATUS[item.status].tone}>{PACKAGE_STATUS[item.status].label}</Badge>
                      {item.status === 'EXCEPTION' && item.exception_reason && (
                        <span className="mt-0.5 block text-[11.5px] text-red-700">
                          {EXCEPTION_REASON[item.exception_reason].label}{item.exception_detail ? ` · ${item.exception_detail}` : ''}
                        </span>
                      )}
                    </td>
                    <td>{item.courier_name ?? <span className="text-ink-400">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={query.data?.total ?? 0} onPage={setPage} />
      </Card>

      {assigning && (
        <AssignModal
          packageIds={ids} couriers={couriers} overview={overview}
          onClose={() => setAssigning(false)} onDone={() => { setAssigning(false); done() }}
        />
      )}
      {detail && (
        <PackageDetailModal packageId={detail} canOperate={canOperate} onClose={() => setDetail(null)} onChanged={() => { void query.refetch(); onChanged() }} />
      )}
    </div>
  )
}

function AssignModal({ packageIds, couriers, overview, onClose, onDone }: {
  packageIds: string[]; couriers: Courier[]; overview: BatchOverview | undefined; onClose: () => void; onDone: () => void
}) {
  const [courierId, setCourierId] = useState('')
  const [reason, setReason] = useState('')
  const load = overview?.couriers.find((courier) => courier.courier_id === courierId)
  const assign = useApiMutation({
    mutationFn: () => api.assignPackages(packageIds, courierId, reason.trim() || null),
    successMessage: (result) => {
      const over = result.load != null && result.limit != null && result.load > result.limit
      return `${result.assigned} pacote(s) atribuído(s)${result.skipped ? ` · ${result.skipped} ignorado(s)` : ''}${over ? ` · atenção: ${result.load} pacotes para um limite de ${result.limit}` : ''}.`
    },
    onSuccess: onDone,
  })
  const active = couriers.filter((courier) => courier.status === 'ACTIVE')
  return (
    <Modal
      open onClose={onClose} title={`Atribuir ${packageIds.length} pacote(s)`}
      description="A atribuição manual vale mesmo acima do limite diário; o excesso fica registrado."
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={!courierId} loading={assign.isPending} onClick={() => assign.mutate()}>Atribuir</Button>
        </>
      )}
    >
      <div className="space-y-3">
        <Field label="Responsável" required>
          <Select value={courierId} onChange={(event) => setCourierId(event.target.value)}>
            <option value="">Selecione…</option>
            {active.map((courier) => {
              const current = overview?.couriers.find((item) => item.courier_id === courier.id)
              return <option key={courier.id} value={courier.id}>{courier.full_name}{current ? ` · ${current.packages}/${current.limit}` : ''}</option>
            })}
          </Select>
        </Field>
        {load && load.packages + packageIds.length > load.limit && (
          <Alert tone="warning" title="Acima do limite diário">
            {load.full_name} ficará com {load.packages + packageIds.length} pacotes; o limite é {load.limit}.
          </Alert>
        )}
        <Field label="Motivo" hint="Fica no histórico do pacote">
          <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ex.: cobertura de férias" />
        </Field>
      </div>
    </Modal>
  )
}
