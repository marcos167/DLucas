import { describe, expect, it } from 'vitest'
import {
  addDays, dayLabel, firstName, greeting, inWindow, mapData, orderDay, orderMatches, searchStops,
  todayOrders, todayRoutes, upcomingDays,
} from './courierDay'
import type { RiderPackage, RiderRoute, RiderStop } from '@/lib/logistics/types'
import type { CourierOrder } from '@/types'

const TODAY = '2026-11-15'

function pkg(code: string, extra: Partial<RiderPackage> = {}): RiderPackage {
  return {
    id: `pkg-${code}`, tracking_code: code, recipient_name: 'Maria Souza', recipient_phone: '(11) 90000-1001',
    complement: null, delivery_instructions: null, is_temperature_controlled: false, status: 'LOADED',
    attempt_count: 0, delivered_at: null, ...extra,
  }
}

function stop(id: string, extra: Partial<RiderStop> = {}): RiderStop {
  return {
    id, route_id: 'r1', sequence: 1, planned_sequence: 1, zip_code: '02010000', street: 'Rua das Acácias', number: '43',
    district: 'Santana', city: 'São Paulo', state: 'SP', latitude: -23.5015, longitude: -46.6262,
    leg_distance_m: null, leg_duration_s: null, status: 'PENDING', packages: [pkg('DL000001')], ...extra,
  }
}

function route(id: string, extra: Partial<RiderRoute> = {}): RiderRoute {
  return {
    id, batch_id: 'b1', route_date: TODAY, sequence: 1, status: 'RELEASED', zip_prefix: '02010',
    planned_distance_m: null, planned_duration_s: null, started_at: null, completed_at: null,
    stops: [stop(`${id}-s1`, { route_id: id })], ...extra,
  }
}

function order(id: string, extra: Partial<CourierOrder> = {}): CourierOrder {
  return {
    id, code: `DLX-${id}`, pharmacy_id: 'f1', unit_id: 'u1', created_by: null, status: 'ACCEPTED', priority: 'NORMAL',
    pickup_zip_code: '01310100', pickup_street: 'Avenida Paulista', pickup_number: '1000', pickup_complement: null,
    pickup_district: 'Bela Vista', pickup_city: 'São Paulo', pickup_state: 'SP', pickup_latitude: -23.5646,
    pickup_longitude: -46.6527, pickup_instructions: null, recipient_name: 'João Pereira',
    recipient_phone: '(11) 98888-7777', recipient_document: null, delivery_zip_code: '04002010',
    delivery_street: 'Rua Tutóia', delivery_number: '200', delivery_complement: null, delivery_district: 'Paraíso',
    delivery_city: 'São Paulo', delivery_state: 'SP', delivery_latitude: -23.5731, delivery_longitude: -46.6497,
    delivery_instructions: null, package_count: 1, package_description: null, is_temperature_controlled: false,
    requires_proof: false, scheduled_for: null, courier_id: 'c1', assigned_at: null, accepted_at: null,
    collected_at: null, delivered_at: null, cancelled_at: null, cancel_reason: null, estimated_distance_km: null,
    dispatch_notes: null, created_at: `${TODAY}T12:00:00Z`, updated_at: `${TODAY}T12:00:00Z`,
    pharmacy: { id: 'f1', trade_name: 'Farmácia Alquimia' }, unit: { id: 'u1', name: 'Matriz' }, ...extra,
  }
}

/** Horário local do aparelho no dia indicado, como o servidor devolve (ISO). */
const localIso = (date: string, hour: number) => {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day, hour).toISOString()
}

