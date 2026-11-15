import { afterEach, describe, expect, it } from 'vitest'
import { applyRiderTheme, isRiderPath, RIDER_THEME_COLOR } from './riderTheme'

describe('tema do aplicativo dos entregadores', () => {
  afterEach(() => {
    document.documentElement.className = ''
    document.head.innerHTML = ''
  })

  it('vale só para o aplicativo dos entregadores', () => {
    expect(isRiderPath('/entregador')).toBe(true)
    expect(isRiderPath('/entregador/mapa')).toBe(true)
    expect(isRiderPath('/entregador/rotas/abc')).toBe(true)
    // a página pública de cadastro de entregadores é do site, não do aplicativo
    expect(isRiderPath('/entregadores')).toBe(false)
    expect(isRiderPath('/app/entregadores')).toBe(false)
    expect(isRiderPath('/entrar')).toBe(false)
    expect(isRiderPath('/')).toBe(false)
  })

  it('liga e desliga a classe do tema e a cor da barra do aparelho', () => {
    document.head.innerHTML = '<meta name="theme-color" content="#F5F2EC">'
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!

    applyRiderTheme(true)
    expect(document.documentElement.classList.contains('theme-rider')).toBe(true)
    expect(meta.content).toBe(RIDER_THEME_COLOR)

    applyRiderTheme(true)
    applyRiderTheme(false)
    expect(document.documentElement.classList.contains('theme-rider')).toBe(false)
    expect(meta.content).toBe('#F5F2EC')
  })

  it('funciona mesmo sem a meta de cor na página', () => {
    applyRiderTheme(true)
    expect(document.documentElement.classList.contains('theme-rider')).toBe(true)
    applyRiderTheme(false)
    expect(document.documentElement.classList.contains('theme-rider')).toBe(false)
  })
})
