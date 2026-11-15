import { supabase } from './supabase'
import type {
  Order, OrderEvent, Courier, Pharmacy, PharmacyUnit, CourierLocation,
  DeliveryOffer, Occurrence, InvoiceItem, Payment, Proof, Profile,
} from '@/types'

/** Erro normalizado para exibir mensagens amigáveis */
export class ApiError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

function wrap<T>(data: T | null, error: { message: string; code?: string } | null): T {
  if (error) {
    // mensagens amigáveis para os erros mais comuns de RLS
    if (error.code === '42501' || /row-level security/i.test(error.message)) {
      throw new ApiError('Você não tem permissão para executar esta ação.', error.code)
    }
    if (error.code === '23505') {
      throw new ApiError('Registro duplicado: já existe um cadastro com estes dados.', error.code)
    }
    throw new ApiError(error.message, error.code)
  }
  return data as T
}

/* -------------------------------------------------------------- PEDIDOS */

const ORDER_SELECT = `*,
  pharmacy:pharmacies(id, trade_name),
  unit:pharmacy_units(id, name),
  courier:couriers(id, full_name, phone, availability)`

export async function listOrders(params: {
  pharmacyId?: string | null
  courierId?: string | null
  status?: string[]
  search?: string
  from?: string
  to?: string
  limit?: number
} = {}): Promise<Order[]> {
  let q = supabase.from('orders').select(ORDER_SELECT).order('created_at', { ascending: false })
  if (params.pharmacyId) q = q.eq('pharmacy_id', params.pharmacyId)
  if (params.courierId) q = q.eq('courier_id', params.courierId)
  if (params.status?.length) q = q.in('status', params.status)
  if (params.from) q = q.gte('created_at', params.from)
  if (params.to) q = q.lte('created_at', params.to)
  if (params.search) {
    const s = params.search.replace(/[%,]/g, '')
    q = q.or(
      `code.ilike.%${s}%,recipient_name.ilike.%${s}%,delivery_street.ilike.%${s}%,delivery_city.ilike.%${s}%`,
    )
  }
  q = q.limit(params.limit ?? 200)
  const { data, error } = await q
  return wrap(data, error) as Order[]
}

export async function getOrder(id: string): Promise<Order & { events: OrderEvent[] }> {
  const { data, error } = await supabase
    .from('orders')
    .select(`${ORDER_SELECT}, events:order_events(*)`)
    .eq('id', id)
    .single()
  const order = wrap(data, error) as Order & { events: OrderEvent[] }
  order.events = (order.events ?? []).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  return order
}

export async function createOrder(payload: Record<string, unknown>): Promise<Order> {
  const { data, error } = await supabase.from('orders').insert(payload).select('*').single()
  return wrap(data, error) as Order
}

export async function updateOrder(id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('orders').update(patch).eq('id', id)
  wrap(null, error)
}

export async function addOrderEvent(orderId: string, event: string, description?: string) {
  const { error } = await supabase.from('order_events').insert({
    order_id: orderId,
    event,
    description: description ?? null,
  })
  wrap(null, error)
}

/* ------------------------------------------------------------- DESPACHO */

export async function listAvailableCouriers(): Promise<Courier[]> {
  // Só mostrar no despacho quem pode efetivamente receber/aceitar a oferta.
  // Há cadastros ACTIVE sem conta vinculada: não são elegíveis para despacho.
  // O FK explícito evita ambiguidade com approved_by -> profiles.
  const { data, error } = await supabase
    .from('couriers')
    .select('*, profile:profiles!couriers_profile_id_fkey!inner(id)')
    .eq('status', 'ACTIVE')
    .eq('profile.is_active', true)
    .eq('profile.role', 'COURIER')
    .order('availability', { ascending: true })
    .order('full_name')
  return wrap(data, error) as Courier[]
}

/**
 * Sugestões automáticas de entregadores.
 * Critérios: disponibilidade, região (cidade base/zone) e distância até a coleta.
 * Retorna uma pontuação transparente para o despachante decidir.
 */
