import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { geocodeAddress } = vi.hoisted(() => ({ geocodeAddress: vi.fn() }))
vi.mock('@/lib/geocode', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/geocode')>(), geocodeAddress,
}))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ profile: { pharmacy_id: 'p', id: 'user' } }) }))
vi.mock('@/lib/api', () => ({
  listUnits: async () => [{ id: 'unit', is_active: true, name: 'Unidade', street: 'Rua Origem', city: 'São Paulo', state: 'SP', latitude: -23.5, longitude: -46.6 }],
  listContracts: async () => [{ id: 'contract', status: 'ACTIVE', name: 'Contrato', base_price_cents: 1000, included_km: 0, price_per_extra_km_cents: 100 }],
  createOrder: vi.fn(),
}))
import NewOrder from './NewOrder'

function setup() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><NewOrder /></MemoryRouter>
    </QueryClientProvider>,
  )
}

function destinationInput(index: number) {
  const card = screen.getByText('Destino e destinatário').closest('.card')
  return card!.querySelectorAll('input')[index]
}

async function fillAddress() {
  await screen.findByRole('option', { name: /Unidade —/ })
  fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'unit' } })
  fireEvent.change(destinationInput(4), { target: { value: 'Rua Destino' } })
  fireEvent.change(destinationInput(8), { target: { value: 'São Paulo' } })
  fireEvent.change(destinationInput(9), { target: { value: 'SP' } })
}

beforeEach(() => geocodeAddress.mockReset())

describe('estimativa do novo pedido', () => {
  it('invalida coordenadas após editar endereço geocodificado', async () => {
    geocodeAddress.mockResolvedValue({ lat: -23.6, lng: -46.7, displayName: 'São Paulo' })
    setup()
    await fillAddress()
    fireEvent.click(screen.getByRole('button', { name: /Localizar/ }))
    await screen.findByText(/Endereço de destino localizado/)
    expect(screen.getByText(/Distância estimada:/)).toBeInTheDocument()

    fireEvent.change(destinationInput(4), { target: { value: 'Outra Rua' } })
    expect(screen.queryByText(/Distância estimada:/)).not.toBeInTheDocument()
    expect(screen.getByText(/Localize novamente/)).toBeInTheDocument()
  })

})
