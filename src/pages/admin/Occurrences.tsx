import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react'
import {
  Button, Card, CardHeader, EmptyState, Field, Modal, SearchInput, Skeleton, Tabs, Textarea,
} from '@/components/ui'
import { listOccurrences, logAudit, resolveOccurrence } from '@/lib/api'
import { formatDateTime, OCCURRENCE_STATUS_LABEL, OCCURRENCE_TYPE_LABEL, relativeTime } from '@/lib/utils'
import type { Occurrence } from '@/types'

const STATUS_CLASS: Record<string, string> = {
  OPEN: 'bg-red-100 text-red-700', IN_REVIEW: 'bg-amber-100 text-amber-800',
  RESOLVED: 'bg-emerald-100 text-emerald-800', CANCELLED: 'bg-ink-200 text-ink-600',
}

export default function Occurrences() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'open' | 'all' | 'resolved'>('open')
  const [search, setSearch] = useState('')
  const [resolving, setResolving] = useState<Occurrence | null>(null)
  const [resolution, setResolution] = useState('')

  const { data, isLoading } = useQuery({ queryKey: ['occurrences'], queryFn: listOccurrences })

  const resolve = useMutation({
    mutationFn: async () => {
      if (!resolving) return
      await resolveOccurrence(resolving.id, resolution)
      await logAudit('RESOLVE', 'occurrence', resolving.id, `Resolveu ocorrência de ${resolving.order?.code ?? ''}`)
    },
    onSuccess: () => {
      setResolving(null); setResolution('')
      void qc.invalidateQueries({ queryKey: ['occurrences'] })
    },
  })

  const filtered = (data ?? []).filter((o) => {
    const byTab = tab === 'all' ? true
      : tab === 'open' ? ['OPEN', 'IN_REVIEW'].includes(o.status)
      : o.status === 'RESOLVED'
    const s = search.toLowerCase()
    const bySearch = !s || (o.order?.code ?? '').toLowerCase().includes(s)
      || o.description.toLowerCase().includes(s)
    return byTab && bySearch
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por pedido ou descrição…" className="w-full sm:w-80" />
        <div className="ml-auto flex gap-2 text-[11px]">
          <span className="badge bg-red-100 text-red-700">{(data ?? []).filter((o) => o.status === 'OPEN').length} abertas</span>
          <span className="badge bg-amber-100 text-amber-800">{(data ?? []).filter((o) => o.status === 'IN_REVIEW').length} em análise</span>
        </div>
      </div>

      <Tabs
        value={tab} onChange={setTab}
        tabs={[{ id: 'open', label: 'Abertas' }, { id: 'resolved', label: 'Resolvidas' }, { id: 'all', label: 'Todas' }]}
      />

      <Card>
        <CardHeader title={`Ocorrências (${filtered.length})`} description="Registros enviados por entregadores e farmácias" />
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState title="Nenhuma ocorrência" description="Sem registros para este filtro." icon={<AlertCircle className="h-6 w-6" />} />
        ) : (
          <ul className="divide-y divide-ink-100">
            {filtered.map((o) => (
              <li key={o.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-semibold text-ink-900">{OCCURRENCE_TYPE_LABEL[o.type]}</span>
                      <span className={`badge ${STATUS_CLASS[o.status]}`}>{OCCURRENCE_STATUS_LABEL[o.status]}</span>
                      {o.order && <span className="font-mono text-[11px] text-ink-500">{o.order.code}</span>}
                    </div>
                    <p className="mt-1 text-[12.5px] text-ink-700">{o.description}</p>
                    {o.resolution && (
                      <p className="mt-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[12px] text-emerald-900">
                        <strong>Resolução:</strong> {o.resolution}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-ink-400">
                      {relativeTime(o.created_at)} · {formatDateTime(o.created_at)}
                    </p>
                  </div>
                  {o.status !== 'RESOLVED' && (
                    <Button size="sm" variant="secondary" onClick={() => setResolving(o)} icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
                      Resolver
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={!!resolving} onClose={() => setResolving(null)} size="md"
        title="Resolver ocorrência"
        description={resolving?.order?.code ? `Pedido ${resolving.order.code}` : undefined}
        footer={<>
          <Button variant="secondary" onClick={() => setResolving(null)}>Cancelar</Button>
          <Button onClick={() => resolve.mutate()} loading={resolve.isPending} disabled={!resolution.trim()}>Resolver</Button>
        </>}>
        <div className="space-y-3">
          {resolving && (
            <div className="rounded-xl bg-ink-50 p-3 text-[12.5px]">
              <p className="flex items-center gap-1.5 font-semibold text-ink-900">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> {OCCURRENCE_TYPE_LABEL[resolving.type]}
              </p>
              <p className="mt-1 text-ink-700">{resolving.description}</p>
            </div>
          )}
          <Field label="Resolução" required>
            <Textarea rows={4} value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="Descreva o que foi feito…" />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
