import type { Config } from 'tailwindcss'
import defaultColors from 'tailwindcss/colors'
import plugin from 'tailwindcss/plugin'

/**
 * Sistema visual DLucas Express.
 *
 * Princípios que guiam os valores abaixo:
 * - Elevação em camadas (nunca uma sombra só): borda + sombra próxima + difusa.
 * - Champagne gold como acento preciso sobre superfícies marfim e grafite.
 * - Tipografia com tracking negativo nos títulos grandes (óptico, não mecânico).
 * - Movimento discreto com alternativa para quem prefere movimento reduzido.
 *
 * Temas: as paletas abaixo chegam ao CSS como variáveis (`--c-ink-900` etc.).
 * O tema padrão (`:root`) usa exatamente os valores declarados aqui; o tema do
 * aplicativo dos entregadores (`html.theme-rider`, ligado por `App.tsx` conforme
 * o endereço, ver `src/lib/riderTheme.ts`) troca só as variáveis. Assim as telas e os componentes compartilhados não
 * precisam de classes próprias para o tema escuro.
 */

type Scale = Record<string, string>

const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const

/** Champagne gold: subtle accents, dark shades maintain contrast on light surfaces. */
const brand: Scale = {
  50: '#f8f5ee',
  100: '#f0e8d9',
  200: '#e3d3b4',
  300: '#d8bf91',
  400: '#c6a66b',
  500: '#a9854d',
  600: '#826337',
  700: '#654b29',
  800: '#49371f',
  900: '#302519',
  950: '#17130f',
}

const ink: Scale = {
  50: '#f5f2ec',
  100: '#eae6df',
  200: '#d5d0c7',
  300: '#a6a6a6',
  400: '#737373',
  500: '#686868',
  600: '#525252',
  700: '#3c3c3c',
  800: '#242424',
  900: '#151515',
  950: '#090909',
}

/** Paletas padrão do Tailwind usadas em avisos, selos e estados. */
const SEMANTIC = ['red', 'amber', 'emerald', 'sky', 'cyan', 'blue', 'indigo', 'violet'] as const
const semantic = Object.fromEntries(
  SEMANTIC.map((name) => [name, defaultColors[name] as unknown as Scale]),
) as Record<(typeof SEMANTIC)[number], Scale>

/**
 * Tema do aplicativo dos entregadores: verde-escuro com texto creme, medido
 * nas telas do aplicativo original (fundo #0e1f19, faixas e cartões #152a23,
 * destaque #bad6be).
 *
 * A escala é a mesma, de trás para a frente: `ink-50` continua sendo "fundo da
 * página" e `ink-900` "texto principal", então todo par claro/escuro que já
 * existe nas telas mantém o contraste. Pelo mesmo motivo `white` (superfície
 * de cartão e texto sobre preenchimento escuro) vira a superfície escura.
 */
const riderInk: Scale = {
  50: '#0e1f19',
  100: '#1a3129',
  200: '#27443a',
  300: '#3d5c50',
  400: '#82978c',
  500: '#9db0a5',
  600: '#b7c6bc',
  700: '#ced9d0',
  800: '#e0e7e0',
  900: '#eef1ea',
  950: '#f7f5ee',
}
const riderBrand: Scale = {
  50: '#1a382e',
  100: '#20463a',
  200: '#2c5a4a',
  300: '#3b715d',
  400: '#55907a',
  500: '#7fb39a',
  600: '#a3ccb0',
  700: '#bad6be',
  800: '#cde3d0',
  900: '#e0efe2',
  950: '#f0f8f1',
}
const RIDER_SURFACE = '#152a23'

/** "#rrggbb" → "r g b", o formato que aceita opacidade em `rgb(var(--x) / a)`. */
function triplet(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16)
  return `${value >> 16} ${(value >> 8) & 255} ${value & 255}`
}
/** Cores da paleta como referência à variável do tema. */
function themed(name: string): Scale {
  return Object.fromEntries(SHADES.map((shade) => [shade, `rgb(var(--c-${name}-${shade}) / <alpha-value>)`]))
}
function variables(name: string, scale: Scale): Record<string, string> {
  return Object.fromEntries(SHADES.map((shade) => [`--c-${name}-${shade}`, triplet(scale[shade])]))
}
/** O tom mais claro vira o mais escuro e vice-versa; o 500 fica onde está. */
function inverted(scale: Scale): Scale {
  return Object.fromEntries(SHADES.map((shade, index) => [shade, scale[SHADES[SHADES.length - 1 - index]]]))
}

