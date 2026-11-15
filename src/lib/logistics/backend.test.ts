// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { as, backend, COURIERS, PHARMACY, startBackend, stopBackend, USERS } from '@/test/logistics-backend'

/**
 * Critérios de prontidão do módulo de distribuição, de ponta a ponta:
 * as funções de `api.ts` e a fila offline falam com o cliente Supabase real,
 * que fala com um PostgreSQL em memória carregado com as migrações reais
 * (RLS, privilégios, triggers e funções). Nada aqui toca em produção.
 */
vi.mock('@/lib/supabase', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  const { backendFetch } = await import('@/test/logistics-backend')
  return {
    isSupabaseConfigured: true,
    supabase: createClient('http://banco.local', 'chave-publica-de-teste', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: backendFetch },
    }),
    storageBucketProofs: 'proofs',
    storageBucketReceipts: 'receipts',
  }
})

import { supabase } from '@/lib/supabase'
import { ApiError } from '@/lib/api'
import * as api from './api'
import { addressKey } from './address'
import { normalizeZip } from './cep'
import type { ImportRow } from './import'
import { createHaversineProvider } from './matrix'
import { DEFAULT_ORGANIZE_OPTIONS, organizeRoutes, planMetaPayload, toPlanPayload } from './organizer'
import { applyQueueToDay, newId, SyncQueue, type QueueOp } from './offline/queue'
import { classifyError, probeServer, runOperation } from './offline/runner'
import { createMemoryStore } from './offline/store'
import { DEFAULT_DISTRIBUTION_SETTINGS, type DistributionBatch, type RiderDay, type RiderRoute } from './types'

const DAY = '2026-11-15'
const admin = <T>(action: () => Promise<T>) => as(USERS.admin, action)
const dispatcher = <T>(action: () => Promise<T>) => as(USERS.dispatcher, action)
const riderA = <T>(action: () => Promise<T>) => as(USERS.riderA, action)
const riderB = <T>(action: () => Promise<T>) => as(USERS.riderB, action)

async function sql<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
  if (!backend.db) throw new Error('banco não iniciado')
  return (await backend.db.query<T>(query, params)).rows
}

async function rejection(action: () => Promise<unknown>): Promise<ApiError> {
  try {
    await action()
  } catch (error) {
    return error as ApiError
  }
  throw new Error('a ação deveria ter sido recusada')
}

function row(code: string, zip: string, street: string, number: string, extra: Partial<ImportRow> = {}): ImportRow {
  return {
    line: 0, tracking_code: code, external_ref: null, manifest_ref: null, sender_name: 'Farmácia Teste',
    recipient_name: `Cliente ${code}`, recipient_phone: '11999990000', recipient_document: null,
    zip_code: zip, street, number, complement: null, district: 'Freguesia', city: 'São Paulo', state: 'SP',
    delivery_instructions: null, latitude: null, longitude: null, is_temperature_controlled: false, ...extra,
  }
}

/** 49 pacotes em 42 endereços na área do entregador A; os 7 primeiros endereços recebem 2 pacotes. */
function dayOfA(): ImportRow[] {
  const rows: ImportRow[] = []
  let code = 0
  for (let address = 0; address < 42; address++) {
    const point = { latitude: -23.48 - Math.floor(address / 7) * 0.002, longitude: -46.69 - (address % 7) * 0.002 }
    for (let unit = 0; unit < (address < 7 ? 2 : 1); unit++) {
      code++
      rows.push(row(`A${String(code).padStart(3, '0')}`, `027050${String(address).padStart(2, '0')}`,
        'Rua das Flores', String(address + 1), { ...point, complement: address < 7 ? `Apto ${unit + 1}` : null }))
    }
  }
  return rows
}

async function planFor(batchId: string, courierId: string) {
  const { items } = await api.listPackages(batchId, { courier_id: courierId, statuses: ['ASSIGNED'], limit: 1000 })
  const result = await organizeRoutes(items, DEFAULT_ORGANIZE_OPTIONS, createHaversineProvider())
  const saved = await api.saveRoutePlan(batchId, courierId, toPlanPayload(result.routes), planMetaPayload(result.meta))
  return { result, saved }
}

async function fetchDay(): Promise<RiderDay> {
  return { ...(await api.riderDay(DAY)), fetchedAt: new Date().toISOString() }
}

const codesOf = (route: RiderRoute) => route.stops.flatMap((stop) => stop.packages.map((pkg) => pkg.tracking_code))
const packagesOf = (route: RiderRoute) => route.stops.flatMap((stop) => stop.packages)

function attemptOp(route: RiderRoute, packageId: string, outcome: 'DELIVERED' | 'FAILED' = 'DELIVERED'): QueueOp & { type: 'ATTEMPT' } {
  const stop = route.stops.find((candidate) => candidate.packages.some((pkg) => pkg.id === packageId))
  return {
    type: 'ATTEMPT', attemptId: newId(), packageId, routeId: route.id, stopId: stop?.id ?? '', outcome,
    failureReason: outcome === 'FAILED' ? 'RECIPIENT_ABSENT' : null, notes: null,
    recipientName: outcome === 'DELIVERED' ? 'Portaria' : null, recipientDocument: null,
    latitude: -23.48, longitude: -46.69, occurredAt: new Date().toISOString(),
  }
}

let batch: DistributionBatch
let regionA = ''
let regionB = ''
/** roteiros do entregador A no lote principal, na ordem do dia */
let routes: RiderRoute[] = []

beforeAll(async () => {
  await startBackend()
  await admin(async () => {
    await api.saveRegion({ name: 'Zona A', description: null, color: '#0f766e', courier_id: COURIERS.a, is_active: true })
    await api.saveRegion({ name: 'Zona B', description: null, color: '#b45309', courier_id: COURIERS.b, is_active: true })
    await api.saveRegion({ name: 'Sem responsável', description: null, color: '#64748b', courier_id: null, is_active: true })
    await api.saveRegion({ name: 'Suspenso', description: null, color: '#64748b', courier_id: COURIERS.suspended, is_active: true })
    const byName = Object.fromEntries((await api.listRegions()).map((region) => [region.name, region.id]))
    regionA = byName['Zona A']
    regionB = byName['Zona B']
    const range = (region: string, zip_start: number, zip_end: number, priority = 0) => api.saveAssignment({
      region_id: byName[region], courier_id: null, zip_start, zip_end, priority, is_active: true, notes: null,
    })
    await range('Zona A', 2700000, 2799999)
    await range('Zona B', 2710000, 2710999)
    await range('Sem responsável', 2900000, 2999999)
    await range('Suspenso', 3000000, 3099999)
    batch = await api.createBatch({ batch_date: DAY, name: 'Lote principal', notes: null, package_limit_override: null })
  })
}, 120_000)

afterAll(async () => {
  await stopBackend()
})

