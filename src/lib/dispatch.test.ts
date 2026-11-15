import { describe, expect, it } from 'vitest'
import { suggestCouriers } from '@/lib/api'
import type { Courier, Order } from '@/types'

/**
 * O ranking de entregadores é a regra mais visível do produto: é o que o
 * despachante vê na tela e usa para decidir. Se a pontuação quebrar, a
 * operação perde o critério — então estes testes fixam os pesos do contrato.
 *
 * Pesos documentados no deck e no ARQUITETURA.md:
 *   Disponível agora .......... +40
 *   Mesma cidade da coleta .... +20
 *   Atua no bairro ............ +10
 *   Distância até a coleta .... até +30 (30 - km)
 */

function courier(over: Partial<Courier> = {}): Courier {
  return {
    id: 'c1',
    profile_id: 'profile-c1',
    full_name: 'Entregador Padrão',
    cpf: null,
    birth_date: null,
    phone: '11999999999',
    email: null,
    cnh_number: null,
    cnh_category: null,
    vehicle_type: 'MOTO',
    vehicle_plate: null,
    base_city: 'São Paulo',
    base_state: 'SP',
    service_zone: null,
    status: 'ACTIVE',
    availability: 'AVAILABLE',
    current_latitude: null,
    current_longitude: null,
    current_location_at: null,
    location_sharing_enabled: false,
    approved_at: null,
    notes: null,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    ...over,
  }
}

function order(over: Partial<Order> = {}): Order {
  return {
    id: 'o1',
    code: 'DLC-2611-00001',
    pharmacy_id: 'p1',
    unit_id: null,
    courier_id: null,
    status: 'PENDING',
    priority: 'NORMAL',
    pickup_city: 'São Paulo',
    pickup_district: 'Centro',
    pickup_latitude: null,
    pickup_longitude: null,
    quoted_price_cents: 2000,
    courier_payout_cents: 800,
    ...over,
  } as Order
}

describe('suggestCouriers — filtros', () => {
  it('não sugere cadastro sem conta de entregador vinculada', () => {
    const semAcesso = courier({ id: 'sem-acesso', profile_id: null })
    const elegivel = courier({ id: 'elegivel', profile_id: 'user-entregador' })
    expect(suggestCouriers(order(), [semAcesso, elegivel]).map((s) => s.courier.id)).toEqual(['elegivel'])
  })

  it('exclui entregador que já está em rota', () => {
    const emRota = courier({ id: 'em-rota', availability: 'ON_DELIVERY' })
    const livre = courier({ id: 'livre' })
    const result = suggestCouriers(order(), [emRota, livre])
    expect(result.map((r) => r.courier.id)).toEqual(['livre'])
  })

  it('exclui entregador inativo, mesmo disponível', () => {
    const inativo = courier({ id: 'inativo', status: 'SUSPENDED' })
    const result = suggestCouriers(order(), [inativo])
    expect(result).toHaveLength(0)
  })

  it('respeita o limite de sugestões', () => {
    const lista = Array.from({ length: 10 }, (_, i) => courier({ id: `c${i}` }))
    expect(suggestCouriers(order(), lista, 3)).toHaveLength(3)
    expect(suggestCouriers(order(), lista)).toHaveLength(5) // padrão
  })
})

describe('suggestCouriers — pontuação', () => {
  it('dá +40 para quem está disponível e +10 para offline', () => {
    const result = suggestCouriers(order(), [
      courier({ id: 'disp', availability: 'AVAILABLE' }),
      courier({ id: 'off', availability: 'OFFLINE' }),
    ])
    const disp = result.find((r) => r.courier.id === 'disp')!
    const off = result.find((r) => r.courier.id === 'off')!
    expect(disp.score - off.score).toBe(30) // 40 - 10
  })

  it('dá +20 quando a cidade base é a mesma da coleta, ignorando caixa e espaços', () => {
    const result = suggestCouriers(order({ pickup_city: 'São Paulo' }), [
      courier({ id: 'sp', base_city: '  SÃO PAULO ' }),
      courier({ id: 'campinas', base_city: 'Campinas' }),
    ])
    const somaSp = result.find((r) => r.courier.id === 'sp')!
    const somaCampinas = result.find((r) => r.courier.id === 'campinas')!
    expect(somaSp.score - somaCampinas.score).toBe(20)
  })

  it('dá +10 quando a zona de atendimento cobre o bairro da coleta', () => {
    const result = suggestCouriers(order({ pickup_district: 'Vila Mariana' }), [
      courier({ id: 'zona', service_zone: 'vila mariana' }),
      courier({ id: 'outro', service_zone: 'Pinheiros' }),
    ])
    const zona = result.find((r) => r.courier.id === 'zona')!
    const outro = result.find((r) => r.courier.id === 'outro')!
    expect(zona.score - outro.score).toBe(10)
  })

  it('não pontua distância quando o entregador não compartilhou localização', () => {
    const result = suggestCouriers(
      order({ pickup_latitude: -23.55, pickup_longitude: -46.63 }),
      [courier({ location_sharing_enabled: false })],
    )
    expect(result[0].distance).toBeNull()
    expect(result[0].reasons).toContain('Localização não compartilhada')
  })

  it('pontua mais quem está mais perto da coleta', () => {
    const coleta = { pickup_latitude: -23.55, pickup_longitude: -46.63 }
    const result = suggestCouriers(order(coleta), [
      courier({ id: 'perto', current_latitude: -23.551, current_longitude: -46.631 }),
      courier({ id: 'longe', current_latitude: -23.60, current_longitude: -46.70 }),
    ])
    const perto = result.find((r) => r.courier.id === 'perto')!
    const longe = result.find((r) => r.courier.id === 'longe')!
    expect(perto.score).toBeGreaterThan(longe.score)
    expect(perto.distance!).toBeLessThan(longe.distance!)
  })

  it('nunca deixa a pontuação de distância ficar negativa', () => {
    // ponto muito distante: 30 - km ficaria negativo sem o piso em zero
    const result = suggestCouriers(
      order({ pickup_latitude: -23.55, pickup_longitude: -46.63 }),
      [courier({ current_latitude: -10, current_longitude: -60 })],
    )
    // 40 (disponível) + 20 (mesma cidade) + 10 (nada) + 0 (distância) = 60
    expect(result[0].score).toBe(60)
  })
})

describe('suggestCouriers — ordenação e motivos', () => {
  it('ordena do maior para o menor score', () => {
    const result = suggestCouriers(order(), [
      courier({ id: 'off', availability: 'OFFLINE', base_city: 'Campinas' }),
      courier({ id: 'top', availability: 'AVAILABLE', base_city: 'São Paulo' }),
      courier({ id: 'meio', availability: 'OFFLINE', base_city: 'São Paulo' }),
    ])
    expect(result.map((r) => r.courier.id)).toEqual(['top', 'meio', 'off'])
  })

  it('explica cada ponto com um motivo legível', () => {
    const result = suggestCouriers(order(), [courier()])
    expect(result[0].reasons).toContain('Disponível agora')
    expect(result[0].reasons).toContain('Mesma cidade da coleta')
  })
})
