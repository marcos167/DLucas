import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ profile: null, homeRoute: '/app' }),
}))

import SiteLayout from './SiteLayout'
import Home from '@/pages/site/Home'

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn())
})

function renderSite() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes><Route element={<SiteLayout />}><Route index element={<Home />} /></Route></Routes>
    </MemoryRouter>,
  )
}

describe('site institucional premium', () => {
  it('preserva a navegação, orçamento e acesso ao sistema', () => {
    renderSite()
    const navigation = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(within(navigation).getByRole('link', { name: 'Serviços' })).toHaveAttribute('href', '/servicos')
    expect(within(navigation).getByRole('link', { name: 'Para farmácias' })).toHaveAttribute('href', '/farmacias')
    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'DLucas Express — início' })).toHaveTextContent('DLucas Express')
    expect(screen.getByText('DLucas Express / Logística em saúde')).toBeInTheDocument()
    expect(screen.getByText(/© \d{4} DLucas Express\. Todos os direitos reservados\./)).toBeInTheDocument()
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Cada entrega carrega algo essencial.')
    expect(heading.closest('section')).toHaveClass('bg-ink-50')
    expect(screen.getByRole('banner')).toHaveClass('bg-white/95')
    expect(screen.getAllByRole('link', { name: /Solicitar proposta/i })[0]).toHaveAttribute('href', '/orcamento')
    expect(screen.getAllByRole('link', { name: 'Acessar plataforma' })[0]).toHaveAttribute('href', '/entrar')
    expect(screen.getByRole('link', { name: 'Pular para o conteúdo' })).toHaveAttribute('href', '#conteudo')
  })

  it('abre o menu móvel com rotas e mantém o controle acessível', () => {
    renderSite()
    const toggle = screen.getByRole('button', { name: 'Abrir menu' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    const mobile = screen.getByRole('navigation', { name: 'Navegação móvel' })
    expect(screen.getByRole('button', { name: 'Fechar menu' })).toHaveAttribute('aria-expanded', 'true')
    expect(within(mobile).getByRole('link', { name: 'Seja entregador' })).toHaveAttribute('href', '/entregadores')
    expect(within(mobile).getByRole('link', { name: 'Acessar plataforma' })).toHaveAttribute('href', '/entrar')
  })
})
