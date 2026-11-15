import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import {
  applyQueueToDay, dayProgress, isNetworkError, newId, SyncQueue, TRANSIENT_TRIES_BEFORE_PROBE,
  type OpOutcome, type QueueOp,
} from './queue'
import { createIndexedDbStore, createMemoryStore, type LocalStore } from './store'
import type { RiderDay } from '../types'

const COURIER = 'c0000000-0000-4000-8000-000000000001'

function attempt(packageId: string, outcome: 'DELIVERED' | 'FAILED' = 'DELIVERED'): QueueOp {
  return {
    type: 'ATTEMPT', attemptId: newId(), packageId, routeId: 'r1', stopId: 's1', outcome,
    failureReason: outcome === 'FAILED' ? 'RECIPIENT_ABSENT' : null, notes: null,
    recipientName: outcome === 'DELIVERED' ? 'Maria' : null, recipientDocument: null,
    latitude: null, longitude: null, occurredAt: '2026-11-15T12:00:00.000Z',
  }
}

/** Servidor de mentira: fica "sem rede" até `online` virar verdadeiro e aplica cada registro uma vez só. */
function fakeServer() {
  const state = { online: false, applied: [] as string[], calls: 0, conflicts: new Set<string>(), reject: new Set<string>() }
  const seen = new Set<string>()
  const runner = async (op: QueueOp): Promise<OpOutcome> => {
    state.calls++
    if (!state.online) throw new TypeError('Failed to fetch')
    const key = op.type === 'ATTEMPT' ? op.attemptId : op.type === 'SCAN' ? op.scanId
      : op.type === 'PROOF' ? op.blobKey : op.type === 'START_ROUTE' ? `start:${op.routeId}`
        : op.type === 'DEPART' ? `depart:${op.manifestId}` : `reorder:${op.routeId}`
    if (state.reject.has(key)) return { kind: 'failed', message: 'Registro de entrega inválido' }
    if (state.conflicts.has(key)) return { kind: 'conflict', reason: 'NOT_ASSIGNED' }
    if (!seen.has(key)) { seen.add(key); state.applied.push(key) }
    return { kind: 'done' }
  }
  return { state, runner }
}

function day(): RiderDay {
  const pkg = (id: string, status: 'ROUTED' | 'LOADED' = 'LOADED') => ({
    id, tracking_code: id.toUpperCase(), recipient_name: 'Cliente', recipient_phone: null, complement: null,
    delivery_instructions: null, is_temperature_controlled: false, status, attempt_count: 0, delivered_at: null,
  })
  const stop = (id: string, sequence: number, packages: ReturnType<typeof pkg>[]) => ({
    id, route_id: 'r1', sequence, planned_sequence: sequence, zip_code: '02710000', street: 'Rua', number: String(sequence),
    district: null, city: null, state: null, latitude: null, longitude: null, leg_distance_m: null, leg_duration_s: null,
    status: 'PENDING' as const, packages,
  })
  return {
    courier_id: COURIER, date: '2026-11-15', fetchedAt: '2026-11-15T11:00:00.000Z', manifests: [],
    config: { require_loading_scan: true, service_minutes_per_stop: 4 },
    routes: [{
      id: 'r1', batch_id: 'b1', route_date: '2026-11-15', sequence: 1, status: 'RELEASED', zip_prefix: '027',
      planned_distance_m: null, planned_duration_s: null, started_at: null, completed_at: null,
      stops: [stop('s1', 1, [pkg('p1'), pkg('p2')]), stop('s2', 2, [pkg('p3')])],
    }],
  }
}