describe('cobertura por CEP', () => {
  it('o lote nasce aberto, com código próprio e autoria registrada pelo banco', async () => {
    expect(batch.code).toMatch(/^LT-261115-\d{4}$/)
    expect(batch.status).toBe('OPEN')
    const [stored] = await sql<{ created_by: string }>('select created_by from distribution_batches where id = $1', [batch.id])
    expect(stored.created_by).toBe(USERS.admin)
  })

  it('a faixa mais específica vence a mais ampla', async () => {
    const [wide, narrow] = await admin(() => Promise.all([
      api.resolvePostalCode('02705-010'), api.resolvePostalCode('02710-500'),
    ]))
    expect(wide).toMatchObject({ matched: true, region_name: 'Zona A', courier_id: COURIERS.a, courier_name: 'Ana Rota' })
    expect(narrow).toMatchObject({ matched: true, region_name: 'Zona B', courier_id: COURIERS.b })
  })

  it('CEP inválido e CEP fora da cobertura são informados, não adivinhados', async () => {
    const [invalid, outside] = await admin(() => Promise.all([
      api.resolvePostalCode('2705'), api.resolvePostalCode('04000-000'),
    ]))
    expect(invalid).toMatchObject({ valid: false, matched: false })
    expect(outside).toMatchObject({ valid: true, matched: false })
  })

  it('em faixas de mesmo tamanho vale a prioridade; faixa desativada não conta; a faixa pode ter responsável próprio', async () => {
    await admin(async () => {
      await api.saveAssignment({
        region_id: regionA, courier_id: COURIERS.c, zip_start: 2710000, zip_end: 2710999, priority: 5,
        is_active: true, notes: 'cobertura temporária',
      })
      expect(await api.resolvePostalCode('02710-500')).toMatchObject({ region_name: 'Zona A', courier_id: COURIERS.c })
      const temporary = (await api.listAssignments()).find((item) => item.priority === 5)
      await api.saveAssignment({
        id: temporary?.id, region_id: regionA, courier_id: COURIERS.c, zip_start: 2710000, zip_end: 2710999,
        priority: 5, is_active: false, notes: null,
      })
      expect(await api.resolvePostalCode('02710-500')).toMatchObject({ region_name: 'Zona B', courier_id: COURIERS.b })
      await api.deleteAssignment(temporary?.id ?? '')
    })
  })

  it('não aceita faixa invertida nem repetida na mesma região', async () => {
    const inverted = await rejection(() => admin(() => api.saveAssignment({
      region_id: regionB, courier_id: null, zip_start: 2720000, zip_end: 2710000, priority: 0, is_active: true, notes: null,
    })))
    expect(inverted.code).toBe('23514')
    const repeated = await rejection(() => admin(() => api.saveAssignment({
      region_id: regionB, courier_id: null, zip_start: 2710000, zip_end: 2710999, priority: 0, is_active: true, notes: null,
    })))
    expect(repeated.message).toMatch(/já está cadastrada/)
  })
})

