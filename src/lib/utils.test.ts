import { describe, expect, it } from 'vitest'
import {
  brl, distanceKm, initials, isLocationFresh, km, maskCnpj, maskCpf, maskPhone, onlyDigits,
} from '@/lib/utils'

/** O Intl usa espaço não separável (U+00A0) depois de "R$" — normaliza para comparar. */
const norm = (s: string) => s.replace(/\u00a0/g, ' ')

describe('formatação de valores', () => {
  it('formata centavos em reais no padrão pt-BR', () => {
    expect(norm(brl(0))).toBe('R$ 0,00')
    expect(norm(brl(1234))).toBe('R$ 12,34')
    expect(norm(brl(123456))).toBe('R$ 1.234,56')
  })

  it('trata valor ausente como zero em vez de NaN', () => {
    expect(norm(brl(null))).toBe('R$ 0,00')
    expect(norm(brl(undefined))).toBe('R$ 0,00')
  })

  it('formata quilômetros com vírgula decimal e uma casa', () => {
    expect(km(6.24)).toBe('6,2 km')
    expect(km(12)).toBe('12 km')
    expect(km(null)).toBe('—')
  })
})

describe('máscaras de documento', () => {
  it('aplica máscara de telefone em fixo e celular', () => {
    expect(maskPhone('1133334444')).toBe('(11) 3333-4444')
    expect(maskPhone('11987654321')).toBe('(11) 98765-4321')
  })

  it('descarta caracteres não numéricos antes de mascarar', () => {
    expect(maskPhone('(11) 98765-4321')).toBe('(11) 98765-4321')
    expect(onlyDigits('abc123.456')).toBe('123456')
  })

  it('aplica máscara de CPF e CNPJ', () => {
    expect(maskCpf('12345678901')).toBe('123.456.789-01')
    expect(maskCnpj('12345678000199')).toBe('12.345.678/0001-99')
  })

  it('não quebra com entrada parcial', () => {
    expect(maskCpf('123')).toBe('123')
    expect(maskCnpj('123456')).toBe('12.345.6')
  })
})

describe('iniciais para avatar', () => {
  it('usa as iniciais dos dois primeiros nomes', () => {
    expect(initials('Anderson Silva Prado')).toBe('AS')
    expect(initials('maria clara')).toBe('MC')
    expect(initials('Maria')).toBe('M')
  })

  it('lida com nome ausente', () => {
    expect(initials(null)).toBe('?')
    expect(initials('')).toBe('?')
  })
})

describe('distância entre coordenadas', () => {
  it('retorna zero para o mesmo ponto', () => {
    const p = { lat: -23.55, lng: -46.63 }
    expect(distanceKm(p, p)).toBeCloseTo(0)
  })

  it('calcula a distância real entre São Paulo e Rio', () => {
    // ~360 km em linha reta
    const d = distanceKm({ lat: -23.5505, lng: -46.6333 }, { lat: -22.9068, lng: -43.1729 })
    expect(d).toBeGreaterThan(350)
    expect(d).toBeLessThan(375)
  })

  it('é simétrica: a distância de A para B é igual à de B para A', () => {
    const sp = { lat: -23.5505, lng: -46.6333 }
    const rio = { lat: -22.9068, lng: -43.1729 }
    expect(distanceKm(sp, rio)).toBeCloseTo(distanceKm(rio, sp), 10)
  })
})

describe('frescor da localização (regra de privacidade)', () => {
  it('considera atual abaixo do limite', () => {
    const doisMinutosAtras = new Date(Date.now() - 2 * 60_000).toISOString()
    expect(isLocationFresh(doisMinutosAtras)).toBe(true)
  })

  it('considera desatualizada acima do limite padrão de 3 minutos', () => {
    const dezMinutosAtras = new Date(Date.now() - 10 * 60_000).toISOString()
    expect(isLocationFresh(dezMinutosAtras)).toBe(false)
  })

  it('respeita limite customizado', () => {
    const cincoMinutosAtras = new Date(Date.now() - 5 * 60_000).toISOString()
    expect(isLocationFresh(cincoMinutosAtras, 10)).toBe(true)
    expect(isLocationFresh(cincoMinutosAtras, 2)).toBe(false)
  })

  it('ausência de posição nunca é considerada fresca', () => {
    expect(isLocationFresh(null)).toBe(false)
    expect(isLocationFresh(undefined)).toBe(false)
  })
})
