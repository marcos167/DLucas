/**
 * Tema do aplicativo dos entregadores.
 *
 * O aplicativo dos entregadores segue o visual do aplicativo original da
 * operação (verde-escuro); o site, o painel e o portal das farmácias continuam
 * claros. O tema é a classe `theme-rider` no <html> — as cores estão em
 * `tailwind.config.ts` — e depende só do endereço: vale em `/entregador` e no
 * que há dentro dele. Por ficar no <html>, janelas e avisos montados fora da
 * árvore da tela (portais) também recebem o tema, e a tela de carregamento já
 * abre na cor certa.
 */

const THEME_CLASS = 'theme-rider'

/** Cor da barra de status do aparelho: o fundo do tema (`ink-50` do tema em tailwind.config.ts). */
export const RIDER_THEME_COLOR = '#0e1f19'

/** `/entregadores` (página pública de cadastro) não faz parte do aplicativo. */
export function isRiderPath(pathname: string): boolean {
  return pathname === '/entregador' || pathname.startsWith('/entregador/')
}

/** Liga ou desliga o tema e acerta a cor da barra de status do aparelho. */
export function applyRiderTheme(on: boolean): void {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle(THEME_CLASS, on)
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) return
  // a cor padrão é a que veio no index.html; guarda-se na primeira troca
  if (meta.dataset.defaultColor === undefined) meta.dataset.defaultColor = meta.content
  meta.content = on ? RIDER_THEME_COLOR : meta.dataset.defaultColor
}
