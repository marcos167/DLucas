import { describe, expect, it } from 'vitest'
import {
  createHaversineProvider, createOsrmTableProvider, haversineMeters, matrixProviderFromEnv, withFallback,
  type LatLng, type MatrixProvider,
} from './matrix'
import {
  addStop, buildStops, DEFAULT_ORGANIZE_OPTIONS, moveStop, optimizeStopSequence, orderStops, organizeRoutes,
  planMetaPayload, removeStop, splitIntoRoutes, toPlanPayload, type PlannerPackage, type PlanStop,
} from './organizer'
import { addressKey } from './address'

const haversine = createHaversineProvider()

function pkg(code: string, street: string, number: string, point: LatLng | null, zip = '02710000'): PlannerPackage {
  return {
    id: `id-${code}`, tracking_code: code, address_key: addressKey(zip, street, number), zip_code: zip,
    street, number, district: 'Bairro', city: 'São Paulo',
    latitude: point?.lat ?? null, longitude: point?.lng ?? null,
  }
}

/** 49 pacotes em 42 endereços espalhados em uma grade de ~150 m (um bairro). */
function dayOf49(): PlannerPackage[] {
  const packages: PlannerPackage[] = []
  for (let i = 0; i < 42; i++) {
    const point = { lat: -23.48 + Math.floor(i / 7) * 0.0014, lng: -46.66 + (i % 7) * 0.0015 }
    packages.push(pkg(`P${String(i).padStart(3, '0')}`, `Rua ${Math.floor(i / 7)}`, String(100 + i), point))
  }
  // sete endereços recebem um segundo pacote
  for (let i = 0; i < 7; i++) {
    const twin = packages[i * 6]
    packages.push({ ...twin, id: `id-T${i}`, tracking_code: `T${i}` })
  }
  return packages
}

describe('matriz de distâncias', () => {
  it('calcula distância em linha reta com precisão de GPS', () => {
    // 0,01° de latitude ≈ 1.112 m
    expect(haversineMeters({ lat: -23.55, lng: -46.63 }, { lat: -23.56, lng: -46.63 })).toBeCloseTo(1112, -1)
    expect(haversineMeters({ lat: -23.55, lng: -46.63 }, { lat: -23.55, lng: -46.63 })).toBe(0)
  })

  it('estimativa local é simétrica, com diagonal zero e tempo proporcional', async () => {
    const points = [{ lat: -23.55, lng: -46.63 }, { lat: -23.56, lng: -46.63 }, { lat: -23.56, lng: -46.64 }]
    const result = await haversine.matrix(points)
    expect(result.provider).toBe('haversine')
    expect(result.fallbackUsed).toBe(false)
    for (let i = 0; i < 3; i++) {
      expect(result.distancesM[i][i]).toBe(0)
      for (let j = 0; j < 3; j++) expect(result.distancesM[i][j]).toBe(result.distancesM[j][i])
    }
    // 1.112 m × 1,3 de sinuosidade a 22 km/h ≈ 237 s
    expect(result.distancesM[0][1]).toBeGreaterThan(1400)
    expect(result.distancesM[0][1]).toBeLessThan(1500)
    expect(result.durationsS[0][1]).toBeGreaterThan(225)
    expect(result.durationsS[0][1]).toBeLessThan(245)
  })

  it('provedor externo: monta a URL em lng,lat e devolve a matriz do serviço', async () => {
    let requested = ''
    const provider = createOsrmTableProvider({
      urlTemplate: 'https://mapas.exemplo/table/v1/driving/{coordinates}?annotations=distance,duration',
      name: 'osrm-teste',
      fetchImpl: (async (url: string) => {
        requested = url
        return new Response(JSON.stringify({
          code: 'Ok', distances: [[0, 1200.4], [1300.6, 0]], durations: [[0, 200.2], [210.7, 0]],
        }))
      }) as unknown as typeof fetch,
    })
    const result = await provider.matrix([{ lat: -23.55, lng: -46.63 }, { lat: -23.56, lng: -46.64 }])
    expect(requested).toContain('/-46.630000,-23.550000;-46.640000,-23.560000?')
    expect(result).toEqual({
      distancesM: [[0, 1200], [1301, 0]], durationsS: [[0, 200], [211, 0]],
      provider: 'osrm-teste', fallbackUsed: false,
    })
  })

  it('provedor externo recusa resposta com erro, incompleta ou com rota impossível', async () => {
    const respond = (body: unknown, status = 200) => createOsrmTableProvider({
      urlTemplate: 'https://x/{coordinates}',
      fetchImpl: (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch,
    })
    const points = [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }]
    await expect(respond({}, 503).matrix(points)).rejects.toThrow('HTTP 503')
    await expect(respond({ code: 'NoTable' }).matrix(points)).rejects.toThrow('NoTable')
    await expect(respond({ code: 'Ok', distances: [[0, 1]], durations: [[0, 1], [1, 0]] }).matrix(points))
      .rejects.toThrow('matriz incompleta')
    // OSRM devolve null quando não há caminho entre dois pontos
    await expect(respond({ code: 'Ok', distances: [[0, null], [1, 0]], durations: [[0, 1], [1, 0]] }).matrix(points))
      .rejects.toThrow('matriz incompleta')
    await expect(createOsrmTableProvider({ urlTemplate: 'https://x/sem-marcador' }).matrix(points))
      .rejects.toThrow('{coordinates}')
    await expect(createOsrmTableProvider({ urlTemplate: 'https://x/{coordinates}', maxPoints: 1 }).matrix(points))
      .rejects.toThrow('excedem o limite')
  })

  it('cai para o cálculo local quando o serviço externo está fora e registra isso', async () => {
    const broken: MatrixProvider = { name: 'fora-do-ar', matrix: async () => { throw new Error('timeout') } }
    const provider = withFallback(broken, haversine)
    const result = await provider.matrix([{ lat: -23.55, lng: -46.63 }, { lat: -23.56, lng: -46.63 }])
    expect(result.provider).toBe('haversine')
    expect(result.fallbackUsed).toBe(true)
    expect(result.distancesM[0][1]).toBeGreaterThan(0)
  })

  it('sem serviço configurado usa só o cálculo local, sem chamar terceiros', async () => {
    expect(matrixProviderFromEnv({}).name).toBe('haversine')
    expect(matrixProviderFromEnv({ VITE_ROUTING_MATRIX_URL: '  ' }).name).toBe('haversine')
    const configured = matrixProviderFromEnv({
      VITE_ROUTING_MATRIX_URL: 'https://x/{coordinates}', VITE_ROUTING_MATRIX_NAME: 'mapbox',
    })
    expect(configured.name).toBe('mapbox+haversine')
  })
})

