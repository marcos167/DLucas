import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { CtaBand, FeatureCard, PageHeader } from './PageSections'

describe('seções reutilizáveis do site', () => {
  it('oferece um título principal, descrição, ações e destaque opcional', () => {
    render(
      <PageHeader
        eyebrow="Serviços"
        title="Transporte de medicamentos"
        description="Processo com registro"
        actions={<a href="/orcamento">Solicitar orçamento</a>}
        aside={<p>Rastreabilidade</p>}
      />,
    )

    const header = screen.getByRole('banner')
    expect(within(header).getByRole('heading', { level: 1, name: 'Transporte de medicamentos' })).toBeInTheDocument()
    expect(within(header).getByText('Serviços')).toBeInTheDocument()
    expect(within(header).getByText('Processo com registro')).toBeInTheDocument()
    expect(within(header).getByRole('link', { name: 'Solicitar orçamento' })).toHaveAttribute('href', '/orcamento')
    expect(within(header).getByText('Rastreabilidade')).toBeInTheDocument()
  })

  it('expõe título no nível solicitado e cada benefício como item de lista', () => {
    render(
      <FeatureCard icon={<span aria-hidden="true">★</span>} title="Portal da farmácia" headingLevel={3}
        bullets={['Pedidos', 'Comprovantes']}>
        Histórico por unidade
      </FeatureCard>,
    )

    expect(screen.getByRole('heading', { level: 3, name: 'Portal da farmácia' })).toBeInTheDocument()
    expect(screen.getByText('Histórico por unidade')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('exibe chamada e link de orçamento sem prometer acesso automático', () => {
    render(
      <CtaBand title="Pronto para começar?" description="Acesso após análise."
        actions={<a href="/orcamento">Falar com a equipe</a>} />,
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Pronto para começar?' })).toBeInTheDocument()
    expect(screen.getByText('Acesso após análise.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Falar com a equipe' })).toHaveAttribute('href', '/orcamento')
  })
})