describe('critério de prontidão: trabalhar sem internet e sincronizar depois', () => {
  it('guarda os registros no aparelho enquanto não há rede e envia tudo, em ordem, quando ela volta', async () => {
    const store = createMemoryStore()
    const server = fakeServer()
    const queue = new SyncQueue(store, server.runner, COURIER)

    const first = attempt('p1')
    const second = attempt('p2', 'FAILED')
    await queue.enqueue({ type: 'START_ROUTE', routeId: 'r1', occurredAt: '2026-11-15T11:59:00.000Z' })
    await queue.enqueue(first)
    await queue.enqueue(second)

    const offline = await queue.flush()
    expect(offline).toMatchObject({ done: 0, remaining: 3, offline: true })
    // parou no primeiro: não adianta insistir nos seguintes sem rede
    expect(server.state.calls).toBe(1)
    expect(server.state.applied).toEqual([])

    server.state.online = true
    const online = await queue.flush()
    expect(online).toMatchObject({ done: 3, conflicts: 0, failed: 0, remaining: 0, offline: false })
    expect(server.state.applied).toEqual([
      'start:r1', (first as { attemptId: string }).attemptId, (second as { attemptId: string }).attemptId,
    ])
    expect(await queue.entries()).toEqual([])
  })

  it('reenviar depois de uma resposta perdida não duplica o registro', async () => {
    const store = createMemoryStore()
    const op = attempt('p1')
    const applied: string[] = []
    let dropResponse = true
    const queue = new SyncQueue(store, async (current) => {
      const id = (current as { attemptId: string }).attemptId
      if (!applied.includes(id)) applied.push(id) // o servidor gravou…
      if (dropResponse) { dropResponse = false; throw new TypeError('Failed to fetch') } // …mas a resposta se perdeu
      return { kind: 'done' }
    }, COURIER)
    await queue.enqueue(op)
    expect((await queue.flush()).offline).toBe(true)
    expect((await queue.flush()).done).toBe(1)
    expect(applied).toHaveLength(1)
  })

  it('conflito fica guardado para o entregador ver e não trava os registros seguintes', async () => {
    const store = createMemoryStore()
    const server = fakeServer()
    server.state.online = true
    const queue = new SyncQueue(store, server.runner, COURIER)
    const transferred = attempt('p1')
    const fine = attempt('p3')
    server.state.conflicts.add((transferred as { attemptId: string }).attemptId)
    await queue.enqueue(transferred)
    await queue.enqueue(fine)

    const summary = await queue.flush()
    expect(summary).toMatchObject({ done: 1, conflicts: 1, remaining: 0 })
    const left = await queue.entries()
    expect(left).toHaveLength(1)
    expect(left[0]).toMatchObject({ state: 'CONFLICT', detail: 'NOT_ASSIGNED' })

    // um conflito não é reenviado sozinho
    const calls = server.state.calls
    await queue.flush()
    expect(server.state.calls).toBe(calls)
    await queue.dismiss(left[0].id)
    expect(await queue.entries()).toEqual([])
  })

  it('recusa definitiva do servidor vira falha visível, que pode ser reenviada', async () => {
    const store = createMemoryStore()
    const server = fakeServer()
    server.state.online = true
    const queue = new SyncQueue(store, server.runner, COURIER)
    const bad = attempt('p1')
    const key = (bad as { attemptId: string }).attemptId
    server.state.reject.add(key)
    const entry = await queue.enqueue(bad)
    expect(await queue.flush()).toMatchObject({ failed: 1, remaining: 0 })
    expect((await queue.entries())[0]).toMatchObject({ state: 'FAILED', detail: 'Registro de entrega inválido' })

    server.state.reject.delete(key)
    await queue.retry(entry.id)
    expect(await queue.flush()).toMatchObject({ done: 1, failed: 0 })
  })

  it('registros de outro login no mesmo aparelho não são enviados nem exibidos', async () => {
    const store = createMemoryStore()
    const server = fakeServer()
    server.state.online = true
    const mine = new SyncQueue(store, server.runner, COURIER)
    const theirs = new SyncQueue(store, server.runner, 'c0000000-0000-4000-8000-000000000002')
    await theirs.enqueue(attempt('p9'))
    await mine.enqueue(attempt('p1'))
    expect(await mine.flush()).toMatchObject({ done: 1 })
    expect(await mine.entries()).toEqual([])
    expect(await theirs.entries()).toHaveLength(1)
  })

  it('envia a foto guardada no aparelho e a apaga só depois de confirmada', async () => {
    const store = createMemoryStore()
    const blob = new Blob(['foto'], { type: 'image/jpeg' })
    await store.putBlob('blob-1', blob)
    const uploaded: string[] = []
    let online = false
    const queue = new SyncQueue(store, async (op, local) => {
      if (!online) throw new TypeError('Failed to fetch')
      if (op.type === 'PROOF') {
        const file = await local.getBlob(op.blobKey)
        if (!file) return { kind: 'failed', message: 'Arquivo do comprovante não está mais no aparelho.' }
        uploaded.push(`${op.storagePath}:${file.size}`)
      }
      return { kind: 'done' }
    }, COURIER)
    await queue.enqueue({
      type: 'PROOF', blobKey: 'blob-1', storagePath: `couriers/${COURIER}/a.jpg`, mimeType: 'image/jpeg', sizeBytes: 4,
      proofs: [{ proofId: newId(), attemptId: newId() }],
    })
    await queue.flush()
    expect(await store.getBlob('blob-1')).not.toBeNull()
    online = true
    await queue.flush()
    expect(uploaded).toEqual([`couriers/${COURIER}/a.jpg:4`])
    expect(await store.getBlob('blob-1')).toBeNull()
  })

  it('duas chamadas simultâneas de envio não mandam o mesmo registro duas vezes', async () => {
    const store = createMemoryStore()
    let calls = 0
    const queue = new SyncQueue(store, async () => {
      calls++
      await new Promise((resolve) => setTimeout(resolve, 5))
      return { kind: 'done' }
    }, COURIER)
    await queue.enqueue(attempt('p1'))
    const [a, b] = await Promise.all([queue.flush(), queue.flush()])
    expect(calls).toBe(1)
    expect(a).toBe(b)
  })

  it('avisa quem está ouvindo quando a fila muda', async () => {
    const queue = new SyncQueue(createMemoryStore(), async () => ({ kind: 'done' }), COURIER)
    let changes = 0
    const stop = queue.subscribe(() => { changes++ })
    await queue.enqueue(attempt('p1'))
    await queue.flush()
    expect(changes).toBe(2)
    stop()
    await queue.enqueue(attempt('p2'))
    expect(changes).toBe(2)
  })
})

