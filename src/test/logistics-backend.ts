import type { PGlite } from '@electric-sql/pglite'
import { bootSupabaseDatabase } from './pglite-supabase'
import { createSupabaseEmulator, type SupabaseEmulator } from './supabase-emulator'

/**
 * Banco e API locais para os testes do módulo de distribuição.
 *
 * Este módulo não importa nada de `src/lib`: ele é carregado de dentro do
 * `vi.mock('@/lib/supabase')`, antes de o código da aplicação existir.
 */

export const USERS = {
  admin: 'a0000000-0000-4000-8000-000000000001',
  dispatcher: 'a0000000-0000-4000-8000-000000000002',
  finance: 'a0000000-0000-4000-8000-000000000003',
  pharmacy: 'a0000000-0000-4000-8000-000000000004',
  riderA: 'a0000000-0000-4000-8000-00000000000a',
  riderB: 'a0000000-0000-4000-8000-00000000000b',
} as const

export const COURIERS = {
  a: 'c0000000-0000-4000-8000-00000000000a',
  b: 'c0000000-0000-4000-8000-00000000000b',
  /** ativo, sem login no aplicativo */
  c: 'c0000000-0000-4000-8000-00000000000c',
  suspended: 'c0000000-0000-4000-8000-00000000000d',
} as const

export const PHARMACY = 'f0000000-0000-4000-8000-000000000001'

interface Backend {
  db: PGlite | null
  emulator: SupabaseEmulator | null
  /** usuário das próximas requisições; `null` é visitante (anon) */
  user: string | null
  /** `false` simula o aparelho sem rede */
  online: boolean
}

export const backend: Backend = { db: null, emulator: null, user: null, online: true }

/** `fetch` entregue ao cliente Supabase dos testes. */
export const backendFetch: typeof fetch = (input, init) => {
  if (!backend.online) return Promise.reject(new TypeError('Failed to fetch'))
  if (!backend.emulator) return Promise.reject(new Error('Banco de teste não iniciado'))
  return backend.emulator.fetch(input, init)
}

export async function startBackend(): Promise<PGlite> {
  const db = await bootSupabaseDatabase()
  await db.exec(`
    insert into auth.users(id, email, encrypted_password) values
      ('${USERS.admin}', 'admin@teste.local', 'x'),
      ('${USERS.dispatcher}', 'despacho@teste.local', 'x'),
      ('${USERS.finance}', 'financeiro@teste.local', 'x'),
      ('${USERS.pharmacy}', 'farmacia@teste.local', 'x'),
      ('${USERS.riderA}', 'ana@teste.local', 'x'),
      ('${USERS.riderB}', 'bruno@teste.local', 'x');
    insert into pharmacies(id, legal_name, trade_name) values ('${PHARMACY}', 'Farmácia Teste', 'Farmácia Teste');
    update profiles set role = 'ADMIN', full_name = 'Admin Teste' where id = '${USERS.admin}';
    update profiles set role = 'DISPATCHER', full_name = 'Despacho Teste' where id = '${USERS.dispatcher}';
    update profiles set role = 'FINANCE', full_name = 'Financeiro Teste' where id = '${USERS.finance}';
    update profiles set role = 'PHARMACY_ADMIN', pharmacy_id = '${PHARMACY}' where id = '${USERS.pharmacy}';
    update profiles set role = 'COURIER' where id in ('${USERS.riderA}', '${USERS.riderB}');
    insert into couriers(id, profile_id, full_name, phone, status, availability) values
      ('${COURIERS.a}', '${USERS.riderA}', 'Ana Rota', '11900000001', 'ACTIVE', 'AVAILABLE'),
      ('${COURIERS.b}', '${USERS.riderB}', 'Bruno Rota', '11900000002', 'ACTIVE', 'AVAILABLE'),
      ('${COURIERS.c}', null, 'Carla Rota', '11900000003', 'ACTIVE', 'OFFLINE'),
      ('${COURIERS.suspended}', null, 'Davi Suspenso', '11900000004', 'SUSPENDED', 'OFFLINE');
  `)
  backend.db = db
  backend.emulator = createSupabaseEmulator(db, { userFromRequest: () => backend.user })
  backend.user = null
  backend.online = true
  return db
}

export async function stopBackend(): Promise<void> {
  await backend.db?.close()
  backend.db = null
  backend.emulator = null
}

/** Executa a ação como o usuário indicado (as requisições saem com o token dele). */
export async function as<T>(userId: string | null, action: () => Promise<T>): Promise<T> {
  const previous = backend.user
  backend.user = userId
  try {
    return await action()
  } finally {
    backend.user = previous
  }
}