describe('dias do entregador', () => {
  it('soma dias pelo calendário, atravessando mês e ano', () => {
    expect(addDays('2026-11-15', 1)).toBe('2026-11-16')
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('entrega sem agendamento é de hoje; agendada vale o dia local do agendamento', () => {
    expect(orderDay({ scheduled_for: null }, TODAY)).toBe(TODAY)
    expect(orderDay({ scheduled_for: localIso('2026-11-17', 9) }, TODAY)).toBe('2026-11-17')
    expect(orderDay({ scheduled_for: localIso('2026-11-17', 23) }, TODAY)).toBe('2026-11-17')
    expect(orderDay({ scheduled_for: 'não é data' }, TODAY)).toBe(TODAY)
  })

  it('períodos do mapa: atrasado conta como hoje e "7 dias" começa hoje', () => {
    expect(inWindow('2026-11-14', 'today', TODAY)).toBe(true)
    expect(inWindow(TODAY, 'today', TODAY)).toBe(true)
    expect(inWindow('2026-11-16', 'today', TODAY)).toBe(false)
    expect(inWindow('2026-11-16', 'tomorrow', TODAY)).toBe(true)
    expect(inWindow(TODAY, 'tomorrow', TODAY)).toBe(false)
    expect(inWindow('2026-11-21', 'week', TODAY)).toBe(true)
    expect(inWindow('2026-11-22', 'week', TODAY)).toBe(false)
    expect(inWindow('2027-01-10', 'all', TODAY)).toBe(true)
  })

  it('Hoje fica com os roteiros até a data de hoje e as entregas em andamento não agendadas para depois', () => {
    const routes = [route('r1'), route('r2', { route_date: '2026-11-14' }), route('r3', { route_date: '2026-11-16' })]
    expect(todayRoutes(routes, TODAY).map((item) => item.id)).toEqual(['r1', 'r2'])
    const orders = [
      order('a'), order('b', { scheduled_for: localIso('2026-11-16', 10) }),
      order('c', { status: 'DELIVERED' }), order('d', { scheduled_for: localIso(TODAY, 18) }),
    ]
    expect(todayOrders(orders, TODAY).map((item) => item.id)).toEqual(['a', 'd'])
  })

  it('Próximas agrupa por dia, do mais próximo para o mais distante, sem o que já acabou', () => {
    const routes = [
      route('r1'),
      route('r4', { route_date: '2026-11-18', sequence: 2 }),
      route('r3', { route_date: '2026-11-18', sequence: 1 }),
      route('r5', { route_date: '2026-11-16' }),
      route('r6', { route_date: '2026-11-17', status: 'COMPLETED' }),
    ]
    const orders = [
      order('a'),
      order('b', { scheduled_for: localIso('2026-11-16', 15) }),
      order('c', { scheduled_for: localIso('2026-11-16', 9) }),
      order('d', { scheduled_for: localIso('2026-11-20', 9), status: 'CANCELLED' }),
    ]
    const days = upcomingDays(routes, orders, TODAY)
    expect(days.map((day) => day.date)).toEqual(['2026-11-16', '2026-11-18'])
    expect(days[0].routes.map((item) => item.id)).toEqual(['r5'])
    expect(days[0].orders.map((item) => item.id)).toEqual(['c', 'b'])
    expect(days[1].routes.map((item) => item.id)).toEqual(['r3', 'r4'])
    expect(upcomingDays([route('r1')], [order('a')], TODAY)).toEqual([])
  })

  it('nomeia o dia como o entregador fala', () => {
    expect(dayLabel('2026-11-16', TODAY)).toBe('Amanhã · Segunda-feira, 16 de novembro')
    expect(dayLabel('2026-11-18', TODAY)).toBe('Quarta-feira, 18 de novembro')
    expect(dayLabel(TODAY, TODAY)).toBe('Hoje · Domingo, 15 de novembro')
  })
})

describe('saudação', () => {
  it('acompanha a hora do aparelho', () => {
    const at = (hour: number) => greeting(new Date(2026, 10, 15, hour, 20))
    expect(at(5)).toBe('Bom dia')
    expect(at(11)).toBe('Bom dia')
    expect(at(12)).toBe('Boa tarde')
    expect(at(15)).toBe('Boa tarde')
    expect(at(18)).toBe('Boa noite')
    expect(at(2)).toBe('Boa noite')
  })

  it('usa só o primeiro nome', () => {
    expect(firstName('Anderson Silva Prado')).toBe('Anderson')
    expect(firstName('  MARCO  ')).toBe('MARCO')
    expect(firstName(null)).toBe('')
  })
})

describe('busca por protocolo, endereço ou farmácia', () => {
  it('encontra a entrega pelo protocolo, pelo endereço sem acento e pela farmácia', () => {
    const item = order('77')
    expect(orderMatches(item, '')).toBe(true)
    expect(orderMatches(item, 'dlx-77')).toBe(true)
    expect(orderMatches(item, 'tutoia 200')).toBe(true)
    expect(orderMatches(item, 'ALQUIMIA')).toBe(true)
    expect(orderMatches(item, 'paraiso joao')).toBe(true)
    expect(orderMatches(item, 'santana')).toBe(false)
  })

  it('aceita CEP e telefone com ou sem pontuação', () => {
    const item = order('77')
    expect(orderMatches(item, '04002-010')).toBe(true)
    expect(orderMatches(item, '04002010')).toBe(true)
    expect(orderMatches(item, '988887777')).toBe(true)
    expect(orderMatches(item, '99999')).toBe(false)
  })

  it('encontra a parada pelo código do pacote, pelo destinatário ou pela rua', () => {
    const routes = [route('r1', {
      sequence: 3,
      stops: [
        stop('s1', { packages: [pkg('DL000001'), pkg('DL000002', { recipient_name: 'Carlos Rocha' })] }),
        stop('s2', { sequence: 2, street: 'Rua dos Ipês', number: '10', zip_code: '02012010', packages: [pkg('DL000003')] }),
      ],
    })]
    expect(searchStops(routes, 'dl000002').map((hit) => [hit.stop.id, hit.packages.map((item) => item.tracking_code)]))
      .toEqual([['s1', ['DL000002']]])
    expect(searchStops(routes, 'carlos')[0].packages).toHaveLength(1)
    expect(searchStops(routes, 'ipes').map((hit) => hit.stop.id)).toEqual(['s2'])
    expect(searchStops(routes, '02012-010').map((hit) => hit.stop.id)).toEqual(['s2'])
    expect(searchStops(routes, 'roteiro 03')).toHaveLength(2)
    expect(searchStops(routes, 'inexistente')).toEqual([])
  })
})

describe('pontos do mapa', () => {
  it('mostra só as paradas em aberto dos roteiros do período', () => {
    const routes = [
      route('r1', { stops: [stop('s1'), stop('s2', { sequence: 2, status: 'COMPLETED' })] }),
      route('r2', { route_date: '2026-11-16', stops: [stop('s3')] }),
      route('r3', { status: 'COMPLETED', stops: [stop('s4')] }),
    ]
    expect(mapData(routes, [], 'today', TODAY).points.map((point) => point.id)).toEqual(['stop:s1'])
    expect(mapData(routes, [], 'tomorrow', TODAY).points.map((point) => point.id)).toEqual(['stop:s3'])
    expect(mapData(routes, [], 'all', TODAY).points.map((point) => point.id)).toEqual(['stop:s1', 'stop:s3'])
    const point = mapData(routes, [], 'today', TODAY).points[0]
    expect(point).toMatchObject({ kind: 'stop', label: '1.1', title: 'Rua das Acácias, 43', href: '/entregador/rotas/r1' })
    expect(point.subtitle).toBe('Roteiro 01, parada 1 · 1 pacote(s) · Santana')
    expect(point.nav.google).toContain('-23.5015,-46.6262')
  })

  it('endereço sem coordenada não some: vai para a lista', () => {
    const routes = [route('r1', { stops: [stop('s1', { latitude: null, longitude: null })] })]
    const data = mapData(routes, [], 'today', TODAY)
    expect(data.points).toEqual([])
    expect(data.unplaced.map((place) => place.id)).toEqual(['stop:s1'])
    expect(data.unplaced[0].nav.google).toContain(encodeURIComponent('Rua das Acácias, 43'))
  })

  it('entrega avulsa mostra a coleta até ser coletada e depois só o destino', () => {
    const before = mapData([], [order('a', { status: 'PICKING_UP' })], 'today', TODAY)
    expect(before.points.map((point) => [point.kind, point.label])).toEqual([['pickup', 'C'], ['delivery', 'E']])
    const after = mapData([], [order('a', { status: 'IN_TRANSIT' })], 'today', TODAY)
    expect(after.points.map((point) => point.kind)).toEqual(['delivery'])
    expect(after.points[0]).toMatchObject({ title: 'Rua Tutóia, 200', href: '/entregador/entrega/a' })
    expect(mapData([], [order('a', { status: 'DELIVERED' })], 'all', TODAY).points).toEqual([])
    expect(mapData([], [order('a', { scheduled_for: localIso('2026-11-16', 9) })], 'today', TODAY).points).toEqual([])
  })
})
