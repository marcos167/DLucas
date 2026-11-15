import { z } from 'zod'

const phone = z.string().trim().min(10, 'Telefone inválido').max(20, 'Telefone inválido')
const email = z.string().trim().email('E-mail inválido')
const required = (label: string, min = 2) =>
  z.string().trim().min(min, `${label} é obrigatório`)

export const quoteSchema = z.object({
  name: required('Nome', 3),
  company_name: z.string().trim().optional().or(z.literal('')),
  cnpj: z.string().trim().optional().or(z.literal('')),
  email,
  phone,
  city: z.string().trim().optional().or(z.literal('')),
  state: z.string().trim().max(2).optional().or(z.literal('')),
  units_count: z.coerce.number().int().min(0).optional(),
  deliveries_per_day: z.coerce.number().int().min(0).optional(),
  message: z.string().trim().optional().or(z.literal('')),
})
export type QuoteInput = z.infer<typeof quoteSchema>

export const businessSchema = quoteSchema.extend({
  company_name: required('Empresa', 2),
})
export type BusinessInput = z.infer<typeof businessSchema>

export const courierApplicationSchema = z.object({
  full_name: required('Nome completo', 5),
  phone,
  email: z.string().trim().email('E-mail inválido').optional().or(z.literal('')),
  cpf: z.string().trim().optional().or(z.literal('')),
  city: required('Cidade', 2),
  state: z.string().trim().min(2, 'UF obrigatória').max(2),
  service_zone: z.string().trim().optional().or(z.literal('')),
  has_motorcycle: z.boolean(),
  vehicle_plate: z.string().trim().optional().or(z.literal('')),
  cnh_category: z.string().trim().optional().or(z.literal('')),
  experience: z.string().trim().optional().or(z.literal('')),
  message: z.string().trim().optional().or(z.literal('')),
})
export type CourierApplicationInput = z.infer<typeof courierApplicationSchema>

export const loginSchema = z.object({
  email,
  password: z.string().min(6, 'Senha deve ter ao menos 6 caracteres'),
})
export type LoginInput = z.infer<typeof loginSchema>

export const forgotPasswordSchema = z.object({
  email,
})
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

