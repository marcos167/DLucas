import { haversineMeters, type LatLng, type MatrixProvider } from './matrix'

/**
 * Organizador de roteiros (funções puras, sem tela e sem banco).
 *
 *   1. `buildStops`      junta pacotes do mesmo endereço em uma parada
 *   2. `orderStops`      encadeia as paradas em um trajeto único pelo dia
 *   3. `splitIntoRoutes` corta o trajeto em roteiros pequenos
 *
 * O trajeto único é o que dá sentido à numeração: o Roteiro 02 começa onde
 * o Roteiro 01 terminou. Com menos de 50 paradas por funcionário, vizinho
 * mais próximo + melhorias locais (2-opt e realocação) resolve em
 * milissegundos e dispensa um otimizador pesado.
 */

export interface PlannerPackage {
  id: string
  tracking_code: string
  address_key: string
  zip_code: string | null
  street: string
  number: string | null
  district: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
}

export interface PlanStop {
  /** chave do endereço físico (`packages.address_key`) */
  key: string
  zip: string | null
  street: string
  number: string | null
  district: string | null
  city: string | null
  point: LatLng | null
  packageIds: string[]
  /** trecho desde a parada anterior do trajeto (ou desde a central) */
  legDistanceM: number | null
  legDurationS: number | null
}

export interface PlanRoute {
  origin: 'AUTO' | 'MANUAL'
  stops: PlanStop[]
  distanceM: number
  durationS: number
}

export interface OrganizeOptions {
  /** máximo de paradas em um roteiro */
  stopsPerRoute: number
  /** máximo de pacotes em um roteiro (uma parada sozinha pode passar disso) */
  packagesPerRoute: number
  /** trecho maior que isto abre um roteiro novo; `null` desliga a regra */
  maxLegKm: number | null
  /** ponto de partida (central de distribuição), quando conhecido */
  start: LatLng | null
}

export interface OrganizeResult {
  routes: PlanRoute[]
  meta: {
    algorithm: string
    provider: string
    fallbackUsed: boolean
    stops: number
    packages: number
    /** paradas sem coordenada, posicionadas pela proximidade do CEP */
    unlocatedStops: number
    totalDistanceM: number
    totalDurationS: number
    params: OrganizeOptions
  }
}

export const DEFAULT_ORGANIZE_OPTIONS: OrganizeOptions = {
  stopsPerRoute: 2,
  packagesPerRoute: 4,
  maxLegKm: 1.5,
  start: null,
}

const ALGORITHM = 'nearest-neighbour+2opt+relocate/tour-split'

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Uma parada por endereço; os pacotes ficam em ordem de código para a conferência. */
export function buildStops(packages: PlannerPackage[]): PlanStop[] {
  const byKey = new Map<string, PlannerPackage[]>()
  for (const pkg of packages) {
    const group = byKey.get(pkg.address_key)
    if (group) group.push(pkg)
    else byKey.set(pkg.address_key, [pkg])
  }
  const stops: PlanStop[] = []
  for (const [key, group] of byKey) {
    group.sort((a, b) => compare(a.tracking_code, b.tracking_code))
    const located = group.find((pkg) => pkg.latitude != null && pkg.longitude != null)
    const first = group[0]
    stops.push({
      key,
      zip: first.zip_code,
      street: first.street,
      number: first.number,
      district: first.district,
      city: first.city,
      point: located ? { lat: located.latitude as number, lng: located.longitude as number } : null,
      packageIds: group.map((pkg) => pkg.id),
      legDistanceM: null,
      legDurationS: null,
    })
  }
  return stops.sort((a, b) => compare(a.key, b.key))
}

/** Custo de percorrer `order` saindo de `start` (índice na matriz) ou do primeiro ponto. */
function pathCost(order: number[], cost: number[][], start: number | null): number {
  if (order.length === 0) return 0
  let total = start == null ? 0 : cost[start][order[0]]
  for (let i = 0; i + 1 < order.length; i++) total += cost[order[i]][order[i + 1]]
  return total
}