describe('importação e distribuição automática', () => {
  it('importa o romaneio, devolve os códigos repetidos e as linhas inválidas sem gravar nada em dobro', async () => {
    const rows = [
      ...dayOfA(),
      row('B001', '02710-100', 'Av. Brasil', '10', { latitude: -23.5, longitude: -46.7 }),
      row('B002', '02710-100', 'Av. Brasil', '20', { latitude: -23.501, longitude: -46.7 }),
      row('B003', '02710-100', 'Av. Brasil', '30', { latitude: -23.502, longitude: -46.7 }),
      row('X-INV', '123', 'Rua Sem CEP', '1'),
      row('X-NOCOV', '04000-000', 'Rua Fora', '1'),
      row('X-NOCOUR', '02900-100', 'Rua Sem Dono', '1'),
      row('X-SUSP', '03000-100', 'Rua do Suspenso', '1'),
      row('b001', '02710-100', 'Av. Brasil', '10'),
      row('X-RUIM', '02710-100', '', '10'),
    ].map((item, index) => ({ ...item, line: index + 2 })) // linha 1 do arquivo é o cabeçalho
    const first = await dispatcher(() => api.importPackages(batch.id, rows))
    expect(first.inserted).toBe(56)
    expect(first.duplicates).toEqual(['B001'])
    expect(first.invalid).toEqual([{ line: 59, tracking_code: 'X-RUIM' }])

    const again = await dispatcher(() => api.importPackages(batch.id, rows))
    expect(again.inserted).toBe(0)
    expect(again.duplicates).toHaveLength(57)
    const [{ n }] = await sql<{ n: number }>('select count(*)::int as n from packages where batch_id = $1', [batch.id])
    expect(n).toBe(56)
  })

  it('o CEP inválido é guardado como veio e a chave de endereço é a mesma na tela e no banco', async () => {
    const [invalid] = await sql<{ zip_code: string | null; zip_raw: string }>(
      "select zip_code, zip_raw from packages where tracking_code = 'X-INV'")
    expect(invalid).toEqual({ zip_code: null, zip_raw: '123' })

    const samples: [string | null, string, string | null][] = [
      ['02705-010', 'Rua das Flores', '12'], ['02705010', 'R. DAS FLÔRES', ' 12 '], ['02705010', 'Av. Brasil', '100 A'],
      ['02705010', 'AVENIDA BRASIL', '100a'], [null, 'Travessa São João', null], ['123', 'Tv. Sao Joao', 's/n'],
      ['02705010', 'Pça. da Sé', '1'], ['02705010', 'Estr. do Sabão', '7'], ['02705010', 'Al. Santos', '2000'],
      ['02705010', 'Rod. Anhanguera', 'km 18'], ['02705010', 'Rua  Çã ñ  Ü', '0'],
    ]
    for (const [zip, street, number] of samples) {
      const [fromDb] = await sql<{ key: string; zip: string | null }>(
        'select app.address_key($1, $2, $3) as key, app.normalize_zip($1) as zip', [zip, street, number])
      expect(addressKey(zip, street, number), `${zip} ${street} ${number}`).toBe(fromDb.key)
      expect(normalizeZip(zip)).toBe(fromDb.zip)
    }
  })

  it('distribui cada pacote ao responsável do CEP e separa as exceções por motivo', async () => {
    const result = await dispatcher(() => api.distributeBatch(batch.id))
    expect(result).toEqual({
      processed: 56, assigned: 52,
      exceptions: { INVALID_ZIP: 1, NO_COVERAGE: 1, NO_COURIER: 1, COURIER_UNAVAILABLE: 1 },
    })
    const overview = await dispatcher(() => api.batchOverview(batch.id))
    expect(overview.totals).toMatchObject({ packages: 56, by_status: { ASSIGNED: 52, EXCEPTION: 4 } })
    const byName = Object.fromEntries(overview.couriers.map((courier) => [courier.full_name, courier]))
    expect(byName['Ana Rota']).toMatchObject({ packages: 49, addresses: 42, limit: 49, has_login: true })
    expect(byName['Bruno Rota']).toMatchObject({ packages: 3, addresses: 3 })
    const [suspended] = await sql<{ exception_detail: string }>(
      "select exception_detail from packages where tracking_code = 'X-SUSP'")
    expect(suspended.exception_detail).toBe('Davi Suspenso')
  })

  it('cada pacote tem exatamente um responsável atual, com a regra que decidiu', async () => {
    const current = await sql<{ n: number; method: string; region_id: string }>(
      `select count(*)::int as n, min(method) as method, min(region_id::text) as region_id
         from package_assignments a join packages p on p.id = a.package_id
        where p.batch_id = $1 and a.ended_at is null and p.courier_id = $2`, [batch.id, COURIERS.a])
    expect(current[0]).toEqual({ n: 49, method: 'AUTO_CEP', region_id: regionA })
    const doubled = await sql(
      `select package_id from package_assignments where ended_at is null group by package_id having count(*) > 1`)
    expect(doubled).toEqual([])
    const second = await rejection(() => sql(
      `insert into package_assignments (package_id, batch_id, courier_id, method)
       select id, batch_id, $1, 'MANUAL' from packages where tracking_code = 'A001'`, [COURIERS.b]))
    expect(second.message).toMatch(/package_assignments_current_key/)
  })

  it('o 50º pacote do dia vira exceção por capacidade; o supervisor pode atribuir mesmo assim', async () => {
    await dispatcher(() => api.importPackages(batch.id, [
      row('A050', '02705-099', 'Rua das Flores', '900', { latitude: -23.495, longitude: -46.69 }),
    ]))
    const result = await dispatcher(() => api.distributeBatch(batch.id))
    expect(result.exceptions.OVER_CAPACITY).toBe(1)
    const { items } = await dispatcher(() => api.listPackages(batch.id, { search: 'A050' }))
    expect(items[0]).toMatchObject({ status: 'EXCEPTION', exception_reason: 'OVER_CAPACITY', exception_detail: 'Ana Rota: 49 de 49' })

    const manual = await dispatcher(() => api.assignPackages([items[0].id], COURIERS.b, 'Zona A no limite'))
    expect(manual).toMatchObject({ assigned: 1, skipped: 0, load: 4 })
    const detail = await dispatcher(() => api.packageDetail(items[0].id))
    expect(detail.package).toMatchObject({ status: 'ASSIGNED', courier_name: 'Bruno Rota', exception_reason: null })
    expect(detail.assignments[0]).toMatchObject({ method: 'MANUAL', reason: 'Zona A no limite', assigned_by_name: 'Despacho Teste' })
  })

  it('corrigir a cobertura e distribuir de novo resolve as exceções; o que o supervisor segurou não é tocado', async () => {
    const { items } = await dispatcher(() => api.listPackages(batch.id, { statuses: ['EXCEPTION'] }))
    const byCode = Object.fromEntries(items.map((item) => [item.tracking_code, item.id]))
    await dispatcher(async () => {
      expect(await api.holdPackages([byCode['X-NOCOV']], true, 'Confirmar endereço com a farmácia')).toMatchObject({ changed: 1 })
      await api.saveAssignment({
        region_id: regionB, courier_id: null, zip_start: 4000000, zip_end: 4000999, priority: 0, is_active: true, notes: null,
      })
      await api.saveAssignment({
        region_id: regionB, courier_id: null, zip_start: 2900100, zip_end: 2900100, priority: 0, is_active: true, notes: null,
      })
      await api.updatePackageAddress(byCode['X-INV'], { zip_code: '02710100' })
    })
    const result = await dispatcher(() => api.distributeBatch(batch.id))
    expect(result).toEqual({ processed: 3, assigned: 2, exceptions: { COURIER_UNAVAILABLE: 1 } })
    const after = await dispatcher(() => api.listPackages(batch.id, { statuses: ['EXCEPTION'] }))
    expect(after.items.map((item) => [item.tracking_code, item.exception_reason]).sort()).toEqual([
      ['X-NOCOV', 'MANUAL_REVIEW'], ['X-SUSP', 'COURIER_UNAVAILABLE'],
    ])
    await dispatcher(() => api.cancelPackages([byCode['X-NOCOV'], byCode['X-SUSP']], 'Devolvido à farmácia'))
  })

  it('o limite é parâmetro: funcionário, veículo, lote e padrão, nessa ordem de precedência', async () => {
    const limitOfA = async (batchId: string) =>
      (await dispatcher(() => api.batchOverview(batchId))).couriers.find((courier) => courier.courier_id === COURIERS.a)?.limit
    const small = await admin(() => api.createBatch({ batch_date: DAY, name: 'Lote extra', notes: null, package_limit_override: 5 }))
    await dispatcher(() => api.importPackages(small.id, Array.from({ length: 7 }, (_, index) =>
      row(`CAP${index + 1}`, '02705-200', 'Rua do Limite', String(index + 1)))))
    expect(await dispatcher(() => api.distributeBatch(small.id))).toEqual({ processed: 7, assigned: 5, exceptions: { OVER_CAPACITY: 2 } })
    expect(await limitOfA(small.id)).toBe(5)

    await admin(() => api.saveDistributionSettings({ ...DEFAULT_DISTRIBUTION_SETTINGS, vehicle_limits: { MOTORCYCLE: 6 } }))
    expect(await limitOfA(small.id)).toBe(6)
    await dispatcher(() => api.setCourierDailyLimit(COURIERS.a, 60))
    expect(await limitOfA(small.id)).toBe(60)
    expect(await dispatcher(() => api.distributeBatch(small.id))).toMatchObject({ processed: 2, assigned: 2 })

    await dispatcher(() => api.setCourierDailyLimit(COURIERS.a, null))
    await admin(() => api.saveDistributionSettings(DEFAULT_DISTRIBUTION_SETTINGS))
    expect(await limitOfA(batch.id)).toBe(49)
    // só administradores alteram os parâmetros gerais
    await rejection(() => dispatcher(() => api.saveDistributionSettings({ ...DEFAULT_DISTRIBUTION_SETTINGS, stops_per_route: 9 })))
    expect((await dispatcher(() => api.getDistributionSettings())).stops_per_route).toBe(2)
  })
})

