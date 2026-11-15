import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import {
  forgetIdentity, isTransportFailure, recallIdentity, rememberIdentity, storedSession,
} from '@/lib/offlineIdentity'
import type { Courier, Profile, UserRole } from '@/types'

interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  courier: Courier | null
  loading: boolean
  configured: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  updatePassword: (password: string) => Promise<void>
  /** Envia o e-mail de redefinição de senha. Não revela se o e-mail existe. */
  requestPasswordReset: (email: string) => Promise<void>
  /** Define a senha durante a recuperação (sessão temporária do link). */
  completePasswordReset: (password: string) => Promise<void>
  homeRoute: string
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function homeRouteFor(role: UserRole | undefined | null): string {
  switch (role) {
    case 'SUPER_ADMIN':
    case 'ADMIN':
    case 'DISPATCHER':
    case 'FINANCE':
      return '/app'
    case 'PHARMACY_ADMIN':
    case 'PHARMACY_STAFF':
      return '/portal'
    case 'COURIER':
      return '/entregador'
    default:
      return '/entrar'
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [courier, setCourier] = useState<Courier | null>(null)
  const [loading, setLoading] = useState(true)
  const mounted = useRef(true)
  /** verdadeiro enquanto a identidade vem do aparelho, por falta de rede */
  const offlineIdentity = useRef(false)

  const loadContext = useCallback(async (current: Session | null) => {
    if (!current?.user) {
      setProfile(null); setCourier(null); return
    }
    const { data: prof, error } = await supabase
      .from('profiles').select('*').eq('id', current.user.id).maybeSingle()
    if (!mounted.current) return
    // Sem rede, o entregador continua com a identidade confirmada da última vez.
    const remembered = isTransportFailure(error) ? recallIdentity(current.user.id) : null
    if (remembered) {
      offlineIdentity.current = true
      setProfile(remembered.profile); setCourier(remembered.courier)
      return
    }
    offlineIdentity.current = false
    setProfile((prof as Profile) ?? null)

    if ((prof as Profile | null)?.role === 'COURIER') {
      const { data: c, error: courierError } = await supabase
        .from('couriers').select('*').eq('profile_id', current.user.id).maybeSingle()
      if (!mounted.current) return
      const fallback = isTransportFailure(courierError) ? recallIdentity(current.user.id) : null
      if (fallback) {
        setCourier(fallback.courier)
      } else {
        setCourier((c as Courier) ?? null)
        if (!courierError) rememberIdentity(prof as Profile, (c as Courier) ?? null)
      }
    } else {
      setCourier(null)
    }
  }, [])

  useEffect(() => {
    mounted.current = true

    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!mounted.current) return
      // Sessão vencida e sem rede para renovar: o entregador reabre o aplicativo
      // com a sessão guardada, que volta a valer quando a conexão retornar.
      const current = data.session ?? (isTransportFailure(error) ? storedSession() : null)
      if (!data.session && current) offlineIdentity.current = true
      setSession(current)
      await loadContext(current)
      if (mounted.current) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      // enquanto a identidade vem do aparelho, só uma saída de verdade a encerra
      if (!next && event !== 'SIGNED_OUT' && offlineIdentity.current) return
      setSession(next)
      void loadContext(next)
    })

    return () => { mounted.current = false; sub.subscription.unsubscribe() }
  }, [loadContext])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      const msg = /invalid login credentials/i.test(error.message)
        ? 'E-mail ou senha incorretos.'
        : /email not confirmed/i.test(error.message)
          ? 'E-mail ainda não confirmado. Fale com o administrador.'
          : error.message
      throw new Error(msg)
    }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    offlineIdentity.current = false
    forgetIdentity()
    setProfile(null); setCourier(null); setSession(null)
  }, [])

  /**
   * Pede o link de redefinição. O Supabase não informa se o e-mail existe —
   * e isso é proposital: responder "e-mail não cadastrado" permitiria a
   * qualquer pessoa descobrir quem tem conta na plataforma.
   */
  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/nova-senha`,
    })
    // erro de limite de envio é útil saber; "usuário não encontrado" é ignorado
    if (error && !/user not found/i.test(error.message)) {
      const msg = /rate limit|too many/i.test(error.message)
        ? 'Muitos pedidos em pouco tempo. Aguarde alguns minutos e tente novamente.'
        : error.message
      throw new Error(msg)
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    await loadContext(data.session)
  }, [loadContext])

  /**
   * Conclui a recuperação. O link do e-mail cria uma sessão temporária, então
   * `updateUser` funciona aqui sem precisar da senha antiga.
   */
  const completePasswordReset = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw new Error(error.message)
    // O trigger no Auth confirma a troca real e libera a exigência no perfil.
    await refreshProfile()
  }, [refreshProfile])


  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw new Error(error.message)
    // Não permitir que uma chamada REST ao perfil simule troca de senha.
    await refreshProfile()
  }, [refreshProfile])

  const value = useMemo<AuthState>(() => ({
    session,
    user: session?.user ?? null,
    profile,
    courier,
    loading,
    configured: isSupabaseConfigured,
    signIn,
    signOut,
    refreshProfile,
    updatePassword,
    requestPasswordReset,
    completePasswordReset,
    homeRoute: homeRouteFor(profile?.role),
  }), [
    session, profile, courier, loading, signIn, signOut, refreshProfile, updatePassword,
    requestPasswordReset, completePasswordReset,
  ])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