export const newPasswordSchema = z
  .object({
    password: z.string().min(8, 'A senha precisa ter ao menos 8 caracteres'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'As senhas não conferem',
    path: ['confirm'],
  })
export type NewPasswordInput = z.infer<typeof newPasswordSchema>

export const orderSchema = z.object({
  unit_id: z.string().uuid('Selecione a unidade de origem'),
  priority: z.enum(['NORMAL', 'HIGH', 'URGENT']),
  pickup_street: required('Rua de coleta'),
  pickup_number: z.string().trim().optional().or(z.literal('')),
  pickup_district: z.string().trim().optional().or(z.literal('')),
  pickup_city: required('Cidade de coleta'),
  pickup_state: z.string().trim().length(2, 'UF com 2 letras'),
  pickup_instructions: z.string().trim().optional().or(z.literal('')),
  recipient_name: required('Destinatário', 3),
  recipient_phone: phone,
  recipient_document: z.string().trim().optional().or(z.literal('')),
  delivery_street: required('Rua de entrega'),
  delivery_number: z.string().trim().optional().or(z.literal('')),
  delivery_complement: z.string().trim().optional().or(z.literal('')),
  delivery_district: z.string().trim().optional().or(z.literal('')),
  delivery_city: required('Cidade de entrega'),
  delivery_state: z.string().trim().length(2, 'UF com 2 letras'),
  delivery_zip_code: z.string().trim().optional().or(z.literal('')),
  delivery_instructions: z.string().trim().optional().or(z.literal('')),
  package_count: z.coerce.number().int().min(1, 'Mínimo 1 volume'),
  package_description: z.string().trim().optional().or(z.literal('')),
  is_temperature_controlled: z.boolean().default(false),
  requires_proof: z.boolean().default(true),
  scheduled_for: z.string().trim().optional().or(z.literal('')),
})
export type OrderInput = z.infer<typeof orderSchema>

export const pharmacySchema = z.object({
  legal_name: required('Razão social', 3),
  trade_name: required('Nome fantasia', 2),
  cnpj: z.string().trim().optional().or(z.literal('')),
  status: z.enum(['PROSPECT', 'ACTIVE', 'INACTIVE']),
  email: z.string().trim().email('E-mail inválido').optional().or(z.literal('')),
  phone: z.string().trim().optional().or(z.literal('')),
  whatsapp: z.string().trim().optional().or(z.literal('')),
  contact_name: z.string().trim().optional().or(z.literal('')),
  billing_email: z.string().trim().email('E-mail inválido').optional().or(z.literal('')),
  city: z.string().trim().optional().or(z.literal('')),
  state: z.string().trim().max(2).optional().or(z.literal('')),
  street: z.string().trim().optional().or(z.literal('')),
  number: z.string().trim().optional().or(z.literal('')),
  district: z.string().trim().optional().or(z.literal('')),
  zip_code: z.string().trim().optional().or(z.literal('')),
  notes: z.string().trim().optional().or(z.literal('')),
})
export type PharmacyInput = z.infer<typeof pharmacySchema>

export const unitSchema = z.object({
  name: required('Nome da unidade', 2),
  code: z.string().trim().optional().or(z.literal('')),
  phone: z.string().trim().optional().or(z.literal('')),
  contact_name: z.string().trim().optional().or(z.literal('')),
  street: required('Rua'),
  number: z.string().trim().optional().or(z.literal('')),
  complement: z.string().trim().optional().or(z.literal('')),
  district: z.string().trim().optional().or(z.literal('')),
  city: required('Cidade'),
  state: z.string().trim().length(2, 'UF com 2 letras'),
  zip_code: z.string().trim().optional().or(z.literal('')),
  pickup_instructions: z.string().trim().optional().or(z.literal('')),
  is_active: z.boolean().default(true),
})
export type UnitInput = z.infer<typeof unitSchema>

export const courierSchema = z.object({
  full_name: required('Nome completo', 5),
  phone,
  email: z.string().trim().email('E-mail inválido').optional().or(z.literal('')),
  cpf: z.string().trim().optional().or(z.literal('')),
  cnh_number: z.string().trim().optional().or(z.literal('')),
  cnh_category: z.string().trim().optional().or(z.literal('')),
  vehicle_type: z.string().trim().default('MOTORCYCLE'),
  vehicle_plate: z.string().trim().optional().or(z.literal('')),
  base_city: z.string().trim().optional().or(z.literal('')),
  base_state: z.string().trim().max(2).optional().or(z.literal('')),
  service_zone: z.string().trim().optional().or(z.literal('')),
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'INACTIVE']),
  notes: z.string().trim().optional().or(z.literal('')),
})
export type CourierInput = z.infer<typeof courierSchema>

export const contractSchema = z.object({
  pharmacy_id: z.string().uuid('Selecione a farmácia'),
  name: required('Nome do contrato', 3),
  status: z.enum(['DRAFT', 'ACTIVE', 'SUSPENDED', 'ENDED']),
  base_price_cents: z.coerce.number().int().min(0),
  included_km: z.coerce.number().min(0),
  price_per_extra_km_cents: z.coerce.number().int().min(0),
  courier_payout_cents: z.coerce.number().int().min(0),
  urgency_fee_cents: z.coerce.number().int().min(0),
  temperature_fee_cents: z.coerce.number().int().min(0),
  billing_cycle: z.string().default('MONTHLY'),
  payment_terms_days: z.coerce.number().int().min(0),
  starts_on: z.string().trim().min(1, 'Data de início obrigatória'),
  ends_on: z.string().trim().optional().or(z.literal('')),
  notes: z.string().trim().optional().or(z.literal('')),
})
export type ContractInput = z.infer<typeof contractSchema>

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.')
    if (!out[key]) out[key] = issue.message
  }
  return out
}
