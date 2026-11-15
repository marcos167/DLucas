import { describe, expect, it } from 'vitest'
import {
  contractSchema, courierApplicationSchema, forgotPasswordSchema, loginSchema,
  newPasswordSchema, orderSchema, quoteSchema,
} from '@/lib/validation'

/**
 * A validação roda antes de qualquer chamada ao banco. Um furo aqui significa
 * dado sujo gravado ou erro genérico em vez de mensagem de campo.
 */

const pedidoValido = {
  unit_id: '11111111-1111-1111-1111-111111111111',
  priority: 'NORMAL' as const,
  pickup_street: 'Rua das Flores',
  pickup_number: '100',
  pickup_district: 'Centro',
  pickup_city: 'São Paulo',
  pickup_state: 'SP',
  pickup_instructions: '',
  recipient_name: 'Maria Souza',
  recipient_phone: '11987654321',
  recipient_document: '',
  delivery_street: 'Av. Paulista',
  delivery_number: '1000',
  delivery_complement: '',
  delivery_district: 'Bela Vista',
  delivery_city: 'São Paulo',
  delivery_state: 'SP',
  package_count: 1,
}

describe('loginSchema', () => {
  it('aceita e-mail e senha válidos', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: '123456' }).success).toBe(true)
  })

  it('rejeita e-mail malformado', () => {
    expect(loginSchema.safeParse({ email: 'a@', password: '123456' }).success).toBe(false)
  })

  it('rejeita senha curta', () => {
    const r = loginSchema.safeParse({ email: 'a@b.com', password: '123' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].message).toContain('ao menos 6')
  })
})

describe('newPasswordSchema', () => {
  it('exige mínimo de 8 caracteres', () => {
    expect(newPasswordSchema.safeParse({ password: '1234567', confirm: '1234567' }).success)
      .toBe(false)
  })

  it('rejeita senhas diferentes e aponta o erro no campo de confirmação', () => {
    const r = newPasswordSchema.safeParse({ password: 'abcdefgh', confirm: 'abcdefgi' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].path).toEqual(['confirm'])
  })

  it('aceita quando as duas conferem', () => {
    expect(newPasswordSchema.safeParse({ password: 'abcdefgh', confirm: 'abcdefgh' }).success)
      .toBe(true)
  })
})

describe('forgotPasswordSchema', () => {
  it('exige e-mail válido', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'nao-e-email' }).success).toBe(false)
    expect(forgotPasswordSchema.safeParse({ email: 'ok@dominio.com' }).success).toBe(true)
  })
})

describe('orderSchema — validação de pedido', () => {
  it('aceita pedido completo', () => {
    const r = orderSchema.safeParse(pedidoValido)
    expect(r.success).toBe(true)
  })

  it('rejeita unidade de origem fora do formato UUID', () => {
    expect(orderSchema.safeParse({ ...pedidoValido, unit_id: 'abc' }).success).toBe(false)
  })

  it('exige UF com exatamente 2 letras', () => {
    expect(orderSchema.safeParse({ ...pedidoValido, pickup_state: 'SPX' }).success).toBe(false)
    expect(orderSchema.safeParse({ ...pedidoValido, pickup_state: 'S' }).success).toBe(false)
  })

  it('rejeita prioridade fora do enum', () => {
    expect(orderSchema.safeParse({ ...pedidoValido, priority: 'URGENTISSIMO' }).success).toBe(false)
  })

  it('rejeita telefone de destinatário muito curto', () => {
    expect(orderSchema.safeParse({ ...pedidoValido, recipient_phone: '119' }).success).toBe(false)
  })

  it('exige ao menos 1 volume', () => {
    expect(orderSchema.safeParse({ ...pedidoValido, package_count: 0 }).success).toBe(false)
  })

  it('converte volume digitado como texto', () => {
    const r = orderSchema.safeParse({ ...pedidoValido, package_count: '3' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.package_count).toBe(3)
  })

  it('exige nome de destinatário com ao menos 3 caracteres', () => {
    expect(orderSchema.safeParse({ ...pedidoValido, recipient_name: 'Jo' }).success).toBe(false)
  })
})

describe('quoteSchema — formulário público de orçamento', () => {
  const base = { name: 'Carlos', email: 'carlos@farmacia.com', phone: '11999998888' }

  it('aceita o mínimo obrigatório', () => {
    expect(quoteSchema.safeParse(base).success).toBe(true)
  })

  it('rejeita nome muito curto', () => {
    expect(quoteSchema.safeParse({ ...base, name: 'Ca' }).success).toBe(false)
  })

  it('rejeita telefone inválido', () => {
    expect(quoteSchema.safeParse({ ...base, phone: '123' }).success).toBe(false)
  })
})

describe('courierApplicationSchema — candidatura de entregador', () => {
  const base = {
    full_name: 'Anderson Silva',
    phone: '11987654321',
    cpf: '12345678901',
    city: 'São Paulo',
    state: 'SP',
    has_motorcycle: true,
  }

  it('aceita candidatura mínima', () => {
    expect(courierApplicationSchema.safeParse(base).success).toBe(true)
  })

  it('exige cidade', () => {
    expect(courierApplicationSchema.safeParse({ ...base, city: '' }).success).toBe(false)
  })
})

describe('contractSchema — tabela de preço', () => {
  it('rejeita valor base negativo', () => {
    const r = contractSchema.safeParse({
      base_price_cents: -100,
      included_km: 5,
      extra_km_cents: 100,
    })
    expect(r.success).toBe(false)
  })
})
