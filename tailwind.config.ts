import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eefbf7',
          100: '#d5f5eb',
          200: '#aeead8',
          300: '#78d8c0',
          400: '#41bea3',
          500: '#22a289',
          600: '#178271',
          700: '#14685c',
          800: '#13534b',
          900: '#12453f',
          950: '#042924',
        },
        ink: {
          50: '#f6f7f9',
          100: '#eceef2',
          200: '#d5dae3',
          300: '#b1bac9',
          400: '#8695aa',
          500: '#67788f',
          600: '#516076',
          700: '#424e60',
          800: '#3a4351',
          900: '#233043',
          950: '#0d1626',
        },
        accent: '#f59e0b',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(13,22,38,.06), 0 8px 24px -12px rgba(13,22,38,.12)',
        lift: '0 18px 40px -18px rgba(13,22,38,.28)',
      },
      borderRadius: {
        xl2: '1.125rem',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '.45' },
        },
      },
      animation: {
        'fade-up': 'fade-up .45s ease-out both',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
