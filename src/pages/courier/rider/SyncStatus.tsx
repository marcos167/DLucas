import { useState } from 'react'
import { AlertTriangle, ChevronRight, CloudOff, RefreshCw } from 'lucide-react'
import { Badge, Button, Modal } from '@/components/ui'
import { conflictLabel, describeEntry } from '@/lib/logistics/labels'
import { formatDateTime, relativeTime } from '@/lib/utils'
import { useRider } from './RiderContext'

/** Aviso de que o aparelho está sem internet e o trabalho continua valendo. */
export function OfflineNotice() {
  const { online } = useRider()
  if (online) return null
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12.5px] text-amber-900">
      <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-semibold">Sem internet</p>
        <p>Pode continuar: o que você registrar fica guardado neste aparelho e sobe sozinho quando a conexão voltar.</p>
      </div>
    </div>
  )
}

/**
 * Situação do envio dos registros feitos no aparelho, com a lista para
 * acompanhar, tentar de novo ou dispensar o que o servidor não aceitou.
 */
export function SyncStatus() {
  const { day, entries, pending, attention, online, syncing, sync, retry, dismiss } = useRider()
  const [open, setOpen] = useState(false)
  const troubled = entries.filter((entry) => entry.state !== 'PENDING')

  return (
    <>
      <button
        type="button" onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-ink-200 bg-white px-4 py-3 text-left"
      >
        <RefreshCw className={`h-4 w-4 shrink-0 text-ink-500 ${syncing ? 'animate-spin' : ''}`} />
        <div className="min-w-0 flex-1 text-[12.5px]">
          <p className="font-semibold text-ink-900">
            {pending > 0 ? `${pending} registro(s) aguardando envio` : attention > 0 ? 'Há registros que precisam de atenção' : 'Tudo enviado'}
          </p>
          <p className="truncate text-ink-500">
            {day ? `Atualizado ${relativeTime(day.fetchedAt)}` : 'Ainda sem dados do servidor'}
          </p>
        </div>
        {attention > 0 && <Badge tone="danger">{attention}</Badge>}
        <ChevronRight className="h-4 w-4 text-ink-400" />
      </button>

      <Modal
        open={open} onClose={() => setOpen(false)} title="Envio dos registros"
        description={online ? 'Os registros sobem sozinhos; aqui você acompanha.' : 'Sem internet no momento. Nada se perde.'}
        footer={<Button loading={syncing} onClick={() => void sync()} icon={<RefreshCw className="h-4 w-4" />}>Enviar agora</Button>}
      >
        {entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-500">Nenhum registro guardado neste aparelho.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {troubled.concat(entries.filter((entry) => entry.state === 'PENDING')).map((entry) => (
              <li key={entry.id} className="py-3 text-[13px]">
                <div className="flex items-start gap-2">
                  {entry.state === 'PENDING'
                    ? <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
                    : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-900">{describeEntry(entry)}</p>
                    <p className="text-[11.5px] text-ink-500">{formatDateTime(entry.createdAt)}</p>
                    {entry.state === 'CONFLICT' && (
                      <p className="mt-1 text-[12px] text-red-700">
                        {conflictLabel(entry.detail)}.{' '}
                        {entry.op.type === 'ATTEMPT' || entry.op.type === 'PROOF'
                          ? 'O registro foi guardado e a central vai decidir se ele vale.'
                          : 'Nada foi alterado.'}
                      </p>
                    )}
                    {entry.state === 'FAILED' && <p className="mt-1 text-[12px] text-red-700">Não foi aceito: {entry.detail}</p>}
                  </div>
                </div>
                {entry.state !== 'PENDING' && (
                  <div className="mt-2 flex justify-end gap-2">
                    {entry.state === 'FAILED' && <Button size="sm" variant="secondary" onClick={() => void retry(entry.id)}>Tentar de novo</Button>}
                    <Button size="sm" variant="ghost" onClick={() => void dismiss(entry.id)}>
                      {entry.state === 'CONFLICT' ? 'Entendi' : 'Descartar'}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  )
}
