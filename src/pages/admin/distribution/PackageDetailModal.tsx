import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { Alert, Badge, Button, Field, Input, Modal, Skeleton } from '@/components/ui'
import { useApiMutation } from '@/hooks/useApiMutation'
import * as api from '@/lib/logistics/api'
import { formatZip, normalizeZip } from '@/lib/logistics/cep'
import { conflictLabel, EXCEPTION_REASON, PACKAGE_STATUS, ROUTE_STATUS, routeName, SCAN_RESULT } from '@/lib/logistics/labels'
import { formatDateTime, OCCURRENCE_TYPE_LABEL } from '@/lib/utils'

const METHOD: Record<string, string> = { AUTO_CEP: 'Distribuição por CEP', MANUAL: 'Atribuição manual', TRANSFER: 'Transferência de roteiro' }
const SCAN_TYPE: Record<string, string> = { LOAD: 'Saída', RETURN: 'Devolução', TRANSFER: 'Transferência', CHECK: 'Consulta' }
const EVENT: Record<string, string> = {
  PACKAGE_DELIVERED: 'Entrega registrada', DELIVERY_FAILED: 'Tentativa sem sucesso', ATTEMPT_CONFLICT: 'Registro em conflito',
}

/** Rastro completo de um pacote e correção de endereço. */
export function PackageDetailModal({ packageId, canOperate, onClose, onChanged }: {
  packageId: string; canOperate: boolean; onClose: () => void; onChanged: () => void
}) {
  const query = useQuery({ queryKey: ['logistics', 'package', packageId], queryFn: () => api.packageDetail(packageId) })
  const pkg = query.data?.package
  const [form, setForm] = useState({ zip: '', street: '', number: '', complement: '', district: '', phone: '' })
  useEffect(() => {
    if (pkg) {
      setForm({
        zip: pkg.zip_code ? formatZip(pkg.zip_code) : pkg.zip_raw ?? '', street: pkg.street, number: pkg.number ?? '',
        complement: pkg.complement ?? '', district: pkg.district ?? '', phone: pkg.recipient_phone ?? '',
      })
    }
  }, [pkg])

  const editable = canOperate && !!pkg && ['RECEIVED', 'EXCEPTION', 'ASSIGNED'].includes(pkg.status)
  const zip = normalizeZip(form.zip)
  const save = useApiMutation({
    mutationFn: () => api.updatePackageAddress(packageId, {
      zip_code: zip, street: form.street.trim(), number: form.number.trim() || null, complement: form.complement.trim() || null,
      district: form.district.trim() || null, recipient_phone: form.phone.trim() || null,
      // endereço mudou: a posição antiga deixa de valer
      ...(pkg && (zip !== pkg.zip_code || form.street.trim() !== pkg.street || (form.number.trim() || null) !== pkg.number)
        ? { latitude: null, longitude: null, geocode_source: null } : {}),
    }),
    successMessage: 'Endereço atualizado. Distribua de novo para aplicar a cobertura.',
    onSuccess: () => { void query.refetch(); onChanged() },
  })
  const openProof = async (path: string) => {
    const url = await api.proofUrl(path)
    if (url) window.open(url, '_blank', 'noopener')
  }
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [key]: event.target.value }))

  return (
    <Modal open onClose={onClose} size="xl" title={pkg ? `Pacote ${pkg.tracking_code}` : 'Pacote'}
      description={pkg ? `${pkg.recipient_name} · lote ${pkg.batch_code ?? ''}` : undefined}
      footer={<Button variant="secondary" onClick={onClose}>Fechar</Button>}>
      {query.isLoading || !query.data || !pkg ? (
        query.isError ? <Alert tone="danger">{(query.error as Error).message}</Alert> : <Skeleton className="h-40 w-full" />
      ) : (
        <div className="space-y-5 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={PACKAGE_STATUS[pkg.status].tone}>{PACKAGE_STATUS[pkg.status].label}</Badge>
            {pkg.exception_reason && <Badge tone="danger">{EXCEPTION_REASON[pkg.exception_reason].label}</Badge>}
            <span className="text-ink-600">Responsável: <strong>{pkg.courier_name ?? 'ninguém'}</strong></span>
            {query.data.route && (
              <span className="text-ink-600">
                · {routeName(query.data.route.sequence)}, parada {query.data.route.stop_sequence} ({ROUTE_STATUS[query.data.route.status].label})
              </span>
            )}
            {pkg.attempt_count > 0 && <span className="text-ink-600">· {pkg.attempt_count} tentativa(s)</span>}
          </div>
          {pkg.exception_detail && <p className="text-ink-600">{pkg.exception_detail}</p>}

          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-500">Endereço e contato</h3>
            {editable ? (
              <div className="grid gap-3 sm:grid-cols-6">
                <Field label="CEP" className="sm:col-span-2" error={form.zip && !zip ? 'CEP deve ter 8 dígitos' : undefined}>
                  <Input value={form.zip} onChange={set('zip')} inputMode="numeric" invalid={!!form.zip && !zip} />
                </Field>
                <Field label="Logradouro" className="sm:col-span-3"><Input value={form.street} onChange={set('street')} /></Field>
                <Field label="Número" className="sm:col-span-1"><Input value={form.number} onChange={set('number')} /></Field>
                <Field label="Complemento" className="sm:col-span-2"><Input value={form.complement} onChange={set('complement')} /></Field>
                <Field label="Bairro" className="sm:col-span-2"><Input value={form.district} onChange={set('district')} /></Field>
                <Field label="Telefone" className="sm:col-span-2"><Input value={form.phone} onChange={set('phone')} inputMode="tel" /></Field>
                <div className="sm:col-span-6">
                  <Button size="sm" loading={save.isPending} disabled={!form.street.trim() || (!!form.zip && !zip)} onClick={() => save.mutate()}>Salvar endereço</Button>
                </div>
              </div>
            ) : (
              <p className="text-ink-700">
                {pkg.street}{pkg.number ? `, ${pkg.number}` : ''}{pkg.complement ? ` · ${pkg.complement}` : ''} — {[pkg.district, pkg.city, pkg.state].filter(Boolean).join(', ')}
                {pkg.zip_code ? ` · CEP ${formatZip(pkg.zip_code)}` : ''}{pkg.recipient_phone ? ` · ${pkg.recipient_phone}` : ''}
              </p>
            )}
            {pkg.delivery_instructions && <p className="mt-2 text-ink-600">Instruções: {pkg.delivery_instructions}</p>}
          </section>

          <Timeline title="Responsáveis" empty="Ainda sem responsável.">
            {query.data.assignments.map((item) => (
              <li key={item.id}>
                <strong>{item.courier_name}</strong> · {METHOD[item.method] ?? item.method}{item.region_name ? ` (${item.region_name})` : ''}
                {item.reason ? ` — ${item.reason}` : ''}
                <span className="block text-[11.5px] text-ink-500">
                  {formatDateTime(item.assigned_at)}{item.assigned_by_name ? ` por ${item.assigned_by_name}` : ''}
                  {item.ended_at ? ` · encerrado em ${formatDateTime(item.ended_at)}` : ' · atual'}
                </span>
              </li>
            ))}
          </Timeline>

          <Timeline title="Entregas e tentativas" empty="Nenhuma tentativa registrada.">
            {query.data.attempts.map((item) => (
              <li key={item.id}>
                <Badge tone={item.outcome === 'DELIVERED' ? 'success' : 'danger'}>{item.outcome === 'DELIVERED' ? 'Entregue' : 'Não entregue'}</Badge>{' '}
                {item.sync_status === 'CONFLICT' && <Badge tone="warning">Em conflito: {conflictLabel(item.conflict_reason)}</Badge>}
                {item.sync_status === 'DISCARDED' && <Badge>Descartado pela supervisão</Badge>}
                <span className="ml-1">{item.courier_name}</span>
                {item.failure_reason && ` · ${OCCURRENCE_TYPE_LABEL[item.failure_reason]}`}
                {item.recipient_name && ` · recebido por ${item.recipient_name}${item.recipient_document ? ` (${item.recipient_document})` : ''}`}
                {item.notes && ` — ${item.notes}`}
                <span className="block text-[11.5px] text-ink-500">
                  Ocorreu em {formatDateTime(item.occurred_at)} · recebido pelo servidor em {formatDateTime(item.received_at)}
                  {item.resolution_note ? ` · decisão: ${item.resolution_note}` : ''}
                </span>
                {item.proofs.map((proof) => (
                  <button key={proof.id} type="button" onClick={() => void openProof(proof.storage_path)}
                    className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-800 underline">
                    <ExternalLink className="h-3 w-3" /> Ver comprovante
                  </button>
                ))}
              </li>
            ))}
          </Timeline>

          <Timeline title="Conferências" empty="Nenhuma leitura registrada.">
            {query.data.scans.map((item) => (
              <li key={item.id}>
                {SCAN_TYPE[item.scan_type] ?? item.scan_type} · {SCAN_RESULT[item.result]}{item.courier_name ? ` · ${item.courier_name}` : ''}
                <span className="block text-[11.5px] text-ink-500">{formatDateTime(item.occurred_at)}</span>
              </li>
            ))}
          </Timeline>

          {query.data.events.length > 0 && (
            <Timeline title="Histórico" empty="">
              {query.data.events.map((item) => (
                <li key={item.id}>
                  {EVENT[item.event] ?? item.event}{item.actor_name ? ` · ${item.actor_name}` : ''}
                  <span className="block text-[11.5px] text-ink-500">{formatDateTime(item.created_at)}</span>
                </li>
              ))}
            </Timeline>
          )}
        </div>
      )}
    </Modal>
  )
}

function Timeline({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-500">{title}</h3>
      {children.length === 0
        ? <p className="text-ink-500">{empty}</p>
        : <ul className="space-y-2 border-l-2 border-ink-100 pl-3">{children}</ul>}
    </section>
  )
}
