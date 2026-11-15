import type { OccurrenceType } from '@/types'
import type { RiderDay, RiderRoute, RiderStop, StopStatus } from '../types'
import type { LocalStore } from './store'

/**
 * Fila de sincronização do aplicativo do entregador.
 *
 * Tudo que o entregador registra entra primeiro nesta fila, no aparelho, e
 * só depois vai ao servidor — com ou sem internet o caminho é o mesmo. Cada
 * registro nasce com identificador próprio, então reenviar não duplica nada.
 *
 * Conflito não é erro: quando o servidor diz que o registro contradiz o estado
 * atual (roteiro transferido, pacote já baixado), o registro fica guardado lá
 * para o supervisor decidir e aqui para o entregador saber.
 */

export type QueueOp =
  | { type: 'START_ROUTE'; routeId: string; occurredAt: string }
  | {
      type: 'ATTEMPT'
      attemptId: string
      packageId: string
      routeId: string
      stopId: string
      outcome: 'DELIVERED' | 'FAILED'
      failureReason: OccurrenceType | null
      notes: string | null
      recipientName: string | null
      recipientDocument: string | null
      latitude: number | null
      longitude: number | null
      occurredAt: string
    }
  | {
      type: 'PROOF'
      blobKey: string
      storagePath: string
      mimeType: string
      sizeBytes: number
      proofs: { proofId: string; attemptId: string }[]
    }
  | {
      type: 'SCAN'
      scanId: string
      code: string
      scanType: 'LOAD' | 'RETURN'
      manifestId: string
      packageId: string | null
      occurredAt: string
    }
  | { type: 'DEPART'; manifestId: string; occurredAt: string }
  | { type: 'REORDER'; routeId: string; stopIds: string[] }

export interface QueueEntry {
  id: string
  /** ordem de criação; a fila é sempre enviada nesta ordem */
  seq: number
  /** entregador dono do registro: outro login no mesmo aparelho não o envia */
  ownerId: string
  createdAt: string
  op: QueueOp
  state: 'PENDING' | 'CONFLICT' | 'FAILED'
  tries: number
  detail: string | null
}

export type OpOutcome =
  | { kind: 'done' }
  | { kind: 'conflict'; reason: string }
  /** sem rede ou falha passageira: para tudo e tenta de novo depois, na mesma ordem */
  | { kind: 'offline'; message?: string }
  /** o servidor recusou de forma definitiva */
  | { kind: 'failed'; message: string }

export type OpRunner = (op: QueueOp, store: LocalStore) => Promise<OpOutcome>

export interface FlushSummary {
  done: number
  conflicts: number
  failed: number
  remaining: number
  offline: boolean
}

/**
 * Depois de tantas falhas passageiras seguidas, a fila verifica se o servidor
 * responde. Se responde, o problema é do registro, e ele sai da frente para
 * não segurar os demais; se não responde, a fila continua esperando.
 */
export const TRANSIENT_TRIES_BEFORE_PROBE = 5

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // navegadores antigos: UUID v4 a partir de bytes aleatórios
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error
    : (error as { message?: string } | null)?.message ?? ''
  return /failed to fetch|networkerror|load failed|fetch failed|network request failed|err_network|timeout|aborted/i.test(message)
}

export class SyncQueue {
  private listeners = new Set<() => void>()
  private running: Promise<FlushSummary> | null = null

  constructor(
    private readonly store: LocalStore,
    private readonly runner: OpRunner,
    readonly ownerId: string,
    /** responde se o servidor está acessível (chamada leve, sem efeito) */
    private readonly probe: () => Promise<boolean> = async () => false,
  ) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private notify() {
    for (const listener of this.listeners) listener()
  }

  async entries(): Promise<QueueEntry[]> {
    return (await this.store.listEntries()).filter((entry) => entry.ownerId === this.ownerId)
  }

  /** Guarda o registro no aparelho. Só retorna depois de gravado de verdade. */
  async enqueue(op: QueueOp, id: string = newId()): Promise<QueueEntry> {
    const all = await this.store.listEntries()
    const last = all.length ? all[all.length - 1].seq : 0
    const entry: QueueEntry = {
      id,
      seq: Math.max(Date.now() * 1000, last + 1),
      ownerId: this.ownerId,
      createdAt: new Date().toISOString(),
      op,
      state: 'PENDING',
      tries: 0,
      detail: null,
    }
    await this.store.putEntry(entry)
    this.notify()
    return entry
  }