describe('paradas: um endereço, vários pacotes', () => {
  it('junta pacotes do mesmo endereço e mantém os códigos em ordem', () => {
    const here = { lat: -23.5, lng: -46.6 }
    const stops = buildStops([
      pkg('B2', 'Rua das Flores', '100', here),
      pkg('A1', 'Rua das Flores', '100', null),
      pkg('C3', 'Rua das Flores', '102', here),
    ])
    expect(stops).toHaveLength(2)
    const shared = stops.find((stop) => stop.number === '100') as PlanStop
    expect(shared.packageIds).toEqual(['id-A1', 'id-B2'])
    // a coordenada vem de qualquer pacote do endereço que a tenha
    expect(shared.point).toEqual(here)
  })
})

describe('trajeto', () => {
  it('ordena paradas em linha a partir da central, sem ir e voltar', async () => {
    const line = [0, 1, 2, 3, 4, 5].map((i) => pkg(`L${i}`, 'Rua Reta', String(i), { lat: -23.5, lng: -46.6 + i * 0.002 }))
    const shuffled = [line[3], line[0], line[5], line[1], line[4], line[2]]
    const ordered = await orderStops(buildStops(shuffled), { lat: -23.5, lng: -46.602 }, haversine)
    expect(ordered.stops.map((stop) => stop.number)).toEqual(['0', '1', '2', '3', '4', '5'])
    // cada trecho tem ~205 m × 1,3
    for (const stop of ordered.stops) {
      expect(stop.legDistanceM).toBeGreaterThan(200)
      expect(stop.legDistanceM).toBeLessThan(600)
    }
  })

  it('corrige o vizinho mais próximo quando ele escolhe um trajeto pior', async () => {
    // pontos em uma reta: central em 0, paradas em -1, +2 e -4.
    // O vizinho mais próximo vai a -1, cruza até +2 e volta até -4 (1 + 3 + 6 = 10);
    // o melhor trajeto resolve +2 primeiro e segue para um lado só (2 + 3 + 3 = 8).
    const x = [0, -1, 2, -4]
    const cost = x.map((from) => x.map((to) => Math.abs(from - to)))
    const provider: MatrixProvider = {
      name: 'fixa',
      matrix: async () => ({ distancesM: cost, durationsS: cost, provider: 'fixa', fallbackUsed: false }),
    }
    const stops: PlanStop[] = [1, 2, 3].map((n) => ({
      key: `k${n}`, zip: '02710000', street: 'Rua', number: String(x[n]), district: null, city: null,
      point: { lat: 0, lng: x[n] }, packageIds: [`p${n}`], legDistanceM: null, legDurationS: null,
    }))

    const pathCost = (order: number[]) => order.reduce((sum, node, i) => sum + cost[i === 0 ? 0 : order[i - 1]][node], 0)
    const permutations = [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]]
    const best = Math.min(...permutations.map(pathCost))
    expect(best).toBe(8)
    expect(pathCost([1, 2, 3])).toBe(10) // o que o vizinho mais próximo, sozinho, entregaria

    const ordered = await orderStops(stops, { lat: 0, lng: 0 }, provider)
    expect(ordered.stops.map((stop) => stop.number)).toEqual(['2', '-1', '-4'])
    expect(ordered.stops.reduce((sum, stop) => sum + (stop.legDurationS ?? 0), 0)).toBe(best)
  })

  it('sem nenhuma coordenada, segue a ordem de CEP e não inventa distância', async () => {
    const stops = buildStops([
      pkg('A', 'Rua C', '1', null, '02730000'),
      pkg('B', 'Rua A', '1', null, '02710000'),
      pkg('C', 'Rua B', '1', null, '02720000'),
    ])
    const ordered = await orderStops(stops, null, haversine)
    expect(ordered.stops.map((stop) => stop.zip)).toEqual(['02710000', '02720000', '02730000'])
    expect(ordered.provider).toBe('cep-order')
    expect(ordered.unlocated).toBe(3)
    expect(ordered.stops.every((stop) => stop.legDistanceM === null)).toBe(true)
  })

  it('parada sem coordenada entra ao lado da de CEP mais próximo, com trecho desconhecido', async () => {
    const stops = buildStops([
      pkg('A', 'Rua A', '1', { lat: -23.5, lng: -46.6 }, '02710000'),
      pkg('B', 'Rua B', '1', { lat: -23.5, lng: -46.59 }, '02790000'),
      pkg('X', 'Rua X', '1', null, '02710100'),
    ])
    const ordered = await orderStops(stops, { lat: -23.5, lng: -46.61 }, haversine)
    expect(ordered.stops.map((stop) => stop.street)).toEqual(['Rua A', 'Rua X', 'Rua B'])
    expect(ordered.unlocated).toBe(1)
    expect(ordered.stops[0].legDistanceM).toBeGreaterThan(0)
    expect(ordered.stops[1].legDistanceM).toBeNull()
    // o trecho até a Rua B deixou de ser conhecido: a parada anterior não tem coordenada
    expect(ordered.stops[2].legDistanceM).toBeNull()
  })
})

