import type { QueueEntry } from './queue'

/**
 * Armazenamento local do aplicativo do entregador.
 *
 * Guarda três coisas no aparelho: a fila de registros ainda não enviados, os
 * arquivos de comprovante desses registros e a última cópia do dia de
 * trabalho (para abrir os roteiros sem internet). A fila só conhece esta
 * interface; em produção é IndexedDB, nos testes é memória.
 */
export interface LocalStore {
  listEntries(): Promise<QueueEntry[]>
  putEntry(entry: QueueEntry): Promise<void>
  removeEntry(id: string): Promise<void>
  putBlob(key: string, blob: Blob): Promise<void>
  getBlob(key: string): Promise<Blob | null>
  removeBlob(key: string): Promise<void>
  putSnapshot<T>(key: string, value: T): Promise<void>
  getSnapshot<T>(key: string): Promise<T | null>
}

export function createMemoryStore(): LocalStore {
  const entries = new Map<string, QueueEntry>()
  const blobs = new Map<string, Blob>()
  const snapshots = new Map<string, unknown>()
  return {
    async listEntries() {
      return [...entries.values()].sort((a, b) => a.seq - b.seq).map((entry) => structuredClone(entry))
    },
    async putEntry(entry) { entries.set(entry.id, structuredClone(entry)) },
    async removeEntry(id) { entries.delete(id) },
    async putBlob(key, blob) { blobs.set(key, blob) },
    async getBlob(key) { return blobs.get(key) ?? null },
    async removeBlob(key) { blobs.delete(key) },
    async putSnapshot(key, value) { snapshots.set(key, structuredClone(value)) },
    async getSnapshot<T>(key: string) { return (snapshots.get(key) as T | undefined) ?? null },
  }
}

const DB_VERSION = 1
const STORES = { entries: 'queue', blobs: 'blobs', snapshots: 'snapshots' } as const

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Falha no armazenamento local'))
  })
}

/**
 * IndexedDB sem biblioteca: três tabelas chave-valor. A conexão é aberta uma
 * vez e reaproveitada; se o navegador a fechar, a próxima operação reabre.
 */
export function createIndexedDbStore(name = 'dlucas-riders', factory: IDBFactory = indexedDB): LocalStore {
  let connection: Promise<IDBDatabase> | null = null

  function open(): Promise<IDBDatabase> {
    if (!connection) {
      connection = new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open(name, DB_VERSION)
        request.onupgradeneeded = () => {
          const db = request.result
          for (const store of Object.values(STORES)) {
            if (!db.objectStoreNames.contains(store)) db.createObjectStore(store)
          }
        }
        request.onsuccess = () => {
          const db = request.result
          db.onclose = () => { connection = null }
          db.onversionchange = () => { db.close(); connection = null }
          resolve(db)
        }
        request.onerror = () => { connection = null; reject(request.error ?? new Error('IndexedDB indisponível')) }
        request.onblocked = () => { connection = null; reject(new Error('IndexedDB bloqueado por outra aba')) }
      })
    }
    return connection
  }

  async function run<T>(
    store: string, mode: IDBTransactionMode, action: (objectStore: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await open()
    const transaction = db.transaction(store, mode)
    // só considera gravado quando a transação termina de verdade
    const done = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Falha ao gravar localmente'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Gravação local cancelada'))
    })
    done.catch(() => undefined)
    const result = await promisify(action(transaction.objectStore(store)))
    await done
    return result
  }

  return {
    async listEntries() {
      const all = await run<QueueEntry[]>(STORES.entries, 'readonly', (s) => s.getAll() as IDBRequest<QueueEntry[]>)
      return all.sort((a, b) => a.seq - b.seq)
    },
    async putEntry(entry) { await run(STORES.entries, 'readwrite', (s) => s.put(entry, entry.id)) },
    async removeEntry(id) { await run(STORES.entries, 'readwrite', (s) => s.delete(id)) },
    async putBlob(key, blob) { await run(STORES.blobs, 'readwrite', (s) => s.put(blob, key)) },
    async getBlob(key) {
      return (await run<Blob | undefined>(STORES.blobs, 'readonly', (s) => s.get(key) as IDBRequest<Blob | undefined>)) ?? null
    },
    async removeBlob(key) { await run(STORES.blobs, 'readwrite', (s) => s.delete(key)) },
    async putSnapshot(key, value) { await run(STORES.snapshots, 'readwrite', (s) => s.put(value, key)) },
    async getSnapshot<T>(key: string) {
      return (await run<T | undefined>(STORES.snapshots, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>)) ?? null
    },
  }
}

let shared: LocalStore | null = null

/** Armazenamento do aparelho; cai para memória onde não há IndexedDB (modo privado antigo, testes). */
export function getLocalStore(): LocalStore {
  if (!shared) {
    shared = typeof indexedDB === 'undefined' ? createMemoryStore() : createIndexedDbStore()
  }
  return shared
}
