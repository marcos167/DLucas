import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, FileUp, MapPinned, Plus, Route as RouteIcon, Shuffle } from 'lucide-react'
import {
  Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Progress, Select, Skeleton, StatCard, Tabs, Textarea,
} from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { useApiMutation } from '@/hooks/useApiMutation'
import { listCouriers } from '@/lib/api'
import * as api from '@/lib/logistics/api'
import {
  conflictLabel, EXCEPTION_REASON, MANIFEST_STATUS, PACKAGE_STATUS, todayLocal,
} from '@/lib/logistics/labels'
import type { AttemptConflict, BatchOverview, CourierOverview, ExceptionReason } from '@/lib/logistics/types'
import { formatDateTime, OCCURRENCE_TYPE_LABEL, relativeTime } from '@/lib/utils'
import { ImportModal } from './distribution/ImportModal'
import { PackagesPanel } from './distribution/PackagesPanel'

type Tab = 'resumo' | 'pacotes' | 'excecoes' | 'conflitos'
const formatDay = (date: string) => date.split('-').reverse().join('/')

export default function Distribution() {
  const { profile } = useAuth()
  const canOperate = ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER'].includes(profile?.role ?? '')
  const client = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)

  const batches = useQuery({ queryKey: ['logistics', 'batches'], queryFn: () => api.listBatches() })
  const couriers = useQuery({ queryKey: ['couriers'], queryFn: listCouriers })
  const batchId = params.get('lote') ?? batches.data?.[0]?.id ?? null
  const tab = (params.get('aba') as Tab | null) ?? 'resumo'
  const overview = useQuery({
    queryKey: ['logistics', 'overview', batchId],
    queryFn: () => api.batchOverview(batchId as string),
    enabled: !!batchId, refetchInterval: 20_000,
  })
  const batch = overview.data?.batch ?? batches.data?.find((item) => item.id === batchId) ?? null
  const totals = overview.data?.totals
  const exceptionCount = totals?.by_status.EXCEPTION ?? 0

  const select = (next: Record<string, string>) => {
    const merged = new URLSearchParams(params)
    for (const [key, value] of Object.entries(next)) merged.set(key, value)
    setParams(merged, { replace: true })
  }
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['logistics', 'overview', batchId] })
    void client.invalidateQueries({ queryKey: ['logistics', 'packages', batchId] })
    void client.invalidateQueries({ queryKey: ['logistics', 'conflicts', batchId] })
  }

  const distribute = useApiMutation({
    mutationFn: () => api.distributeBatch(batchId as string),
    successMessage: (result) => {
      const pending = Object.entries(result.exceptions) as [ExceptionReason, number][]
      return result.processed === 0
        ? 'Não havia pacotes aguardando distribuição.'
        : `${result.assigned} de ${result.processed} pacote(s) distribuído(s)${pending.length
          ? ` · exceções: ${pending.map(([reason, count]) => `${count} ${EXCEPTION_REASON[reason].label.toLowerCase()}`).join(', ')}` : ''}.`
    },
    onSuccess: (result) => { refresh(); if (Object.keys(result.exceptions).length > 0) select({ aba: 'excecoes' }) },
  })
  const setStatus = useApiMutation({
    mutationFn: (status: 'OPEN' | 'CLOSED') => api.updateBatch(batchId as string, { status }),
    successMessage: (_, status) => (status === 'CLOSED' ? 'Lote fechado.' : 'Lote reaberto.'),
    onSuccess: () => { refresh(); void batches.refetch() },
  })

  if (batches.isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />
  if (batches.isError) return <Alert tone="danger" title="Não foi possível carregar os lotes">{(batches.error as Error).message}</Alert>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[240px] flex-1 sm:max-w-sm">
          <label className="label">Lote</label>
          <Select value={batchId ?? ''} onChange={(event) => select({ lote: event.target.value })} disabled={!batches.data?.length}>
            {!batches.data?.length && <option value="">Nenhum lote criado</option>}
            {batches.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {formatDay(item.batch_date)} · {item.code}{item.name ? ` · ${item.name}` : ''}{item.status !== 'OPEN' ? ` (${item.status === 'CLOSED' ? 'fechado' : 'cancelado'})` : ''}
              </option>
            ))}
          </Select>
        </div>
        <Link to="/app/cobertura" className="btn-ghost"><MapPinned className="h-4 w-4" /> Cobertura por CEP</Link>
        {canOperate && (
          <>
            <Button variant="secondary" onClick={() => setCreating(true)} icon={<Plus className="h-4 w-4" />}>Novo lote</Button>
            {batch?.status === 'OPEN' && (
              <>
                <Button variant="secondary" onClick={() => setImporting(true)} icon={<FileUp className="h-4 w-4" />}>Importar romaneio</Button>
                <Button loading={distribute.isPending} onClick={() => distribute.mutate()} icon={<Shuffle className="h-4 w-4" />}>Distribuir por CEP</Button>
              </>
            )}
          </>
        )}
      </div>

      {!batchId || !batch ? (
        <Card>
          <EmptyState
            icon={<RouteIcon className="h-6 w-6" />} title="Crie o lote do dia"
            description="Cada lote reúne os pacotes de um dia de operação: importação, distribuição por CEP, roteiros e conferência."
            action={canOperate ? <Button onClick={() => setCreating(true)} icon={<Plus className="h-4 w-4" />}>Novo lote</Button> : undefined}
          />
        </Card>
      ) : (
        <>
          {batch.status !== 'OPEN' && (
            <Alert tone="info" title={batch.status === 'CLOSED' ? 'Lote fechado' : 'Lote cancelado'}>
              Não recebe importação nem distribuição.{' '}
              {canOperate && batch.status === 'CLOSED' && (
                <button type="button" className="font-semibold underline" onClick={() => setStatus.mutate('OPEN')}>Reabrir</button>
              )}
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label="Pacotes" value={totals?.packages ?? '—'} hint={`${totals?.addresses ?? 0} endereços`} tone="neutral" />
            <StatCard label="Sem responsável" value={(totals?.by_status.RECEIVED ?? 0) + exceptionCount}
              hint={`${exceptionCount} exceção(ões)`} tone={exceptionCount > 0 ? 'danger' : 'neutral'} onClick={() => select({ aba: 'excecoes' })} />
            <StatCard label="Sem roteiro" value={totals?.by_status.ASSIGNED ?? 0} hint="Já têm responsável" tone="neutral" />
            <StatCard label="Entregues" value={totals?.by_status.DELIVERED ?? 0}
              hint={`${(totals?.by_status.FAILED ?? 0) + (totals?.by_status.RETURNED ?? 0)} não entregue(s)`} tone="brand" />
            <StatCard label="Conflitos" value={totals?.conflicts ?? 0} hint="Registros do campo a decidir"
              tone={(totals?.conflicts ?? 0) > 0 ? 'danger' : 'neutral'} onClick={() => select({ aba: 'conflitos' })} />
          </div>

          <Tabs<Tab>
            value={tab} onChange={(next) => select({ aba: next })}
            tabs={[
              { id: 'resumo', label: 'Funcionários' },
              { id: 'pacotes', label: 'Pacotes', count: totals?.packages },
              { id: 'excecoes', label: 'Exceções', count: exceptionCount },
              { id: 'conflitos', label: 'Conflitos', count: totals?.conflicts },
            ]}
          />

          {tab === 'resumo' && (
            <CouriersTable overview={overview.data} loading={overview.isLoading} batchId={batchId}
              footer={canOperate && batch.status === 'OPEN' ? (
                <Button variant="ghost" size="sm" loading={setStatus.isPending} onClick={() => {
                  if (window.confirm('Fechar o lote? Ele deixa de receber importação e distribuição.')) setStatus.mutate('CLOSED')
                }}>Fechar lote</Button>
              ) : undefined} />
          )}
          {(tab === 'pacotes' || tab === 'excecoes') && (
            <PackagesPanel batchId={batchId} couriers={couriers.data ?? []} overview={overview.data} canOperate={canOperate}
              exceptions={tab === 'excecoes'} onChanged={refresh} />
          )}
          {tab === 'conflitos' && <ConflictsPanel batchId={batchId} canOperate={canOperate} onChanged={refresh} />}
        </>
      )}

      {creating && <NewBatchModal onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); void batches.refetch(); select({ lote: id, aba: 'resumo' }) }} />}
      {batchId && <ImportModal batchId={batchId} open={importing} onClose={() => setImporting(false)} onDone={refresh} />}
    </div>
  )
}

