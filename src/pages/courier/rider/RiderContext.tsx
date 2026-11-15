import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react'
import { supabase } from '@/lib/supabase'
import * as api from '@/lib/logistics/api'
import { todayLocal } from '@/lib/logistics/labels'
import {
  applyQueueToDay, isNetworkError, SyncQueue, type OpRunner, type QueueEntry, type QueueOp,
} from '@/lib/logistics/offline/queue'
import { probeServer, runOperation } from '@/lib/logistics/offline/runner'
import { getLocalStore, type LocalStore } from '@/lib/logistics/offline/store'
import type { RiderDay } from '@/lib/logistics/types'

/**
 * Estado do dia do entregador.
 *
 * A tela sempre mostra a última cópia recebida do servidor com os registros
 * do aparelho aplicados por cima. Com ou sem internet o caminho é o mesmo:
 * registrar grava no aparelho, e o envio acontece em seguida ou quando der.
 */

interface RiderState {
  courierId: string | null
  /** cópia do servidor + registros ainda não enviados */
  day: RiderDay | null
  entries: QueueEntry[]
  /** registros aguardando envio */
  pending: number
  /** conflitos e falhas que o entregador precisa ver */
  attention: number
  online: boolean
  syncing: boolean
  loading: boolean
  error: string | null
  store: LocalStore
  /** grava no aparelho e tenta enviar */
  record: (op: QueueOp) => Promise<void>
  /** envia o que estiver pendente e busca o dia de novo */
  sync: () => Promise<void>
  retry: (id: string) => Promise<void>
  dismiss: (id: string) => Promise<void>
}

const RiderContext = createContext<RiderState | undefined>(undefined)

const snapshotKey = (courierId: string) => `day:${courierId}`

/** Sem sessão válida a chamada sairia como visitante e seria recusada: melhor esperar. */
const guardedRunner: OpRunner = async (op, store) => {
  const { data } = await supabase.auth.getSession()
  if (!data.session) return { kind: 'offline', message: 'Sessão indisponível no momento.' }
  return runOperation(op, store)
}

/** Incorpora à cópia do dia os registros que o servidor acabou de aceitar. */
function mergeAccepted(day: RiderDay, accepted: QueueEntry[]): RiderDay {
  if (accepted.length === 0) return day
  const merged = applyQueueToDay(day, accepted.map((entry) => ({ ...entry, state: 'PENDING' as const })))
  for (const route of merged.routes) {
    for (const stop of route.stops) for (const pkg of stop.packages) delete pkg.pendingSync
  }
  return merged
}

export function RiderProvider({ courierId, children }: { courierId: string | null; children: ReactNode }) {
  const store = useMemo(() => getLocalStore(), [])
  const queue = useMemo(
    () => (courierId ? new SyncQueue(store, guardedRunner, courierId, probeServer) : null),
    [store, courierId],
  )
  const [snapshot, setSnapshot] = useState<RiderDay | null>(null)
  const [entries, setEntries] = useState<QueueEntry[]>([])
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false)
  const [syncing, setSyncing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const running = useRef<Promise<void> | null>(null)
  const snapshotRef = useRef<RiderDay | null>(null)
  snapshotRef.current = snapshot

  const saveSnapshot = useCallback(async (next: RiderDay) => {
    setSnapshot(next)
    snapshotRef.current = next
    if (courierId) await store.putSnapshot(snapshotKey(courierId), next).catch(() => undefined)
  }, [courierId, store])

  const sync = useCallback((): Promise<void> => {
    if (!queue || !courierId) return Promise.resolve()
    if (running.current) return running.current
    const cycle = (async () => {
      setSyncing(true)
      try {
        const before = (await queue.entries()).filter((entry) => entry.state === 'PENDING')
        const summary = await queue.flush()
        const after = await queue.entries()
        const left = new Set(after.map((entry) => entry.id))
        const accepted = before.filter((entry) => !left.has(entry.id))
        // o que o servidor aceitou entra na cópia local antes de sair da fila: a tela nunca "volta atrás"
        if (snapshotRef.current && accepted.length > 0) await saveSnapshot(mergeAccepted(snapshotRef.current, accepted))
        setEntries(after)
        if (summary.offline) {
          setOnline(false)
          return
        }
        const fresh = await api.riderDay(todayLocal())
        await saveSnapshot({ ...fresh, fetchedAt: new Date().toISOString() })
        setOnline(true)
        setError(null)
      } catch (cause) {
        if (isNetworkError(cause)) setOnline(false)
        else setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o dia.')
      } finally {
        setSyncing(false)
        setLoading(false)
        running.current = null
      }
    })()
    running.current = cycle
    return cycle
  }, [queue, courierId, saveSnapshot])

  // abre com o que está no aparelho e só então procura o servidor
  useEffect(() => {
    let active = true
    setSnapshot(null)
    setEntries([])
    if (!queue || !courierId) {
      setLoading(false)
      return
    }
    setLoading(true)
    void (async () => {
      const [saved, stored] = await Promise.all([
        store.getSnapshot<RiderDay>(snapshotKey(courierId)).catch(() => null),
        queue.entries().catch(() => []),
      ])
      if (!active) return
      if (saved && saved.courier_id === courierId) {
        setSnapshot(saved)
        setLoading(false)
      }
      setEntries(stored)
      await sync()
    })()
    return () => { active = false }
  }, [queue, courierId, store, sync])

  useEffect(() => {
    if (!queue) return
    const goOnline = () => { setOnline(true); void sync() }
    const goOffline = () => setOnline(false)
    const onVisible = () => { if (document.visibilityState === 'visible') void sync() }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void sync() }, 45_000)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(timer)
    }
  }, [queue, sync])

  const record = useCallback(async (op: QueueOp) => {
    if (!queue) throw new Error('Cadastro de entregador não encontrado.')
    await queue.enqueue(op)
    setEntries(await queue.entries())
    void sync()
  }, [queue, sync])

  const retry = useCallback(async (id: string) => {
    if (!queue) return
    await queue.retry(id)
    setEntries(await queue.entries())
    void sync()
  }, [queue, sync])

  const dismiss = useCallback(async (id: string) => {
    if (!queue) return
    await queue.dismiss(id)
    setEntries(await queue.entries())
  }, [queue])

  const value = useMemo<RiderState>(() => ({
    courierId,
    day: snapshot ? applyQueueToDay(snapshot, entries) : null,
    entries,
    pending: entries.filter((entry) => entry.state === 'PENDING').length,
    attention: entries.filter((entry) => entry.state !== 'PENDING').length,
    online, syncing, loading, error, store, record, sync, retry, dismiss,
  }), [courierId, snapshot, entries, online, syncing, loading, error, store, record, sync, retry, dismiss])

  return <RiderContext.Provider value={value}>{children}</RiderContext.Provider>
}

export function useRider(): RiderState {
  const context = useContext(RiderContext)
  if (!context) throw new Error('useRider deve ser usado dentro de <RiderProvider>')
  return context
}
