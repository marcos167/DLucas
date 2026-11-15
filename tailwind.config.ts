import type { Config } from 'tailwindcss'

/**
 * Sistema visual D'Luca Connect.
 *
 * Princípios que guiam os valores abaixo:
 * - Elevação em camadas (nunca uma sombra só): borda + sombra próxima + difusa.
 * - Verde da marca como acento, não como preenchimento em tudo.
 * - Tipografia com tracking negativo nos títulos grandes (óptico, não mecânico).
 * - Movimento discreto: 150–250 ms, sempre com curva de saída.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#ecfdf7',
          100: '#d1fae9',
          200: '#a6f3d5',
          300: '#6ee7be',
          400: '#34d3a4',
          500: '#12b98c',
          600: '#069574',
          700: '#07785f',
          800: '#095f4d',
          900: '#0a4e41',
          950: '#032c25',
        },
        ink: {
          50: '#f7f8fa',
          100: '#eef0f4',
          200: '#dde1e9',
          300: '#c1c8d4',
          400: '#96a1b3',
          500: '#6c7a90',
          600: '#505d73',
          700: '#3d4859',
          800: '#2f3847',
          900: '#1a2231',
          950: '#0b111c',
        },
        accent: {
          DEFAULT: '#e8a33d',
          50: '#fdf6e9',
          100: '#faecd0',
          200: '#f4d79e',
          300: '#eebc66',
          400: '#e8a33d',
          500: '#d98a22',
          600: '#bb6c18',
          700: '#955015',
          800: '#7a4117',
          900: '#663716',
        },
        /** Verde de sinalização (sucesso, disponível) — distinto do verde de marca. */
        signal: {
          50: '#f0fdf4',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
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
        'glow-brand': '0 8px 24px -8px rgb(18 185 140 / 0.45)',
        'glow-accent': '0 8px 24px -8px rgb(232 163 61 / 0.4)',
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
        'radial-brand': 'radial-gradient(circle at 50% 0%, rgb(18 185 140 / 0.16), transparent 62%)',
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
          '0%': { boxShadow: '0 0 0 0 rgb(18 185 140 / 0.35)' },
          '70%': { boxShadow: '0 0 0 8px rgb(18 185 140 / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(18 185 140 / 0)' },
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
  plugins: [],
} satisfies Config
