import { describe, expect, it } from 'vitest'

/**
 * Regra da operação: todos os entregadores têm salário fixo, então o
 * aplicativo deles não mostra valores (preço, repasse, totais).
 *
 * Este teste lê o código das telas do entregador e falha se algo de dinheiro
 * voltar a aparecer nelas — formatação em reais, campos de valor do pedido ou
 * a consulta de repasses.
 */
const sources = {
  ...import.meta.glob('./**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../../lib/courierDay.ts', { query: '?raw', import: 'default', eager: true }),
} as Record<string, string>

const FORBIDDEN: Array<[RegExp, string]> = [
  [/\bbrl\s*\(/, 'formatação em reais'],
  [/R\$/, 'símbolo de reais'],
  [/payout/i, 'repasse (campo ou consulta)'],
  [/repasse/i, 'texto de repasse'],
  [/price/i, 'preço'],
  [/_cents\b/, 'campo de valor em centavos'],
  [/\b(Banknote|Wallet|DollarSign|Coins)\b/, 'ícone de dinheiro'],
]

describe('aplicativo do entregador: sem valores', () => {
  const files = Object.entries(sources).filter(([file]) => !/\.test\.tsx?$/.test(file))

  it('o teste enxerga as telas do entregador', () => {
    const names = files.map(([file]) => file)
    for (const expected of ['./CourierHome.tsx', './CourierOffers.tsx', './CourierProfile.tsx', './CourierDelivery.tsx',
      './CourierHistory.tsx', './CourierMap.tsx', './CourierUpcoming.tsx', './rider/OrderCard.tsx']) {
      expect(names).toContain(expected)
    }
  })

  it('nenhuma tela mostra, formata ou consulta valores', () => {
    const found = files.flatMap(([file, code]) => FORBIDDEN
      .filter(([pattern]) => pattern.test(code))
      .map(([, reason]) => `${file}: ${reason}`))
    expect(found).toEqual([])
  })
})