describe('roteiros', () => {
  it('49 pacotes viram 20 ou mais roteiros; cada pacote em um único roteiro e cada endereço em uma única parada', async () => {
    const { result, saved } = await dispatcher(() => planFor(batch.id, COURIERS.a))
    expect(saved).toEqual({ routes: result.routes.length, stops: 42, packages: 49 })
    expect(saved.routes).toBeGreaterThanOrEqual(20)

    const plan = await dispatcher(() => api.courierPlan(batch.id, COURIERS.a))
    expect(plan.routes.map((route) => route.sequence)).toEqual(plan.routes.map((_, index) => index + 1))
    expect(plan.routes.every((route) => route.status === 'DRAFT' && route.stop_count <= 2 && route.package_count <= 4)).toBe(true)
    const linked = plan.routes.flatMap((route) => route.stops.flatMap((stop) => stop.packages.map((pkg) => pkg.id)))
    expect(new Set(linked).size).toBe(49)
    expect(plan.packages.every((pkg) => pkg.status === 'ROUTED' && pkg.route_status === 'DRAFT')).toBe(true)

    const shared = plan.routes.flatMap((route) => route.stops).filter((stop) => stop.packages.length === 2)
    expect(shared).toHaveLength(7)
    expect(shared[0].packages.map((pkg) => pkg.complement).sort()).toEqual(['Apto 1', 'Apto 2'])
    const [log] = await sql<{ algorithm: string; provider: string; route_count: number; package_count: number }>(
      `select algorithm, provider, route_count, package_count from route_optimization_logs
        where batch_id = $1 and courier_id = $2 order by id desc limit 1`, [batch.id, COURIERS.a])
    expect(log).toMatchObject({ provider: 'haversine', route_count: saved.routes, package_count: 49 })
    expect(log.algorithm).toContain('2opt')
  })

  it('o banco recusa plano com pacote de outro funcionário, pacote repetido ou parada com dois endereços', async () => {
    const mine = await dispatcher(() => api.courierPlan(batch.id, COURIERS.a))
    const other = await dispatcher(() => api.listPackages(batch.id, { courier_id: COURIERS.b }))
    const [first, second] = mine.packages
    const stop = (ids: string[]) => ({ address_key: 'x', package_ids: ids, leg_distance_m: null, leg_duration_s: null })
    const save = (stops: ReturnType<typeof stop>[]) => dispatcher(() =>
      api.saveRoutePlan(batch.id, COURIERS.a, [{ origin: 'MANUAL', distance_m: 0, duration_s: 0, stops }], {}))

    expect((await rejection(() => save([stop([other.items[0].id])]))).message).toMatch(/indisponível para o roteiro/)
    expect((await rejection(() => save([stop([first.id]), stop([first.id])]))).message).toMatch(/indisponível para o roteiro/)
    expect((await rejection(() => save([stop([first.id, first.id])]))).message).toMatch(/repetido/)
    const differentAddress = mine.packages.find((pkg) => pkg.address_key !== first.address_key) ?? second
    expect((await rejection(() => save([stop([first.id, differentAddress.id])]))).message).toMatch(/mesmo endereço/)

    // a recusa desfaz tudo: o plano anterior continua inteiro
    const after = await dispatcher(() => api.courierPlan(batch.id, COURIERS.a))
    expect(after.routes).toHaveLength(mine.routes.length)
    const [active] = await sql<{ n: number }>(
      `select count(*)::int as n from route_packages rp join packages p on p.id = rp.package_id
        where p.batch_id = $1 and p.courier_id = $2 and rp.released_at is null`, [batch.id, COURIERS.a])
    expect(active.n).toBe(49)
  })

  it('rascunho não aparece para o entregador; liberado aparece só para o dono', async () => {
    expect((await riderA(fetchDay)).routes).toEqual([])
    const plan = await dispatcher(() => api.courierPlan(batch.id, COURIERS.a))
    const released = await dispatcher(() => api.setRoutesStatus(plan.routes.map((route) => route.id), 'RELEASE'))
    expect(released).toEqual({ changed: plan.routes.length, skipped: 0 })

    const day = await riderA(fetchDay)
    routes = day.routes
    expect(day.courier_id).toBe(COURIERS.a)
    expect(routes).toHaveLength(plan.routes.length)
    expect(routes.every((route) => route.status === 'RELEASED' && route.stops.length === 2)).toBe(true)
    expect(new Set(routes.flatMap(codesOf)).size).toBe(49)
    expect((await riderB(fetchDay)).routes).toEqual([])
    // gerar de novo não mexe no que já foi liberado
    expect(await dispatcher(() => api.saveRoutePlan(batch.id, COURIERS.a, [], {}))).toEqual({ routes: 0, stops: 0, packages: 0 })
    expect((await riderA(fetchDay)).routes).toHaveLength(plan.routes.length)
  })
})

describe('quem vê e quem altera', () => {
  it('visitante e farmácia não acessam nada do módulo', async () => {
    const anonymous = await rejection(() => as(null, () => api.listBatches()))
    expect(anonymous.code).toBe('42501')
    expect((await rejection(() => as(null, () => api.riderDay(DAY)))).code).toBe('42501')
    await as(USERS.pharmacy, async () => {
      expect(await api.listBatches()).toEqual([])
      expect((await supabase.from('packages').select('id')).data).toEqual([])
      expect((await supabase.from('delivery_routes').select('id')).data).toEqual([])
      expect((await rejection(() => api.batchOverview(batch.id))).code).toBe('42501')
      expect((await rejection(() => api.riderDay(DAY))).code).toBe('42501')
      expect((await rejection(() => api.riderConfig())).code).toBe('42501')
    })
  })

  it('o financeiro consulta, mas não opera', async () => {
    await as(USERS.finance, async () => {
      expect((await api.batchOverview(batch.id)).totals.packages).toBeGreaterThan(0)
      expect((await rejection(() => api.distributeBatch(batch.id))).code).toBe('42501')
      expect((await rejection(() => api.cancelPackages([], null))).code).toBe('42501')
      expect((await rejection(() => api.createBatch({
        batch_date: DAY, name: null, notes: null, package_limit_override: null,
      }))).code).toBe('42501')
      // o financeiro edita o cadastro do entregador, mas não o limite que decide a distribuição
      expect((await rejection(() => api.setCourierDailyLimit(COURIERS.a, 500))).code).toBe('42501')
    })
    expect((await rejection(() => riderA(() => api.setCourierDailyLimit(COURIERS.a, 500)))).code).toBe('42501')
    const [stored] = await sql<{ daily_package_limit: number | null }>('select daily_package_limit from couriers where id = $1', [COURIERS.a])
    expect(stored.daily_package_limit).toBeNull()
  })

  it('o entregador lê só os próprios pacotes e roteiros, e nenhuma tabela do módulo tem valor financeiro', async () => {
    await riderA(async () => {
      const { data: packages } = await supabase.from('packages').select('courier_id').eq('batch_id', batch.id)
      expect(packages?.length).toBe(49)
      expect((await supabase.from('packages').select('id').eq('courier_id', COURIERS.b)).data).toEqual([])
      expect(new Set(packages?.map((item) => item.courier_id))).toEqual(new Set([COURIERS.a]))
      const { data: visible } = await supabase.from('delivery_routes').select('courier_id, status')
      expect(visible?.every((route) => route.courier_id === COURIERS.a && route.status === 'RELEASED')).toBe(true)
      expect((await supabase.from('package_assignments').select('id')).data).toEqual([])
      expect((await supabase.from('postal_code_assignments').select('id')).data).toEqual([])
      expect((await rejection(() => api.batchOverview(batch.id))).code).toBe('42501')
      expect((await rejection(() => api.listPackages(batch.id))).code).toBe('42501')
    })
    const money = await sql<{ column_name: string }>(
      `select table_name || '.' || column_name as column_name from information_schema.columns
        where table_schema = 'public' and table_name in (
          'postal_code_regions','postal_code_assignments','distribution_batches','packages','package_assignments',
          'delivery_routes','route_stops','route_packages','route_events','route_optimization_logs',
          'loading_manifests','package_scans','delivery_attempts','delivery_proofs','manifest_items')
          and column_name ~* '(cents|price|payout|amount|valor|fee|commission|repasse)'`)
    expect(money).toEqual([])
    expect(JSON.stringify(await riderA(fetchDay))).not.toMatch(/cents|payout|price|repasse/i)
  })

  it('situação, responsável e baixa só mudam pelas funções: escrita direta é recusada', async () => {
    const [target] = await sql<{ id: string }>("select id from packages where tracking_code = 'A001'")
    await dispatcher(async () => {
      const forged = await supabase.from('packages').update({ status: 'DELIVERED' }).eq('id', target.id)
      expect(forged.error?.code).toBe('42501')
      const moved = await supabase.from('packages').update({ courier_id: COURIERS.b }).eq('id', target.id)
      expect(moved.error?.code).toBe('42501')
      expect((await supabase.from('packages').insert({ batch_id: batch.id, tracking_code: 'Z', recipient_name: 'Z', street: 'Z' })).error?.code).toBe('42501')
      expect((await supabase.from('packages').delete().eq('id', target.id)).error?.code).toBe('42501')
      expect((await supabase.from('delivery_routes').update({ status: 'COMPLETED' }).eq('batch_id', batch.id)).error?.code).toBe('42501')
      // correção de endereço e contato continua permitida
      await api.updatePackageAddress(target.id, { recipient_phone: '11888887777' })
    })
    await riderA(async () => {
      await supabase.from('packages').update({ recipient_phone: '0' }).eq('id', target.id)
      expect((await supabase.from('delivery_attempts').insert({
        id: newId(), package_id: target.id, courier_id: COURIERS.a, outcome: 'DELIVERED', occurred_at: new Date().toISOString(),
      })).error?.code).toBe('42501')
      expect((await supabase.from('route_stops').update({ status: 'COMPLETED' }).eq('route_id', routes[0].id)).error?.code).toBe('42501')
    })
    const [stored] = await sql<{ status: string; courier_id: string; recipient_phone: string }>(
      'select status, courier_id, recipient_phone from packages where id = $1', [target.id])
    expect(stored).toEqual({ status: 'ROUTED', courier_id: COURIERS.a, recipient_phone: '11888887777' })
  })

  it('o lote protege o que não é editável e não pode ser cancelado com pacotes ativos', async () => {
    await dispatcher(async () => {
      expect((await supabase.from('distribution_batches').update({ code: 'LT-FALSO' }).eq('id', batch.id)).error?.code).toBe('42501')
      expect((await rejection(() => api.updateBatch(batch.id, { status: 'CANCELLED' }))).message).toMatch(/Cancele os pacotes/)
    })
  })
})

