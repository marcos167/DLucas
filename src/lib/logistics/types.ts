import type { CourierStatus, OccurrenceType } from '@/types'

/** Tipos do módulo de distribuição por CEP e micro-rotas. */

export type BatchStatus = 'OPEN' | 'CLOSED' | 'CANCELLED'

export type PackageStatus =
  | 'RECEIVED'
  | 'EXCEPTION'
  | 'ASSIGNED'
  | 'ROUTED'
  | 'LOADED'
  | 'DELIVERED'
  | 'FAILED'
  | 'RETURNED'
  | 'CANCELLED'

export type ExceptionReason =
  | 'INVALID_ZIP'
  | 'NO_COVERAGE'
  | 'NO_COURIER'
  | 'COURIER_UNAVAILABLE'
  | 'OVER_CAPACITY'
  | 'MANUAL_REVIEW'

export type RouteStatus = 'DRAFT' | 'RELEASED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
export type StopStatus = 'PENDING' | 'COMPLETED' | 'PARTIAL' | 'FAILED'
export type ManifestStatus = 'OPEN' | 'DEPARTED' | 'CLOSED'
export type ScanType = 'LOAD' | 'RETURN' | 'CHECK'
export type ScanResult = 'OK' | 'UNKNOWN_CODE' | 'NOT_ASSIGNED' | 'WRONG_STATUS' | 'DUPLICATE'
export type AttemptOutcome = 'DELIVERED' | 'FAILED'
export type ManifestOutcome = 'OPEN' | 'DELIVERED' | 'RETURNED' | 'TRANSFERRED'

export interface CourierRef {
  id: string
  full_name: string
  status?: CourierStatus
}

export interface PostalRegion {
  id: string
  name: string
  description: string | null
  color: string
  courier_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  courier?: CourierRef | null
}

export interface PostalAssignment {
  id: string
  region_id: string
  courier_id: string | null
  zip_start: number
  zip_end: number
  priority: number
  is_active: boolean
  notes: string | null
  created_at: string
  courier?: CourierRef | null
}

export interface DistributionBatch {
  id: string
  code: string
  batch_date: string
  name: string | null
  status: BatchStatus
  notes: string | null
  package_limit_override: number | null
  created_at: string
  closed_at: string | null
}

export interface LogisticsPackage {
  id: string
  batch_id: string
  tracking_code: string
  external_ref: string | null
  manifest_ref: string | null
  sender_name: string | null
  recipient_name: string
  recipient_phone: string | null
  recipient_document: string | null
  zip_code: string | null
  zip_raw: string | null
  street: string
  number: string | null
  complement: string | null
  district: string | null
  city: string | null
  state: string | null
  delivery_instructions: string | null
  latitude: number | null
  longitude: number | null
  geocode_source: string | null
  is_temperature_controlled: boolean
  address_key: string
  status: PackageStatus
  exception_reason: ExceptionReason | null
  exception_detail: string | null
  courier_id: string | null
  attempt_count: number
  delivered_at: string | null
  created_at: string
  updated_at: string
  courier?: CourierRef | null
}

export interface DeliveryRoute {
  id: string
  batch_id: string
  courier_id: string
  route_date: string
  sequence: number
  status: RouteStatus
  origin: 'AUTO' | 'MANUAL' | 'TRANSFER'
  zip_prefix: string | null
  stop_count: number
  package_count: number
  planned_distance_m: number | null
  planned_duration_s: number | null
  released_at: string | null
  started_at: string | null
  completed_at: string | null
  transferred_from: string | null
}

export interface RouteStop {
  id: string
  route_id: string
  sequence: number
  planned_sequence: number
  address_key: string
  zip_code: string | null
  street: string
  number: string | null
  district: string | null
  city: string | null
  state: string | null
  latitude: number | null
  longitude: number | null
  leg_distance_m: number | null
  leg_duration_s: number | null
  status: StopStatus
  package_count: number
  completed_at: string | null
}

export interface LoadingManifest {
  id: string
  batch_id: string
  courier_id: string
  trip_number: number
  status: ManifestStatus
  opened_at: string
  departed_at: string | null
  closed_at: string | null
  loaded_count: number
  delivered_count: number
  returned_count: number
  transferred_count: number
  open_count: number
  divergence_note: string | null
}

export interface ManifestItem {
  manifest_id: string
  package_id: string
  courier_id: string
  tracking_code: string
  recipient_name: string
  package_status: PackageStatus
  loaded_at: string
  outcome: ManifestOutcome
}