function CouriersTable({ overview, loading, batchId, footer }: {
  overview: BatchOverview | undefined; loading: boolean; batchId: string; footer?: React.ReactNode
}) {
  if (loading) return <Skeleton className="h-48 w-full rounded-2xl" />
  const rows = overview?.couriers ?? []
  return (
    <Card>
      <CardHeader title="Carga por funcionário" description="Clique em um nome para montar, liberar ou transferir os roteiros." action={footer} />
      {rows.length === 0 ? (
        <EmptyState title="Ninguém recebeu pacotes ainda" description="Importe o romaneio e use “Distribuir por CEP”." />
      ) : (
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Funcionário</th><th>Pacotes / limite</th><th>Roteiros</th><th>Andamento</th><th>Conferência</th><th>Atenção</th><th /></tr></thead>
            <tbody>{rows.map((row) => <CourierRow key={row.courier_id} row={row} batchId={batchId} />)}</tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function CourierRow({ row, batchId }: { row: CourierOverview; batchId: string }) {
  const done = (row.by_status.DELIVERED ?? 0) + (row.by_status.FAILED ?? 0) + (row.by_status.RETURNED ?? 0)
  const routes = row.routes
  const totalRoutes = (routes.DRAFT ?? 0) + (routes.RELEASED ?? 0) + (routes.IN_PROGRESS ?? 0) + (routes.COMPLETED ?? 0)
  const over = row.packages > row.limit
  const link = `/app/distribuicao/${batchId}/funcionario/${row.courier_id}`
  return (
    <tr>
      <td>
        <Link to={link} className="font-semibold text-ink-950 hover:underline">{row.full_name}</Link>
        <span className="block text-[11.5px] text-ink-500">{row.addresses} endereço(s)</span>
      </td>
      <td className="min-w-[140px]">
        <span className={over ? 'font-semibold text-red-700' : 'font-medium'}>{row.packages} / {row.limit}</span>
        <div className="mt-1"><Progress value={(row.packages / Math.max(row.limit, 1)) * 100} tone={over ? 'red' : row.packages === row.limit ? 'amber' : 'brand'} /></div>
      </td>
      <td className="text-[12.5px]">
        {totalRoutes === 0 ? <span className="text-ink-400">Nenhum</span> : (
          <>
            {totalRoutes} roteiro(s)
            <span className="block text-[11.5px] text-ink-500">
              {[routes.DRAFT && `${routes.DRAFT} rascunho`, routes.RELEASED && `${routes.RELEASED} liberado(s)`,
                routes.IN_PROGRESS && `${routes.IN_PROGRESS} em andamento`, routes.COMPLETED && `${routes.COMPLETED} concluído(s)`].filter(Boolean).join(' · ')}
            </span>
          </>
        )}
      </td>
      <td className="min-w-[130px] text-[12.5px]">
        {row.by_status.DELIVERED ?? 0} entregue(s){done - (row.by_status.DELIVERED ?? 0) > 0 ? ` · ${done - (row.by_status.DELIVERED ?? 0)} não` : ''}
        <div className="mt-1"><Progress value={row.packages ? (done / row.packages) * 100 : 0} /></div>
        {row.last_activity_at && <span className="text-[11px] text-ink-400">último registro {relativeTime(row.last_activity_at)}</span>}
      </td>
      <td className="text-[12.5px]">
        {row.manifest ? (
          <>
            {MANIFEST_STATUS[row.manifest.status]}
            <span className="block text-[11.5px] text-ink-500">viagem {row.manifest.trip_number} · {row.manifest.loaded} conferido(s){row.manifest.open ? ` · ${row.manifest.open} em aberto` : ''}</span>
          </>
        ) : <span className="text-ink-400">Não iniciada</span>}
      </td>
      <td>
        <div className="flex flex-wrap gap-1">
          {!row.has_login && <Badge tone="warning">Sem acesso ao aplicativo</Badge>}
          {row.status !== 'ACTIVE' && <Badge tone="danger">Inativo</Badge>}
          {over && <Badge tone="danger">Acima do limite</Badge>}
          {row.conflicts > 0 && <Badge tone="danger">{row.conflicts} conflito(s)</Badge>}
          {row.delivered_without_load > 0 && <Badge tone="warning">{row.delivered_without_load} entregue(s) sem conferência</Badge>}
          {(row.by_status.ASSIGNED ?? 0) > 0 && <Badge tone="info">{row.by_status.ASSIGNED} sem roteiro</Badge>}
        </div>
      </td>
      <td className="text-right"><Link to={link} className="btn-secondary btn-sm"><RouteIcon className="h-3.5 w-3.5" /> Roteiros</Link></td>
    </tr>
  )
}

function ConflictsPanel({ batchId, canOperate, onChanged }: { batchId: string; canOperate: boolean; onChanged: () => void }) {
  const query = useQuery({ queryKey: ['logistics', 'conflicts', batchId], queryFn: () => api.listAttemptConflicts(batchId), refetchInterval: 20_000 })
  const [deciding, setDeciding] = useState<{ conflict: AttemptConflict; accept: boolean } | null>(null)
  const [note, setNote] = useState('')
  const resolve = useApiMutation({
    mutationFn: () => api.resolveAttemptConflict(deciding!.conflict.id, deciding!.accept, note.trim() || null),
    successMessage: (result) => (result.status === 'APPLIED' ? 'Baixa aceita e aplicada ao pacote.' : 'Registro descartado.'),
    onSuccess: () => { setDeciding(null); setNote(''); void query.refetch(); onChanged() },
  })
  if (query.isLoading) return <Skeleton className="h-32 w-full rounded-2xl" />
  const items = query.data ?? []
  return (
    <Card>
      <CardHeader title="Registros do campo em conflito"
        description="Chegaram depois que a situação do pacote mudou (por exemplo, roteiro transferido). Nada foi perdido nem aplicado: a decisão é sua." />
      {items.length === 0 ? <EmptyState title="Nenhum conflito pendente" description="Os registros dos entregadores estão de acordo com a situação atual." /> : (
        <ul className="divide-y divide-ink-100">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start gap-3 px-4 py-3.5 text-[13px] sm:px-5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink-950">
                  <span className="font-mono">{item.tracking_code}</span> · {item.recipient_name}
                </p>
                <p className="text-ink-700">
                  {item.courier_name} registrou <strong>{item.outcome === 'DELIVERED' ? 'entrega' : 'tentativa sem sucesso'}</strong>
                  {item.failure_reason ? ` (${OCCURRENCE_TYPE_LABEL[item.failure_reason]})` : ''}
                  {item.attempt_recipient_name ? `, recebido por ${item.attempt_recipient_name}` : ''} em {formatDateTime(item.occurred_at)}.
                  {item.notes ? ` “${item.notes}”` : ''}
                </p>
                <p className="text-[12px] text-ink-500">
                  {conflictLabel(item.conflict_reason)}. Hoje o pacote está com {item.holder_name ?? 'ninguém'} · {PACKAGE_STATUS[item.package_status].label.toLowerCase()}.
                  Chegou ao servidor em {formatDateTime(item.received_at)}.
                </p>
              </div>
              {canOperate && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setDeciding({ conflict: item, accept: true })}>Aceitar baixa</Button>
                  <Button size="sm" variant="secondary" onClick={() => setDeciding({ conflict: item, accept: false })}>Descartar</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {deciding && (
        <Modal open onClose={() => setDeciding(null)}
          title={deciding.accept ? 'Aceitar a baixa do campo' : 'Descartar o registro'}
          description={deciding.accept
            ? `O pacote ${deciding.conflict.tracking_code} passa a constar como ${deciding.conflict.outcome === 'DELIVERED' ? 'entregue' : 'não entregue'}, mesmo estando hoje com ${deciding.conflict.holder_name ?? 'outra pessoa'}.`
            : `O registro de ${deciding.conflict.courier_name} fica guardado no histórico, sem alterar o pacote.`}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setDeciding(null)}>Voltar</Button>
              <Button loading={resolve.isPending} onClick={() => resolve.mutate()}>{deciding.accept ? 'Aceitar baixa' : 'Descartar'}</Button>
            </>
          )}>
          <Field label="Justificativa" hint="Fica na auditoria">
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ex.: entrega confirmada por telefone com o destinatário" />
          </Field>
        </Modal>
      )}
    </Card>
  )
}

function NewBatchModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [date, setDate] = useState(todayLocal())
  const [name, setName] = useState('')
  const [limit, setLimit] = useState('')
  const parsed = limit.trim() === '' ? null : Number(limit)
  const invalid = parsed !== null && (!Number.isInteger(parsed) || parsed <= 0)
  const create = useApiMutation({
    mutationFn: () => api.createBatch({ batch_date: date, name: name.trim() || null, notes: null, package_limit_override: parsed }),
    successMessage: (batch) => `Lote ${batch.code} criado.`,
    onSuccess: (batch) => onCreated(batch.id),
  })
  return (
    <Modal open onClose={onClose} title="Novo lote de distribuição"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button loading={create.isPending} disabled={!date || invalid} onClick={() => create.mutate()}>Criar lote</Button>
        </>
      )}>
      <div className="space-y-3">
        <Field label="Data da operação" required><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
        <Field label="Nome" hint="Opcional. Ex.: manhã, segunda saída"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field>
        <Field label="Limite de pacotes por funcionário neste lote" hint="Em branco usa o limite padrão. Limite do funcionário ou do veículo tem precedência."
          error={invalid ? 'Informe um número inteiro maior que zero' : undefined}>
          <Input value={limit} onChange={(event) => setLimit(event.target.value)} inputMode="numeric" placeholder="Padrão" invalid={invalid} />
        </Field>
      </div>
    </Modal>
  )
}
