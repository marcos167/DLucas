import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useOutletContext } from 'react-router-dom'
import { Bike, ShieldCheck, ShieldOff, Wallet } from 'lucide-react'
import { Alert, Button, Card, Input, Skeleton } from '@/components/ui'
import { updateCourier, listPayouts } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import {
  AVAILABILITY_LABEL, brl, formatDate, formatDateTime, maskPhone, ROLE_LABEL,
} from '@/lib/utils'
import type { Courier } from '@/types'

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Em análise', ACTIVE: 'Ativo', SUSPENDED: 'Suspenso', REJECTED: 'Não aprovado', INACTIVE: 'Inativo',
}

export default function CourierProfile() {
  const { courier, setCourier } = useOutletContext<{ courier: Courier | null; setCourier: (c: Courier) => void }>()
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [phone, setPhone] = useState(courier?.phone ?? '')
  const [saved, setSaved] = useState(false)

  const payouts = useQuery({
    queryKey: ['courier-payouts', courier?.id],
    queryFn: listPayouts,
    enabled: !!courier?.id,
  })

  const save = useMutation({
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

  if (!courier) {
    return <Skeleton className="h-40" />
  }

  const myPayouts = (payouts.data ?? []).filter((p) => p.courier_id === courier.id)
  const pending = myPayouts.filter((p) => p.status !== 'PAID').reduce((s, p) => s + p.amount_cents, 0)
  const paid = myPayouts.filter((p) => p.status === 'PAID').reduce((s, p) => s + p.amount_cents, 0)

  return (
    <div className="space-y-3">
      {saved && <Alert tone="success">Telefone atualizado.</Alert>}

      <Card className="p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-800 text-sm font-bold text-white">
            {courier.full_name.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-bold text-ink-950">{courier.full_name}</p>
            <p className="text-[11.5px] text-ink-500">{ROLE_LABEL[profile?.role ?? 'COURIER']} · {STATUS_LABEL[courier.status]}</p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-ink-100 pt-3 text-[12px]">
          <div><dt className="text-ink-400">E-mail</dt><dd className="truncate font-medium">{courier.email ?? profile?.email ?? '—'}</dd></div>
          <div><dt className="text-ink-400">CPF</dt><dd className="font-medium">{courier.cpf ?? '—'}</dd></div>
          <div><dt className="text-ink-400">Veículo</dt><dd className="font-medium">{courier.vehicle_type === 'MOTORCYCLE' ? 'Motocicleta' : courier.vehicle_type}</dd></div>
          <div><dt className="text-ink-400">Placa</dt><dd className="font-medium">{courier.vehicle_plate ?? '—'}</dd></div>
          <div><dt className="text-ink-400">CNH</dt><dd className="font-medium">{courier.cnh_category ?? '—'}</dd></div>
          <div><dt className="text-ink-400">Disponibilidade</dt><dd className="font-medium">{AVAILABILITY_LABEL[courier.availability]}</dd></div>
          <div className="col-span-2"><dt className="text-ink-400">Região</dt>
            <dd className="font-medium">{[courier.base_city, courier.base_state].filter(Boolean).join(' / ')}{courier.service_zone ? ` · ${courier.service_zone}` : ''}</dd>
          </div>
          <div className="col-span-2"><dt className="text-ink-400">Aprovado em</dt><dd className="font-medium">{courier.approved_at ? formatDate(courier.approved_at) : '—'}</dd></div>
        </dl>
      </Card>

      <Card className="p-4">
        <p className="text-[12.5px] font-bold text-ink-900">Telefone de contato</p>
        <p className="mt-0.5 text-[11px] text-ink-500">Usado pela central em caso de necessidade.</p>
        <div className="mt-3 flex gap-2">
          <Input value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} inputMode="tel" />
          <Button onClick={() => save.mutate()} loading={save.isPending}>Salvar</Button>
        </div>
      </Card>

      <Card className="p-4">
        <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-bold text-ink-900">
          <Wallet className="h-4 w-4 text-brand-700" /> Repasses
        </p>
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <div className="rounded-lg bg-ink-50 p-2.5">
            <p className="text-[10.5px] text-ink-500">A receber</p>
            <p className="font-bold">{brl(pending)}</p>
          </div>
          <div className="rounded-lg bg-ink-50 p-2.5">
            <p className="text-[10.5px] text-ink-500">Pago</p>
            <p className="font-bold text-emerald-700">{brl(paid)}</p>
          </div>
        </div>
        {myPayouts.length > 0 ? (
          <ul className="mt-2 divide-y divide-ink-100">
            {myPayouts.slice(0, 6).map((p) => (
              <li key={p.id} className="flex items-center justify-between py-1.5 text-[11.5px]">
                <span className="text-ink-600">{p.status === 'PAID' ? `Pago em ${formatDate(p.paid_at)}` : 'Pendente'}</span>
                <span className="font-medium">{brl(p.amount_cents)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[11px] text-ink-400">Os repasses são lançados pela equipe financeira.</p>
        )}
      </Card>

      <Card className="p-4">
        <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-ink-900">
          {courier.location_sharing_enabled ? <ShieldCheck className="h-4 w-4 text-brand-700" /> : <ShieldOff className="h-4 w-4 text-ink-400" />}
          Localização
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-600">
          Você decide quando compartilhar. O controle fica na tela de cada entrega e a escolha não fica
          ativa indefinidamente.
        </p>
        {courier.current_location_at && courier.location_sharing_enabled && (
          <p className="mt-1.5 text-[10.5px] text-ink-500">Último registro: {formatDateTime(courier.current_location_at)}</p>
        )}
        <p className="mt-2 flex items-center gap-1 text-[10.5px] text-ink-400">
          <Bike className="h-3 w-3" /> Cadastrado em {formatDate(courier.created_at)}
        </p>
      </Card>
    </div>
  )
}