const themeVariables = plugin(({ addBase }) => {
  addBase({
    ':root': {
      '--c-white': '255 255 255',
      ...variables('ink', ink),
      ...variables('brand', brand),
      ...Object.assign({}, ...SEMANTIC.map((name) => variables(name, semantic[name]))),
    },
    // `html.` dá precedência sobre `:root` sem depender da ordem das regras
    'html.theme-rider': {
      '--c-white': triplet(RIDER_SURFACE),
      ...variables('ink', riderInk),
      ...variables('brand', riderBrand),
      ...Object.assign({}, ...SEMANTIC.map((name) => variables(name, inverted(semantic[name])))),
    },
  })
})

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /** Variáveis do tema (ver o topo do arquivo). */
        white: 'rgb(var(--c-white) / <alpha-value>)',
        brand: themed('brand'),
        ink: themed('ink'),
        ...Object.fromEntries(SEMANTIC.map((name) => [name, themed(name)])),
        accent: {
          DEFAULT: '#c6a66b',
          50: '#f8f5ee',
          100: '#f0e8d9',
          200: '#e3d3b4',
          300: '#d8bf91',
          400: '#c6a66b',
          500: '#a9854d',
          600: '#826337',
          700: '#654b29',
          800: '#49371f',
          900: '#302519',
        },
        /** Verde de sinalização (sucesso, disponível) — distinto do verde de marca. */
        signal: {
          50: '#f0fdf4',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
        },
      },
      /**
       * Anel de foco sem cor declarada: o Tailwind tira o padrão de `blue.500`
       * e, como essa paleta agora é variável, cairia num azul mais claro.
       * Fixar o valor mantém o que já estava em uso.
       */
      ringColor: {
        DEFAULT: '#3b82f6',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Manrope', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        editorial: ['"Playfair Display"', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        // escala com tracking óptico: quanto maior, mais apertado
        'display-xl': ['4rem', { lineHeight: '1.02', letterSpacing: '-0.035em', fontWeight: '800' }],
        'display-lg': ['3.25rem', { lineHeight: '1.05', letterSpacing: '-0.03em', fontWeight: '800' }],
        'display-md': ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.025em', fontWeight: '800' }],
        'display-sm': ['2rem', { lineHeight: '1.15', letterSpacing: '-0.02em', fontWeight: '700' }],
        'title-lg': ['1.375rem', { lineHeight: '1.25', letterSpacing: '-0.015em', fontWeight: '700' }],
        'title-md': ['1.125rem', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '700' }],
        'title-sm': ['0.9375rem', { lineHeight: '1.4', letterSpacing: '-0.005em', fontWeight: '700' }],
      },
      boxShadow: {
        /** Camada 1: repouso. Borda implícita + sombra curta + sombra longa. */
        xs: '0 1px 2px 0 rgb(11 17 28 / 0.04)',
        card: '0 1px 1px -0.5px rgb(11 17 28 / 0.04), 0 1px 2px 0 rgb(11 17 28 / 0.03), 0 6px 16px -8px rgb(11 17 28 / 0.08)',
        /** Camada 2: hover de card interativo. */
        'card-hover': '0 1px 2px 0 rgb(11 17 28 / 0.05), 0 12px 28px -12px rgb(11 17 28 / 0.16)',
        /** Camada 3: flutuante (dropdown, popover). */
        lift: '0 2px 4px -1px rgb(11 17 28 / 0.06), 0 16px 32px -12px rgb(11 17 28 / 0.18)',
        /** Camada 4: modal. */
        modal: '0 4px 8px -2px rgb(11 17 28 / 0.08), 0 32px 64px -24px rgb(11 17 28 / 0.32)',
        /** Anel interno que dá profundidade a superfícies escuras. */
        'inner-light': 'inset 0 1px 0 0 rgb(255 255 255 / 0.08)',
        'glow-brand': '0 8px 24px -8px rgb(198 166 107 / 0.45)',
        'glow-accent': '0 8px 24px -8px rgb(198 166 107 / 0.4)',
      },
      borderRadius: {
        xl2: '1.125rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      backgroundImage: {
        /** Textura sutil para heros escuros. */
        'grid-fade': 'linear-gradient(to bottom, rgb(255 255 255 / 0.06) 1px, transparent 1px)',
        'radial-brand': 'radial-gradient(circle at 50% 0%, rgb(198 166 107 / 0.12), transparent 62%)',
        'sheen': 'linear-gradient(105deg, transparent 40%, rgb(255 255 255 / 0.14) 50%, transparent 60%)',
      },
      backgroundSize: {
        grid: '44px 44px',
      },
      transitionTimingFunction: {
        /** Curva de saída para movimento natural. */
        out: 'cubic-bezier(0.22, 1, 0.36, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'pulse-soft': {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '.45' },
        },
        'toast-in': {
          '0%': { opacity: '0', transform: 'translateY(8px) scale(.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'sheen-move': {
          '0%': { transform: 'translateX(-120%)' },
          '100%': { transform: 'translateX(220%)' },
        },
        'float': {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'ring-pulse': {
          '0%': { boxShadow: '0 0 0 0 rgb(198 166 107 / 0.35)' },
          '70%': { boxShadow: '0 0 0 8px rgb(198 166 107 / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(198 166 107 / 0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .5s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in .3s ease-out both',
        'scale-in': 'scale-in .2s cubic-bezier(0.22, 1, 0.36, 1) both',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        'toast-in': 'toast-in .22s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.8s linear infinite',
        sheen: 'sheen-move .75s cubic-bezier(0.22, 1, 0.36, 1)',
        float: 'float 5s ease-in-out infinite',
        'ring-pulse': 'ring-pulse 1.8s ease-out infinite',
      },
    },
  },
  plugins: [themeVariables],
} satisfies Config