export interface DeliveryAttempt {
  id: string
  package_id: string
  route_id: string | null
  stop_id: string | null
  batch_id: string | null
  courier_id: string
  outcome: AttemptOutcome
  failure_reason: OccurrenceType | null
  notes: string | null
  recipient_name: string | null
  recipient_document: string | null
  occurred_at: string
  received_at: string
  sync_status: 'APPLIED' | 'CONFLICT' | 'DISCARDED'
  conflict_reason: string | null
  package?: Pick<LogisticsPackage, 'id' | 'tracking_code' | 'recipient_name' | 'status' | 'courier_id'> | null
  courier?: CourierRef | null
}

export interface DeliveryProof {
  id: string
  attempt_id: string
  package_id: string
  kind: 'PHOTO' | 'SIGNATURE' | 'DOCUMENT'
  storage_path: string
  created_at: string
}

export interface DistributionSettings {
  default_daily_package_limit: number
  vehicle_limits: Record<string, number>
  stops_per_route: number
  packages_per_route: number
  max_leg_km: number | null
  service_minutes_per_stop: number
  require_loading_scan: boolean
  hub: { name?: string; latitude: number; longitude: number } | null
}

export const DEFAULT_DISTRIBUTION_SETTINGS: DistributionSettings = {
  default_daily_package_limit: 49,
  vehicle_limits: {},
  stops_per_route: 2,
  packages_per_route: 4,
  max_leg_km: 1.5,
  service_minutes_per_stop: 4,
  require_loading_scan: true,
  hub: null,
}

export interface CourierOverview {
  courier_id: string
  full_name: string
  vehicle_type: string
  status: CourierStatus
  has_login: boolean
  limit: number
  packages: number
  addresses: number
  by_status: Partial<Record<PackageStatus, number>>
  routes: Partial<Record<RouteStatus, number>>
  last_activity_at: string | null
  manifest: {
    id: string
    status: ManifestStatus
    trip_number: number
    departed_at: string | null
    loaded: number
    open: number
  } | null
  conflicts: number
  delivered_without_load: number
}

export interface BatchOverview {
  batch: DistributionBatch | null
  totals: {
    packages: number
    addresses: number
    by_status: Partial<Record<PackageStatus, number>>
    exceptions: Partial<Record<ExceptionReason, number>>
    routes: Partial<Record<RouteStatus, number>>
    conflicts: number
  }
  couriers: CourierOverview[]
}

export interface PostalMatch {
  zip: string
  valid: boolean
  matched: boolean
  region_id?: string
  region_name?: string
  color?: string
  zip_start?: number
  zip_end?: number
  courier_id?: string | null
  courier_name?: string | null
  courier_status?: CourierStatus | null
}

export interface ImportResult {
  inserted: number
  duplicates: string[]
  invalid: { line: number; tracking_code: string }[]
}

export interface DistributeResult {
  processed: number
  assigned: number
  exceptions: Partial<Record<ExceptionReason, number>>
}

/* ------------------------------------------------------------------ dia do entregador */

export interface RiderPackage {
  id: string
  tracking_code: string
  recipient_name: string
  recipient_phone: string | null
  complement: string | null
  delivery_instructions: string | null
  is_temperature_controlled: boolean
  status: PackageStatus
  attempt_count: number
  delivered_at: string | null
  /** registro feito no aparelho e ainda não confirmado pelo servidor */
  pendingSync?: boolean
}

export interface RiderStop {
  id: string
  route_id: string
  sequence: number
  planned_sequence: number
  zip_code: string | null
  street: string
  number: string | null
  district: string | null
  city: string | null
  state: string | null
  latitude: number | null
  longitude: number | null
  leg_distance_m: number | null
  leg_duration_s: number | null
  status: StopStatus
  packages: RiderPackage[]
}

export interface RiderRoute {
  id: string
  batch_id: string
  route_date: string
  sequence: number
  status: RouteStatus
  zip_prefix: string | null
  planned_distance_m: number | null
  planned_duration_s: number | null
  started_at: string | null
  completed_at: string | null
  stops: RiderStop[]
}

export interface RiderConfig {
  require_loading_scan: boolean
  service_minutes_per_stop: number
}

export interface RiderManifestItem {
  package_id: string
  tracking_code: string
  recipient_name: string
  outcome: ManifestOutcome
}

export interface RiderManifest {
  id: string
  batch_id: string
  trip_number: number
  status: ManifestStatus
  opened_at: string
  departed_at: string | null
  closed_at: string | null
  items: RiderManifestItem[]
}

