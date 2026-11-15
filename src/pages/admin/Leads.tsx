import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Inbox, Mail, Phone } from 'lucide-react'
import { Card, CardHeader, EmptyState, SearchInput, Select, Skeleton, Tabs } from '@/components/ui'
import { listLeads } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { formatDateTime, LEAD_STATUS_LABEL, relativeTime } from '@/lib/utils'
import type { Lead, LeadStatus } from '@/types'

const STATUS_CLASS: Record<LeadStatus, string> = {
  NEW: 'bg-sky-100 text-sky-800', CONTACTED: 'bg-amber-100 text-amber-800',
  QUALIFIED: 'bg-indigo-100 text-indigo-800', WON: 'bg-emerald-100 text-emerald-800',
  LOST: 'bg-ink-200 text-ink-600',
}

export default function Leads() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'QUOTE' | 'BUSINESS' | 'all'>('all')
  const [search, setSearch] = useState('')
  const [updating, setUpdating] = useState<string | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['leads'], queryFn: listLeads })

  async function changeStatus(lead: Lead, status: LeadStatus) {
    setUpdating(lead.id)
    await supabase.from('leads').update({ status }).eq('id', lead.id)
    setUpdating(null)
    void qc.invalidateQueries({ queryKey: ['leads'] })
  }

  const filtered = (data ?? []).filter((l) => {
    const byTab = tab === 'all' || l.type === tab
    const s = search.toLowerCase()
    const bySearch = !s || l.name.toLowerCase().includes(s) || l.email.toLowerCase().includes(s)
      || (l.company_name ?? '').toLowerCase().includes(s) || l.phone.includes(s)
    return byTab && bySearch
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nome, e-mail, empresa…" className="w-full sm:w-80" />
        <div className="flex gap-1 ml-auto text-[11px]">
          <span className="badge bg-sky-100 text-sky-800">{(data ?? []).filter((l) => l.status === 'NEW').length} novos</span>
        </div>
      </div>

      <Tabs value={tab} onChange={setTab}
        tabs={[
          { id: 'all', label: 'Todos' },
          { id: 'QUOTE', label: 'Orçamentos' },
          { id: 'BUSINESS', label: 'Novas empresas' },
        ]} />

      <Card>
        <CardHeader title={`Solicitações (${filtered.length})`} description="Leads recebidos pelo site institucional" />
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState title="Nenhuma solicitação" description="Os formulários do site aparecem aqui." icon={<Inbox className="h-6 w-6" />} />
        ) : (
          <div className="divide-y divide-ink-100">
            {filtered.map((l) => (
              <div key={l.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-semibold text-ink-900">{l.company_name || l.name}</p>
                      <span className="badge bg-ink-100 text-ink-600">{l.type === 'BUSINESS' ? 'Nova empresa' : 'Orçamento'}</span>
                      <span className={`badge ${STATUS_CLASS[l.status]}`}>{LEAD_STATUS_LABEL[l.status]}</span>
                    </div>
                    <p className="mt-1 text-[12.5px] text-ink-700">{l.name}
                      {l.city ? ` · ${l.city}${l.state ? `/${l.state}` : ''}` : ''}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-3 text-[11.5px] text-ink-600">
                      <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {l.email}</span>
                      <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {l.phone}</span>
                      {l.units_count != null && <span>{l.units_count} unidade(s)</span>}
                      {l.deliveries_per_day != null && <span>{l.deliveries_per_day} entregas/dia</span>}
                    </p>
                    {l.message && (
                      <p className="mt-2 rounded-lg bg-ink-50 px-2.5 py-1.5 text-[12px] text-ink-700">{l.message}</p>
                    )}
                    <p className="mt-1 text-[10.5px] text-ink-400">{relativeTime(l.created_at)} · {formatDateTime(l.created_at)}</p>
                  </div>
                  <Select value={l.status} onChange={(e) => void changeStatus(l, e.target.value as LeadStatus)}
                    className="w-auto text-[12px]" disabled={updating === l.id}>
                    {Object.entries(LEAD_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