function nearestNeighbour(nodes: number[], cost: number[][], start: number | null, first: number): number[] {
  const remaining = new Set(nodes)
  const order: number[] = []
  let current = start
  if (current == null) {
    current = first
    remaining.delete(first)
    order.push(first)
  }
  while (remaining.size > 0) {
    let best = -1
    let bestCost = Infinity
    for (const candidate of remaining) {
      const value = cost[current][candidate]
      if (value < bestCost || (value === bestCost && candidate < best)) { best = candidate; bestCost = value }
    }
    remaining.delete(best)
    order.push(best)
    current = best
  }
  return order
}

/**
 * Melhoria local: inverte trechos (2-opt) e realoca paradas isoladas enquanto
 * houver ganho. O custo é recalculado por inteiro a cada tentativa, o que
 * mantém o resultado correto mesmo com matriz assimétrica (mão de via).
 */
function improve(initial: number[], cost: number[][], start: number | null): number[] {
  let order = initial.slice()
  let best = pathCost(order, cost, start)
  for (let pass = 0; pass < 60; pass++) {
    let improved = false
    for (let i = 0; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const candidate = order.slice(0, i).concat(order.slice(i, j + 1).reverse(), order.slice(j + 1))
        const value = pathCost(candidate, cost, start)
        if (value < best - 1e-9) { order = candidate; best = value; improved = true }
      }
    }
    for (let i = 0; i < order.length; i++) {
      for (let j = 0; j < order.length; j++) {
        if (i === j) continue
        const candidate = order.slice()
        const [moved] = candidate.splice(i, 1)
        candidate.splice(j, 0, moved)
        const value = pathCost(candidate, cost, start)
        if (value < best - 1e-9) { order = candidate; best = value; improved = true }
      }
    }
    if (!improved) break
  }
  return order
}

const zipNumber = (zip: string | null) => (zip && /^\d{8}$/.test(zip) ? Number(zip) : null)

/**
 * Paradas sem coordenada entram ao lado da parada localizada de CEP mais
 * próximo: no Brasil, CEPs vizinhos são ruas vizinhas. Sem nenhuma coordenada,
 * o trajeto inteiro segue a ordem de CEP e endereço.
 */
function mergeUnlocated(located: PlanStop[], unlocated: PlanStop[]): PlanStop[] {
  const sorted = unlocated.slice().sort((a, b) =>
    compare(a.zip ?? '99999999', b.zip ?? '99999999') || compare(a.key, b.key))
  if (located.length === 0) return sorted
  const after = new Map<number, PlanStop[]>()
  const tail: PlanStop[] = []
  for (const stop of sorted) {
    const zip = zipNumber(stop.zip)
    if (zip == null) { tail.push(stop); continue }
    let anchor = -1
    let distance = Infinity
    located.forEach((candidate, index) => {
      const candidateZip = zipNumber(candidate.zip)
      if (candidateZip == null) return
      const gap = Math.abs(candidateZip - zip)
      if (gap < distance) { anchor = index; distance = gap }
    })
    if (anchor < 0) { tail.push(stop); continue }
    const list = after.get(anchor)
    if (list) list.push(stop)
    else after.set(anchor, [stop])
  }
  const merged: PlanStop[] = []
  located.forEach((stop, index) => {
    merged.push(stop)
    merged.push(...(after.get(index) ?? []))
  })
  return merged.concat(tail)
}

export interface OrderedStops {
  stops: PlanStop[]
  provider: string
  fallbackUsed: boolean
  unlocated: number
}

