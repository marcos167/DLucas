import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type {
  OrderStatus, OrderPriority, CourierAvailability, InvoiceStatus,
  OccurrenceType, LeadStatus, OccurrenceStatus, ContractStatus,
} from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Formata centavos em BRL */
export function brl(cents: number | null | undefined): string {
  const v = (cents ?? 0) / 100
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function km(value: number | null | undefined): string {
  if (value == null) return '—'
  return `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`
}

export function formatDate(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value.length <= 10 ? `${value}T12:00:00` : value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR')
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function relativeTime(value?: string | null): string {
  if (!value) return '—'
  const diff = Date.now() - new Date(value).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min atrás`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h atrás`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} d atrás`
  return formatDate(value)
}

/** Indica se uma posição é recente o bastante para ser exibida como "ao vivo" (máx. 3 min). */
export function isLocationFresh(iso?: string | null, maxMinutes = 3): boolean {
  if (!iso) return false
  return Date.now() - new Date(iso).getTime() < maxMinutes * 60_000
}

export function initials(name?: string | null): string {
  if (!name) return '?'
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export function onlyDigits(v: string): string {
  return (v || '').replace(/\D+/g, '')
}

export function maskPhone(v: string): string {
  const d = onlyDigits(v).slice(0, 11)
  if (d.length <= 10) return d.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3').replace(/-$/, '')
  return d.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3').replace(/-$/, '')
}

export function maskCpf(v: string): string {
  const d = onlyDigits(v).slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
}

export function maskCnpj(v: string): string {
  const d = onlyDigits(v).slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

/** Distância em km entre dois pontos (fórmula de Haversine) */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: 'Rascunho',
  PENDING: 'Aguardando despacho',
  OFFERED: 'Ofertado',
  ASSIGNED: 'Atribuído',
  ACCEPTED: 'Aceito',
  PICKING_UP: 'A caminho da coleta',
  COLLECTED: 'Coletado',
  IN_TRANSIT: 'Em rota',
  DELIVERED: 'Entregue',
  FAILED: 'Falhou',
  CANCELLED: 'Cancelado',
}

export const ORDER_STATUS_CLASS: Record<OrderStatus, string> = {
  DRAFT: 'bg-ink-100 text-ink-600',
  PENDING: 'bg-amber-100 text-amber-800',
  OFFERED: 'bg-sky-100 text-sky-800',
  ASSIGNED: 'bg-indigo-100 text-indigo-800',
  ACCEPTED: 'bg-indigo-100 text-indigo-800',
  PICKING_UP: 'bg-violet-100 text-violet-800',
  COLLECTED: 'bg-cyan-100 text-cyan-800',
  IN_TRANSIT: 'bg-blue-100 text-blue-800',
  DELIVERED: 'bg-emerald-100 text-emerald-800',
  FAILED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-ink-200 text-ink-600',
}

export const ORDER_PRIORITY_LABEL: Record<OrderPriority, string> = {
  NORMAL: 'Normal',
  HIGH: 'Alta',
  URGENT: 'Urgente',
}

export const ORDER_PRIORITY_CLASS: Record<OrderPriority, string> = {
  NORMAL: 'bg-ink-100 text-ink-600',
  HIGH: 'bg-amber-100 text-amber-800',
  URGENT: 'bg-red-100 text-red-700',
}

export const AVAILABILITY_LABEL: Record<CourierAvailability, string> = {
  AVAILABLE: 'Disponível',
  ON_DELIVERY: 'Em entrega',
  OFFLINE: 'Offline',
}

export const AVAILABILITY_CLASS: Record<CourierAvailability, string> = {
  AVAILABLE: 'bg-emerald-100 text-emerald-800',
  ON_DELIVERY: 'bg-blue-100 text-blue-800',
  OFFLINE: 'bg-ink-200 text-ink-600',
}

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: 'Rascunho',
  OPEN: 'Em aberto',
  PARTIALLY_PAID: 'Parcialmente paga',
  PAID: 'Paga',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
}

export const INVOICE_STATUS_CLASS: Record<InvoiceStatus, string> = {
  DRAFT: 'bg-ink-100 text-ink-600',
  OPEN: 'bg-sky-100 text-sky-800',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-800',
  PAID: 'bg-emerald-100 text-emerald-800',
  OVERDUE: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-ink-200 text-ink-600',
}

export const OCCURRENCE_TYPE_LABEL: Record<OccurrenceType, string> = {
  RECIPIENT_ABSENT: 'Destinatário ausente',
  WRONG_ADDRESS: 'Endereço incorreto',
  DAMAGED_PACKAGE: 'Embalagem danificada',
  REFUSED: 'Recusado pelo destinatário',
  DELAY: 'Atraso',
  ACCIDENT: 'Acidente',
  OTHER: 'Outro',
}

export const OCCURRENCE_STATUS_LABEL: Record<OccurrenceStatus, string> = {
  OPEN: 'Aberta',
  IN_REVIEW: 'Em análise',
  RESOLVED: 'Resolvida',
  CANCELLED: 'Cancelada',
}

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: 'Novo',
  CONTACTED: 'Contatado',
  QUALIFIED: 'Qualificado',
  WON: 'Ganho',
  LOST: 'Perdido',
}

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  DRAFT: 'Rascunho',
  ACTIVE: 'Ativo',
  SUSPENDED: 'Suspenso',
  ENDED: 'Encerrado',
}

export const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Super administrador',
  ADMIN: 'Administrador',
  DISPATCHER: 'Despachante',
  FINANCE: 'Financeiro',
  PHARMACY_ADMIN: 'Farmácia · gestor',
  PHARMACY_STAFF: 'Farmácia · operador',
  COURIER: 'Entregador',
}

/** Transições permitidas por papel na operação */
export const COURIER_FLOW: Partial<Record<OrderStatus, { next: OrderStatus; label: string }>> = {
  ACCEPTED: { next: 'PICKING_UP', label: 'Iniciar deslocamento' },
  PICKING_UP: { next: 'COLLECTED', label: 'Confirmar coleta' },
  COLLECTED: { next: 'IN_TRANSIT', label: 'Iniciar rota' },
  IN_TRANSIT: { next: 'DELIVERED', label: 'Confirmar entrega' },
}

export function slugifyZone(city?: string | null): string {
  return (city ?? '').trim().toLowerCase()
}