export function suggestCouriers(order: Order, couriers: Courier[], limit = 5) {
  const pickup =
    order.pickup_latitude != null && order.pickup_longitude != null
      ? { lat: order.pickup_latitude, lng: order.pickup_longitude }
      : null

  const scored = couriers
    .filter((c) => c.status === 'ACTIVE' && c.profile_id != null && c.availability !== 'ON_DELIVERY')
    .map((c) => {
      let score = 0
      const reasons: string[] = []

      if (c.availability === 'AVAILABLE') { score += 40; reasons.push('Disponível agora') }
      else { score += 10; reasons.push('Offline') }

      const sameCity =
        c.base_city && order.pickup_city &&
        c.base_city.trim().toLowerCase() === order.pickup_city.trim().toLowerCase()
      if (sameCity) { score += 20; reasons.push('Mesma cidade da coleta') }

      const zone = (c.service_zone ?? '').toLowerCase()
      if (zone && (order.pickup_district ?? '').toLowerCase().includes(zone)) {
        score += 10; reasons.push('Atua no bairro')
      }

      let distance: number | null = null
      if (pickup && c.current_latitude != null && c.current_longitude != null) {
        const R = 6371
        const dLat = ((c.current_latitude - pickup.lat) * Math.PI) / 180
        const dLon = ((c.current_longitude - pickup.lng) * Math.PI) / 180
        const la1 = (pickup.lat * Math.PI) / 180
        const la2 = (c.current_latitude * Math.PI) / 180
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
        distance = 2 * R * Math.asin(Math.sqrt(h))
        score += Math.max(0, 30 - distance)
        reasons.push(`${distance.toFixed(1)} km da coleta`)
      } else {
        reasons.push('Localização não compartilhada')
      }

      return { courier: c, score: Math.round(score * 10) / 10, distance, reasons }
    })
    .sort((a, b) => b.score - a.score)

  return scored.slice(0, limit)
}

export async function offerOrderToCourier(params: {
  orderId: string
  courierId: string
  method?: 'MANUAL' | 'AUTO_SUGGESTION' | 'REASSIGNMENT'
  score?: number | null
  distance?: number | null
  message?: string
}) {
  // encerra ofertas pendentes anteriores do mesmo pedido (uma oferta ativa por vez)
  await supabase
    .from('delivery_offers')
    .update({ status: 'CANCELLED', responded_at: new Date().toISOString() })
    .eq('order_id', params.orderId)
    .eq('status', 'PENDING')

  const { error } = await supabase.from('delivery_offers').insert({
    order_id: params.orderId,
    courier_id: params.courierId,
    method: params.method ?? 'MANUAL',
    score: params.score ?? null,
    distance_to_pickup_km: params.distance ?? null,
    message: params.message ?? null,
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  })
  wrap(null, error)

  const { error: e2 } = await supabase
    .from('orders')
    .update({ status: 'OFFERED' })
    .eq('id', params.orderId)
    .in('status', ['PENDING', 'OFFERED'])
  wrap(null, e2)
}

export async function assignOrder(params: {
  orderId: string
  courierId: string
  method?: 'MANUAL' | 'AUTO_SUGGESTION' | 'REASSIGNMENT'
  reason?: string
}) {
  // A atribuição direta vincula o pedido ao entregador.
  // O histórico de atribuições e a timeline são gerados por trigger no banco.
  const { error } = await supabase
    .from('orders')
    .update({
      status: 'ASSIGNED',
      courier_id: params.courierId,
      assigned_at: new Date().toISOString(),
      dispatch_notes: params.reason ?? null,
    })
    .eq('id', params.orderId)
  wrap(null, error)

  // encerra ofertas pendentes que possam existir para este pedido
  await supabase
    .from('delivery_offers')
    .update({ status: 'CANCELLED', responded_at: new Date().toISOString() })
    .eq('order_id', params.orderId)
    .eq('status', 'PENDING')
}

export async function listOffersForCourier(courierId: string): Promise<DeliveryOffer[]> {
  const { data, error } = await supabase
    .from('delivery_offers')
    .select('*, order:orders(*, pharmacy:pharmacies(id,trade_name), unit:pharmacy_units(id,name))')
    .eq('courier_id', courierId)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false })
  return wrap(data, error) as DeliveryOffer[]
}

export async function respondToOffer(offerId: string, accept: boolean) {
  // O trigger `offer_response` no banco faz o vínculo do pedido, encerra as
  // demais ofertas, registra o evento e devolve o pedido à fila em caso de recusa.
  const { data, error } = await supabase
    .from('delivery_offers')
    .update({
      status: accept ? 'ACCEPTED' : 'DECLINED',
      responded_at: new Date().toISOString(),
    })
    .eq('id', offerId)
    .eq('status', 'PENDING')
    .select('order_id, courier_id')
    .single()

  const row = wrap(data, error) as { order_id: string; courier_id: string }
  return row
}

/* ------------------------------------------------------------- RASTREIO */

