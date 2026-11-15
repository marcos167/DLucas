import { useQuery } from '@tanstack/react-query'
import { Users, ShieldCheck } from 'lucide-react'
import { Alert, Card, CardHeader, EmptyState, Skeleton } from '@/components/ui'
import { listPharmacyProfiles } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { ROLE_LABEL, formatDateTime } from '@/lib/utils'

export default function PortalStaff() {
  const { profile } = useAuth()
  const pharmacyId = profile?.pharmacy_id ?? null

  const staff = useQuery({
    queryKey: ['portal-staff', pharmacyId],
    queryFn: () => listPharmacyProfiles(pharmacyId!),
    enabled: !!pharmacyId,
  })

  return (
    <div className="space-y-4">
      <Alert tone="info" title="Gestão de acessos">
        Novos usuários da sua farmácia são criados pela equipe administrativa da D'Luca, garantindo
        que cada acesso seja auditado. Solicite a inclusão ou desativação pelo canal de atendimento.
      </Alert>

      <Card>
        <CardHeader title={`Funcionários (${(staff.data ?? []).length})`} description="Usuários vinculados a esta farmácia" />
        {staff.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : (staff.data ?? []).length === 0 ? (
          <EmptyState title="Nenhum funcionário" icon={<Users className="h-6 w-6" />} />
        ) : (
          <div className="table-wrap">
            <table className="table-base">
              <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Situação</th><th>Criado em</th></tr></thead>
              <tbody>
                {(staff.data ?? []).map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.full_name || '—'}</td>
                    <td className="text-[12.5px]">{p.email}</td>
                    <td className="text-[12.5px]">{ROLE_LABEL[p.role]}</td>
                    <td>
                      <span className={`badge ${p.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-ink-200 text-ink-600'}`}>
                        {p.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="text-[12px] text-ink-500">{formatDateTime(p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="card flex items-start gap-3 p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" />
        <div>
          <p className="text-[13px] font-semibold text-ink-900">Permissões do seu perfil</p>
          <p className="mt-0.5 text-[12.5px] text-ink-600">
            {profile?.role === 'PHARMACY_ADMIN'
              ? 'Você pode criar pedidos, cadastrar unidades e consultar financeiro e comprovantes da sua farmácia.'
              : 'Você pode criar pedidos e acompanhar entregas. Unidades e financeiro são restritos ao gestor.'}
          </p>
        </div>
      </div>
    </div>
  )
}
