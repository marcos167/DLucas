import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

/**
 * Banco em memória com o esquema completo das migrações, preparado como um
 * projeto Supabase: papéis `anon`/`authenticated`/`service_role`, `auth.uid()`
 * lido do token, RLS ativa e — ponto importante — os privilégios padrão do
 * Supabase, em que toda tabela e função nova nasce liberada para `anon` e
 * `authenticated`. É isso que torna os testes de permissão significativos:
 * a migração precisa fechar o acesso por conta própria.
 *
 * As únicas simulações são os schemas geridos pelo Supabase (auth/storage) e
 * a publicação Realtime. A 006 altera colunas internas do GoTrue e não
 * participa dos fluxos sob teste.
 */

const BASE = [
  '20261115000100_core.sql', '20261115000200_operations.sql', '20261115000300_finance.sql',
  '20261115000400_security.sql', '20261115000500_offers.sql',
]
const HARDENING = [
  '20261115123622_authorization_hardening_007.sql',
  '20261115123630_direct_assignment_acceptance_008.sql',
  '20261115123637_offer_acceptance_contention_009.sql',
]
export const LOGISTICS_MIGRATION = '20261115150000_logistics_micro_routes_010.sql'

function migrationSql(filename: string): string {
  const sql = readFileSync(resolve('supabase/migrations', filename), 'utf8')
  // As extensões não fazem parte do runtime WASM; gen_random_uuid já é nativa.
  return filename.includes('_core.sql') ? sql.replace(/^create extension if not exists .*?;\s*$/gm, '') : sql
}

export async function bootSupabaseDatabase(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table auth.users(
      id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb,
      encrypted_password text
    );
    create schema storage;
    create table storage.buckets(
      id text primary key, name text, public boolean, file_size_limit int, allowed_mime_types text[]
    );
    create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    create publication supabase_realtime;
  `)
  for (const file of BASE) await db.exec(migrationSql(file))
  // A instância efetiva protege também pharmacy_id na policy self (o arquivo
  // 004 não o faz); reproduz apenas essa divergência conhecida.
  await db.exec(`
    drop policy profiles_update_self on public.profiles;
    create policy profiles_update_self on public.profiles for update using (id = auth.uid())
    with check (id = auth.uid() and role = app.current_role() and
      pharmacy_id is not distinct from (select p.pharmacy_id from profiles p where p.id = auth.uid()));
    grant usage on schema public, app, auth to authenticated;
    grant usage on schema public to anon;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant usage on all sequences in schema public to authenticated;
    grant execute on all functions in schema auth to authenticated, anon;
    grant usage on schema storage to authenticated, anon;
    grant select, insert, update, delete on storage.objects to authenticated;
  `)
  for (const file of HARDENING) await db.exec(migrationSql(file))
  // Privilégios padrão de um projeto Supabase para objetos criados daqui em diante.
  await db.exec(`
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  `)
  await db.exec(migrationSql(LOGISTICS_MIGRATION))
  await db.exec(migrationSql(LOGISTICS_MIGRATION)) // reaplicar não pode falhar nem mudar nada
  return db
}
