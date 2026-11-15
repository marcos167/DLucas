/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_COMPANY_WHATSAPP: string
  /** `1` habilita o bloco "Acesso rápido" na tela de login. Nunca em produção. */
  readonly VITE_DEMO_LOGINS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
