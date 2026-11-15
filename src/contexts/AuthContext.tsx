import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
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

  const loadContext = useCallback(async (current: Session | null) => {
    if (!current?.user) {
      setProfile(null); setCourier(null); return
    }
    const { data: prof } = await supabase
      .from('profiles').select('*').eq('id', current.user.id).maybeSingle()
    if (!mounted.current) return
    setProfile((prof as Profile) ?? null)

    if ((prof as Profile | null)?.role === 'COURIER') {
      const { data: c } = await supabase
        .from('couriers').select('*').eq('profile_id', current.user.id).maybeSingle()
      if (mounted.current) setCourier((c as Courier) ?? null)
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

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted.current) return
      setSession(data.session)
      await loadContext(data.session)
      if (mounted.current) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
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
    setProfile(null); setCourier(null); setSession(null)
  }, [])

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    await loadContext(data.session)
  }, [loadContext])

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw new Error(error.message)
    if (profile?.id) {
      await supabase.from('profiles').update({ must_change_password: false }).eq('id', profile.id)
    }
    await refreshProfile()
  }, [profile?.id, refreshProfile])

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
    homeRoute: homeRouteFor(profile?.role),
  }), [session, profile, courier, loading, signIn, signOut, refreshProfile, updatePassword])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
