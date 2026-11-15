import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import type { UserRole } from '@/types'
import { Loader2 } from 'lucide-react'

export function FullScreenLoader({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ink-50">
      <Loader2 className="h-6 w-6 animate-spin text-brand-700" />
      <p className="text-sm text-ink-500">{label}</p>
    </div>
  )
}

export function Protected({ children, allow }: { children: ReactNode; allow: UserRole[] }) {
  const { loading, profile, homeRoute, configured } = useAuth()
  const location = useLocation()

  if (!configured) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="card max-w-md p-6 text-center">
          <h1 className="font-display text-lg font-bold">Supabase não configurado</h1>
          <p className="mt-2 text-sm text-ink-600">
            Configure <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> para usar a
            plataforma.
          </p>
        </div>
      </div>
    )
  }

  if (loading) return <FullScreenLoader />

  if (!profile) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />

  if (!profile.is_active) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="card max-w-md p-6 text-center">
          <h1 className="font-display text-lg font-bold">Acesso inativo</h1>
          <p className="mt-2 text-sm text-ink-600">
            Seu usuário está desativado. Fale com o administrador da plataforma.
          </p>
        </div>
      </div>
    )
  }

  if (!allow.includes(profile.role)) return <Navigate to={homeRoute} replace />

  return <>{children}</>
}