describe('corte em roteiros', () => {
  const stop = (n: number, packages: number, leg: number | null): PlanStop => ({
    key: `k${n}`, zip: '02710000', street: 'Rua', number: String(n), district: null, city: null,
    point: null, packageIds: Array.from({ length: packages }, (_, i) => `p${n}-${i}`),
    legDistanceM: leg, legDurationS: leg == null ? null : Math.round(leg / 6),
  })

  it('respeita o máximo de paradas por roteiro', () => {
    const routes = splitIntoRoutes([1, 2, 3, 4, 5].map((n) => stop(n, 1, 100)),
      { stopsPerRoute: 2, packagesPerRoute: 10, maxLegKm: null, start: null })
    expect(routes.map((route) => route.stops.length)).toEqual([2, 2, 1])
  })

  it('respeita o máximo de pacotes, mas nunca divide um endereço', () => {
    const routes = splitIntoRoutes([stop(1, 3, 100), stop(2, 2, 100), stop(3, 6, 100), stop(4, 1, 100)],
      { stopsPerRoute: 10, packagesPerRoute: 4, maxLegKm: null, start: null })
    expect(routes.map((route) => route.stops.map((s) => s.packageIds.length))).toEqual([[3], [2], [6], [1]])
  })

  it('abre roteiro novo quando o deslocamento é longo demais', () => {
    const routes = splitIntoRoutes([stop(1, 1, 100), stop(2, 1, 200), stop(3, 1, 2500), stop(4, 1, 100)],
      { stopsPerRoute: 10, packagesPerRoute: 10, maxLegKm: 1.5, start: null })
    expect(routes.map((route) => route.stops.length)).toEqual([2, 2])
    // a distância do roteiro inclui o deslocamento até a primeira parada dele
    expect(routes[1].distanceM).toBe(2600)
  })

  it('parâmetros inválidos não geram roteiro vazio nem laço infinito', () => {
    const routes = splitIntoRoutes([stop(1, 1, null), stop(2, 1, null)],
      { stopsPerRoute: 0, packagesPerRoute: -3, maxLegKm: 0, start: null })
    expect(routes.map((route) => route.stops.length)).toEqual([1, 1])
    expect(splitIntoRoutes([], DEFAULT_ORGANIZE_OPTIONS)).toEqual([])
  })
})

