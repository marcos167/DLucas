import { describe, expect, it } from 'vitest'
import {
  describeZipRange, formatZip, normalizeZip, parseZipRange, rangeContains, rangesOverlap, repairZip,
  zipPrefixLabel, zipShortLabel,
} from './cep'
import { addressKey, normalizeText } from './address'

describe('CEP', () => {
  it('aceita somente 8 dígitos e ignora a máscara', () => {
    expect(normalizeZip('02710-000')).toBe('02710000')
    expect(normalizeZip(' 02.710-000 ')).toBe('02710000')
    expect(normalizeZip('2710000')).toBeNull()
    expect(normalizeZip('027100000')).toBeNull()
    expect(normalizeZip('')).toBeNull()
    expect(normalizeZip(null)).toBeNull()
  })

  it('devolve o zero que a planilha cortou e avisa que consertou', () => {
    expect(repairZip('2710000')).toEqual({ zip: '02710000', repaired: true })
    expect(repairZip('2710-000')).toEqual({ zip: '02710000', repaired: true })
    expect(repairZip('02710-000')).toEqual({ zip: '02710000', repaired: false })
    // com 6 dígitos não há como saber o que falta: fica inválido
    expect(repairZip('271000')).toEqual({ zip: null, repaired: false })
  })

  it('formata texto e o inteiro guardado nas faixas', () => {
    expect(formatZip('02710000')).toBe('02710-000')
    expect(formatZip(2710000)).toBe('02710-000')
    expect(formatZip(null)).toBe('—')
    expect(formatZip('abc')).toBe('abc')
  })

  it('lê CEP único, prefixo e faixa explícita', () => {
    expect(parseZipRange('02710-000')).toEqual({ start: 2710000, end: 2710000 })
    expect(parseZipRange('027')).toEqual({ start: 2700000, end: 2799999 })
    expect(parseZipRange('027xx')).toEqual({ start: 2700000, end: 2799999 })
    expect(parseZipRange('02710')).toEqual({ start: 2710000, end: 2710999 })
    expect(parseZipRange('02700-000 a 02799-999')).toEqual({ start: 2700000, end: 2799999 })
    expect(parseZipRange('02700000-02799999')).toEqual({ start: 2700000, end: 2799999 })
    expect(parseZipRange('02700-000 até 02712-999')).toEqual({ start: 2700000, end: 2712999 })
  })

  it('recusa entradas que distribuiriam para a pessoa errada', () => {
    expect(parseZipRange('')).toBeNull()
    expect(parseZipRange('0')).toBeNull() // um dígito cobriria um décimo do país
    expect(parseZipRange('027100')).toBeNull() // CEP pela metade
    expect(parseZipRange('2710000')).toBeNull()
    expect(parseZipRange('02799-999 a 02700-000')).toBeNull() // invertida
    expect(parseZipRange('zona norte')).toBeNull()
  })

  it('descreve a faixa da forma mais curta que ainda é exata', () => {
    expect(describeZipRange(2700000, 2799999)).toBe('027xx-xxx')
    expect(describeZipRange(2710000, 2710999)).toBe('02710-xxx')
    expect(describeZipRange(2710000, 2710000)).toBe('02710-000')
    expect(describeZipRange(2700000, 2712999)).toBe('02700-000 a 02712-999')
  })

  it('monta os rótulos dos roteiros', () => {
    expect(zipShortLabel('027')).toBe('027xx')
    expect(zipShortLabel('02710')).toBe('02710')
    expect(zipShortLabel(null)).toBe('Sem CEP')
    expect(zipPrefixLabel('027')).toBe('027xx-xxx')
  })

  it('detecta sobreposição e contenção de faixas', () => {
    const general = { start: 2700000, end: 2799999 }
    const specific = { start: 2710000, end: 2712999 }
    expect(rangesOverlap(general, specific)).toBe(true)
    expect(rangeContains(general, specific)).toBe(true)
    expect(rangeContains(specific, general)).toBe(false)
    expect(rangesOverlap(general, { start: 2900000, end: 2999999 })).toBe(false)
  })
})

describe('chave de endereço', () => {
  it('ignora acento, caixa e pontuação', () => {
    expect(normalizeText('  Rua  das FLÔRES, nº 10 ')).toBe('rua das flores n 10')
    expect(normalizeText(null)).toBe('')
  })

  it('trata grafias diferentes do mesmo endereço como uma parada só', () => {
    const base = addressKey('02710-000', 'Rua das Flores', '100')
    expect(addressKey('02710000', 'R. das Flôres', '100')).toBe(base)
    expect(addressKey('02710-000', 'RUA DAS FLORES', ' 100 ')).toBe(base)
    expect(base).toBe('02710000|rua das flores|100')
  })

  it('separa imóveis diferentes e normaliza abreviações de logradouro', () => {
    expect(addressKey('02710000', 'Rua das Flores', '100')).not.toBe(addressKey('02710000', 'Rua das Flores', '102'))
    expect(addressKey('02710000', 'Av Paulista', '10')).toBe(addressKey('02710000', 'Avenida Paulista', '10'))
    expect(addressKey('02710000', 'Pça da Sé', '1')).toBe(addressKey('02710000', 'Praça da Sé', '1'))
    expect(addressKey('02710000', 'Rua A', 's/n')).toBe(addressKey('02710000', 'Rua A', ''))
    expect(addressKey(null, 'Rua A', '1')).toBe('00000000|rua a|1')
  })
})
