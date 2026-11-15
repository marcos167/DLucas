// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { as, backend, COURIERS, PHARMACY, startBackend, stopBackend, USERS } from '@/test/logistics-backend'

/**
 * Entregadores têm salário fixo: o aplicativo deles não mostra nem pede
 * valores ao servidor. Aqui as funções de `api.ts` usadas pelas telas do
 * entregador falam com um PostgreSQL em memória carregado com as migrações
 * reais (RLS, triggers e funções). Nada aqui toca em produção.
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

import { COURIER_ORDER_COLUMNS, getCourierOrder, listCourierOrders, listOffersForCourier } from './api'

const MONEY = ['quoted_price_cents', 'courier_payout_cents', 'contract_id']
const UNIT = 'e0000000-0000-4000-8000-000000000001'
const ORDER_MINE = 'd0000000-0000-4000-8000-000000000001'
const ORDER_OFFERED = 'd0000000-0000-4000-8000-000000000002'

const riderA = <T>(action: () => Promise<T>) => as(USERS.riderA, action)
const riderB = <T>(action: () => Promise<T>) => as(USERS.riderB, action)

async function sql<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
  if (!backend.db) throw new Error('banco não iniciado')
  return (await backend.db.query<T>(query, params)).rows
}

beforeAll(async () => {
  await startBackend()
  await sql(
    `insert into pharmacy_units(id, pharmacy_id, name, street, number, city, state, latitude, longitude)
     values ($1, $2, 'Matriz', 'Avenida Paulista', '1000', 'São Paulo', 'SP', -23.5646, -46.6527)`,
    [UNIT, PHARMACY],
  )
  const order = `insert into orders(id, pharmacy_id, unit_id, status, courier_id, pickup_street, pickup_number, pickup_city, pickup_state,
       recipient_name, recipient_phone, delivery_street, delivery_number, delivery_district, delivery_city, delivery_state,
       quoted_price_cents, courier_payout_cents)
     values ($1, $2, $3, $4, $5, 'Avenida Paulista', '1000', 'São Paulo', 'SP',
       'João Pereira', '(11) 98888-7777', 'Rua Tutóia', '200', 'Paraíso', 'São Paulo', 'SP', 4200, 1500)`
  // os valores existem no banco (são do financeiro); o que se verifica é que o aplicativo do entregador não os recebe
  await sql(order, [ORDER_MINE, PHARMACY, UNIT, 'ACCEPTED', COURIERS.a])
  await sql(order, [ORDER_OFFERED, PHARMACY, UNIT, 'PENDING', null])
  await sql(
    `insert into delivery_offers(order_id, courier_id, status, method) values ($1, $2, 'PENDING', 'MANUAL')`,
    [ORDER_OFFERED, COURIERS.a],
  )
}, 120_000)

afterAll(async () => {
  await stopBackend()
})

describe('pedidos no aplicativo do entregador: sem valores', () => {
  it('a lista de colunas pedidas ao servidor não tem preço, repasse nem contrato', () => {
    for (const column of MONEY) expect(COURIER_ORDER_COLUMNS).not.toContain(column)
    expect(COURIER_ORDER_COLUMNS.filter((column) => /price|payout|cents|contract|amount|valor|repasse/i.test(column))).toEqual([])
  })

  it('o banco guarda os valores do pedido (o financeiro precisa deles)', async () => {
    const [row] = await sql<{ quoted_price_cents: number; courier_payout_cents: number }>(
      'select quoted_price_cents, courier_payout_cents from orders where id = $1', [ORDER_MINE])
    expect(row.quoted_price_cents).toBeGreaterThan(0)
    expect(row.courier_payout_cents).toBeGreaterThan(0)
  })

  it('a lista de entregas chega com farmácia e unidade, e sem nenhum campo de valor', async () => {
    const orders = await riderA(() => listCourierOrders({ courierId: COURIERS.a, status: ['ACCEPTED'] }))
    expect(orders).toHaveLength(1)
    const [order] = orders
    // o nome da farmácia não chega: a regra de acesso de `pharmacies` só libera a equipe e a própria
    // farmácia. O entregador recebe a unidade de coleta das entregas que são dele.
    expect(order).toMatchObject({
      id: ORDER_MINE, status: 'ACCEPTED', delivery_street: 'Rua Tutóia', recipient_name: 'João Pereira',
      unit: { name: 'Matriz' },
    })
    expect(order.code).toMatch(/^DLC-/)
    for (const column of MONEY) expect(order).not.toHaveProperty(column)
    expect(JSON.stringify(order)).not.toMatch(/cents|payout|price/)
  })

  it('a tela da entrega chega com o histórico e sem nenhum campo de valor', async () => {
    const order = await riderA(() => getCourierOrder(ORDER_MINE))
    expect(order.id).toBe(ORDER_MINE)
    expect(Array.isArray(order.events)).toBe(true)
    for (const column of MONEY) expect(order).not.toHaveProperty(column)
    expect(JSON.stringify(order)).not.toMatch(/cents|payout|price/)
  })

  it('a retirada disponível traz o pedido (com a unidade de coleta) sem nenhum campo de valor', async () => {
    const offers = await riderA(() => listOffersForCourier(COURIERS.a))
    expect(offers).toHaveLength(1)
    const [offer] = offers
    expect(offer.order).toMatchObject({ id: ORDER_OFFERED, delivery_street: 'Rua Tutóia', unit: { name: 'Matriz' } })
    expect(JSON.stringify(offer)).not.toMatch(/cents|payout|price/)
  })

  it('um entregador não recebe as entregas nem as retiradas de outro', async () => {
    expect(await riderB(() => listCourierOrders({ courierId: COURIERS.a, status: ['ACCEPTED'] }))).toEqual([])
    expect(await riderB(() => listOffersForCourier(COURIERS.a))).toEqual([])
  })
})
