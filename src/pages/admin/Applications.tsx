import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { UserPlus, Bike, CheckCircle2, MapPin } from 'lucide-react'
import { Button, Card, CardHeader, EmptyState, SearchInput, Skeleton, Tabs, Alert } from '@/components/ui'
import { listApplications, logAudit, upsertCourier } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { formatDateTime, LEAD_STATUS_LABEL, maskCpf, maskPhone, relativeTime } from '@/lib/utils'
import type { CourierApplication } from '@/types'

export default function Applications() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'NEW' | 'all'>('NEW')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')

  const { data, isLoading } = useQuery({ queryKey: ['applications'], queryFn: listApplications })

  async function approve(app: CourierApplication) {
    setBusy(app.id)
    try {
      const courierId = await upsertCourier({
        full_name: app.full_name,
        phone: app.phone,
        email: app.email,
        cpf: app.cpf,
        base_city: app.city,
        base_state: app.state,
        service_zone: app.service_zone,
        vehicle_plate: app.vehicle_plate,
        cnh_category: app.cnh_category,
        vehicle_type: 'MOTORCYCLE',
        status: 'PENDING',
        notes: app.experience ?? app.message ?? null,
      })
      await supabase.from('courier_applications')
        .update({ status: 'QUALIFIED', reviewed_at: new Date().toISOString() })
        .eq('id', app.id)
      await logAudit('APPROVE', 'courier_application', app.id, `Aprovou candidatura de ${app.full_name} (cadastro ${courierId.slice(0, 8)})`)
      setFeedback(`Candidatura de ${app.full_name} aprovada e cadastro de entregador criado (pendente de acesso).`)
      void qc.invalidateQueries({ queryKey: ['applications'] })
      void qc.invalidateQueries({ queryKey: ['couriers'] })
    } finally { setBusy(null) }
  }

  async function reject(app: CourierApplication) {
    setBusy(app.id)
    await supabase.from('courier_applications')
      .update({ status: 'LOST', reviewed_at: new Date().toISOString() })
      .eq('id', app.id)
    await logAudit('REJECT', 'courier_application', app.id, `Recusou candidatura de ${app.full_name}`)
    setBusy(null)
    void qc.invalidateQueries({ queryKey: ['applications'] })
  }

  const filtered = (data ?? []).filter((a) => {
    const byTab = tab === 'all' || a.status === 'NEW'
    const s = search.toLowerCase()
    const bySearch = !s || a.full_name.toLowerCase().includes(s) || a.phone.includes(s)
      || (a.city ?? '').toLowerCase().includes(s)
    return byTab && bySearch
  })

  return (
    <div className="space-y-4">
      {feedback && <Alert tone="success">{feedback}</Alert>}
      <SearchInput value={search} onChange={setSearch} placeholder="Buscar candidato…" className="w-full sm:w-80" />
      <Tabs value={tab} onChange={setTab}
        tabs={[{ id: 'NEW', label: 'Novas', count: (data ?? []).filter((a) => a.status === 'NEW').length }, { id: 'all', label: 'Todas' }]} />

      <Card>
        <CardHeader title={`Candidaturas (${filtered.length})`} description="Inscrições recebidas pelo site" />
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState title="Nenhuma candidatura" description="As inscrições do formulário de entregadores aparecem aqui." icon={<UserPlus className="h-6 w-6" />} />
        ) : (
          <div className="divide-y divide-ink-100">
            {filtered.map((a) => (
              <div key={a.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-semibold text-ink-900">{a.full_name}</p>
                      <span className={`badge ${a.status === 'NEW' ? 'bg-sky-100 text-sky-800' : a.status === 'QUALIFIED' ? 'bg-emerald-100 text-emerald-800' : 'bg-ink-200 text-ink-600'}`}>
                        {LEAD_STATUS_LABEL[a.status]}
                      </span>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-ink-600">
                      <span>{maskPhone(a.phone)}</span>
                      {a.cpf && <span>{maskCpf(a.cpf)}</span>}
                      {a.email && <span>{a.email}</span>}
                      {a.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{a.city}/{a.state}</span>}
                    </p>
                    <p className="mt-1 text-[11.5px] text-ink-500">
                      <Bike className="mr-1 inline h-3 w-3" />
                      {a.has_motorcycle ? 'Motocicleta própria' : 'Sem motocicleta'}
                      {a.vehicle_plate ? ` · ${a.vehicle_plate}` : ''}
                      {a.cnh_category ? ` · CNH ${a.cnh_category}` : ''}
                      {a.service_zone ? ` · ${a.service_zone}` : ''}
                    </p>
                    {(a.experience || a.message) && (
                      <p className="mt-1.5 rounded-lg bg-ink-50 px-2.5 py-1.5 text-[12px] text-ink-700">
                        {a.experience || a.message}
                      </p>
                    )}
                    <p className="mt-1 text-[10.5px] text-ink-400">{relativeTime(a.created_at)} · {formatDateTime(a.created_at)}</p>
                  </div>
                  {a.status === 'NEW' && (
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="secondary" onClick={() => void reject(a)} loading={busy === a.id}>Recusar</Button>
                      <Button size="sm" onClick={() => void approve(a)} loading={busy === a.id} icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
                        Aprovar
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <p className="px-1 text-[11px] text-ink-400">
        Aprovar cria o cadastro do entregador. O acesso ao aplicativo é liberado pela equipe de usuários.
      </p>
    </div>
  )
}