describe('execução em campo', () => {
  let manifestId = ''

  it('conferência de saída: lê os pacotes do roteiro, avisa repetição, código desconhecido e pacote de outro', async () => {
    const route = routes[0]
    await riderA(async () => {
      const manifest = await api.openManifest(batch.id)
      manifestId = manifest.id
      expect(manifest).toMatchObject({ courier_id: COURIERS.a, trip_number: 1, status: 'OPEN' })
      expect((await api.openManifest(batch.id)).id).toBe(manifestId)

      const scan = (code: string) => api.registerPackageScan({
        scanId: newId(), code, scanType: 'LOAD', manifestId, occurredAt: new Date().toISOString(),
      })
      for (const code of codesOf(route)) {
        expect(await scan(code.toLowerCase())).toMatchObject({ status: 'APPLIED', result: 'OK', package_status: 'LOADED' })
      }
      expect(await scan(codesOf(route)[0])).toMatchObject({ result: 'DUPLICATE' })
      expect(await scan('NAO-EXISTE')).toMatchObject({ result: 'UNKNOWN_CODE', package_id: null })
      // pacote de outro responsável: só o resultado, sem dados do destinatário
      expect(await scan('B001')).toMatchObject({ result: 'NOT_ASSIGNED', package_id: null, recipient_name: null, package_status: null })

      const day = await fetchDay()
      expect(day.manifests[0].items.map((item) => item.tracking_code)).toEqual(codesOf(route).slice().sort())
      expect(await api.departManifest(manifestId, new Date().toISOString())).toMatchObject({ status: 'APPLIED' })
      expect(await api.departManifest(manifestId, new Date().toISOString())).toMatchObject({ status: 'DUPLICATE' })
      expect(await scan(codesOf(routes[1])[0])).toMatchObject({ status: 'CONFLICT', reason: 'MANIFEST_DEPARTED' })
    })
    expect((await rejection(() => riderB(() => api.registerPackageScan({
      scanId: newId(), code: 'A001', scanType: 'LOAD', manifestId: null, occurredAt: new Date().toISOString(),
    })).then((reply) => { if (reply.status === 'CONFLICT') throw new ApiError(reply.reason ?? '', 'CONFLICT') }))).code).toBe('CONFLICT')
  })

  it('entrega e tentativa sem sucesso: repetir o envio não duplica, falha exige motivo e gera ocorrência', async () => {
    const route = routes[0]
    const [first, second, ...others] = packagesOf(route)
    await riderA(async () => {
      expect(await api.startRoute(route.id, new Date().toISOString())).toMatchObject({ status: 'APPLIED', route_status: 'IN_PROGRESS' })
      expect(await api.startRoute(route.id, new Date().toISOString())).toMatchObject({ status: 'DUPLICATE' })

      const delivered = attemptOp(route, first.id)
      const send = (op: QueueOp & { type: 'ATTEMPT' }) => api.registerDeliveryAttempt({
        attemptId: op.attemptId, packageId: op.packageId, outcome: op.outcome, failureReason: op.failureReason,
        notes: op.notes, recipientName: op.recipientName, recipientDocument: null, latitude: op.latitude,
        longitude: op.longitude, occurredAt: op.occurredAt,
      })
      expect(await send(delivered)).toMatchObject({ status: 'APPLIED', package_status: 'DELIVERED' })
      expect(await send(delivered)).toMatchObject({ status: 'DUPLICATE', sync_status: 'APPLIED' })

      const noReason = await rejection(() => send({ ...attemptOp(route, second.id, 'FAILED'), failureReason: null }))
      expect(noReason.code).toBe('22023')
      expect(await send({ ...attemptOp(route, second.id, 'FAILED'), notes: 'Ninguém atendeu' }))
        .toMatchObject({ status: 'APPLIED', package_status: 'FAILED' })
      for (const pkg of others) expect(await send(attemptOp(route, pkg.id))).toMatchObject({ status: 'APPLIED' })
    })

    const [counts] = await sql<{ attempts: number; attempt_count: number }>(
      `select (select count(*)::int from delivery_attempts where package_id = $1) as attempts, attempt_count
         from packages where id = $1`, [first.id])
    expect(counts).toEqual({ attempts: 1, attempt_count: 1 })
    const [occurrence] = await sql<{ type: string; description: string; courier_id: string }>(
      'select type, description, courier_id from occurrences where package_id = $1', [second.id])
    expect(occurrence).toMatchObject({ type: 'RECIPIENT_ABSENT', courier_id: COURIERS.a })
    expect(occurrence.description).toContain('Ninguém atendeu')

    const day = await riderA(fetchDay)
    const done = day.routes.find((candidate) => candidate.id === route.id)
    expect(done?.status).toBe('COMPLETED')
    expect(done?.stops.map((stop) => stop.status).sort()).toEqual(
      route.stops[0].packages.length === 2 ? ['COMPLETED', 'PARTIAL'] : ['COMPLETED', 'FAILED'])
  })

  it('comprovante: só na pasta do próprio entregador, visível para a equipe e para o dono, não para outro entregador', async () => {
    const [attempt] = await sql<{ id: string }>(
      `select id from delivery_attempts where package_id = $1 and outcome = 'DELIVERED'`, [packagesOf(routes[0])[0].id])
    const path = `couriers/${COURIERS.a}/${attempt.id}/foto.jpg`
    await riderA(async () => {
      const photo = new Blob([new Uint8Array([255, 216, 255, 224])], { type: 'image/jpeg' })
      await api.uploadProofFile(path, photo, 'image/jpeg')
      await api.uploadProofFile(path, photo, 'image/jpeg') // reenviar o mesmo arquivo não é erro
      const proof = { proofId: newId(), attemptId: attempt.id, storagePath: path, mimeType: 'image/jpeg', sizeBytes: 4 }
      expect(await api.addDeliveryProof(proof)).toMatchObject({ status: 'APPLIED' })
      expect(await api.addDeliveryProof(proof)).toMatchObject({ status: 'DUPLICATE' })
      const elsewhere = await rejection(() => api.addDeliveryProof({
        ...proof, proofId: newId(), storagePath: `couriers/${COURIERS.b}/alheio.jpg`,
      }))
      expect(elsewhere.code).toBe('22023')
      expect(await api.proofUrl(path)).toContain('/object/sign/proofs/')
    })
    expect(backend.emulator?.files.has(`proofs/${path}`)).toBe(true)
    await riderB(async () => {
      expect((await supabase.from('delivery_proofs').select('id')).data).toEqual([])
      expect(await api.proofUrl(path)).toBeNull()
      expect(await api.addDeliveryProof({
        proofId: newId(), attemptId: attempt.id, storagePath: `couriers/${COURIERS.b}/x.jpg`, mimeType: null, sizeBytes: null,
      })).toMatchObject({ status: 'CONFLICT', reason: 'ATTEMPT_NOT_FOUND' })
    })
    const detail = await dispatcher(() => api.packageDetail(packagesOf(routes[0])[0].id))
    expect(detail.attempts[0].proofs).toHaveLength(1)
    expect(await dispatcher(() => api.proofUrl(path))).not.toBeNull()
  })

  it('conferência de retorno: não fecha com pacote em aberto; devolvido o pacote, fecha com os totais', async () => {
    const failed = packagesOf(routes[0])[1]
    await riderA(async () => {
      expect(await api.closeManifest(manifestId)).toMatchObject({ status: 'CONFLICT', reason: 'OPEN_ITEMS', open: 1, codes: [failed.tracking_code] })
      // o entregador não pode forçar o fechamento
      expect(await api.closeManifest(manifestId, true, 'forçando')).toMatchObject({ status: 'CONFLICT', reason: 'OPEN_ITEMS' })
      expect(await api.registerPackageScan({
        scanId: newId(), code: failed.tracking_code, scanType: 'RETURN', manifestId, occurredAt: new Date().toISOString(),
      })).toMatchObject({ result: 'OK', package_status: 'RETURNED' })
      const total = packagesOf(routes[0]).length
      expect(await api.closeManifest(manifestId)).toMatchObject({
        status: 'APPLIED', loaded: total, delivered: total - 1, returned: 1, open: 0,
      })
      expect(await api.closeManifest(manifestId)).toMatchObject({ status: 'DUPLICATE' })
    })
    const overview = await dispatcher(() => api.batchOverview(batch.id))
    const ana = overview.couriers.find((courier) => courier.courier_id === COURIERS.a)
    expect(ana).toMatchObject({ delivered_without_load: 0, manifest: { status: 'CLOSED', trip_number: 1 } })
    expect(ana?.routes).toMatchObject({ COMPLETED: 1 })
  })
})