describe('registro que o servidor não aceita não pode travar a fila para sempre', () => {
  const failing: OpOutcome = { kind: 'offline', message: 'erro 500' }

  it('sem resposta do servidor, a fila espera: nada é descartado', async () => {
    const queue = new SyncQueue(createMemoryStore(), async () => failing, COURIER, async () => false)
    await queue.enqueue(attempt('p1'))
    await queue.enqueue(attempt('p2'))
    for (let round = 0; round < TRANSIENT_TRIES_BEFORE_PROBE + 3; round++) {
      expect(await queue.flush()).toMatchObject({ offline: true, remaining: 2, failed: 0 })
    }
    expect((await queue.entries()).map((entry) => entry.state)).toEqual(['PENDING', 'PENDING'])
  })

  it('com o servidor respondendo, o registro problemático sai da frente e os demais seguem', async () => {
    const sent: string[] = []
    let probes = 0
    const bad = attempt('p1')
    const good = attempt('p2')
    const queue = new SyncQueue(createMemoryStore(), async (op) => {
      if (op.type === 'ATTEMPT' && op.packageId === 'p1') return failing
      sent.push(op.type === 'ATTEMPT' ? op.packageId : op.type)
      return { kind: 'done' }
    }, COURIER, async () => { probes++; return true })
    await queue.enqueue(bad)
    await queue.enqueue(good)

    for (let round = 1; round < TRANSIENT_TRIES_BEFORE_PROBE; round++) {
      expect(await queue.flush()).toMatchObject({ offline: true, remaining: 2 })
    }
    expect(probes).toBe(0)
    expect(sent).toEqual([])

    expect(await queue.flush()).toMatchObject({ failed: 1, done: 1, remaining: 0, offline: false })
    expect(probes).toBe(1)
    expect(sent).toEqual(['p2'])
    const [left] = await queue.entries()
    expect(left).toMatchObject({ state: 'FAILED', detail: 'erro 500' })

    // continua no aparelho e pode ser reenviado
    await queue.retry(left.id)
    expect((await queue.entries())[0]).toMatchObject({ state: 'PENDING', tries: 0 })
  })
})

