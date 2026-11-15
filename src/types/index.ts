// Tipos de domínio do D'Luca Connect
export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'DISPATCHER'
  | 'FINANCE'
  | 'PHARMACY_ADMIN'
  | 'PHARMACY_STAFF'
  | 'COURIER'

export type PharmacyStatus = 'PROSPECT' | 'ACTIVE' | 'INACTIVE'
export type CourierStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED' | 'INACTIVE'
export type CourierAvailability = 'AVAILABLE' | 'ON_DELIVERY' | 'OFFLINE'

export type OrderStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'OFFERED'
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'PICKING_UP'
  | 'COLLECTED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'FAILED'
  | 'CANCELLED'

export type OrderPriority = 'NORMAL' | 'HIGH' | 'URGENT'
export type AssignmentMethod = 'MANUAL' | 'AUTO_SUGGESTION' | 'REASSIGNMENT'
export type OfferStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'CANCELLED'
export type OccurrenceType =
  | 'RECIPIENT_ABSENT' | 'WRONG_ADDRESS' | 'DAMAGED_PACKAGE' | 'REFUSED' | 'DELAY' | 'ACCIDENT' | 'OTHER'
export type OccurrenceStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'CANCELLED'
export type ContractStatus = 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'ENDED'
export type InvoiceStatus = 'DRAFT' | 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED'
export type PaymentMethod = 'PIX' | 'TRANSFER' | 'CASH' | 'CARD' | 'OTHER'
export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'WON' | 'LOST'
export type LeadType = 'QUOTE' | 'BUSINESS' | 'COURIER'

export interface Profile {
  id: string
  email: string
  full_name: string
  phone: string | null
  role: UserRole
  pharmacy_id: string | null
  is_active: boolean
  must_change_password: boolean
  created_at: string
  updated_at: string
}

