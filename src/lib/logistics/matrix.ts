/**
 * Matriz de distâncias e tempos entre pontos.
 *
 * O organizador de roteiros só conhece a interface `MatrixProvider`. Trocar o
 * provedor de mapas (OSRM, Mapbox, um serviço próprio) é trocar a
 * implementação, não o motor. O cálculo geométrico local está sempre
 * disponível e assume quando o serviço externo falha ou não está configurado.
 */

export interface LatLng {
  lat: number
  lng: number
}

export interface MatrixResult {
  /** metros de i para j */
  distancesM: number[][]
  /** segundos de i para j */
  durationsS: number[][]
  provider: string
  /** verdadeiro quando o provedor configurado falhou e o cálculo local assumiu */
  fallbackUsed: boolean
}

export interface MatrixProvider {
  name: string
  matrix(points: LatLng[]): Promise<MatrixResult>
}

const EARTH_RADIUS_M = 6_371_000

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(Math.min(1, h)))
}

/**
 * Estimativa local: distância em linha reta corrigida por um fator de
 * sinuosidade das ruas e convertida em tempo por uma velocidade média urbana
 * de moto. Não enxerga mão de via nem trânsito — é uma ordem de grandeza boa
 * o bastante para agrupar e ordenar paradas próximas.
 */
export function createHaversineProvider(options: { circuity?: number; speedKmh?: number } = {}): MatrixProvider {
  const circuity = options.circuity ?? 1.3
  const speedMps = ((options.speedKmh ?? 22) * 1000) / 3600
  return {
    name: 'haversine',
    async matrix(points) {
      const distancesM = points.map((from) =>
        points.map((to) => (from === to ? 0 : Math.round(haversineMeters(from, to) * circuity))),
      )
      const durationsS = distancesM.map((row) => row.map((meters) => Math.round(meters / speedMps)))
      return { distancesM, durationsS, provider: 'haversine', fallbackUsed: false }
    },
  }
}

export class MatrixProviderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MatrixProviderError'
  }
}

function isSquareMatrix(value: unknown, size: number): value is number[][] {
  return (
    Array.isArray(value) && value.length === size &&
    value.every((row) => Array.isArray(row) && row.length === size &&
      row.every((cell) => typeof cell === 'number' && Number.isFinite(cell) && cell >= 0))
  )
}

/**
 * Provedor para serviços no formato "table" do OSRM, que o Matrix API do
 * Mapbox também segue. A URL é um modelo com `{coordinates}`, por exemplo:
 *
 *   https://SEU-OSRM/table/v1/driving/{coordinates}?annotations=distance,duration
 *   https://api.mapbox.com/directions-matrix/v1/mapbox/driving/{coordinates}?annotations=distance,duration&access_token=...
 *
 * Qualquer resposta fora do esperado vira erro — o chamador decide o que fazer
 * (normalmente, cair no cálculo local via `withFallback`).
 */
export function createOsrmTableProvider(options: {
  urlTemplate: string
  name?: string
  timeoutMs?: number
  maxPoints?: number
  fetchImpl?: typeof fetch
}): MatrixProvider {
  const name = options.name ?? 'osrm-table'
  const timeoutMs = options.timeoutMs ?? 8000
  const maxPoints = options.maxPoints ?? 100
  return {
    name,
    async matrix(points) {
      if (points.length > maxPoints) {
        throw new MatrixProviderError(`${name}: ${points.length} pontos excedem o limite de ${maxPoints}`)
      }
      if (!options.urlTemplate.includes('{coordinates}')) {
        throw new MatrixProviderError(`${name}: a URL precisa conter {coordinates}`)
      }
      const coordinates = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';')
      const url = options.urlTemplate.replace('{coordinates}', coordinates)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const doFetch = options.fetchImpl ?? fetch
        const response = await doFetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
        if (!response.ok) throw new MatrixProviderError(`${name}: HTTP ${response.status}`)
        const body = (await response.json()) as { code?: string; distances?: unknown; durations?: unknown }
        if (body.code && body.code !== 'Ok') throw new MatrixProviderError(`${name}: ${body.code}`)
        if (!isSquareMatrix(body.distances, points.length) || !isSquareMatrix(body.durations, points.length)) {
          throw new MatrixProviderError(`${name}: matriz incompleta`)
        }
        return {
          distancesM: body.distances.map((row) => row.map(Math.round)),
          durationsS: body.durations.map((row) => row.map(Math.round)),
          provider: name,
          fallbackUsed: false,
        }
      } catch (error) {
        if (error instanceof MatrixProviderError) throw error
        throw new MatrixProviderError(`${name}: ${(error as Error).message || 'falha de rede'}`)
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

/** Usa o provedor principal e, se ele falhar, o reserva — registrando que foi o reserva. */
export function withFallback(primary: MatrixProvider | null, fallback: MatrixProvider): MatrixProvider {
  if (!primary) return fallback
  return {
    name: `${primary.name}+${fallback.name}`,
    async matrix(points) {
      try {
        return await primary.matrix(points)
      } catch {
        const result = await fallback.matrix(points)
        return { ...result, fallbackUsed: true }
      }
    },
  }
}

/**
 * Provedor efetivo da aplicação. Sem `VITE_ROUTING_MATRIX_URL`, só o cálculo
 * local é usado (nenhum serviço de terceiros é chamado por padrão).
 */
export function matrixProviderFromEnv(env: Record<string, string | undefined>): MatrixProvider {
  const fallback = createHaversineProvider()
  const urlTemplate = env.VITE_ROUTING_MATRIX_URL?.trim()
  if (!urlTemplate) return fallback
  const maxPoints = Number(env.VITE_ROUTING_MATRIX_MAX_POINTS)
  return withFallback(
    createOsrmTableProvider({
      urlTemplate,
      name: env.VITE_ROUTING_MATRIX_NAME?.trim() || 'osrm-table',
      maxPoints: Number.isFinite(maxPoints) && maxPoints > 1 ? maxPoints : undefined,
    }),
    fallback,
  )
}