describe('sem internet', () => {
  it('os registros ficam no aparelho, a tela mostra o resultado na hora e tudo sobe em ordem quando a rede volta', async () => {
    const route = routes[1]
    const target = packagesOf(route)[0]
    const store = createMemoryStore()
    const queue = new SyncQueue(store, runOperation, COURIERS.a, probeServer)

    await riderA(async () => {
      const manifest = await api.openManifest(batch.id)
      expect(manifest.trip_number).toBe(2)
      const snapshot = await fetchDay()

      backend.online = false
      expect(await probeServer()).toBe(false)
      const attempt = attemptOp(route, target.id)
      const blobKey = `foto-${attempt.attemptId}`
      await store.putBlob(blobKey, new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }))
      await queue.enqueue({
        type: 'SCAN', scanId: newId(), code: target.tracking_code, scanType: 'LOAD', manifestId: manifest.id,
        packageId: target.id, occurredAt: new Date().toISOString(),
      })
      await queue.enqueue({ type: 'DEPART', manifestId: manifest.id, occurredAt: new Date().toISOString() })
      await queue.enqueue({ type: 'START_ROUTE', routeId: route.id, occurredAt: new Date().toISOString() })
      await queue.enqueue(attempt)
      await queue.enqueue({
        type: 'PROOF', blobKey, storagePath: `couriers/${COURIERS.a}/${attempt.attemptId}/foto.jpg`,
        mimeType: 'image/jpeg', sizeBytes: 3, proofs: [{ proofId: newId(), attemptId: attempt.attemptId }],
      })

      expect(await queue.flush()).toMatchObject({ done: 0, remaining: 5, offline: true })
      const local = applyQueueToDay(snapshot, await queue.entries())
      const localRoute = local.routes.find((candidate) => candidate.id === route.id)
      expect(localRoute?.status).toBe('IN_PROGRESS')
      expect(packagesOf(localRoute as RiderRoute)[0]).toMatchObject({ status: 'DELIVERED', pendingSync: true })
      expect(local.manifests.find((item) => item.id === manifest.id)).toMatchObject({ status: 'DEPARTED' })
      const [untouched] = await sql<{ status: string }>('select status from packages where id = $1', [target.id])
      expect(untouched.status).toBe('ROUTED')

      backend.online = true
      expect(await probeServer()).toBe(true)
      expect(await queue.flush()).toMatchObject({ done: 5, conflicts: 0, failed: 0, remaining: 0, offline: false })
      expect(await store.getBlob(blobKey)).toBeNull()

      // resposta perdida: o aparelho reenvia a mesma baixa e nada é duplicado
      expect(await runOperation(attempt, store)).toEqual({ kind: 'done' })
      const [stored] = await sql<{ status: string; attempt_count: number; proofs: number; loads: number }>(
        `select status, attempt_count,
                (select count(*)::int from delivery_proofs where package_id = p.id) as proofs,
                (select count(*)::int from package_scans where package_id = p.id and result = 'OK') as loads
           from packages p where id = $1`, [target.id])
      expect(stored).toEqual({ status: 'DELIVERED', attempt_count: 1, proofs: 1, loads: 1 })
      expect(await api.closeManifest(manifest.id)).toMatchObject({ status: 'APPLIED', loaded: 1, delivered: 1 })
    })
  })

  it('distingue queda de rede (tenta de novo) de recusa do servidor (falha visível)', async () => {
    backend.online = false
    const offline = await riderA(() => runOperation({ type: 'START_ROUTE', routeId: routes[2].id, occurredAt: '' }, createMemoryStore()))
    backend.online = true
    expect(offline.kind).toBe('offline')
    const refused = await riderA(() => runOperation(
      { ...attemptOp(routes[2], packagesOf(routes[2])[0].id, 'FAILED'), failureReason: null }, createMemoryStore()))
    expect(refused.kind).toBe('failed')
    const missingPhoto = await riderA(() => runOperation({
      type: 'PROOF', blobKey: 'apagada', storagePath: `couriers/${COURIERS.a}/x.jpg`, mimeType: 'image/jpeg', sizeBytes: 1, proofs: [],
    }, createMemoryStore()))
    expect(missingPhoto.kind).toBe('failed')
    expect(classifyError(new ApiError('permission denied', '42501')).kind).toBe('failed')
    expect(classifyError(new ApiError('deadlock detected', '40P01')).kind).toBe('offline')
    expect(classifyError(new ApiError('JWT expired', 'PGRST301')).kind).toBe('offline')
    expect(classifyError(new Error('Bad Gateway')).kind).toBe('offline')
    expect(classifyError(new TypeError('Failed to fetch')).kind).toBe('offline')
  })
})