  /** Envia o que está pendente, em ordem. Chamadas simultâneas compartilham a mesma execução. */
  flush(): Promise<FlushSummary> {
    if (!this.running) {
      this.running = this.run().finally(() => { this.running = null })
    }
    return this.running
  }

  private async run(): Promise<FlushSummary> {
    const summary: FlushSummary = { done: 0, conflicts: 0, failed: 0, remaining: 0, offline: false }
    const pending = (await this.entries()).filter((entry) => entry.state === 'PENDING')

    for (const entry of pending) {
      let outcome: OpOutcome
      try {
        outcome = await this.runner(entry.op, this.store)
      } catch (error) {
        outcome = isNetworkError(error)
          ? { kind: 'offline', message: (error as Error).message }
          : { kind: 'failed', message: (error as Error).message || 'Falha ao enviar o registro.' }
      }

      if (outcome.kind === 'done') {
        await this.store.removeEntry(entry.id)
        if (entry.op.type === 'PROOF') await this.store.removeBlob(entry.op.blobKey)
        summary.done++
      } else if (outcome.kind === 'conflict') {
        await this.store.putEntry({ ...entry, state: 'CONFLICT', detail: outcome.reason })
        summary.conflicts++
      } else if (outcome.kind === 'failed') {
        await this.store.putEntry({ ...entry, state: 'FAILED', detail: outcome.message, tries: entry.tries + 1 })
        summary.failed++
      } else {
        const tries = entry.tries + 1
        if (tries >= TRANSIENT_TRIES_BEFORE_PROBE && await this.probe().catch(() => false)) {
          // o servidor responde e este registro continua falhando: não segura os demais
          await this.store.putEntry({
            ...entry, state: 'FAILED', tries,
            detail: outcome.message ?? 'O servidor não aceitou este registro depois de várias tentativas.',
          })
          summary.failed++
          continue
        }
        await this.store.putEntry({ ...entry, tries, detail: outcome.message ?? null })
        summary.offline = true
        break
      }
    }

    summary.remaining = (await this.entries()).filter((entry) => entry.state === 'PENDING').length
    this.notify()
    return summary
  }

  /** Recoloca na fila um registro que falhou. */
  async retry(id: string): Promise<void> {
    const entry = (await this.entries()).find((candidate) => candidate.id === id)
    if (!entry || entry.state !== 'FAILED') return
    await this.store.putEntry({ ...entry, state: 'PENDING', tries: 0, detail: null })
    this.notify()
  }

  /** Remove do aparelho um registro já tratado (conflito visto, falha descartada). */
  async dismiss(id: string): Promise<void> {
    const entry = (await this.entries()).find((candidate) => candidate.id === id)
    if (!entry) return
    await this.store.removeEntry(id)
    if (entry.op.type === 'PROOF') await this.store.removeBlob(entry.op.blobKey)
    this.notify()
  }
}

/* ------------------------------------------------------------------ visão local do dia */

function stopStatus(stop: RiderStop): StopStatus {
  const total = stop.packages.length
  const done = stop.packages.filter((pkg) => pkg.status === 'DELIVERED').length
  const failed = stop.packages.filter((pkg) => pkg.status === 'FAILED' || pkg.status === 'RETURNED').length
  if (total === 0 || done === total) return 'COMPLETED'
  if (failed === total) return 'FAILED'
  if (done + failed === total) return 'PARTIAL'
  return 'PENDING'
}

function refreshRoute(route: RiderRoute): void {
  for (const stop of route.stops) stop.status = stopStatus(stop)
  const pending = route.stops.some((stop) => stop.status === 'PENDING')
  if (route.status === 'IN_PROGRESS' && route.stops.length > 0 && !pending) route.status = 'COMPLETED'
  else if (route.status === 'COMPLETED' && pending) route.status = 'IN_PROGRESS'
}

/**
 * Aplica à cópia local do dia os registros que ainda não chegaram ao
 * servidor, com as mesmas regras do banco. É o que permite ao entregador
 * continuar trabalhando sem internet e ver o resultado na hora.
 */
