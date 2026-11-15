import { supabase, storageBucketProofs } from '@/lib/supabase'
import { ApiError, wrap } from '@/lib/api'
import type { OccurrenceType } from '@/types'
import type { ImportRow } from './import'
import type { RoutePlanPayload } from './organizer'
import {
  DEFAULT_DISTRIBUTION_SETTINGS,
  type AttemptConflict, type BatchOverview, type CourierPlan, type DistributeResult, type DistributionBatch,
  type DistributionSettings, type ImportResult, type LoadingManifest, type LogisticsPackage, type PackageDetail,
  type PackageListItem, type PackageStatus, type PostalAssignment, type PostalMatch, type PostalRegion,
  type RiderConfig, type RiderDay, type ScanResult, type ScanType, type SyncReply,
} from './types'

/**
 * Acesso ao módulo de distribuição e micro-rotas.
 *
 * Tudo que altera a operação passa por função do banco (uma transação por
 * ação); a tela nunca escreve em pacote, roteiro ou parada diretamente.
 * Cobertura de CEP e lotes são cadastros simples e usam a tabela, protegidos
 * por RLS e por trigger.
 */

/** O banco desfez a transação inteira por disputa de trava: repetir é seguro. */
const RETRYABLE = new Set(['40P01', '40001'])

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const { data, error } = await supabase.rpc(fn, args)
    if (error && RETRYABLE.has(error.code ?? '')) {
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 120 * attempt))
        continue
      }
      throw new ApiError('Outra ação alterou estes dados ao mesmo tempo. Tente novamente.', error.code)
    }
    return wrap(data as T | null, error)
  }
}

/* ------------------------------------------------------------------ cobertura */

export async function listRegions(): Promise<PostalRegion[]> {
  const { data, error } = await supabase.from('postal_code_regions').select('*').order('name')
  return wrap(data, error) as PostalRegion[]
}

export async function listAssignments(): Promise<PostalAssignment[]> {
  const { data, error } = await supabase.from('postal_code_assignments').select('*').order('zip_start')
  return wrap(data, error) as PostalAssignment[]
}

export interface RegionInput {
  id?: string
  name: string
  description: string | null
  color: string
  courier_id: string | null
  is_active: boolean
}

export async function saveRegion(input: RegionInput): Promise<void> {
  const { id, ...values } = input
  const { error } = id
    ? await supabase.from('postal_code_regions').update(values).eq('id', id)
    : await supabase.from('postal_code_regions').insert(values)
  if (error?.code === '23505') throw new ApiError('Já existe uma região com este nome.', error.code)
  wrap(null, error)
}

export async function deleteRegion(id: string): Promise<void> {
  const { error } = await supabase.from('postal_code_regions').delete().eq('id', id)
  wrap(null, error)
}

export interface AssignmentInput {
  id?: string
  region_id: string
  courier_id: string | null
  zip_start: number
  zip_end: number
  priority: number
  is_active: boolean
  notes: string | null
}

export async function saveAssignment(input: AssignmentInput): Promise<void> {
  const { id, ...values } = input
  const { error } = id
    ? await supabase.from('postal_code_assignments').update(values).eq('id', id)
    : await supabase.from('postal_code_assignments').insert(values)
  if (error?.code === '23505') throw new ApiError('Esta faixa já está cadastrada nesta região.', error.code)
  wrap(null, error)
}

export async function deleteAssignment(id: string): Promise<void> {
  const { error } = await supabase.from('postal_code_assignments').delete().eq('id', id)
  wrap(null, error)
}

export function resolvePostalCode(zip: string): Promise<PostalMatch> {
  return rpc('resolve_postal_code', { p_zip: zip })
}

/* ------------------------------------------------------------------ parâmetros */

export async function getDistributionSettings(): Promise<DistributionSettings> {
  const { data, error } = await supabase.from('settings').select('value').eq('key', 'distribution').maybeSingle()
  const row = wrap(data, error) as { value: Partial<DistributionSettings> | null } | null
  return { ...DEFAULT_DISTRIBUTION_SETTINGS, ...(row?.value ?? {}) }
}

export async function saveDistributionSettings(value: DistributionSettings): Promise<void> {
  const { error } = await supabase.from('settings').upsert({
    key: 'distribution', value, description: 'Parâmetros da distribuição por CEP e dos roteiros',
  })
  wrap(null, error)
}

export async function setCourierDailyLimit(courierId: string, limit: number | null): Promise<void> {
  const { error } = await supabase.from('couriers').update({ daily_package_limit: limit }).eq('id', courierId)
  wrap(null, error)
}

/* ------------------------------------------------------------------ lotes */

export async function listBatches(limit = 40): Promise<DistributionBatch[]> {
  const { data, error } = await supabase
    .from('distribution_batches').select('*')
    .order('batch_date', { ascending: false }).order('created_at', { ascending: false })
    .limit(limit)
  return wrap(data, error) as DistributionBatch[]
}