describe('transferência de roteiro e conflitos de sincronização', () => {
  it('roteiro não iniciado muda de dono por inteiro, com histórico de responsáveis', async () => {
    const route = routes[2]
    const moved = await dispatcher(() => api.transferRoute(route.id, COURIERS.b, 'Ana com excesso de carga'))
    expect(moved).toMatchObject({ route_id: route.id, packages: packagesOf(route).length, partial: false })

    expect((await riderA(fetchDay)).routes.some((candidate) => candidate.id === route.id)).toBe(false)
    const forB = (await riderB(fetchDay)).routes.find((candidate) => candidate.id === route.id)
    expect(codesOf(forB as RiderRoute)).toEqual(codesOf(route))
    const detail = await dispatcher(() => api.packageDetail(packagesOf(route)[0].id))
    expect(detail.package.courier_name).toBe('Bruno Rota')
    expect(detail.assignments.map((item) => [item.method, item.courier_name, item.ended_at === null])).toEqual([
      ['TRANSFER', 'Bruno Rota', true], ['AUTO_CEP', 'Ana Rota', false],
    ])
    expect((await rejection(() => dispatcher(() => api.transferRoute(route.id, COURIERS.suspended, null)))).message)
      .toMatch(/destino indisponível/)
  })

  it('a baixa de quem perdeu o roteiro fica guardada como conflito e o supervisor decide', async () => {
    const route = routes[2]
    const [first, second] = packagesOf(route)
    const store = createMemoryStore()
    const queue = new SyncQueue(store, runOperation, COURIERS.a, probeServer)
    await riderA(async () => {
      await queue.enqueue(attemptOp(route, first.id))
      await queue.enqueue(attemptOp(route, second.id, 'FAILED'))
      expect(await queue.flush()).toMatchObject({ done: 0, conflicts: 2, remaining: 0 })
      expect((await queue.entries()).map((entry) => [entry.state, entry.detail])).toEqual([
        ['CONFLICT', 'NOT_ASSIGNED'], ['CONFLICT', 'NOT_ASSIGNED'],
      ])
    })
    const untouched = await sql<{ status: string }>('select status from packages where id = any($1::uuid[])', [[first.id, second.id]])
    expect(untouched.map((item) => item.status)).toEqual(['ROUTED', 'ROUTED'])

    const conflicts = await dispatcher(() => api.listAttemptConflicts(batch.id))
    expect(conflicts).toHaveLength(2)
    expect(conflicts[0]).toMatchObject({ courier_name: 'Ana Rota', holder_name: 'Bruno Rota', conflict_reason: 'NOT_ASSIGNED' })
    expect((await dispatcher(() => api.batchOverview(batch.id))).totals.conflicts).toBe(2)

    const accepted = conflicts.find((item) => item.package_id === first.id)
    const discarded = conflicts.find((item) => item.package_id === second.id)
    expect(await dispatcher(() => api.resolveAttemptConflict(accepted?.id ?? '', true, 'Confirmado por telefone')))
      .toEqual({ status: 'APPLIED' })
    expect(await dispatcher(() => api.resolveAttemptConflict(discarded?.id ?? '', false, 'Bruno fará a entrega')))
      .toEqual({ status: 'DISCARDED' })
    expect((await rejection(() => dispatcher(() => api.resolveAttemptConflict(accepted?.id ?? '', true, null)))).message)
      .toMatch(/já resolvido/)

    const after = await sql<{ tracking_code: string; status: string }>(
      'select tracking_code, status from packages where id = any($1::uuid[]) order by tracking_code', [[first.id, second.id]])
    expect(Object.fromEntries(after.map((item) => [item.tracking_code, item.status])))
      .toEqual({ [first.tracking_code]: 'DELIVERED', [second.tracking_code]: 'ROUTED' })
    expect(await dispatcher(() => api.listAttemptConflicts(batch.id))).toEqual([])
    // quem não é da distribuição não resolve conflito
    expect((await rejection(() => riderA(() => api.resolveAttemptConflict(discarded?.id ?? '', true, null)))).code).toBe('42501')
  })

  it('roteiro em andamento cede só o que falta; o que já foi feito fica com quem fez', async () => {
    const route = routes[3]
    const [doneStop, pendingStop] = route.stops
    let manifestId = ''
    await riderA(async () => {
      manifestId = (await api.openManifest(batch.id)).id
      for (const code of codesOf(route)) {
        await api.registerPackageScan({ scanId: newId(), code, scanType: 'LOAD', manifestId, occurredAt: new Date().toISOString() })
      }
      await api.departManifest(manifestId, new Date().toISOString())
      for (const pkg of doneStop.packages) {
        const op = attemptOp(route, pkg.id)
        await api.registerDeliveryAttempt({
          attemptId: op.attemptId, packageId: pkg.id, outcome: 'DELIVERED', failureReason: null, notes: null,
          recipientName: 'Portaria', recipientDocument: null, latitude: null, longitude: null, occurredAt: op.occurredAt,
        })
      }
    })
    const moved = await dispatcher(() => api.transferRoute(route.id, COURIERS.b, 'Moto quebrou'))
    expect(moved).toMatchObject({ partial: true, packages: pendingStop.packages.length })
    expect(moved.route_id).not.toBe(route.id)

    const plan = await dispatcher(() => api.courierPlan(batch.id, COURIERS.a))
    const original = plan.routes.find((candidate) => candidate.id === route.id)
    expect(original).toMatchObject({ status: 'COMPLETED', stop_count: 1, package_count: doneStop.packages.length })
    const forB = (await riderB(fetchDay)).routes.find((candidate) => candidate.id === moved.route_id)
    expect(forB).toMatchObject({ status: 'RELEASED' })
    // o pacote já tinha saído com a Ana: o novo responsável confere de novo
    expect(packagesOf(forB as RiderRoute).map((pkg) => pkg.status)).toEqual(pendingStop.packages.map(() => 'ROUTED'))
    expect(codesOf(forB as RiderRoute)).toEqual(pendingStop.packages.map((pkg) => pkg.tracking_code))

    await riderA(async () => {
      const closed = await api.closeManifest(manifestId)
      expect(closed).toMatchObject({
        status: 'APPLIED', delivered: doneStop.packages.length, transferred: pendingStop.packages.length, open: 0,
      })
    })
    const [event] = await sql<{ metadata: { partial: boolean; from_courier: string } }>(
      `select metadata from route_events where route_id = $1 and event = 'ROUTE_TRANSFERRED'`, [moved.route_id])
    expect(event.metadata).toMatchObject({ partial: true, from_courier: COURIERS.a })
  })
})