export async function pushLocation(params: {
  courierId: string
  orderId?: string | null
  latitude: number
  longitude: number
  accuracy?: number | null
}) {
  const { error } = await supabase.from('courier_locations').insert({
    courier_id: params.courierId,
    order_id: params.orderId ?? null,
    latitude: params.latitude,
    longitude: params.longitude,
    accuracy_m: params.accuracy ?? null,
  })
  wrap(null, error)
  await supabase
    .from('couriers')
    .update({
      current_latitude: params.latitude,
      current_longitude: params.longitude,
      current_location_at: new Date().toISOString(),
    })
    .eq('id', params.courierId)
}

export async function latestLocations(courierIds: string[]): Promise<CourierLocation[]> {
  if (!courierIds.length) return []
  const { data, error } = await supabase
    .from('courier_locations')
    .select('*')
    .in('courier_id', courierIds)
    .order('recorded_at', { ascending: false })
    .limit(200)
  const rows = wrap(data, error) as CourierLocation[]
  const seen = new Set<string>()
  return rows.filter((r) => (seen.has(r.courier_id) ? false : (seen.add(r.courier_id), true)))
}

export async function listLocationsForOrder(orderId: string): Promise<CourierLocation[]> {
  const { data, error } = await supabase
    .from('courier_locations')
    .select('*')
    .eq('order_id', orderId)
    .order('recorded_at', { ascending: false })
    .limit(100)
  return wrap(data, error) as CourierLocation[]
}

/* ----------------------------------------------------------- FARMÁCIAS */

export async function listPharmacies(): Promise<Pharmacy[]> {
  const { data, error } = await supabase.from('pharmacies').select('*').order('trade_name')
  return wrap(data, error) as Pharmacy[]
}

export async function getPharmacy(id: string): Promise<Pharmacy> {
  const { data, error } = await supabase.from('pharmacies').select('*').eq('id', id).single()
  return wrap(data, error) as Pharmacy
}

export async function upsertPharmacy(payload: Record<string, unknown>, id?: string) {
  if (id) {
    const { error } = await supabase.from('pharmacies').update(payload).eq('id', id)
    wrap(null, error); return id
  }
  const { data, error } = await supabase.from('pharmacies').insert(payload).select('id').single()
  return (wrap(data, error) as { id: string }).id
}

export async function listUnits(pharmacyId?: string | null): Promise<PharmacyUnit[]> {
  let q = supabase.from('pharmacy_units').select('*').order('name')
  if (pharmacyId) q = q.eq('pharmacy_id', pharmacyId)
  const { data, error } = await q
  return wrap(data, error) as PharmacyUnit[]
}

export async function upsertUnit(payload: Record<string, unknown>, id?: string) {
  if (id) {
    const { error } = await supabase.from('pharmacy_units').update(payload).eq('id', id)
    wrap(null, error); return id
  }
  const { data, error } = await supabase.from('pharmacy_units').insert(payload).select('id').single()
  return (wrap(data, error) as { id: string }).id
}

/* ---------------------------------------------------------- ENTREGADORES */

export async function listCouriers(): Promise<Courier[]> {
  const { data, error } = await supabase.from('couriers').select('*').order('full_name')
  return wrap(data, error) as Courier[]
}

export async function getCourierByProfile(profileId: string): Promise<Courier | null> {
  const { data, error } = await supabase
    .from('couriers').select('*').eq('profile_id', profileId).maybeSingle()
  return wrap(data, error) as Courier | null
}

export async function updateCourier(id: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from('couriers').update(patch).eq('id', id)
  wrap(null, error)
}

export async function upsertCourier(payload: Record<string, unknown>, id?: string) {
  if (id) {
    const { error } = await supabase.from('couriers').update(payload).eq('id', id)
    wrap(null, error); return id
  }
  const { data, error } = await supabase.from('couriers').insert(payload).select('id').single()
  return (wrap(data, error) as { id: string }).id
}

/* ------------------------------------------------------------ USUÁRIOS */

export async function listProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase.from('profiles').select('*').order('full_name')
  return wrap(data, error) as Profile[]
}

export async function listPharmacyProfiles(pharmacyId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles').select('*').eq('pharmacy_id', pharmacyId).order('full_name')
  return wrap(data, error) as Profile[]
}

export async function updateProfile(id: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from('profiles').update(patch).eq('id', id)
  wrap(null, error)
}

/* ------------------------------------------------------------ OCORRÊNCIAS */

export async function listOccurrences(): Promise<Occurrence[]> {
  const { data, error } = await supabase
    .from('occurrences')
    .select('*, order:orders(id, code)')
    .order('created_at', { ascending: false })
  return wrap(data, error) as Occurrence[]
}

export async function createOccurrence(payload: Record<string, unknown>) {
  const { error } = await supabase.from('occurrences').insert(payload)
  wrap(null, error)
}

