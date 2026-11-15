import type { QueueEntry } from './offline/queue'
import type {
  ExceptionReason, ManifestOutcome, ManifestStatus, PackageStatus, RouteStatus, ScanResult, StopStatus,
} from './types'

/** Textos e cores das situações do módulo de distribuição. */

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'

export const PACKAGE_STATUS: Record<PackageStatus, { label: string; tone: Tone }> = {
  RECEIVED: { label: 'Aguardando distribuição', tone: 'neutral' },
  EXCEPTION: { label: 'Exceção', tone: 'danger' },
  ASSIGNED: { label: 'Sem roteiro', tone: 'warning' },
  ROUTED: { label: 'Em roteiro', tone: 'info' },
  LOADED: { label: 'Saiu para entrega', tone: 'brand' },
  DELIVERED: { label: 'Entregue', tone: 'success' },
  FAILED: { label: 'Não entregue', tone: 'danger' },
  RETURNED: { label: 'Devolvido à central', tone: 'warning' },
  CANCELLED: { label: 'Cancelado', tone: 'neutral' },
}

export const EXCEPTION_REASON: Record<ExceptionReason, { label: string; help: string }> = {
  INVALID_ZIP: { label: 'CEP inválido', help: 'Corrija o CEP do pacote e distribua de novo.' },
  NO_COVERAGE: { label: 'CEP sem cobertura', help: 'Cadastre a faixa de CEP ou atribua o pacote a alguém.' },
  NO_COURIER: { label: 'Região sem responsável', help: 'Defina o responsável da região ou da faixa.' },
  COURIER_UNAVAILABLE: { label: 'Responsável indisponível', help: 'O responsável não está ativo. Atribua a outra pessoa.' },
  OVER_CAPACITY: { label: 'Acima do limite diário', help: 'Atribua a outra pessoa ou aumente o limite.' },
  MANUAL_REVIEW: { label: 'Retido pela supervisão', help: 'Aguardando decisão. Atribua ou devolva à distribuição.' },
}

export const ROUTE_STATUS: Record<RouteStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Rascunho', tone: 'neutral' },
  RELEASED: { label: 'Liberado', tone: 'info' },
  IN_PROGRESS: { label: 'Em andamento', tone: 'brand' },
  COMPLETED: { label: 'Concluído', tone: 'success' },
  CANCELLED: { label: 'Cancelado', tone: 'neutral' },
}

export const STOP_STATUS: Record<StopStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Pendente', tone: 'neutral' },
  COMPLETED: { label: 'Entregue', tone: 'success' },
  PARTIAL: { label: 'Parcial', tone: 'warning' },
  FAILED: { label: 'Não entregue', tone: 'danger' },
}

export const MANIFEST_STATUS: Record<ManifestStatus, string> = {
  OPEN: 'Conferindo a saída',
  DEPARTED: 'Na rua',
  CLOSED: 'Fechada',
}

export const MANIFEST_OUTCOME: Record<ManifestOutcome, { label: string; tone: Tone }> = {
  OPEN: { label: 'Em aberto', tone: 'warning' },
  DELIVERED: { label: 'Entregue', tone: 'success' },
  RETURNED: { label: 'Devolvido', tone: 'neutral' },
  TRANSFERRED: { label: 'Transferido', tone: 'info' },
}

export const SCAN_RESULT: Record<ScanResult, string> = {
  OK: 'Conferido',
  UNKNOWN_CODE: 'Código não encontrado',
  NOT_ASSIGNED: 'Este pacote é de outro responsável',
  WRONG_STATUS: 'Pacote não pode ser conferido agora',
  DUPLICATE: 'Já conferido',
}

const CONFLICT_REASON: Record<string, string> = {
  NOT_ASSIGNED: 'O pacote foi passado para outra pessoa',
  ALREADY_DELIVERED: 'O pacote já constava como entregue',
  WRONG_STATUS: 'O pacote não estava mais em rota',
  NOT_IN_ROUTE: 'O pacote saiu do roteiro',
  ROUTE_NOT_RELEASED: 'O roteiro foi recolhido pela central',
  ROUTE_NOT_ASSIGNED: 'O roteiro foi passado para outra pessoa',
  PACKAGE_NOT_FOUND: 'Pacote não encontrado',
  MANIFEST_UNAVAILABLE: 'A conferência não está mais disponível',
  MANIFEST_DEPARTED: 'A saída já tinha sido registrada',
  ATTEMPT_NOT_FOUND: 'A baixa deste comprovante não foi aceita',
  ROUTE_CHANGED: 'O roteiro mudou antes de a nova ordem chegar',
  OPEN_ITEMS: 'Ainda há pacotes em aberto',
}

export function conflictLabel(reason: string | null | undefined): string {
  return (reason && CONFLICT_REASON[reason]) || 'O registro não combina com a situação atual'
}

/** Detalhe de uma leitura recusada, em linguagem de quem está conferindo. */
export function scanDetail(result: ScanResult, detail: string | null | undefined): string {
  if (result !== 'WRONG_STATUS') return SCAN_RESULT[result]
  if (detail === 'ROUTE_NOT_RELEASED') return 'O roteiro deste pacote ainda não foi liberado'
  if (detail === 'ASSIGNED' || detail === 'RECEIVED') return 'Este pacote ainda não está em um roteiro'
  if (detail === 'DELIVERED') return 'Este pacote já consta como entregue'
  if (detail === 'ROUTED') return 'Este pacote não saiu da central'
  if (detail === 'LOADED') return 'Este pacote ainda está em rota'
  return SCAN_RESULT.WRONG_STATUS
}

export function describeEntry(entry: QueueEntry): string {
  const op = entry.op
  switch (op.type) {
    case 'START_ROUTE': return 'Início de roteiro'
    case 'ATTEMPT': return op.outcome === 'DELIVERED' ? 'Entrega' : 'Tentativa sem sucesso'
    case 'PROOF': return 'Foto do comprovante'
    case 'SCAN': return `${op.scanType === 'LOAD' ? 'Conferência de saída' : 'Devolução'} · ${op.code}`
    case 'DEPART': return 'Saída para entrega'
    case 'REORDER': return 'Nova ordem das paradas'
  }
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters == null) return '—'
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1).replace('.', ',')} km`
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—'
  const minutes = Math.max(1, Math.round(seconds / 60))
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`
}

/** Data local do aparelho (AAAA-MM-DD). O servidor trabalha em UTC, a operação não. */
export function todayLocal(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function routeName(sequence: number): string {
  return `Roteiro ${String(sequence).padStart(2, '0')}`
}

export function mapsLinks(stop: {
  latitude: number | null; longitude: number | null; street: string; number: string | null
  district: string | null; city: string | null; state: string | null; zip_code: string | null
}): { google: string; waze: string } {
  const text = [
    [stop.street, stop.number].filter(Boolean).join(', '), stop.district, stop.city, stop.state, stop.zip_code,
  ].filter(Boolean).join(', ')
  if (stop.latitude != null && stop.longitude != null) {
    const point = `${stop.latitude},${stop.longitude}`
    return {
      google: `https://www.google.com/maps/dir/?api=1&destination=${point}&travelmode=driving`,
      waze: `https://waze.com/ul?ll=${point}&navigate=yes`,
    }
  }
  const query = encodeURIComponent(text)
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${query}&travelmode=driving`,
    waze: `https://waze.com/ul?q=${query}&navigate=yes`,
  }
}