describe('critério de prontidão: 49 pacotes viram 20 ou mais roteiros', () => {
  it('com os parâmetros padrão, cada pacote entra em exatamente um roteiro', async () => {
    const packages = dayOf49()
    expect(packages).toHaveLength(49)
    const result = await organizeRoutes(packages, DEFAULT_ORGANIZE_OPTIONS, haversine)

    expect(result.routes.length).toBeGreaterThanOrEqual(20)
    expect(result.meta).toMatchObject({ packages: 49, stops: 42, unlocatedStops: 0, fallbackUsed: false })

    const routed = result.routes.flatMap((route) => route.stops.flatMap((stop) => stop.packageIds))
    expect(routed).toHaveLength(49)
    expect(new Set(routed).size).toBe(49)
    expect(new Set(routed)).toEqual(new Set(packages.map((p) => p.id)))

    for (const route of result.routes) {
      expect(route.stops.length).toBeGreaterThan(0)
      expect(route.stops.length).toBeLessThanOrEqual(DEFAULT_ORGANIZE_OPTIONS.stopsPerRoute)
      const count = route.stops.reduce((sum, stop) => sum + stop.packageIds.length, 0)
      expect(count).toBeLessThanOrEqual(DEFAULT_ORGANIZE_OPTIONS.packagesPerRoute)
    }
  })

  it('pacotes do mesmo endereço ficam na mesma parada, com dois códigos', async () => {
    const result = await organizeRoutes(dayOf49(), DEFAULT_ORGANIZE_OPTIONS, haversine)
    const stops = result.routes.flatMap((route) => route.stops)
    expect(stops.filter((stop) => stop.packageIds.length === 2)).toHaveLength(7)
    // nenhum endereço aparece em dois lugares
    expect(new Set(stops.map((stop) => stop.key)).size).toBe(stops.length)
  })

  it('o trajeto fica muito mais curto que a ordem de importação e é reprodutível', async () => {
    const packages = dayOf49()
    const start = { lat: -23.481, lng: -46.661 }
    const result = await organizeRoutes(packages, { ...DEFAULT_ORGANIZE_OPTIONS, start }, haversine)
    // ordem de importação embaralhada de forma fixa
    const naive = buildStops(packages).sort((a, b) => (a.packageIds[0] < b.packageIds[0] ? 1 : -1))
    let naiveDistance = 0
    let previous = start
    for (const stop of naive.filter((_, index) => index % 2 === 0).concat(naive.filter((_, index) => index % 2 === 1))) {
      naiveDistance += haversineMeters(previous, stop.point as LatLng) * 1.3
      previous = stop.point as LatLng
    }
    expect(result.meta.totalDistanceM).toBeLessThan(naiveDistance * 0.6)
    // 42 paradas a ~150 m: o trajeto todo cabe em poucos quilômetros
    expect(result.meta.totalDistanceM).toBeLessThan(12_000)

    const again = await organizeRoutes(packages.slice().reverse(), { ...DEFAULT_ORGANIZE_OPTIONS, start }, haversine)
    expect(toPlanPayload(again.routes)).toEqual(toPlanPayload(result.routes))
  })

  it('funciona com o serviço de mapas fora do ar e avisa que usou a reserva', async () => {
    const broken: MatrixProvider = { name: 'mapas', matrix: async () => { throw new Error('HTTP 503') } }
    const result = await organizeRoutes(dayOf49(), DEFAULT_ORGANIZE_OPTIONS, withFallback(broken, haversine))
    expect(result.routes.length).toBeGreaterThanOrEqual(20)
    expect(result.meta.fallbackUsed).toBe(true)
    expect(planMetaPayload(result.meta)).toMatchObject({ provider: 'haversine', fallback_used: true })
  })

  it('limites maiores geram menos roteiros: o tamanho é parâmetro, não regra fixa', async () => {
    const result = await organizeRoutes(dayOf49(),
      { stopsPerRoute: 6, packagesPerRoute: 8, maxLegKm: null, start: null }, haversine)
    expect(result.routes.length).toBeLessThan(10)
    expect(result.routes.flatMap((route) => route.stops.flatMap((stop) => stop.packageIds))).toHaveLength(49)
  })
})