describe('ordem das paradas e fechamento', () => {
  it('o entregador reordena só as paradas pendentes do próprio roteiro; o planejamento original fica registrado', async () => {
    await dispatcher(() => planFor(batch.id, COURIERS.b))
    const own = (await dispatcher(() => api.courierPlan(batch.id, COURIERS.b))).routes.filter((item) => item.status === 'DRAFT')
    await dispatcher(() => api.setRoutesStatus(own.map((item) => item.id), 'RELEASE'))
    const route = (await riderB(fetchDay)).routes.find((candidate) =>
      own.some((item) => item.id === candidate.id) && candidate.stops.length === 2) as RiderRoute
    const reversed = route.stops.map((stop) => stop.id).reverse()
    await riderB(async () => {
      expect(await api.reorderRouteStops(route.id, reversed, { algorithm: 'manual', provider: 'none' })).toMatchObject({ status: 'APPLIED' })
      const after = (await fetchDay()).routes.find((candidate) => candidate.id === route.id) as RiderRoute
      expect(after.stops.map((stop) => stop.id)).toEqual(reversed)
      expect(after.stops.map((stop) => [stop.sequence, stop.planned_sequence])).toEqual([[1, 2], [2, 1]])
      expect((await rejection(() => api.reorderRouteStops(route.id, [reversed[0]]))).message).toMatch(/exatamente as paradas pendentes/)
    })
    expect((await rejection(() => riderA(() => api.reorderRouteStops(route.id, reversed)))).code).toBe('42501')
    // pela fila do aparelho, uma ordem que não vale mais vira aviso, não erro repetido
    expect(await riderA(() => runOperation({ type: 'REORDER', routeId: route.id, stopIds: reversed }, createMemoryStore())))
      .toEqual({ kind: 'conflict', reason: 'ROUTE_CHANGED' })
    const [event] = await sql<{ metadata: { by_courier: boolean } }>(
      `select metadata from route_events where route_id = $1 and event = 'STOPS_REORDERED'`, [route.id])
    expect(event.metadata.by_courier).toBe(true)
    const [log] = await sql<{ scope: string }>('select scope from route_optimization_logs where route_id = $1', [route.id])
    expect(log.scope).toBe('ROUTE')
  })

  it('a equipe pode fechar uma conferência com divergência, e isso fica anotado e auditado', async () => {
    const manifest = await dispatcher(() => api.openManifest(batch.id, COURIERS.b))
    expect(manifest.courier_id).toBe(COURIERS.b)
    await dispatcher(() => api.registerPackageScan({
      scanId: newId(), code: 'B001', scanType: 'LOAD', manifestId: manifest.id, occurredAt: new Date().toISOString(),
    }))
    // pacote de roteiro ainda em rascunho não sai da central
    await dispatcher(async () => {
      await api.importPackages(batch.id, [row('B900', '02710-100', 'Av. Brasil', '900')])
      await api.distributeBatch(batch.id)
      await planFor(batch.id, COURIERS.b)
      expect(await api.registerPackageScan({
        scanId: newId(), code: 'B900', scanType: 'LOAD', manifestId: manifest.id, occurredAt: new Date().toISOString(),
      })).toMatchObject({ result: 'WRONG_STATUS', detail: 'ROUTE_NOT_RELEASED' })
    })
    expect(await riderB(() => api.closeManifest(manifest.id))).toMatchObject({ status: 'CONFLICT', reason: 'OPEN_ITEMS' })
    expect(await dispatcher(() => api.closeManifest(manifest.id, true, 'Pacote ficou no baú; conferido na central')))
      .toMatchObject({ status: 'APPLIED', open: 1 })
    const plan = await dispatcher(() => api.courierPlan(batch.id, COURIERS.b))
    expect(plan.manifests[0]).toMatchObject({ status: 'CLOSED', divergence_note: 'Pacote ficou no baú; conferido na central' })
    const audit = await sql(`select 1 from audit_logs where action = 'CLOSE_WITH_DIVERGENCE' and entity_id = $1`, [manifest.id])
    expect(audit).toHaveLength(1)
  })

  it('pacote devolvido à central pode ser reprogramado: volta a aguardar roteiro, com o histórico preservado', async () => {
    const returned = packagesOf(routes[0])[1]
    const before = await dispatcher(() => api.packageDetail(returned.id))
    expect(before.package.status).toBe('RETURNED')
    // de outro dia o roteiro concluído some da lista, mas um pacote a devolver o manteria visível
    expect((await riderA(() => api.riderDay('2026-11-16'))).routes.some((route) => route.id === routes[0].id)).toBe(false)

    expect(await dispatcher(() => api.assignPackages([returned.id], COURIERS.a, 'Nova tentativa amanhã'))).toMatchObject({ assigned: 1, skipped: 0 })
    const after = await dispatcher(() => api.packageDetail(returned.id))
    expect(after.package).toMatchObject({ status: 'ASSIGNED', courier_name: 'Ana Rota', attempt_count: 1 })
    expect(after.route).toBeNull()
    expect(after.attempts).toHaveLength(1)
    expect(after.assignments[0]).toMatchObject({ method: 'MANUAL', reason: 'Nova tentativa amanhã' })

    // entra em um roteiro novo e pode sair de novo
    const { saved } = await dispatcher(() => planFor(batch.id, COURIERS.a))
    expect(saved).toEqual({ routes: 1, stops: 1, packages: 1 })
    const [original] = await sql<{ status: string; package_count: number }>(
      'select status, package_count from delivery_routes where id = $1', [routes[0].id])
    expect(original).toEqual({ status: 'COMPLETED', package_count: packagesOf(routes[0]).length - 1 })
  })

  it('cancelar libera o código para nova importação; entregue ou na rua não é cancelado', async () => {
    const delivered = packagesOf(routes[0])[0]
    const { items } = await dispatcher(() => api.listPackages(batch.id, { search: 'B002' }))
    const result = await dispatcher(() => api.cancelPackages([delivered.id, items[0].id], 'Pedido cancelado pela farmácia'))
    expect(result).toEqual({ cancelled: 1, skipped: 1 })
    const again = await dispatcher(() => api.importPackages(batch.id, [row('B002', '02710-100', 'Av. Brasil', '20')]))
    expect(again).toMatchObject({ inserted: 1, duplicates: [] })
  })

  it('lote fechado não recebe importação nem distribuição', async () => {
    const closed = await admin(() => api.createBatch({ batch_date: DAY, name: 'Encerrado', notes: null, package_limit_override: null }))
    await admin(() => api.updateBatch(closed.id, { status: 'CLOSED' }))
    expect((await rejection(() => dispatcher(() => api.importPackages(closed.id, [row('Z1', '02705-000', 'Rua Z', '1')])))).message)
      .toMatch(/indisponível para importação/)
    expect((await rejection(() => dispatcher(() => api.distributeBatch(closed.id)))).message).toMatch(/indisponível para distribuição/)
    expect((await admin(() => api.listBatches())).find((item) => item.id === closed.id)?.closed_at).not.toBeNull()
  })

  it('toda ação operacional deixa rastro de quem fez', async () => {
    const actions = await sql<{ action: string }>(
      `select distinct action from audit_logs where actor_id in ($1, $2) order by action`, [USERS.admin, USERS.dispatcher])
    expect(actions.map((item) => item.action)).toEqual(expect.arrayContaining([
      'ASSIGN', 'CANCEL', 'DISTRIBUTE', 'HOLD', 'IMPORT', 'INSERT', 'TRANSFER', 'ACCEPT_CONFLICT', 'DISCARD_CONFLICT',
    ]))
    expect(PHARMACY).toBeTruthy()
  })
})
