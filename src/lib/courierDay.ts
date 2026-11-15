/**
 * Organização do trabalho do entregador por dia.
 *
 * As abas do aplicativo (Hoje, Mapa, Próximas) mostram as mesmas duas fontes
 * de trabalho: os roteiros liberados pela distribuição e as entregas avulsas
 * atribuídas pelo despacho. Aqui fica a regra de em que dia cada item aparece,
 * a busca e os pontos do mapa — sem tela e sem servidor, para poder testar.
 */
import { mapsLinks, routeName, todayLocal } from '@/lib/logistics/labels'
import type { RiderPackage, RiderRoute, RiderStop } from '@/lib/logistics/types'
import type { CourierOrder, OrderStatus } from '@/types'

export type DayWindow = 'today' | 'tomorrow' | 'week' | 'all'

export const DAY_WINDOWS: { id: DayWindow; label: string }[] = [
  { id: 'today', label: 'Hoje' },
  { id: 'tomorrow', label: 'Amanhã' },
  { id: 'week', label: '7 dias' },
  { id: 'all', label: 'Todas' },
]

/** Estados em que a entrega avulsa ainda está nas mãos do entregador. */
export const ACTIVE_ORDER_STATUSES: OrderStatus[] = ['ASSIGNED', 'ACCEPTED', 'PICKING_UP', 'COLLECTED', 'IN_TRANSIT']
/** Antes da coleta o entregador ainda precisa passar na farmácia. */
const BEFORE_PICKUP: OrderStatus[] = ['ASSIGNED', 'ACCEPTED', 'PICKING_UP']
/** Roteiros que ainda têm o que fazer. */
const OPEN_ROUTE = ['RELEASED', 'IN_PROGRESS']

/** Data AAAA-MM-DD somada de `days` dias, pelo calendário. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/** Dia em que a entrega avulsa deve ser feita: o agendado ou, sem agendamento, hoje. */
export function orderDay(order: Pick<CourierOrder, 'scheduled_for'>, today: string): string {
  if (!order.scheduled_for) return today
  const when = new Date(order.scheduled_for)
  return Number.isNaN(when.getTime()) ? today : todayLocal(when)
}

/**
 * O dia pertence ao período escolhido?
 * O que ficou de dias anteriores continua sendo trabalho de hoje.
 */
export function inWindow(date: string, window: DayWindow, today: string): boolean {
  if (window === 'today') return date <= today
  if (window === 'tomorrow') return date === addDays(today, 1)
  if (window === 'week') return date <= addDays(today, 6)
  return true
}

/** Roteiros de hoje (e os de dias anteriores que ainda aparecem para o entregador). */
export function todayRoutes(routes: RiderRoute[], today: string): RiderRoute[] {
  return routes.filter((route) => route.route_date <= today)
}

/** Entregas avulsas em andamento que são de hoje. */
export function todayOrders(orders: CourierOrder[], today: string): CourierOrder[] {
  return orders.filter((order) => ACTIVE_ORDER_STATUSES.includes(order.status) && orderDay(order, today) <= today)
}

export interface UpcomingDay {
  date: string
  routes: RiderRoute[]
  orders: CourierOrder[]
}

/** O que já está marcado para os próximos dias, do mais próximo para o mais distante. */
export function upcomingDays(routes: RiderRoute[], orders: CourierOrder[], today: string): UpcomingDay[] {
  const days = new Map<string, UpcomingDay>()
  const at = (date: string) => {
    let entry = days.get(date)
    if (!entry) {
      entry = { date, routes: [], orders: [] }
      days.set(date, entry)
    }
    return entry
  }
  for (const route of routes) {
    if (route.route_date > today && OPEN_ROUTE.includes(route.status)) at(route.route_date).routes.push(route)
  }
  for (const order of orders) {
    const date = orderDay(order, today)
    if (date > today && ACTIVE_ORDER_STATUSES.includes(order.status)) at(date).orders.push(order)
  }
  const list = [...days.values()].sort((a, b) => a.date.localeCompare(b.date))
  for (const entry of list) {
    entry.routes.sort((a, b) => a.sequence - b.sequence)
    entry.orders.sort((a, b) => (a.scheduled_for ?? '').localeCompare(b.scheduled_for ?? ''))
  }
  return list
}

/** "Amanhã", ou o dia da semana com a data por extenso. */
export function dayLabel(date: string, today: string): string {
  const [year, month, day] = date.split('-').map(Number)
  // meio-dia local: o dia do calendário não muda com o fuso do aparelho
  const text = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    .format(new Date(year, month - 1, day, 12))
  const label = text.charAt(0).toUpperCase() + text.slice(1)
  if (date === today) return `Hoje · ${label}`
  if (date === addDays(today, 1)) return `Amanhã · ${label}`
  return label
}

/* ------------------------------------------------------------------ saudação */