export async function resolveOccurrence(id: string, resolution: string) {
  const { error } = await supabase
    .from('occurrences')
    .update({ status: 'RESOLVED', resolution, resolved_at: new Date().toISOString() })
    .eq('id', id)
  wrap(null, error)
}

/* ------------------------------------------------------------ COMPROVANTES */

export async function uploadProof(params: {
  orderId: string
  file: File
  kind?: string
  recipientName?: string
  notes?: string
  uploadedBy: string
}): Promise<void> {
  const ext = params.file.name.split('.').pop() || 'jpg'
  const path = `${params.orderId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error: upErr } = await supabase.storage
    .from('proofs')
    .upload(path, params.file, { contentType: params.file.type, upsert: false })
  wrap(null, upErr)

  const { error } = await supabase.from('proofs').insert({
    order_id: params.orderId,
    kind: params.kind ?? 'DELIVERY',
    storage_path: path,
    file_name: params.file.name,
    mime_type: params.file.type,
    size_bytes: params.file.size,
    recipient_name: params.recipientName ?? null,
    notes: params.notes ?? null,
    uploaded_by: params.uploadedBy,
  })
  wrap(null, error)
}

export async function listProofs(orderId: string): Promise<Proof[]> {
  const { data, error } = await supabase
    .from('proofs').select('*').eq('order_id', orderId).order('created_at', { ascending: false })
  return wrap(data, error) as Proof[]
}

export async function getProofUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('proofs').createSignedUrl(path, 60 * 10)
  if (error) return null
  return data?.signedUrl ?? null
}

/* ------------------------------------------------------------- FINANCEIRO */

export async function listInvoices(pharmacyId?: string | null) {
  let q = supabase.from('invoices').select('*, pharmacy:pharmacies(id, trade_name)').order('due_date', { ascending: false })
  if (pharmacyId) q = q.eq('pharmacy_id', pharmacyId)
  const { data, error } = await q
  return wrap(data, error) as (import('@/types').Invoice)[]
}

export async function getInvoice(id: string) {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, pharmacy:pharmacies(id, trade_name, billing_email), items:invoice_items(*), payments(*)')
    .eq('id', id)
    .single()
  return wrap(data, error) as import('@/types').Invoice & {
    items: InvoiceItem[]; payments: Payment[]
  }
}

export async function createInvoice(payload: Record<string, unknown>) {
  const { data, error } = await supabase.from('invoices').insert(payload).select('id').single()
  return (wrap(data, error) as { id: string }).id
}

export async function updateInvoice(id: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from('invoices').update(patch).eq('id', id)
  wrap(null, error)
}

export async function addInvoiceItem(payload: Record<string, unknown>) {
  const { error } = await supabase.from('invoice_items').insert(payload)
  wrap(null, error)
}

export async function removeInvoiceItem(id: number) {
  const { error } = await supabase.from('invoice_items').delete().eq('id', id)
  wrap(null, error)
}

export async function registerPayment(payload: Record<string, unknown>) {
  const { error } = await supabase.from('payments').insert(payload)
  wrap(null, error)
}

export async function listPayments(invoiceId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments').select('*').eq('invoice_id', invoiceId).order('paid_at', { ascending: false })
  return wrap(data, error) as Payment[]
}

/** Gera itens de fatura a partir dos pedidos entregues no período (ainda não faturados) */
export async function billableOrders(pharmacyId: string, from: string, to: string) {
  const { data: billed } = await supabase
    .from('invoice_items').select('order_id').not('order_id', 'is', null)
  const billedIds = new Set((billed ?? []).map((r) => (r as { order_id: string }).order_id))

  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('pharmacy_id', pharmacyId)
    .eq('status', 'DELIVERED')
    .gte('delivered_at', from)
    .lte('delivered_at', to)
    .order('delivered_at')
  const rows = wrap(data, error) as Order[]
  return rows.filter((o) => !billedIds.has(o.id))
}

/* ------------------------------------------------------------- AUDITORIA */

export async function listAuditLogs(limit = 200) {
  const { data, error } = await supabase
    .from('audit_logs').select('*').order('created_at', { ascending: false }).limit(limit)
  return wrap(data, error) as import('@/types').AuditLog[]
}

export async function logAudit(action: string, entity: string, entityId: string | null, description: string, metadata: Record<string, unknown> = {}) {
  const { error } = await supabase.from('audit_logs').insert({
    action, entity, entity_id: entityId, description, metadata,
  })
  if (error) console.warn('audit', error.message)
}

/* ------------------------------------------------------------ CONFIGURAÇÕES */

export async function listSettings() {
  const { data, error } = await supabase.from('settings').select('*').order('key')
  return wrap(data, error) as import('@/types').Setting[]
}

export async function upsertSetting(key: string, value: Record<string, unknown>, description?: string) {
  const { error } = await supabase.from('settings').upsert({ key, value, description })
  wrap(null, error)
}

/* -------------------------------------------------------------- DASHBOARD */

export async function dashboardMetrics() {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const iso = todayStart.toISOString()

  const [ordersToday, active, deliveredToday, couriersActive, pendingInvoices] = await Promise.all([
    supabase.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', iso),
    supabase.from('orders').select('id', { count: 'exact', head: true })
      .in('status', ['PENDING', 'OFFERED', 'ASSIGNED', 'ACCEPTED', 'PICKING_UP', 'COLLECTED', 'IN_TRANSIT']),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'DELIVERED').gte('delivered_at', iso),
    supabase.from('couriers').select('id', { count: 'exact', head: true })
      .eq('status', 'ACTIVE').in('availability', ['AVAILABLE', 'ON_DELIVERY']),
    supabase.from('invoices').select('id, total_cents, paid_cents, due_date').in('status', ['OPEN', 'PARTIALLY_PAID', 'OVERDUE']),
  ])

  const openInvoices = (pendingInvoices.data ?? []) as { total_cents: number; paid_cents: number; due_date: string }[]
  const outstanding = openInvoices.reduce((s, i) => s + (i.total_cents - i.paid_cents), 0)
  const overdue = openInvoices
    .filter((i) => new Date(i.due_date) < new Date())
    .reduce((s, i) => s + (i.total_cents - i.paid_cents), 0)

  return {
    ordersToday: ordersToday.count ?? 0,
    activeOrders: active.count ?? 0,
    deliveredToday: deliveredToday.count ?? 0,
    couriersActive: couriersActive.count ?? 0,
    outstandingCents: outstanding,
    overdueCents: overdue,
  }
}

export async function ordersByStatus() {
  const { data, error } = await supabase
    .from('orders')
    .select('status')
    .gte('created_at', new Date(Date.now() - 30 * 864e5).toISOString())
  const rows = wrap(data, error) as { status: string }[]
  const counts: Record<string, number> = {}
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1
  return counts
}

export async function deliveriesLast7Days() {
  const start = new Date(); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0)
  const { data, error } = await supabase
    .from('orders')
    .select('delivered_at')
    .eq('status', 'DELIVERED')
    .gte('delivered_at', start.toISOString())
  const rows = wrap(data, error) as { delivered_at: string }[]
  const days: { day: string; total: number }[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i)
    const key = d.toISOString().slice(0, 10)
    days.push({
      day: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      total: rows.filter((r) => r.delivered_at.slice(0, 10) === key).length,
    })
  }
  return days
}

/* ---------------------------------------------------------------- LEADS */

export async function submitLead(payload: Record<string, unknown>) {
  const { error } = await supabase.from('leads').insert(payload)
  if (error) throw new ApiError('Não foi possível enviar sua solicitação. Tente novamente.')
}

export async function listLeads() {
  const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false })
  return wrap(data, error) as import('@/types').Lead[]
}

export async function listApplications() {
  const { data, error } = await supabase
    .from('courier_applications').select('*').order('created_at', { ascending: false })
  return wrap(data, error) as import('@/types').CourierApplication[]
}

export async function submitCourierApplication(payload: Record<string, unknown>) {
  const { error } = await supabase.from('courier_applications').insert(payload)
  if (error) throw new ApiError('Não foi possível enviar sua candidatura. Tente novamente.')
}

/* --------------------------------------------------------------- EXTRAS */

export async function listContracts(pharmacyId?: string | null) {
  let q = supabase.from('contracts').select('*, pharmacy:pharmacies(id,trade_name)').order('created_at', { ascending: false })
  if (pharmacyId) q = q.eq('pharmacy_id', pharmacyId)
  const { data, error } = await q
  return wrap(data, error) as import('@/types').Contract[]
}

export async function upsertContract(payload: Record<string, unknown>, id?: string) {
  if (id) {
    const { error } = await supabase.from('contracts').update(payload).eq('id', id)
    wrap(null, error); return id
  }
  const { data, error } = await supabase.from('contracts').insert(payload).select('id').single()
  return (wrap(data, error) as { id: string }).id
}

export async function listPayouts() {
  const { data, error } = await supabase
    .from('courier_payouts').select('*, courier:couriers(id, full_name)')
    .order('created_at', { ascending: false })
  return wrap(data, error) as import('@/types').CourierPayout[]
}

export async function createPayout(payload: Record<string, unknown>) {
  const { error } = await supabase.from('courier_payouts').insert(payload)
  wrap(null, error)
}
