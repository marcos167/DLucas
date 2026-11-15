import { beforeEach, describe, expect, it, vi } from 'vitest'

const { from, tables, failTable, calls } = vi.hoisted(() => ({
  from: vi.fn(),
  tables: {} as Record<string, Record<string, unknown>[]>,
  failTable: { name: '' },
  calls: [] as { table: string; method: string; args: unknown[] }[],
}))

vi.mock('./supabase', () => ({ supabase: { from } }))
import { billableOrders, dashboardMetrics, latestLocations, ordersByStatus } from './api'

beforeEach(() => {
  from.mockReset()
  for (const key of Object.keys(tables)) delete tables[key]
  failTable.name = ''
  calls.length = 0
  from.mockImplementation((table: string) => {
    let rows = tables[table] ?? []
    const result = () => failTable.name === table
      ? { data: null, count: null, error: { message: 'Falha no banco' } }
      : { data: rows, count: rows.length, error: null }
    const query = {
      then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
      select: (_columns: string) => query,
      eq: (column: string, value: unknown) => { rows = rows.filter((r) => r[column] === value); return query },
      gte: (column: string, value: unknown) => { rows = rows.filter((r) => String(r[column]) >= String(value)); return query },
      lte: (column: string, value: unknown) => { rows = rows.filter((r) => String(r[column]) <= String(value)); return query },
      in: (column: string, values: unknown[]) => { rows = rows.filter((r) => values.includes(r[column])); return query },
      order: (column: string, options?: { ascending?: boolean }) => {
        calls.push({ table, method: 'order', args: [column, options] })
        rows = [...rows].sort((a, b) => {
          const comparison = String(a[column]).localeCompare(String(b[column]), undefined, { numeric: true })
          return options?.ascending === false ? -comparison : comparison
        })
        return query
      },
      range: (start: number, end: number) => {
        calls.push({ table, method: 'range', args: [start, end] })
        return Promise.resolve(failTable.name === table
          ? { data: null, error: { message: 'Falha no banco' } }
          : { data: rows.slice(start, end + 1), error: null })
      },
      limit: (limit: number) => {
        calls.push({ table, method: 'limit', args: [limit] })
        return Promise.resolve(failTable.name === table
          ? { data: null, error: { message: 'Falha no banco' } }
          : { data: rows.slice(0, limit), error: null })
      },
    }
    return query
  })
})

describe('relatórios paginados', () => {
  it('encontra pedidos faturados além da primeira página sem carregar faturas de outras farmácias', async () => {
    tables.orders = Array.from({ length: 503 }, (_, index) => ({
      id: `o${index}`, pharmacy_id: 'pharmacy', status: 'DELIVERED',
      delivered_at: '2026-11-15',
    }))
    tables.invoice_items = [
      ...Array.from({ length: 1500 }, (_, index) => ({ order_id: `other-${index}` })),
      { order_id: 'o502' },
    ]
    const orders = await billableOrders('pharmacy', '2026-11-01', '2026-11-30')
    expect(orders).toHaveLength(502)
    expect(orders.some((order) => order.id === 'o502')).toBe(false)
    expect(calls.filter((call) => call.table === 'orders' && call.method === 'range').map((call) => call.args))
      .toEqual([[0, 499], [500, 999]])
  })

  it('não apresenta pedidos como não faturados quando a consulta de itens falha', async () => {
    tables.orders = [{ id: 'o1', pharmacy_id: 'pharmacy', status: 'DELIVERED', delivered_at: '2026-11-15' }]
    failTable.name = 'invoice_items'
    // The invoice item query is normally awaited directly, not via range.
    await expect(billableOrders('pharmacy', '2026-11-01', '2026-11-30')).rejects.toThrow()
  })

  it('não trunca contagens quando há mais de 500 pedidos', async () => {
    tables.orders = Array.from({ length: 503 }, (_, index) => ({ id: `o${index}`, status: 'DELIVERED', created_at: new Date().toISOString() }))
    expect(await ordersByStatus()).toEqual({ DELIVERED: 503 })
  })

  it('soma todas as páginas de faturas abertas e rejeita falhas da consulta', async () => {
    tables.invoices = Array.from({ length: 503 }, (_, index) => ({
      id: `i${index}`, status: 'OPEN', total_cents: 100, paid_cents: 20, due_date: '2020-01-01',
    }))
    const metrics = await dashboardMetrics()
    expect(metrics.outstandingCents).toBe(503 * 80)
    expect(metrics.overdueCents).toBe(503 * 80)
    failTable.name = 'invoices'
    await expect(dashboardMetrics()).rejects.toThrow('Falha no banco')
  })
})

describe('localizações recentes', () => {
  it('busca uma posição por entregador, mesmo se um deles tem centenas de registros', async () => {
    tables.courier_locations = [
      ...Array.from({ length: 250 }, (_, index) => ({ courier_id: 'a', recorded_at: index, id: `a${index}` })),
      { courier_id: 'b', recorded_at: 1, id: 'b1' },
    ]
    const result = await latestLocations(['a', 'b', 'a'])
    expect(result.map((row) => row.id)).toEqual(['a249', 'b1'])
    expect(calls.filter((call) => call.table === 'courier_locations' && call.method === 'limit')).toHaveLength(2)
  })
})