export interface RiderDay {
  courier_id: string
  /** data local do aparelho (AAAA-MM-DD) */
  date: string
  /** quando esta cópia foi obtida do servidor */
  fetchedAt: string
  routes: RiderRoute[]
  manifests: RiderManifest[]
  config: RiderConfig
}

/** Resposta das funções de campo: é o contrato da sincronização. */
export interface SyncReply {
  status: 'APPLIED' | 'DUPLICATE' | 'CONFLICT'
  reason?: string | null
  route_status?: RouteStatus
  stop_status?: StopStatus
  package_status?: PackageStatus | null
  manifest_status?: ManifestStatus
}

/* ------------------------------------------------------------------ telas da equipe */

export interface PackageListItem {
  id: string
  batch_id: string
  tracking_code: string
  external_ref: string | null
  manifest_ref: string | null
  sender_name: string | null
  recipient_name: string
  recipient_phone: string | null
  zip_code: string | null
  zip_raw: string | null
  street: string
  number: string | null
  complement: string | null
  district: string | null
  city: string | null
  state: string | null
  delivery_instructions: string | null
  latitude: number | null
  longitude: number | null
  is_temperature_controlled: boolean
  address_key: string
  status: PackageStatus
  exception_reason: ExceptionReason | null
  exception_detail: string | null
  courier_id: string | null
  courier_name: string | null
  attempt_count: number
  delivered_at: string | null
  created_at: string
  updated_at: string
}

export interface PlanStopPackage {
  id: string
  tracking_code: string
  recipient_name: string
  complement: string | null
  status: PackageStatus
  attempt_count: number
  delivered_at: string | null
  is_temperature_controlled: boolean
}

export interface PlanRouteStop extends RouteStop {
  packages: PlanStopPackage[]
}

export interface PlanRouteRow extends DeliveryRoute {
  transferred_from_name: string | null
  stops: PlanRouteStop[]
}

export interface PlanPackage {
  id: string
  tracking_code: string
  recipient_name: string
  address_key: string
  zip_code: string | null
  street: string
  number: string | null
  complement: string | null
  district: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  status: PackageStatus
  route_id: string | null
  route_status: RouteStatus | null
}

export interface PlanManifest {
  id: string
  trip_number: number
  status: ManifestStatus
  opened_at: string
  departed_at: string | null
  closed_at: string | null
  divergence_note: string | null
  items: (RiderManifestItem & { loaded_at: string })[]
}

export interface CourierPlan {
  courier: {
    id: string
    full_name: string
    status: CourierStatus
    vehicle_type: string
    has_login: boolean
    limit: number
  } | null
  routes: PlanRouteRow[]
  packages: PlanPackage[]
  manifests: PlanManifest[]
}

export interface AttemptConflict {
  id: string
  package_id: string
  tracking_code: string
  recipient_name: string
  package_status: PackageStatus
  outcome: AttemptOutcome
  failure_reason: OccurrenceType | null
  notes: string | null
  attempt_recipient_name: string | null
  occurred_at: string
  received_at: string
  conflict_reason: string | null
  courier_id: string
  courier_name: string | null
  holder_id: string | null
  holder_name: string | null
}

export interface PackageDetail {
  package: LogisticsPackage & { courier_name: string | null; batch_code: string | null }
  route: {
    route_id: string
    sequence: number
    status: RouteStatus
    stop_sequence: number
    stop_status: StopStatus
  } | null
  assignments: {
    id: string
    courier_id: string
    courier_name: string
    method: 'AUTO_CEP' | 'MANUAL' | 'TRANSFER'
    region_name: string | null
    reason: string | null
    assigned_at: string
    ended_at: string | null
    end_reason: string | null
    assigned_by_name: string | null
  }[]
  attempts: {
    id: string
    outcome: AttemptOutcome
    failure_reason: OccurrenceType | null
    notes: string | null
    recipient_name: string | null
    recipient_document: string | null
    latitude: number | null
    longitude: number | null
    occurred_at: string
    received_at: string
    sync_status: 'APPLIED' | 'CONFLICT' | 'DISCARDED'
    conflict_reason: string | null
    resolution_note: string | null
    courier_id: string
    courier_name: string | null
    proofs: { id: string; kind: string; storage_path: string; created_at: string }[]
  }[]
  scans: {
    id: string
    scan_type: ScanType | 'TRANSFER'
    result: ScanResult
    detail: string | null
    occurred_at: string
    courier_name: string | null
  }[]
  events: { id: number; event: string; description: string | null; created_at: string; actor_name: string | null }[]
}