export function applyQueueToDay(day: RiderDay, entries: QueueEntry[]): RiderDay {
  const next = structuredClone(day)
  const routes = new Map(next.routes.map((route) => [route.id, route]))
  const packages = new Map(
    next.routes.flatMap((route) => route.stops.flatMap((stop) => stop.packages.map((pkg) => [pkg.id, { pkg, route }] as const))),
  )
  const manifests = new Map(next.manifests.map((manifest) => [manifest.id, manifest]))
  const setOutcome = (packageId: string, outcome: 'DELIVERED' | 'RETURNED') => {
    for (const manifest of next.manifests) {
      if (manifest.status === 'CLOSED') continue
      const item = manifest.items.find((candidate) => candidate.package_id === packageId)
      if (item && item.outcome === 'OPEN') item.outcome = outcome
    }
  }

  for (const entry of entries.slice().sort((a, b) => a.seq - b.seq)) {
    if (entry.state !== 'PENDING') continue
    const op = entry.op
    if (op.type === 'START_ROUTE') {
      const route = routes.get(op.routeId)
      if (route && route.status === 'RELEASED') { route.status = 'IN_PROGRESS'; route.started_at = op.occurredAt }
    } else if (op.type === 'ATTEMPT') {
      const found = packages.get(op.packageId)
      if (!found) continue
      found.pkg.status = op.outcome
      found.pkg.attempt_count += 1
      found.pkg.pendingSync = true
      if (op.outcome === 'DELIVERED') {
        found.pkg.delivered_at = op.occurredAt
        setOutcome(op.packageId, 'DELIVERED')
      }
      if (found.route.status === 'RELEASED') {
        found.route.status = 'IN_PROGRESS'
        found.route.started_at = found.route.started_at ?? op.occurredAt
      }
    } else if (op.type === 'SCAN') {
      const found = op.packageId ? packages.get(op.packageId) : undefined
      if (!found) continue
      const manifest = manifests.get(op.manifestId)
      if (op.scanType === 'LOAD' && (found.pkg.status === 'ROUTED' || found.pkg.status === 'RETURNED')) {
        found.pkg.status = 'LOADED'
        found.pkg.pendingSync = true
        if (manifest && !manifest.items.some((item) => item.package_id === found.pkg.id)) {
          manifest.items.push({
            package_id: found.pkg.id, tracking_code: found.pkg.tracking_code,
            recipient_name: found.pkg.recipient_name, outcome: 'OPEN',
          })
        }
      } else if (op.scanType === 'RETURN' && (found.pkg.status === 'LOADED' || found.pkg.status === 'FAILED')) {
        found.pkg.status = 'RETURNED'
        found.pkg.pendingSync = true
        setOutcome(found.pkg.id, 'RETURNED')
        if (manifest && manifest.status === 'OPEN') manifest.status = 'DEPARTED'
      }
    } else if (op.type === 'DEPART') {
      const manifest = manifests.get(op.manifestId)
      if (manifest && manifest.status === 'OPEN') { manifest.status = 'DEPARTED'; manifest.departed_at = op.occurredAt }
    } else if (op.type === 'REORDER') {
      const route = routes.get(op.routeId)
      if (!route) continue
      const position = new Map(op.stopIds.map((id, index) => [id, index]))
      const resolved = route.stops.filter((stop) => !position.has(stop.id))
      const pending = route.stops
        .filter((stop) => position.has(stop.id))
        .sort((a, b) => (position.get(a.id) as number) - (position.get(b.id) as number))
      route.stops = resolved.concat(pending).map((stop, index) => ({ ...stop, sequence: index + 1 }))
    }
  }

  for (const route of next.routes) refreshRoute(route)
  return next
}

export interface DayProgress {
  routes: number
  routesDone: number
  routesActive: number
  packages: number
  delivered: number
  failed: number
  pending: number
  addresses: number
}

export function dayProgress(day: RiderDay | null | undefined): DayProgress {
  const progress: DayProgress = {
    routes: 0, routesDone: 0, routesActive: 0, packages: 0, delivered: 0, failed: 0, pending: 0, addresses: 0,
  }
  for (const route of day?.routes ?? []) {
    progress.routes++
    if (route.status === 'COMPLETED') progress.routesDone++
    if (route.status === 'IN_PROGRESS') progress.routesActive++
    progress.addresses += route.stops.length
    for (const stop of route.stops) {
      for (const pkg of stop.packages) {
        progress.packages++
        if (pkg.status === 'DELIVERED') progress.delivered++
        else if (pkg.status === 'FAILED' || pkg.status === 'RETURNED') progress.failed++
        else progress.pending++
      }
    }
  }
  return progress
}