export async function createBatch(input: {
  batch_date: string
  name: string | null
  notes: string | null
  package_limit_override: number | null
}): Promise<DistributionBatch> {
  const { data, error } = await supabase.from('distribution_batches').insert(input).select('*').single()
  return wrap(data, error) as DistributionBatch
}

export async function updateBatch(
  id: string,
  patch: Partial<Pick<DistributionBatch, 'name' | 'notes' | 'package_limit_override' | 'status'>>,
): Promise<void> {
  const { error } = await supabase.from('distribution_batches').update(patch).eq('id', id)
  wrap(null, error)
}

export function batchOverview(batchId: string): Promise<BatchOverview> {
  return rpc('batch_overview', { p_batch_id: batchId })
}

/* ------------------------------------------------------------------ pacotes */

const IMPORT_CHUNK = 500

/**
 * Envia o romaneio em blocos. Cada bloco é uma transação; repetir a
 * importação é seguro porque códigos já existentes são devolvidos como
 * repetidos, nunca gravados de novo.
 */
export async function importPackages(batchId: string, rows: ImportRow[]): Promise<ImportResult> {
  const total: ImportResult = { inserted: 0, duplicates: [], invalid: [] }
  for (let start = 0; start < rows.length; start += IMPORT_CHUNK) {
    const part = await rpc<ImportResult>('import_packages', {
      p_batch_id: batchId, p_rows: rows.slice(start, start + IMPORT_CHUNK),
    })
    total.inserted += part.inserted
    total.duplicates.push(...part.duplicates)
    total.invalid.push(...part.invalid)
  }
  return total
}

export function distributeBatch(batchId: string): Promise<DistributeResult> {
  return rpc('distribute_batch', { p_batch_id: batchId })
}

export function assignPackages(packageIds: string[], courierId: string, reason: string | null) {
  return rpc<{ assigned: number; skipped: number; load: number | null; limit: number | null }>(
    'assign_packages', { p_package_ids: packageIds, p_courier_id: courierId, p_reason: reason })
}

export function cancelPackages(packageIds: string[], reason: string | null) {
  return rpc<{ cancelled: number; skipped: number }>(
    'cancel_packages', { p_package_ids: packageIds, p_reason: reason })
}

/** `hold = true` segura os pacotes com o supervisor; `false` devolve à distribuição automática. */
export function holdPackages(packageIds: string[], hold: boolean, note: string | null) {
  return rpc<{ changed: number; skipped: number }>(
    'hold_packages', { p_package_ids: packageIds, p_hold: hold, p_note: note })
}

export interface PackageFilter {
  statuses?: PackageStatus[]
  courier_id?: string | null
  search?: string
  limit?: number
  offset?: number
}

export function listPackages(batchId: string, filter: PackageFilter = {}) {
  return rpc<{ total: number; items: PackageListItem[] }>('list_packages', { p_batch_id: batchId, p_filter: filter })
}

export function packageDetail(packageId: string): Promise<PackageDetail> {
  return rpc('package_detail', { p_package_id: packageId })
}

export type PackageAddressPatch = Partial<Pick<LogisticsPackage,
  'recipient_name' | 'recipient_phone' | 'zip_code' | 'street' | 'number' | 'complement' | 'district' | 'city' |
  'state' | 'delivery_instructions' | 'latitude' | 'longitude' | 'geocode_source'>>

/** Correção de endereço e contato. Situação e responsável só mudam pelas funções. */
export async function updatePackageAddress(id: string, patch: PackageAddressPatch): Promise<void> {
  const { error } = await supabase.from('packages').update(patch).eq('id', id)
  wrap(null, error)
}

/* ------------------------------------------------------------------ roteiros */

export function courierPlan(batchId: string, courierId: string): Promise<CourierPlan> {
  return rpc('courier_plan', { p_batch_id: batchId, p_courier_id: courierId })
}

export function saveRoutePlan(
  batchId: string, courierId: string, plan: RoutePlanPayload[], meta: Record<string, unknown>,
) {
  return rpc<{ routes: number; stops: number; packages: number }>(
    'save_route_plan', { p_batch_id: batchId, p_courier_id: courierId, p_plan: plan, p_meta: meta })
}

export function setRoutesStatus(routeIds: string[], action: 'RELEASE' | 'UNRELEASE' | 'CANCEL') {
  return rpc<{ changed: number; skipped: number }>('set_routes_status', { p_route_ids: routeIds, p_action: action })
}

export function transferRoute(routeId: string, courierId: string, reason: string | null) {
  return rpc<{ route_id: string; packages: number; sequence: number; partial: boolean }>(
    'transfer_route', { p_route_id: routeId, p_courier_id: courierId, p_reason: reason })
}

export interface ReorderMeta {
  algorithm?: string
  provider?: string
  fallback_used?: boolean
  distance_m?: number
  duration_s?: number
  legs?: { stop_id: string; leg_distance_m: number | null; leg_duration_s: number | null }[]
}