/** Encadeia as paradas em um trajeto único e preenche os trechos conhecidos. */
export async function orderStops(
  stops: PlanStop[],
  start: LatLng | null,
  provider: MatrixProvider,
): Promise<OrderedStops> {
  const located = stops.filter((stop) => stop.point)
  const unlocated = stops.filter((stop) => !stop.point)
  if (located.length === 0) {
    return {
      stops: mergeUnlocated([], unlocated).map((stop) => ({ ...stop, legDistanceM: null, legDurationS: null })),
      provider: 'cep-order',
      fallbackUsed: false,
      unlocated: unlocated.length,
    }
  }

  const offset = start ? 1 : 0
  const points = (start ? [start] : []).concat(located.map((stop) => stop.point as LatLng))
  const matrix = await provider.matrix(points)
  const nodes = located.map((_, index) => index + offset)
  // sem ponto de partida, o trajeto começa pelo menor CEP (resultado estável)
  let first = nodes[0]
  located.forEach((stop, index) => {
    const current = located[first - offset]
    if (compare(stop.zip ?? '99999999', current.zip ?? '99999999') < 0) first = index + offset
  })
  const startNode = start ? 0 : null
  const seed = nearestNeighbour(nodes, matrix.durationsS, startNode, first)
  const order = improve(seed, matrix.durationsS, startNode)

  const ordered: PlanStop[] = order.map((node, position) => {
    const previous = position === 0 ? startNode : order[position - 1]
    return {
      ...located[node - offset],
      legDistanceM: previous == null ? null : matrix.distancesM[previous][node],
      legDurationS: previous == null ? null : matrix.durationsS[previous][node],
    }
  })

  const merged = mergeUnlocated(ordered, unlocated)
  // um trecho só é conhecido quando as duas pontas estão na matriz e são vizinhas no trajeto
  const nodeByKey = new Map(order.map((node) => [located[node - offset].key, node]))
  const result = merged.map((stop, position) => {
    const node = nodeByKey.get(stop.key)
    const previousStop = position === 0 ? null : merged[position - 1]
    const previousNode = position === 0 ? startNode : nodeByKey.get(previousStop!.key)
    if (node == null || previousNode == null) return { ...stop, legDistanceM: null, legDurationS: null }
    return {
      ...stop,
      legDistanceM: matrix.distancesM[previousNode][node],
      legDurationS: matrix.durationsS[previousNode][node],
    }
  })
  return { stops: result, provider: matrix.provider, fallbackUsed: matrix.fallbackUsed, unlocated: unlocated.length }
}

function routeTotals(stops: PlanStop[]): { distanceM: number; durationS: number } {
  let distanceM = 0
  let durationS = 0
  for (const stop of stops) {
    distanceM += stop.legDistanceM ?? 0
    durationS += stop.legDurationS ?? 0
  }
  return { distanceM, durationS }
}

/**
 * Corta o trajeto em roteiros. Abre um roteiro novo quando o atual atingiu o
 * máximo de paradas, quando a próxima parada estouraria o máximo de pacotes
 * ou quando o deslocamento até ela é longo demais para ser "o mesmo roteiro".
 */
export function splitIntoRoutes(ordered: PlanStop[], options: OrganizeOptions): PlanRoute[] {
  const maxStops = Math.max(1, Math.floor(options.stopsPerRoute))
  const maxPackages = Math.max(1, Math.floor(options.packagesPerRoute))
  const maxLegM = options.maxLegKm != null && options.maxLegKm > 0 ? options.maxLegKm * 1000 : null
  const routes: PlanRoute[] = []
  let current: PlanStop[] = []
  let packages = 0

  const close = () => {
    if (current.length === 0) return
    routes.push({ origin: 'AUTO', stops: current, ...routeTotals(current) })
    current = []
    packages = 0
  }

  for (const stop of ordered) {
    const farAway = maxLegM != null && stop.legDistanceM != null && stop.legDistanceM > maxLegM
    if (current.length > 0 &&
        (current.length >= maxStops || packages + stop.packageIds.length > maxPackages || farAway)) {
      close()
    }
    current.push(stop)
    packages += stop.packageIds.length
  }
  close()
  return routes
}

