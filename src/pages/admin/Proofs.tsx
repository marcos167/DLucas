import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Download, FileCheck2 } from 'lucide-react'
import { Button, Card, CardHeader, EmptyState, SearchInput, Skeleton } from '@/components/ui'
import { getProofUrl } from '@/lib/api'
import { formatDateTime } from '@/lib/utils'

interface ProofRow {
  id: string
  order_id: string
  kind: string
  storage_path: string
  file_name: string | null
  created_at: string
  recipient_name: string | null
  order?: { code: string; pharmacy?: { trade_name: string } }
}

export default function Proofs() {
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['all-proofs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proofs')
        .select('*, order:orders(code, pharmacy:pharmacies(trade_name))')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw new Error(error.message)
      return data as ProofRow[]
    },
  })

  const filtered = (data ?? []).filter((p) => {
    const s = search.toLowerCase()
    return !s || (p.order?.code ?? '').toLowerCase().includes(s)
      || (p.file_name ?? '').toLowerCase().includes(s)
      || (p.order?.pharmacy?.trade_name ?? '').toLowerCase().includes(s)
  })

  return (
    <div className="space-y-4">
      <SearchInput value={search} onChange={setSearch} placeholder="Buscar por pedido, farmácia ou arquivo…" className="w-full sm:w-80" />
      <Card>
        <CardHeader title={`Comprovantes (${filtered.length})`} description="Documentos arquivados em bucket privado" />
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState title="Nenhum comprovante" description="Os documentos enviados nas entregas aparecem aqui." icon={<FileCheck2 className="h-6 w-6" />} />
        ) : (
          <div className="table-wrap">
            <table className="table-base">
              <thead><tr><th>Pedido</th><th>Farmácia</th><th>Tipo</th><th>Arquivo</th><th>Recebido por</th><th>Data</th><th /></tr></thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td className="font-mono text-[12px] font-semibold">{p.order?.code ?? '—'}</td>
                    <td className="text-[12.5px]">{p.order?.pharmacy?.trade_name ?? '—'}</td>
                    <td className="text-[12px]">{p.kind === 'PICKUP' ? 'Coleta' : p.kind === 'DELIVERY' ? 'Entrega' : p.kind}</td>
                    <td className="max-w-[220px] truncate text-[12px] text-ink-600">{p.file_name ?? p.storage_path}</td>
                    <td className="text-[12.5px]">{p.recipient_name ?? '—'}</td>
                    <td className="whitespace-nowrap text-[11.5px] text-ink-500">{formatDateTime(p.created_at)}</td>
                    <td>
                      <Button variant="ghost" size="sm" icon={<Download className="h-3.5 w-3.5" />}
                        onClick={async () => {
                          const url = await getProofUrl(p.storage_path)
                          if (url) window.open(url, '_blank', 'noreferrer')
                        }}>
                        Abrir
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="px-1 text-[11px] text-ink-400">
        Os arquivos são acessados por URL assinada com validade de 10 minutos.
      </p>
    </div>
  )
}