export function greeting(now = new Date()): string {
  const hour = now.getHours()
  if (hour >= 5 && hour < 12) return 'Bom dia'
  if (hour >= 12 && hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

export function firstName(fullName?: string | null): string {
  return (fullName ?? '').trim().split(/\s+/)[0] ?? ''
}

/* ------------------------------------------------------------------ busca */

const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const digitsOf = (text: string) => text.replace(/\D/g, '')

/** Todos os termos digitados aparecem em algum dos campos (sem acento; CEP e telefone só pelos dígitos). */
function matches(query: string, fields: Array<string | null | undefined>): boolean {
  const terms = fold(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const texts = fields.filter((field): field is string => Boolean(field)).map(fold)
  return terms.every((term) => {
    if (texts.some((text) => text.includes(term))) return true
    const digits = digitsOf(term)
    return digits.length >= 3 && digits.length === term.replace(/[.\-\s()]/g, '').length
      && texts.some((text) => digitsOf(text).includes(digits))
  })
}

export function orderMatches(order: CourierOrder, query: string): boolean {
  return matches(query, [
    order.code, order.recipient_name, order.recipient_phone,
    order.delivery_street, order.delivery_number, order.delivery_district, order.delivery_city, order.delivery_zip_code,
    order.pickup_street, order.pickup_district, order.pickup_city,
    order.pharmacy?.trade_name, order.unit?.name,
  ])
}

export interface StopHit {
  route: RiderRoute
  stop: RiderStop
  /** pacotes da parada que correspondem à busca */
  packages: RiderPackage[]
}

/** Paradas (com os pacotes encontrados) que correspondem à busca, na ordem dos roteiros. */
export function searchStops(routes: RiderRoute[], query: string): StopHit[] {
  const hits: StopHit[] = []
  for (const route of routes) {
    for (const stop of route.stops) {
      const address = [stop.street, stop.number, stop.district, stop.city, stop.zip_code, routeName(route.sequence)]
      const packages = stop.packages.filter((pkg) => matches(query, [
        ...address, pkg.tracking_code, pkg.recipient_name, pkg.recipient_phone, pkg.complement,
      ]))
      if (packages.length > 0) hits.push({ route, stop, packages })
    }
  }
  return hits
}

/* ------------------------------------------------------------------ mapa */

export interface MapPlace {
  id: string
  /** parada de roteiro, coleta na farmácia ou entrega avulsa */
  kind: 'stop' | 'pickup' | 'delivery'
  /** desenhado no marcador: "roteiro.parada" (3.2 é a 2ª parada do Roteiro 03) ou a letra do tipo */
  label: string
  title: string
  subtitle: string
  /** tela do aplicativo que trata este ponto */
  href: string
  nav: { google: string; waze: string }
}

export interface MapPoint extends MapPlace {
  latitude: number
  longitude: number
}

export interface MapData {
  /** pontos com coordenada, que aparecem no mapa */
  points: MapPoint[]
  /** endereços ainda sem coordenada: aparecem só na lista */
  unplaced: MapPlace[]
}

const line = (...parts: Array<string | null | undefined>) => parts.filter(Boolean).join(' · ')
const street = (name: string, number: string | null) => (number ? `${name}, ${number}` : name)

/** Entregas em aberto do período, separadas entre as que têm e as que não têm ponto no mapa. */
export function mapData(routes: RiderRoute[], orders: CourierOrder[], window: DayWindow, today: string): MapData {
  const data: MapData = { points: [], unplaced: [] }
  const add = (place: MapPlace, latitude: number | null, longitude: number | null) => {
    if (latitude != null && longitude != null) data.points.push({ ...place, latitude, longitude })
    else data.unplaced.push(place)
  }

  for (const route of routes) {
    if (!OPEN_ROUTE.includes(route.status) || !inWindow(route.route_date, window, today)) continue
    for (const stop of route.stops) {
      if (stop.status !== 'PENDING') continue
      add({
        id: `stop:${stop.id}`,
        kind: 'stop',
        // só o número da parada se repetiria entre os roteiros do dia
        label: `${route.sequence}.${stop.sequence}`,
        title: street(stop.street, stop.number),
        subtitle: line(`${routeName(route.sequence)}, parada ${stop.sequence}`, `${stop.packages.length} pacote(s)`, stop.district),
        href: `/entregador/rotas/${route.id}`,
        nav: mapsLinks(stop),
      }, stop.latitude, stop.longitude)
    }
  }

  for (const order of orders) {
    if (!ACTIVE_ORDER_STATUSES.includes(order.status) || !inWindow(orderDay(order, today), window, today)) continue
    const href = `/entregador/entrega/${order.id}`
    if (BEFORE_PICKUP.includes(order.status)) {
      add({
        id: `pickup:${order.id}`,
        kind: 'pickup',
        label: 'C',
        title: street(order.pickup_street, order.pickup_number),
        subtitle: line('Coleta', order.code, order.pharmacy?.trade_name ?? order.unit?.name),
        href,
        nav: mapsLinks({
          latitude: order.pickup_latitude, longitude: order.pickup_longitude, street: order.pickup_street,
          number: order.pickup_number, district: order.pickup_district, city: order.pickup_city,
          state: order.pickup_state, zip_code: order.pickup_zip_code,
        }),
      }, order.pickup_latitude, order.pickup_longitude)
    }
    add({
      id: `delivery:${order.id}`,
      kind: 'delivery',
      label: 'E',
      title: street(order.delivery_street, order.delivery_number),
      subtitle: line('Entrega', order.code, order.recipient_name),
      href,
      nav: mapsLinks({
        latitude: order.delivery_latitude, longitude: order.delivery_longitude, street: order.delivery_street,
        number: order.delivery_number, district: order.delivery_district, city: order.delivery_city,
        state: order.delivery_state, zip_code: order.delivery_zip_code,
      }),
    }, order.delivery_latitude, order.delivery_longitude)
  }
  return data
}