export function reorderRouteStops(routeId: string, stopIds: string[], meta: ReorderMeta | null = null) {
  return rpc<SyncReply>('reorder_route_stops', { p_route_id: routeId, p_stop_ids: stopIds, p_meta: meta })
}

/* ------------------------------------------------------------------ supervisão */

export function listAttemptConflicts(batchId: string): Promise<AttemptConflict[]> {
  return rpc('list_attempt_conflicts', { p_batch_id: batchId })
}

export function resolveAttemptConflict(attemptId: string, accept: boolean, note: string | null) {
  return rpc<{ status: 'APPLIED' | 'DISCARDED' }>(
    'resolve_attempt_conflict', { p_attempt_id: attemptId, p_accept: accept, p_note: note })
}

/* ------------------------------------------------------------------ campo */

export function riderDay(date: string): Promise<Omit<RiderDay, 'fetchedAt'>> {
  return rpc('rider_day', { p_date: date })
}

/** Parâmetros que o aplicativo do entregador usa; também serve para saber se o servidor responde. */
export function riderConfig(): Promise<RiderConfig> {
  return rpc('logistics_client_config')
}

export function startRoute(routeId: string, occurredAt: string) {
  return rpc<SyncReply>('start_route', { p_route_id: routeId, p_occurred_at: occurredAt })
}

export interface AttemptInput {
  attemptId: string
  packageId: string
  outcome: 'DELIVERED' | 'FAILED'
  failureReason: OccurrenceType | null
  notes: string | null
  recipientName: string | null
  recipientDocument: string | null
  latitude: number | null
  longitude: number | null
  occurredAt: string
}

export function registerDeliveryAttempt(input: AttemptInput) {
  return rpc<SyncReply & { sync_status?: 'APPLIED' | 'CONFLICT' | 'DISCARDED' }>('register_delivery_attempt', {
    p_attempt_id: input.attemptId,
    p_package_id: input.packageId,
    p_outcome: input.outcome,
    p_failure_reason: input.failureReason,
    p_notes: input.notes,
    p_recipient_name: input.recipientName,
    p_recipient_document: input.recipientDocument,
    p_latitude: input.latitude,
    p_longitude: input.longitude,
    p_occurred_at: input.occurredAt,
  })
}

export function addDeliveryProof(input: {
  proofId: string
  attemptId: string
  storagePath: string
  mimeType: string | null
  sizeBytes: number | null
}) {
  return rpc<SyncReply>('add_delivery_proof', {
    p_proof_id: input.proofId,
    p_attempt_id: input.attemptId,
    p_storage_path: input.storagePath,
    p_kind: 'PHOTO',
    p_mime_type: input.mimeType,
    p_size_bytes: input.sizeBytes,
  })
}

/** Envia o arquivo do comprovante. Reenviar o mesmo caminho conta como sucesso. */
export async function uploadProofFile(path: string, file: Blob, contentType: string): Promise<void> {
  const { error } = await supabase.storage.from(storageBucketProofs).upload(path, file, { contentType, upsert: false })
  if (!error) return
  const status = String((error as { statusCode?: string | number; status?: number }).statusCode
    ?? (error as { status?: number }).status ?? '')
  if (status === '409' || /already exists|duplicate/i.test(error.message)) return
  throw new ApiError(error.message, status ? `HTTP${status}` : undefined)
}

export async function proofUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(storageBucketProofs).createSignedUrl(path, 600)
  return error ? null : data?.signedUrl ?? null
}

export function openManifest(batchId: string, courierId: string | null = null): Promise<LoadingManifest> {
  return rpc('open_manifest', { p_batch_id: batchId, p_courier_id: courierId })
}

export function departManifest(manifestId: string, occurredAt: string) {
  return rpc<SyncReply>('depart_manifest', { p_manifest_id: manifestId, p_occurred_at: occurredAt })
}

export interface ScanReply extends SyncReply {
  result?: ScanResult
  detail?: string | null
  package_id?: string | null
  tracking_code?: string
  recipient_name?: string | null
  package_status?: PackageStatus | null
}

export function registerPackageScan(input: {
  scanId: string
  code: string
  scanType: ScanType
  manifestId: string | null
  occurredAt: string
}) {
  return rpc<ScanReply>('register_package_scan', {
    p_scan_id: input.scanId,
    p_code: input.code,
    p_scan_type: input.scanType,
    p_manifest_id: input.manifestId,
    p_occurred_at: input.occurredAt,
  })
}

export interface CloseManifestReply extends SyncReply {
  open?: number
  codes?: string[]
  loaded?: number
  delivered?: number
  returned?: number
  transferred?: number
}

export function closeManifest(manifestId: string, force = false, note: string | null = null) {
  return rpc<CloseManifestReply>('close_manifest', { p_manifest_id: manifestId, p_force: force, p_note: note })
}