describe('armazenamento no aparelho (IndexedDB)', () => {
  function stores(): [string, () => LocalStore][] {
    return [
      ['memória', () => createMemoryStore()],
      ['IndexedDB', () => createIndexedDbStore(`teste-${newId()}`, new IDBFactory())],
    ]
  }

  for (const [name, create] of stores()) {
    it(`${name}: fila, arquivos e cópia do dia sobrevivem e saem na ordem de criação`, async () => {
      const store = create()
      const queue = new SyncQueue(store, async () => ({ kind: 'offline' }), COURIER)
      const ids: string[] = []
      for (const packageId of ['p1', 'p2', 'p3']) ids.push((await queue.enqueue(attempt(packageId))).id)
      expect((await store.listEntries()).map((entry) => entry.id)).toEqual(ids)

      await store.putBlob('foto', new Blob(['abc'], { type: 'image/jpeg' }))
      expect(await store.getBlob('foto')).not.toBeNull()
      expect(await store.getBlob('nao-existe')).toBeNull()

      await store.putSnapshot('dia', day())
      expect((await store.getSnapshot<RiderDay>('dia'))?.routes[0].stops).toHaveLength(2)
      expect(await store.getSnapshot('outro')).toBeNull()

      await store.removeEntry(ids[0])
      await store.removeBlob('foto')
      expect((await store.listEntries()).map((entry) => entry.id)).toEqual(ids.slice(1))
      expect(await store.getBlob('foto')).toBeNull()
    })
  }

  it('o que foi gravado continua lá depois de fechar e reabrir o aplicativo', async () => {
    const factory = new IDBFactory()
    const before = new SyncQueue(createIndexedDbStore('persistente', factory), async () => ({ kind: 'offline' }), COURIER)
    const entry = await before.enqueue(attempt('p1'))
    // nova instância = aplicativo reaberto
    const server = fakeServer()
    server.state.online = true
    const after = new SyncQueue(createIndexedDbStore('persistente', factory), server.runner, COURIER)
    expect((await after.entries()).map((e) => e.id)).toEqual([entry.id])
    expect(await after.flush()).toMatchObject({ done: 1, remaining: 0 })
  })
})

