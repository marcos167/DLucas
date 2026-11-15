import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // permite o host de preview do ambiente e qualquer subdomínio *.e2b.app
    allowedHosts: true,
    hmr: { clientPort: 443 },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  build: {
    rollupOptions: {
      output: {
        /**
         * Separa as bibliotecas grandes do código da aplicação.
         *
         * Elas mudam pouco entre deploys, então o navegador mantém o cache
         * delas mesmo quando o código do sistema é atualizado.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          // só as bibliotecas realmente pesadas viram chunk próprio.
          // agrupar tudo gera dependência circular entre os chunks.
          if (id.includes('recharts') || id.includes('/d3-')) return 'vendor-charts'
          if (id.includes('leaflet')) return 'vendor-map'
          if (id.includes('@supabase')) return 'vendor-supabase'
          return
        },
      },
    },
    // acima disso o navegador demora a interpretar; 600 kB é o teto que aceitamos
    chunkSizeWarningLimit: 600,
  },
})
