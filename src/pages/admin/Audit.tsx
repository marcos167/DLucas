import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ScrollText } from 'lucide-react'
import { Card, CardHeader, EmptyState, SearchInput, Skeleton } from '@/components/ui'
import { listAuditLogs } from '@/lib/api'
import { formatDateTime, ROLE_LABEL, relativeTime } from '@/lib/utils'

export default function Audit() {
  const [search, setSearch] = useState('')
  const { data, isLoading } = useQuery({ queryKey: ['audit'], queryFn: () => listAuditLogs(300) })

  const rows = (data ?? []).filter((l) => {
    const s = search.toLowerCase()
    return !s || l.action.toLowerCase().includes(s) || l.entity.toLowerCase().includes(s)
      || (l.description ?? '').toLowerCase().includes(s) || (l.actor_email ?? '').toLowerCase().includes(s)
  })

  return (
    <div className="space-y-4">
      <SearchInput value={search} onChange={setSearch} placeholder="Buscar por ação, entidade ou usuário…" className="w-full sm:w-96" />

      <Card>
        <CardHeader title={`Registros de auditoria (${rows.length})`} description="Ações sensíveis registradas no sistema" />
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState title="Nenhum registro" description="As ações auditadas aparecem aqui." icon={<ScrollText className="h-6 w-6" />} />
        ) : (
          <div className="table-wrap">
            <table className="table-base">
              <thead><tr><th>Data</th><th>Usuário</th><th>Ação</th><th>Entidade</th><th>Descrição</th></tr></thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap text-[11.5px] text-ink-500">
                      <span title={formatDateTime(l.created_at)}>{relativeTime(l.created_at)}</span>
                    </td>
                    <td className="text-[12px]">
                      <p className="font-medium">{l.actor_email ?? 'sistema'}</p>
                      <p className="text-[10.5px] text-ink-400">{l.actor_role ? ROLE_LABEL[l.actor_role] : '—'}</p>
                    </td>
                    <td><span className="badge bg-ink-100 text-ink-700">{l.action}</span></td>
                    <td className="text-[12px] text-ink-600">{l.entity}{l.entity_id ? <span className="ml-1 text-ink-400">#{l.entity_id.slice(0, 8)}</span> : ''}</td>
                    <td className="text-[12px] text-ink-700">{l.description ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="px-1 text-[11px] text-ink-400">
        A trilha de auditoria é somente leitura para administradores e não pode ser editada pela aplicação.
      </p>
    </div>
  )
}