describe('visão local do dia com registros pendentes', () => {
  it('mostra a baixa na hora, inicia o roteiro e marca o pacote como aguardando envio', () => {
    const applied = applyQueueToDay(day(), [
      { id: 'e1', seq: 1, ownerId: COURIER, createdAt: '', op: attempt('p1'), state: 'PENDING', tries: 0, detail: null },
    ])
    const route = applied.routes[0]
    expect(route.status).toBe('IN_PROGRESS')
    expect(route.started_at).toBe('2026-11-15T12:00:00.000Z')
    expect(route.stops[0].packages[0]).toMatchObject({ status: 'DELIVERED', pendingSync: true, attempt_count: 1 })
    expect(route.stops[0].status).toBe('PENDING') // ainda falta um pacote neste endereço
  })

  it('aplica as mesmas regras do banco para parada e roteiro', () => {
    const entry = (seq: number, op: QueueOp) =>
      ({ id: `e${seq}`, seq, ownerId: COURIER, createdAt: '', op, state: 'PENDING' as const, tries: 0, detail: null })
    const partial = applyQueueToDay(day(), [entry(1, attempt('p1')), entry(2, attempt('p2', 'FAILED'))])
    expect(partial.routes[0].stops[0].status).toBe('PARTIAL')
    expect(partial.routes[0].status).toBe('IN_PROGRESS')

    const done = applyQueueToDay(day(), [
      entry(1, attempt('p1')), entry(2, attempt('p2', 'FAILED')), entry(3, attempt('p3', 'FAILED')),
    ])
    expect(done.routes[0].stops.map((stop) => stop.status)).toEqual(['PARTIAL', 'FAILED'])
    expect(done.routes[0].status).toBe('COMPLETED')
    expect(dayProgress(done)).toMatchObject({ packages: 3, delivered: 1, failed: 2, pending: 0, routesDone: 1 })
  })

  it('ignora o que está em conflito ou falhou: a tela mostra o que o servidor tem', () => {
    const original = day()
    const applied = applyQueueToDay(original, [
      { id: 'e1', seq: 1, ownerId: COURIER, createdAt: '', op: attempt('p1'), state: 'CONFLICT', tries: 1, detail: 'NOT_ASSIGNED' },
      { id: 'e2', seq: 2, ownerId: COURIER, createdAt: '', op: attempt('p2'), state: 'FAILED', tries: 1, detail: 'x' },
    ])
    expect(applied).toEqual(original)
    // e nunca altera a cópia guardada
    expect(original.routes[0].stops[0].packages[0].status).toBe('LOADED')
  })

  it('aplica conferência e nova ordem das paradas pendentes', () => {
    const base = day()
    base.routes[0].stops[0].packages[0].status = 'ROUTED'
    const applied = applyQueueToDay(base, [
      { id: 'e1', seq: 1, ownerId: COURIER, createdAt: '', state: 'PENDING', tries: 0, detail: null,
        op: { type: 'SCAN', scanId: newId(), code: 'P1', scanType: 'LOAD', manifestId: 'm1', packageId: 'p1', occurredAt: '' } },
      { id: 'e2', seq: 2, ownerId: COURIER, createdAt: '', state: 'PENDING', tries: 0, detail: null,
        op: { type: 'REORDER', routeId: 'r1', stopIds: ['s2', 's1'] } },
    ])
    expect(applied.routes[0].stops[1].packages[0]).toMatchObject({ id: 'p1', status: 'LOADED', pendingSync: true })
    expect(applied.routes[0].stops.map((stop) => [stop.id, stop.sequence])).toEqual([['s2', 1], ['s1', 2]])
    expect(applied.routes[0].status).toBe('RELEASED') // conferir não inicia o roteiro
  })

  it('conferência: leitura de saída entra na lista, saída e retorno mudam a situação', () => {
    const base = day()
    base.routes[0].stops[0].packages[0].status = 'ROUTED'
    base.manifests = [{
      id: 'm1', batch_id: 'b1', trip_number: 1, status: 'OPEN', opened_at: '2026-11-15T10:00:00.000Z',
      departed_at: null, closed_at: null,
      items: [{ package_id: 'p2', tracking_code: 'P2', recipient_name: 'Cliente', outcome: 'OPEN' }],
    }]
    const entry = (seq: number, op: QueueOp) => ({
      id: `e${seq}`, seq, ownerId: COURIER, createdAt: '', op, state: 'PENDING' as const, tries: 0, detail: null,
    })
    const scan = (seq: number, packageId: string, scanType: 'LOAD' | 'RETURN') => entry(seq, {
      type: 'SCAN', scanId: newId(), code: packageId.toUpperCase(), scanType, manifestId: 'm1', packageId,
      occurredAt: '2026-11-15T10:05:00.000Z',
    })

    const loaded = applyQueueToDay(base, [scan(1, 'p1', 'LOAD')])
    expect(loaded.routes[0].stops[0].packages[0]).toMatchObject({ status: 'LOADED', pendingSync: true })
    expect(loaded.manifests[0].items.map((item) => item.package_id).sort()).toEqual(['p1', 'p2'])
    expect(loaded.manifests[0].status).toBe('OPEN')

    const departed = applyQueueToDay(base, [
      scan(1, 'p1', 'LOAD'),
      entry(2, { type: 'DEPART', manifestId: 'm1', occurredAt: '2026-11-15T10:10:00.000Z' }),
      entry(3, attempt('p1')),
      entry(4, attempt('p2', 'FAILED')),
      scan(5, 'p2', 'RETURN'),
    ])
    expect(departed.manifests[0]).toMatchObject({ status: 'DEPARTED', departed_at: '2026-11-15T10:10:00.000Z' })
    const outcome = Object.fromEntries(departed.manifests[0].items.map((item) => [item.package_id, item.outcome]))
    expect(outcome).toEqual({ p1: 'DELIVERED', p2: 'RETURNED' })
    expect(departed.routes[0].stops[0].packages.map((pkg) => pkg.status)).toEqual(['DELIVERED', 'RETURNED'])
    // a cópia original não é alterada
    expect(base.manifests[0].items).toHaveLength(1)
  })

  it('progresso de um dia vazio é zero', () => {
    expect(dayProgress(null)).toMatchObject({ routes: 0, packages: 0, pending: 0 })
  })
})

describe('utilitários', () => {
  it('gera identificadores únicos no formato UUID', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newId()))
    expect(ids.size).toBe(200)
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('distingue falha de rede de recusa do servidor', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkError(new Error('NetworkError when attempting to fetch resource.'))).toBe(true)
    expect(isNetworkError(new Error('Load failed'))).toBe(true)
    expect(isNetworkError({ message: 'Acesso restrito a entregadores ativos' })).toBe(false)
    expect(isNetworkError(new Error('Registro de entrega inválido'))).toBe(false)
  })
})
