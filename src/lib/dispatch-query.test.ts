import { describe, expect, it, vi } from 'vitest'

const { from, select, eq, order, query } = vi.hoisted(() => {
  const query: {
    select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    then: (done: (result: unknown) => unknown) => Promise<unknown>
  } = {
    select: vi.fn(), eq: vi.fn(), order: vi.fn(),
    then: (done) => Promise.resolve({ data: [{ id: 'c1', status: 'ACTIVE', profile_id: 'u1', profile: { id: 'u1' } }], error: null }).then(done),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.order.mockReturnValue(query)
  return { from: vi.fn(() => query), select: query.select, eq: query.eq, order: query.order, query }
})
vi.mock('@/lib/supabase', () => ({ supabase: { from } }))

import { listAvailableCouriers } from '@/lib/api'

describe('consulta dos candidatos de despacho', () => {
  it('filtra no banco contas ativas com papel COURIER e FK correta', async () => {
    const result = await listAvailableCouriers()
    expect(from).toHaveBeenCalledWith('couriers')
    expect(select).toHaveBeenCalledWith('*, profile:profiles!couriers_profile_id_fkey!inner(id)')
    expect(eq).toHaveBeenCalledWith('status', 'ACTIVE')
    expect(eq).toHaveBeenCalledWith('profile.is_active', true)
    expect(eq).toHaveBeenCalledWith('profile.role', 'COURIER')
    expect(order).toHaveBeenCalledTimes(2)
    expect(result).toHaveLength(1)
    expect(query).toBeDefined()
  })
})