export interface Pharmacy {
  id: string
  legal_name: string
  trade_name: string
  cnpj: string | null
  status: PharmacyStatus
  email: string | null
  phone: string | null
  whatsapp: string | null
  contact_name: string | null
  billing_email: string | null
  billing_notes: string | null
  zip_code: string | null
  street: string | null
  number: string | null
  complement: string | null
  district: string | null
  city: string | null
  state: string | null
  latitude: number | null
  longitude: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface PharmacyUnit {
  id: string
  pharmacy_id: string
  code: string | null
  name: string
  phone: string | null
  contact_name: string | null
  zip_code: string | null
  street: string
  number: string | null
  complement: string | null
  district: string | null
  city: string
  state: string
  latitude: number | null
  longitude: number | null
  pickup_instructions: string | null
  is_active: boolean
  is_primary: boolean
  created_at: string
}

export interface Courier {
  id: string
  profile_id: string | null
  full_name: string
  cpf: string | null
  birth_date: string | null
  phone: string
  email: string | null
  cnh_number: string | null
  cnh_category: string | null
  vehicle_type: string
  vehicle_plate: string | null
  base_city: string | null
  base_state: string | null
  service_zone: string | null
  status: CourierStatus
  availability: CourierAvailability
  current_latitude: number | null
  current_longitude: number | null
  current_location_at: string | null
  location_sharing_enabled: boolean
  approved_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Order {
  id: string
  code: string
  pharmacy_id: string
  unit_id: string
  created_by: string | null
  status: OrderStatus
  priority: OrderPriority
  pickup_zip_code: string | null
  pickup_street: string
  pickup_number: string | null
  pickup_complement: string | null
  pickup_district: string | null
  pickup_city: string
  pickup_state: string
  pickup_latitude: number | null
  pickup_longitude: number | null
  pickup_instructions: string | null
  recipient_name: string
  recipient_phone: string
  recipient_document: string | null
  delivery_zip_code: string | null
  delivery_street: string
  delivery_number: string | null
  delivery_complement: string | null
  delivery_district: string | null
  delivery_city: string
  delivery_state: string
  delivery_latitude: number | null
  delivery_longitude: number | null
  delivery_instructions: string | null
  package_count: number
  package_description: string | null
  is_temperature_controlled: boolean
  requires_proof: boolean
  scheduled_for: string | null
  quoted_price_cents: number
  courier_payout_cents: number
  contract_id: string | null
  courier_id: string | null
  assigned_at: string | null
  accepted_at: string | null
  collected_at: string | null
  delivered_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  estimated_distance_km: number | null
  dispatch_notes: string | null
  created_at: string
  updated_at: string
  // joins
  pharmacy?: Pick<Pharmacy, 'id' | 'trade_name'>
  unit?: Pick<PharmacyUnit, 'id' | 'name'>
  courier?: Pick<Courier, 'id' | 'full_name' | 'phone' | 'availability'>
}

export interface OrderEvent {
  id: number
  order_id: string
  status: OrderStatus | null
  event: string
  description: string | null
  actor_id: string | null
  latitude: number | null
  longitude: number | null
  created_at: string
}

export interface DeliveryOffer {
  id: string
  order_id: string
  courier_id: string
  status: OfferStatus
  method: AssignmentMethod
  score: number | null
  distance_to_pickup_km: number | null
  message: string | null
  expires_at: string | null
  responded_at: string | null
  created_at: string
  order?: Order
}

export interface Occurrence {
  id: string
  order_id: string | null
  courier_id: string | null
  pharmacy_id: string | null
  type: OccurrenceType
  status: OccurrenceStatus
  description: string
  reported_by: string | null
  resolution: string | null
  resolved_at: string | null
  created_at: string
  order?: Pick<Order, 'id' | 'code'>
}

export interface Proof {
  id: string
  order_id: string
  kind: string
  storage_path: string
  file_name: string | null
  mime_type: string | null
  size_bytes: number | null
  recipient_name: string | null
  notes: string | null
  created_at: string
}

export interface CourierLocation {
  id: number
  courier_id: string
  order_id: string | null
  latitude: number
  longitude: number
  accuracy_m: number | null
  recorded_at: string
}

export interface Contract {
  id: string
  pharmacy_id: string
  name: string
  status: ContractStatus
  base_price_cents: number
  included_km: number
  price_per_extra_km_cents: number
  courier_payout_cents: number
  urgency_fee_cents: number
  temperature_fee_cents: number
  billing_cycle: string
  payment_terms_days: number
  starts_on: string
  ends_on: string | null
  notes: string | null
  created_at: string
  pharmacy?: Pick<Pharmacy, 'id' | 'trade_name'>
}

export interface Invoice {
  id: string
  number: string
  pharmacy_id: string
  contract_id: string | null
  status: InvoiceStatus
  period_start: string | null
  period_end: string | null
  issue_date: string
  due_date: string
  subtotal_cents: number
  discount_cents: number
  total_cents: number
  paid_cents: number
  notes: string | null
  created_at: string
  pharmacy?: Pick<Pharmacy, 'id' | 'trade_name'>
}

export interface InvoiceItem {
  id: number
  invoice_id: string
  order_id: string | null
  description: string
  quantity: number
  unit_price_cents: number
  total_cents: number
}

export interface Payment {
  id: string
  invoice_id: string
  amount_cents: number
  method: PaymentMethod
  paid_at: string
  reference: string | null
  receipt_path: string | null
  notes: string | null
  created_at: string
}

export interface CourierPayout {
  id: string
  courier_id: string
  order_id: string | null
  amount_cents: number
  status: 'PENDING' | 'APPROVED' | 'PAID' | 'CANCELLED'
  reference_period: string | null
  paid_at: string | null
  notes: string | null
  created_at: string
  courier?: Pick<Courier, 'id' | 'full_name'>
}

export interface Lead {
  id: string
  type: LeadType
  name: string
  company_name: string | null
  cnpj: string | null
  email: string
  phone: string
  city: string | null
  state: string | null
  units_count: number | null
  deliveries_per_day: number | null
  message: string | null
  status: LeadStatus
  internal_notes: string | null
  created_at: string
}

export interface CourierApplication {
  id: string
  full_name: string
  phone: string
  email: string | null
  cpf: string | null
  city: string | null
  state: string | null
  service_zone: string | null
  has_motorcycle: boolean
  vehicle_plate: string | null
  cnh_category: string | null
  experience: string | null
  message: string | null
  status: LeadStatus
  created_at: string
}

export interface AuditLog {
  id: number
  actor_id: string | null
  actor_email: string | null
  actor_role: UserRole | null
  action: string
  entity: string
  entity_id: string | null
  description: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface AppNotification {
  id: string
  user_id: string
  title: string
  body: string | null
  link: string | null
  kind: string
  read_at: string | null
  created_at: string
}

export interface Setting {
  key: string
  value: Record<string, unknown>
  description: string | null
  updated_at: string
}
