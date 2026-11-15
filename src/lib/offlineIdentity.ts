import type { Session } from '@supabase/supabase-js'
import type { Courier, Profile } from '@/types'

/**
 * Identidade do entregador guardada no aparelho.
 *
 * Sem internet não dá para consultar o perfil nem renovar a sessão. Para o
 * entregador conseguir reabrir o aplicativo no meio da rota, guardamos quem
 * ele é (perfil e cadastro) na última vez em que o servidor confirmou.
 *
 * Isto não concede acesso a nada: toda leitura e gravação continua sendo
 * autorizada pelo servidor com a sessão real. Offline, o aplicativo só mostra
 * a cópia do dia que já estava neste aparelho.
 */

const IDENTITY_KEY = 'dluca-connect-identity'
const SESSION_KEY = 'dluca-connect-auth'

interface StoredIdentity {
  userId: string
  profile: Profile
  courier: Courier | null
  savedAt: string
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : null
  } catch {
    return null
  }
}

export function rememberIdentity(profile: Profile, courier: Courier | null): void {
  if (profile.role !== 'COURIER') return
  try {
    const value: StoredIdentity = { userId: profile.id, profile, courier, savedAt: new Date().toISOString() }
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(value))
  } catch {
    // armazenamento cheio ou bloqueado: o aplicativo segue funcionando online
  }
}

export function recallIdentity(userId: string | null | undefined): { profile: Profile; courier: Courier | null } | null {
  const stored = read<StoredIdentity>(IDENTITY_KEY)
  if (!stored || !userId || stored.userId !== userId || !stored.profile?.is_active) return null
  return { profile: stored.profile, courier: stored.courier }
}

export function forgetIdentity(): void {
  try { localStorage.removeItem(IDENTITY_KEY) } catch { /* nada a limpar */ }
}

/**
 * Sessão que ficou guardada quando a renovação falhou por falta de rede.
 * Só é devolvida se houver uma identidade de entregador para o mesmo usuário.
 */
export function storedSession(): Session | null {
  const session = read<Session>(SESSION_KEY)
  if (!session?.user?.id || !session.refresh_token) return null
  return recallIdentity(session.user.id) ? session : null
}

/** Falha de transporte (sem rede, DNS, tempo esgotado), e não uma recusa do servidor. */
export function isTransportFailure(error: unknown): boolean {
  if (!error) return false
  const { name, message, code, status } = error as { name?: string; message?: string; code?: string; status?: number }
  if (name === 'AuthRetryableFetchError') return true
  if (code || (typeof status === 'number' && status > 0)) return false
  return /failed to fetch|networkerror|load failed|fetch failed|network request failed|timeout|aborted/i.test(message ?? '')
}
