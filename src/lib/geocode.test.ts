import { describe, expect, it } from 'vitest'
import { destinationAddressKey, destinationForAddress } from './geocode'

const address = {
  delivery_street: 'Rua A', delivery_number: '12', delivery_district: 'Centro',
  delivery_city: 'São Paulo', delivery_state: 'SP', delivery_zip_code: '01000-000',
}

describe('coordenadas do destino', () => {
  it('só usa o ponto para o endereço geocodificado, inclusive CEP, número e bairro', () => {
    const point = { lat: -23.5, lng: -46.6, addressKey: destinationAddressKey(address) }
    expect(destinationForAddress(point, address)).toEqual(point)
    expect(destinationForAddress(point, { ...address, delivery_number: '13' })).toBeNull()
    expect(destinationForAddress(point, { ...address, delivery_zip_code: '02000-000' })).toBeNull()
    expect(destinationForAddress(point, { ...address, delivery_district: 'Outro' })).toBeNull()
    expect(destinationForAddress(null, address)).toBeNull()
  })

  it('ignora diferenças só de espaços e caixa', () => {
    expect(destinationAddressKey({ ...address, delivery_street: '  RUA A  ' })).toBe(destinationAddressKey(address))
  })
})