describe('ajuste manual dos roteiros', () => {
  async function plan() {
    const packages = [0, 1, 2, 3].map((i) => pkg(`M${i}`, 'Rua Manual', String(i), { lat: -23.5, lng: -46.6 + i * 0.002 }))
    return organizeRoutes(packages, { stopsPerRoute: 2, packagesPerRoute: 4, maxLegKm: null, start: null }, haversine)
  }

  it('move uma parada para outro roteiro, marca como manual e recalcula os trechos', async () => {
    const { routes } = await plan()
    expect(routes.map((route) => route.stops.map((stop) => stop.number))).toEqual([['0', '1'], ['2', '3']])
    const moved = moveStop(routes, { route: 0, stop: 1 }, { route: 1, stop: 0 }, null)
    expect(moved.map((route) => route.stops.map((stop) => stop.number))).toEqual([['0'], ['1', '2', '3']])
    expect(moved.every((route) => route.origin === 'MANUAL')).toBe(true)
    expect(moved[1].stops[0].legDistanceM).toBeGreaterThan(0)
    // o plano original não foi alterado
    expect(routes[0].stops).toHaveLength(2)
  })

  it('esvaziar um roteiro o remove; índices inválidos não alteram nada', async () => {
    const { routes } = await plan()
    const once = moveStop(routes, { route: 0, stop: 0 }, { route: 1, stop: 9 }, null)
    const twice = moveStop(once, { route: 0, stop: 0 }, { route: 1, stop: 0 }, null)
    expect(twice).toHaveLength(1)
    expect(twice[0].stops).toHaveLength(4)
    expect(moveStop(routes, { route: 7, stop: 0 }, { route: 0, stop: 0 }, null)).toBe(routes)
  })

  it('tira uma parada dos roteiros e a recoloca em um roteiro novo', async () => {
    const { routes } = await plan()
    const { routes: without, removed } = removeStop(routes, { route: 1, stop: 0 }, null)
    expect(removed?.number).toBe('2')
    expect(without.flatMap((route) => route.stops)).toHaveLength(3)
    const withNew = addStop(without, removed as PlanStop, 'new', null)
    expect(withNew).toHaveLength(3)
    expect(withNew[2].origin).toBe('MANUAL')
    // o mesmo endereço não entra duas vezes no mesmo roteiro
    expect(addStop(withNew, removed as PlanStop, 2, null)).toBe(withNew)
  })

  it('gera o formato gravado no banco com inteiros e sem roteiros vazios', async () => {
    const { routes, meta } = await plan()
    const payload = toPlanPayload([...routes, { origin: 'MANUAL', stops: [], distanceM: 0, durationS: 0 }])
    expect(payload).toHaveLength(2)
    expect(payload[0].stops[0]).toEqual({
      address_key: routes[0].stops[0].key, package_ids: ['id-M0'], leg_distance_m: null, leg_duration_s: null,
    })
    expect(Number.isInteger(payload[0].distance_m)).toBe(true)
    expect(planMetaPayload(meta)).toMatchObject({
      provider: 'haversine', fallback_used: false,
      params: { stops_per_route: 2, packages_per_route: 4, max_leg_km: null },
    })
    expect(planMetaPayload(null)).toMatchObject({ algorithm: 'manual', provider: 'none' })
  })
})

describe('reordenar as paradas pendentes de um roteiro', () => {
  it('parte da posição atual e devolve a ordem com os trechos', async () => {
    const result = await optimizeStopSequence([
      { id: 'longe', zip: '02710000', point: { lat: -23.5, lng: -46.58 } },
      { id: 'perto', zip: '02710000', point: { lat: -23.5, lng: -46.599 } },
      { id: 'meio', zip: '02710000', point: { lat: -23.5, lng: -46.59 } },
    ], { lat: -23.5, lng: -46.6 }, haversine)
    expect(result.order).toEqual(['perto', 'meio', 'longe'])
    expect(result.legs.map((leg) => leg.stop_id)).toEqual(['perto', 'meio', 'longe'])
    expect(result.distanceM).toBeGreaterThan(2000)
    expect(result.provider).toBe('haversine')
  })
})
