import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileDown, FileCheck2 } from 'lucide-react'
import { Button, Card, CardHeader, EmptyState, SearchInput, Skeleton } from '@/components/ui'
import { getProofUrl, listOrders, listProofs } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { formatDateTime } from '@/lib/utils'
import type { Proof } from '@/types'

export default function PortalProofs() {
  const { profile } = useAuth()
  const pharmacyId = profile?.pharmacy_id ?? null
  const [search, setSearch] = useState('')

  const orders = useQuery({
    queryKey: ['portal-proof-orders', pharmacyId],
    queryFn: () => listOrders({ pharmacyId, status: ['DELIVERED'], limit: 100 }),
    enabled: !!pharmacyId,
  })

  const proofs = useQuery({
    queryKey: ['portal-proofs-all', pharmacyId, (orders.data ?? []).length],
    queryFn: async () => {
      const ids = (orders.data ?? []).map((o) => o.id)
      const all: (Proof & { orderCode: string })[] = []
      for (const id of ids.slice(0, 40)) {
        const list = await listProofs(id)
        const code = (orders.data ?? []).find((o) => o.id === id)?.code ?? ''
        all.push(...list.map((p) => ({ ...p, orderCode: code })))
      }
      return all.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    },
    enabled: !!pharmacyId && !!orders.data,
  })

  const filtered = (proofs.data ?? []).filter((p) => {
    const s = search.toLowerCase()
    return !s || p.orderCode.toLowerCase().includes(s) || (p.file_name ?? '').toLowerCase().includes(s)
  })

  return (
    <div className="space-y-4">
      <SearchInput value={search} onChange={setSearch} placeholder="Buscar por pedido ou arquivo…" className="w-full sm:w-80" />

      <Card>
        <CardHeader title={`Comprovantes (${filtered.length})`} description="Entregas concluídas da sua farmácia" />
        {orders.isLoading || proofs.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState title="Nenhum comprovante" description="Os comprovantes ficam disponíveis após a conclusão das entregas." icon={<FileCheck2 className="h-6 w-6" />} />
        ) : (
          <ul className="divide-y divide-ink-100">
            {filtered.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-mono text-[12px] font-semibold text-brand-800">{p.orderCode}</p>
                  <p className="text-[12.5px] text-ink-700">{p.file_name ?? p.kind}</p>
                  <p className="text-[11px] text-ink-500">{formatDateTime(p.created_at)}</p>
                </div>
                <Button variant="secondary" size="sm" onClick={async () => {
                  const url = await getProofUrl(p.storage_path)
                  if (url) window.open(url, '_blank', 'noreferrer')
                }} icon={<FileDown className="h-3.5 w-3.5" />}>
                  Baixar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
