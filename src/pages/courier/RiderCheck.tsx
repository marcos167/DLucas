import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Camera, CheckCircle2, CircleDashed, PackageCheck, ScanLine, Truck, Undo2, XCircle } from 'lucide-react'
import { Alert, Badge, Button, Input, Select } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'
import * as api from '@/lib/logistics/api'
import { conflictLabel, MANIFEST_STATUS, PACKAGE_STATUS, routeName, scanDetail } from '@/lib/logistics/labels'
import { isNetworkError, newId } from '@/lib/logistics/offline/queue'
import type { RiderPackage, RiderRoute } from '@/lib/logistics/types'
import { cn } from '@/lib/utils'
import { useRider } from './rider/RiderContext'
import { cameraScanAvailable, ScannerModal } from './rider/Scanner'
import { Page } from './rider/ui'

interface Row { pkg: RiderPackage; route: RiderRoute }
interface Feedback { ok: boolean; title: string; detail?: string }

export default function RiderCheck() {
  const { day, record, sync, online, pending, syncing } = useRider()
  const { push } = useToast()
  const navigate = useNavigate()
  const [chosenBatch, setChosenBatch] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [camera, setCamera] = useState(false)
  const [busy, setBusy] = useState(false)
  const [openCodes, setOpenCodes] = useState<string[] | null>(null)
  const canScanWithCamera = useMemo(() => cameraScanAvailable(), [])

  const batches = useMemo(() => {
    const seen = new Map<string, string>()
    for (const route of day?.routes ?? []) if (!seen.has(route.batch_id)) seen.set(route.batch_id, route.route_date)
    for (const manifest of day?.manifests ?? []) if (manifest.status !== 'CLOSED' && !seen.has(manifest.batch_id)) seen.set(manifest.batch_id, '')
    return [...seen.entries()].map(([id, date]) => ({ id, date }))
  }, [day])
  const batchId = chosenBatch && batches.some((batch) => batch.id === chosenBatch) ? chosenBatch : batches[0]?.id ?? null

  const rows: Row[] = useMemo(() => (day?.routes ?? [])
    .filter((route) => route.batch_id === batchId)
    .flatMap((route) => route.stops.flatMap((stop) => stop.packages.map((pkg) => ({ pkg, route })))), [day, batchId])
  const manifest = day?.manifests.filter((item) => item.batch_id === batchId && item.status !== 'CLOSED').at(-1) ?? null

  const toLoad = rows.filter(({ pkg }) => pkg.status === 'ROUTED' || pkg.status === 'RETURNED')
  const loaded = rows.filter(({ pkg }) => pkg.status === 'LOADED')
  const withMe = rows.filter(({ pkg }) => pkg.status === 'LOADED' || pkg.status === 'FAILED')
  const returning = manifest?.status === 'DEPARTED'

  function signal(next: Feedback) {
    setFeedback(next)
    navigator.vibrate?.(next.ok ? 60 : [120, 80, 120])
  }

  async function handleCode(raw: string) {
    const value = raw.trim().toUpperCase()
    if (!value || !manifest) return
    setCode('')
    const found = rows.find(({ pkg }) => pkg.tracking_code.toUpperCase() === value)
    const scanType = returning ? 'RETURN' : 'LOAD'
    if (found) {
      const { pkg } = found
      const accepted = returning ? ['LOADED', 'FAILED'] : ['ROUTED', 'RETURNED']
      if (accepted.includes(pkg.status)) {
        await record({
          type: 'SCAN', scanId: newId(), code: value, scanType, manifestId: manifest.id, packageId: pkg.id,
          occurredAt: new Date().toISOString(),
        })
        signal({ ok: true, title: returning ? 'Devolução registrada' : 'Conferido', detail: `${pkg.tracking_code} · ${pkg.recipient_name}` })
      } else if (pkg.status === (returning ? 'RETURNED' : 'LOADED')) {
        signal({ ok: true, title: 'Já conferido', detail: pkg.tracking_code })
      } else {
        signal({ ok: false, title: 'Não pode ser conferido agora', detail: `${pkg.tracking_code} · ${PACKAGE_STATUS[pkg.status].label}` })
      }
      return
    }
    // não está na cópia deste aparelho: pergunta ao servidor (pode ter sido liberado há pouco)
    if (!online) {
      signal({ ok: false, title: 'Código fora dos seus roteiros', detail: `${value} não está nos roteiros baixados neste aparelho.` })
      return
    }
    try {
      const reply = await api.registerPackageScan({
        scanId: newId(), code: value, scanType, manifestId: manifest.id, occurredAt: new Date().toISOString(),
      })
      if (reply.status === 'CONFLICT') signal({ ok: false, title: conflictLabel(reply.reason), detail: value })
      else if (reply.result === 'OK') { signal({ ok: true, title: 'Conferido', detail: value }); void sync() }
      else signal({ ok: false, title: scanDetail(reply.result ?? 'UNKNOWN_CODE', reply.detail), detail: value })
    } catch (cause) {
      signal({
        ok: false, title: isNetworkError(cause) ? 'Sem conexão para consultar este código' : 'Não foi possível consultar o código',
        detail: value,
      })
    }
  }

  async function openManifest() {
    if (!batchId) return
    setBusy(true)
    try {
      await api.openManifest(batchId)
      await sync()
    } catch (cause) {
      push({ tone: 'error', message: isNetworkError(cause) ? 'É preciso internet para abrir a conferência.' : (cause as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function depart() {
    if (!manifest) return
    if (toLoad.length > 0 && !window.confirm(`Ainda faltam ${toLoad.length} pacote(s) para conferir. Sair mesmo assim?`)) return
    await record({ type: 'DEPART', manifestId: manifest.id, occurredAt: new Date().toISOString() })
    push({ tone: 'success', message: 'Saída registrada. Boa rota!' })
    navigate('/entregador')
  }

  async function close() {
    if (!manifest) return
    setBusy(true)
    setOpenCodes(null)
    try {
      if (pending > 0) await sync()
      const reply = await api.closeManifest(manifest.id)
      if (reply.status === 'CONFLICT') {
        setOpenCodes(reply.codes ?? [])
      } else {
        push({ tone: 'success', message: 'Conferência fechada.', detail: `${reply.delivered ?? 0} entregue(s), ${reply.returned ?? 0} devolvido(s).` })
        await sync()
      }
    } catch (cause) {
      push({ tone: 'error', message: isNetworkError(cause) ? 'É preciso internet para fechar a conferência.' : (cause as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const submit = (event: FormEvent) => { event.preventDefault(); void handleCode(code) }

  return (
    <Page className="space-y-3">
      <Link to="/entregador" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-600">
        <ArrowLeft className="h-4 w-4" /> Hoje
      </Link>

      {batches.length > 1 && (
        <Select value={batchId ?? ''} onChange={(event) => setChosenBatch(event.target.value)}>
          {batches.map((batch, index) => <option key={batch.id} value={batch.id}>Lote {index + 1}{batch.date ? ` · ${batch.date.split('-').reverse().join('/')}` : ''}</option>)}
        </Select>
      )}

      {!batchId ? (
        <Alert tone="info" title="Nada para conferir">Você não tem roteiros liberados no momento.</Alert>
      ) : !manifest ? (
        <div className="rounded-2xl border border-ink-200 bg-white p-5 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-800"><ScanLine className="h-6 w-6" /></span>
          <h1 className="mt-3 font-display text-lg font-bold text-ink-950">Conferência de saída</h1>
          <p className="mt-1 text-[13px] text-ink-600">
            {toLoad.length > 0
              ? `${toLoad.length} pacote(s) aguardando conferência. Leia cada etiqueta antes de sair.`
              : 'Não há pacotes aguardando conferência.'}
          </p>
          <Button className="mt-4 w-full" size="lg" loading={busy} disabled={toLoad.length === 0} onClick={() => void openManifest()}>
            Abrir conferência
          </Button>
          {!online && <p className="mt-2 text-[12px] text-amber-800">É preciso internet para abrir a conferência.</p>}
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-ink-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-display text-lg font-bold text-ink-950">{returning ? 'Retorno à central' : 'Conferência de saída'}</h1>
                <p className="text-[12px] text-ink-500">Viagem {manifest.trip_number} · {MANIFEST_STATUS[manifest.status]}</p>
              </div>
              <p className="text-right font-display text-xl font-bold text-ink-950">
                {returning ? withMe.length : loaded.length}
                <span className="text-sm font-medium text-ink-400">{returning ? ' com você' : ` / ${loaded.length + toLoad.length}`}</span>
              </p>
            </div>

            <form onSubmit={submit} className="mt-3 flex gap-2">
              <Input
                value={code} onChange={(event) => setCode(event.target.value)} placeholder="Código da etiqueta"
                autoCapitalize="characters" autoComplete="off" autoCorrect="off" enterKeyHint="done" className="font-mono"
              />
              <Button type="submit" disabled={!code.trim()}>{returning ? 'Devolver' : 'Conferir'}</Button>
            </form>
            {canScanWithCamera ? (
              <Button variant="secondary" className="mt-2 w-full" onClick={() => setCamera(true)} icon={<Camera className="h-4 w-4" />}>
                Ler com a câmera
              </Button>
            ) : (
              <p className="mt-2 text-[11.5px] text-ink-500">Este navegador não lê código de barras pela câmera. Digite o código ou use um leitor.</p>
            )}

            {feedback && (
              <div className={cn(
                'mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-[13px]',
                feedback.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900',
              )} role="status">
                {feedback.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                <div><p className="font-semibold">{feedback.title}</p>{feedback.detail && <p className="text-[12px]">{feedback.detail}</p>}</div>
              </div>
            )}
          </div>

          {returning ? (
            <>
              <PackageList
                title="Com você" empty="Nenhum pacote em aberto. Pode fechar a conferência."
                rows={withMe} icon={<Undo2 className="h-3.5 w-3.5" />}
                hint={(pkg) => (pkg.status === 'FAILED' ? 'Devolver à central' : 'Ainda em rota')}
              />
              {openCodes && openCodes.length > 0 && (
                <Alert tone="warning" title="Ainda há pacotes em aberto">
                  Entregue ou devolva antes de fechar: {openCodes.join(', ')}. Se algum pacote se perdeu, avise a central.
                </Alert>
              )}
              <Button className="w-full" size="lg" loading={busy || syncing} onClick={() => void close()} icon={<PackageCheck className="h-4 w-4" />}>
                Fechar conferência
              </Button>
              {!online && <p className="text-center text-[12px] text-amber-800">É preciso internet para fechar a conferência.</p>}
            </>
          ) : (
            <>
              <PackageList title={`Faltam (${toLoad.length})`} empty="Todos os pacotes foram conferidos." rows={toLoad} icon={<CircleDashed className="h-3.5 w-3.5" />} />
              <PackageList title={`Conferidos (${loaded.length})`} empty="Nenhum pacote conferido ainda." rows={loaded} icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />} />
              <Button className="w-full" size="lg" disabled={loaded.length === 0} onClick={() => void depart()} icon={<Truck className="h-4 w-4" />}>
                Sair para entrega com {loaded.length} pacote(s)
              </Button>
            </>
          )}
        </>
      )}

      <ScannerModal open={camera} onClose={() => setCamera(false)} onCode={(value) => void handleCode(value)} />
    </Page>
  )
}

function PackageList({ title, empty, rows, icon, hint }: {
  title: string; empty: string; rows: Row[]; icon: React.ReactNode; hint?: (pkg: RiderPackage) => string
}) {
  return (
    <section className="rounded-2xl border border-ink-200 bg-white">
      <h2 className="border-b border-ink-100 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">{title}</h2>
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-[12.5px] text-ink-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {rows.map(({ pkg, route }) => (
            <li key={pkg.id} className="flex items-center gap-2.5 px-4 py-2.5 text-[13px]">
              {icon}
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-[12.5px] font-semibold text-ink-900">{pkg.tracking_code}</p>
                <p className="truncate text-[11.5px] text-ink-500">{pkg.recipient_name}{hint ? ` · ${hint(pkg)}` : ''}</p>
              </div>
              <Badge>{routeName(route.sequence)}</Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
