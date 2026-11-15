import { useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useOutletContext } from 'react-router-dom'
import { Bike, ChevronRight, History, KeyRound, LogOut, ShieldCheck, ShieldOff } from 'lucide-react'
import { Alert, Button, Card, Input, Switch } from '@/components/ui'
import { updateCourier } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import {
  AVAILABILITY_LABEL, formatDate, formatDateTime, initials, maskPhone, ROLE_LABEL,
} from '@/lib/utils'
import { useApiMutation } from '@/hooks/useApiMutation'
import { Page, type CourierOutlet } from './rider/ui'

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Em análise', ACTIVE: 'Ativo', SUSPENDED: 'Suspenso', REJECTED: 'Não aprovado', INACTIVE: 'Inativo',
}

/**
 * Aba "Perfil": cadastro, disponibilidade, contato e conta.
 * Não há valores aqui: entregadores têm salário fixo.
 */
export default function CourierProfile() {
  const { courier, setCourier, toggleAvailability, openPassword, signOut } = useOutletContext<CourierOutlet>()
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [phone, setPhone] = useState(courier?.phone ?? '')
  const [saved, setSaved] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => { setPhone(courier?.phone ?? '') }, [courier?.phone])

  const save = useApiMutation({
    mutationFn: async () => {
      if (!courier) return
      await updateCourier(courier.id, { phone })
      setCourier({ ...courier, phone })
    },
    onSuccess: () => {
      setSaved(true)
      void qc.invalidateQueries({ queryKey: ['couriers'] })
      setTimeout(() => setSaved(false), 2500)
    },
  })

  const name = courier?.full_name || profile?.full_name || profile?.email || 'Entregador'

  return (
    <Page className="space-y-3">
      {saved && <Alert tone="success">Telefone atualizado.</Alert>}

      <Card className="p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-800 text-sm font-bold text-white">
            {initials(name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold text-ink-950">{name}</p>
            <p className="text-[12px] text-ink-500">
              {ROLE_LABEL[profile?.role ?? 'COURIER']}{courier ? ` · ${STATUS_LABEL[courier.status] ?? courier.status}` : ''}
            </p>
          </div>
        </div>

        {courier && (
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-ink-100 pt-3 text-[12px] text-ink-900">
            <div className="min-w-0"><dt className="text-ink-400">E-mail</dt><dd className="truncate font-medium">{courier.email ?? profile?.email ?? '—'}</dd></div>
            <div><dt className="text-ink-400">CPF</dt><dd className="font-medium">{courier.cpf ?? '—'}</dd></div>
            <div><dt className="text-ink-400">Veículo</dt><dd className="font-medium">{courier.vehicle_type === 'MOTORCYCLE' ? 'Motocicleta' : courier.vehicle_type}</dd></div>
            <div><dt className="text-ink-400">Placa</dt><dd className="font-medium">{courier.vehicle_plate ?? '—'}</dd></div>
            <div><dt className="text-ink-400">CNH</dt><dd className="font-medium">{courier.cnh_category ?? '—'}</dd></div>
            <div><dt className="text-ink-400">Aprovado em</dt><dd className="font-medium">{courier.approved_at ? formatDate(courier.approved_at) : '—'}</dd></div>
            <div className="col-span-2"><dt className="text-ink-400">Região</dt>
              <dd className="font-medium">
                {[courier.base_city, courier.base_state].filter(Boolean).join(' / ') || '—'}{courier.service_zone ? ` · ${courier.service_zone}` : ''}
              </dd>
            </div>
          </dl>
        )}
      </Card>

      {courier && (
        <>
          <Card className="p-4">
            <Switch
              checked={courier.availability !== 'OFFLINE'}
              onChange={() => void toggleAvailability()}
              label={`Disponibilidade: ${AVAILABILITY_LABEL[courier.availability]}`}
              description="Fique disponível para a central poder lançar retiradas para você."
            />
          </Card>

          <Card className="p-4">
            <p className="text-[13px] font-bold text-ink-900">Telefone de contato</p>
            <p className="mt-0.5 text-[11.5px] text-ink-500">Usado pela central em caso de necessidade.</p>
            <div className="mt-3 flex gap-2">
              <Input value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} inputMode="tel" aria-label="Telefone de contato" />
              <Button onClick={() => save.mutate()} loading={save.isPending}>Salvar</Button>
            </div>
          </Card>

          <Card className="p-4">
            <p className="flex items-center gap-1.5 text-[13px] font-bold text-ink-900">
              {courier.location_sharing_enabled ? <ShieldCheck className="h-4 w-4 text-brand-700" /> : <ShieldOff className="h-4 w-4 text-ink-400" />}
              Localização
            </p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-600">
              Você decide quando compartilhar. O controle fica na tela de cada entrega e a escolha não fica
              ativa indefinidamente. O botão de posição da aba Mapa mostra onde você está só neste aparelho;
              nada é enviado à central.
            </p>
            {courier.current_location_at && courier.location_sharing_enabled && (
              <p className="mt-1.5 text-[11px] text-ink-500">Último registro: {formatDateTime(courier.current_location_at)}</p>
            )}
            <p className="mt-2 flex items-center gap-1 text-[11px] text-ink-400">
              <Bike className="h-3 w-3" /> Cadastrado em {formatDate(courier.created_at)}
            </p>
          </Card>
        </>
      )}

      <Card className="divide-y divide-ink-100 overflow-hidden">
        {courier && (
          <Link to="/entregador/historico" className="flex items-center gap-3 px-4 py-3.5 active:bg-ink-50">
            <ActionRow icon={<History className="h-[18px] w-[18px]" />} label="Histórico de entregas" />
            <ChevronRight className="h-4 w-4 text-ink-400" />
          </Link>
        )}
        <button type="button" onClick={openPassword} className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-ink-50">
          <ActionRow icon={<KeyRound className="h-[18px] w-[18px]" />} label="Alterar senha" />
          <ChevronRight className="h-4 w-4 text-ink-400" />
        </button>
        <button
          type="button" disabled={leaving}
          onClick={async () => { setLeaving(true); try { await signOut() } finally { setLeaving(false) } }}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-red-700 active:bg-ink-50 disabled:opacity-60"
        >
          <ActionRow icon={<LogOut className="h-[18px] w-[18px]" />} label={leaving ? 'Saindo…' : 'Sair'} />
        </button>
      </Card>
    </Page>
  )
}

function ActionRow({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <>
      <span className="shrink-0 opacity-80">{icon}</span>
      <span className="min-w-0 flex-1 text-[14px] font-medium">{label}</span>
    </>
  )
}