/** Agrupamento e sequenciamento automáticos de todos os pacotes de um funcionário. */
export async function organizeRoutes(
  packages: PlannerPackage[],
  options: OrganizeOptions,
  provider: MatrixProvider,
): Promise<OrganizeResult> {
  const stops = buildStops(packages)
  const ordered = await orderStops(stops, options.start, provider)
  const routes = splitIntoRoutes(ordered.stops, options)
  const totals = routeTotals(ordered.stops)
  return {
    routes,
    meta: {
      algorithm: ALGORITHM,
      provider: ordered.provider,
      fallbackUsed: ordered.fallbackUsed,
      stops: stops.length,
      packages: packages.length,
      unlocatedStops: ordered.unlocated,
      totalDistanceM: totals.distanceM,
      totalDurationS: totals.durationS,
      params: options,
    },
  }
}

/* ------------------------------------------------------------------ edição manual */

const LOCAL_CIRCUITY = 1.3
const LOCAL_SPEED_MPS = (22 * 1000) / 3600

/**
 * Recalcula os trechos depois de uma edição manual, com a estimativa local.
 * Mantém os números da tela coerentes sem depender de rede a cada clique.
 */
export function relegRoutes(routes: PlanRoute[], start: LatLng | null): PlanRoute[] {
  let previous: LatLng | null = start
  return routes.map((route) => {
    const stops = route.stops.map((stop) => {
      let legDistanceM: number | null = null
      let legDurationS: number | null = null
      if (previous && stop.point) {
        legDistanceM = Math.round(haversineMeters(previous, stop.point) * LOCAL_CIRCUITY)
        legDurationS = Math.round(legDistanceM / LOCAL_SPEED_MPS)
      }
      previous = stop.point
      return { ...stop, legDistanceM, legDurationS }
    })
    return { ...route, stops, ...routeTotals(stops) }
  })
}

/** Move uma parada para outra posição ou outro roteiro. Índices fora do intervalo são ignorados. */
export function moveStop(
  routes: PlanRoute[],
  from: { route: number; stop: number },
  to: { route: number; stop: number },
  start: LatLng | null,
): PlanRoute[] {
  const source = routes[from.route]
  const target = routes[to.route]
  if (!source || !target || !source.stops[from.stop]) return routes
  // o mesmo endereço não pode aparecer duas vezes no mesmo roteiro
  const moving = source.stops[from.stop]
  if (from.route !== to.route && target.stops.some((stop) => stop.key === moving.key)) return routes

  const next = routes.map((route) => ({ ...route, stops: route.stops.slice() }))
  const [stop] = next[from.route].stops.splice(from.stop, 1)
  const position = Math.max(0, Math.min(to.stop, next[to.route].stops.length))
  next[to.route].stops.splice(position, 0, stop)
  next[from.route].origin = 'MANUAL'
  next[to.route].origin = 'MANUAL'
  return relegRoutes(next.filter((route) => route.stops.length > 0), start)
}

/** Tira uma parada dos roteiros; ela volta para a lista "sem roteiro". */
export function removeStop(
  routes: PlanRoute[],
  at: { route: number; stop: number },
  start: LatLng | null,
): { routes: PlanRoute[]; removed: PlanStop | null } {
  const source = routes[at.route]
  if (!source || !source.stops[at.stop]) return { routes, removed: null }
  const next = routes.map((route) => ({ ...route, stops: route.stops.slice() }))
  const [removed] = next[at.route].stops.splice(at.stop, 1)
  next[at.route].origin = 'MANUAL'
  return { routes: relegRoutes(next.filter((route) => route.stops.length > 0), start), removed }
}

/** Coloca uma parada sem roteiro no fim de um roteiro existente ou em um roteiro novo. */
export function addStop(
  routes: PlanRoute[],
  stop: PlanStop,
  routeIndex: number | 'new',
  start: LatLng | null,
): PlanRoute[] {
  const next = routes.map((route) => ({ ...route, stops: route.stops.slice() }))
  if (routeIndex === 'new' || !next[routeIndex]) {
    next.push({ origin: 'MANUAL', stops: [stop], distanceM: 0, durationS: 0 })
  } else {
    if (next[routeIndex].stops.some((existing) => existing.key === stop.key)) return routes
    next[routeIndex].stops.push(stop)
    next[routeIndex].origin = 'MANUAL'
  }
  return relegRoutes(next, start)
}

/* ------------------------------------------------------------------ sequência de um roteiro */

export interface SequenceStop {
  id: string
  zip: string | null
  point: LatLng | null
}

export interface SequenceResult {
  order: string[]
  legs: { stop_id: string; leg_distance_m: number | null; leg_duration_s: number | null }[]
  distanceM: number
  durationS: number
  provider: string
  fallbackUsed: boolean
  algorithm: string
}

/**
 * Reordena as paradas pendentes de um roteiro a partir de um ponto (a última
 * parada concluída ou a posição atual). Não mexe no que já foi resolvido.
 */
export async function optimizeStopSequence(
  stops: SequenceStop[],
  start: LatLng | null,
  provider: MatrixProvider,
): Promise<SequenceResult> {
  const asPlan: PlanStop[] = stops.map((stop) => ({
    key: stop.id, zip: stop.zip, street: '', number: null, district: null, city: null,
    point: stop.point, packageIds: [], legDistanceM: null, legDurationS: null,
  }))
  const ordered = await orderStops(asPlan, start, provider)
  const totals = routeTotals(ordered.stops)
  return {
    order: ordered.stops.map((stop) => stop.key),
    legs: ordered.stops.map((stop) => ({
      stop_id: stop.key, leg_distance_m: stop.legDistanceM, leg_duration_s: stop.legDurationS,
    })),
    distanceM: totals.distanceM,
    durationS: totals.durationS,
    provider: ordered.provider,
    fallbackUsed: ordered.fallbackUsed,
    algorithm: 'nearest-neighbour+2opt+relocate',
  }
}

/* ------------------------------------------------------------------ gravação */

export interface RoutePlanPayload {
  origin: 'AUTO' | 'MANUAL'
  distance_m: number
  duration_s: number
  stops: {
    address_key: string
    package_ids: string[]
    leg_distance_m: number | null
    leg_duration_s: number | null
  }[]
}

/** Formato aceito por `save_route_plan` (inteiros; o banco ignora o que não for). */
export function toPlanPayload(routes: PlanRoute[]): RoutePlanPayload[] {
  return routes
    .filter((route) => route.stops.length > 0)
    .map((route) => ({
      origin: route.origin,
      distance_m: Math.round(route.distanceM),
      duration_s: Math.round(route.durationS),
      stops: route.stops.map((stop) => ({
        address_key: stop.key,
        package_ids: stop.packageIds,
        leg_distance_m: stop.legDistanceM == null ? null : Math.round(stop.legDistanceM),
        leg_duration_s: stop.legDurationS == null ? null : Math.round(stop.legDurationS),
      })),
    }))
}

export function planMetaPayload(meta: OrganizeResult['meta'] | null): Record<string, unknown> {
  if (!meta) return { algorithm: 'manual', provider: 'none', fallback_used: false, params: {} }
  return {
    algorithm: meta.algorithm,
    provider: meta.provider,
    fallback_used: meta.fallbackUsed,
    total_distance_m: Math.round(meta.totalDistanceM),
    total_duration_s: Math.round(meta.totalDurationS),
    params: {
      stops_per_route: meta.params.stopsPerRoute,
      packages_per_route: meta.params.packagesPerRoute,
      max_leg_km: meta.params.maxLegKm,
      start: meta.params.start,
      unlocated_stops: meta.unlocatedStops,
    },
  }
}
