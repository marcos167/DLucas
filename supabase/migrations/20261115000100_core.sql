-- =====================================================================
-- D'Luca Connect — 01 · Núcleo: empresas, unidades, pessoas, entregadores
-- =====================================================================
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

create schema if not exists app;

-- ------------------------------------------------------------------
-- Enums
-- ------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('SUPER_ADMIN','ADMIN','DISPATCHER','FINANCE','PHARMACY_ADMIN','PHARMACY_STAFF','COURIER');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.pharmacy_status as enum ('PROSPECT','ACTIVE','INACTIVE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.courier_status as enum ('PENDING','ACTIVE','SUSPENDED','REJECTED','INACTIVE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.courier_availability as enum ('AVAILABLE','ON_DELIVERY','OFFLINE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.lead_type as enum ('QUOTE','BUSINESS','COURIER');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.lead_status as enum ('NEW','CONTACTED','QUALIFIED','WON','LOST');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------------
-- updated_at helper
-- ------------------------------------------------------------------
create or replace function app.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ------------------------------------------------------------------
-- Profiles (1:1 com auth.users)
-- ------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  phone text,
  role public.user_role not null default 'PHARMACY_STAFF',
  pharmacy_id uuid,
  is_active boolean not null default true,
  must_change_password boolean not null default false,
  last_seen_at timestamptz,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_pharmacy_idx on public.profiles(pharmacy_id);
create index if not exists profiles_role_idx on public.profiles(role);

-- ------------------------------------------------------------------
-- Farmácias (clientes)
-- ------------------------------------------------------------------
create table if not exists public.pharmacies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  trade_name text not null,
  cnpj text,
  status public.pharmacy_status not null default 'ACTIVE',
  email text,
  phone text,
  whatsapp text,
  contact_name text,
  billing_email text,
  billing_notes text,
  -- endereço sede
  zip_code text,
  street text,
  number text,
  complement text,
  district text,
  city text,
  state text,
  latitude double precision,
  longitude double precision,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pharmacies_status_idx on public.pharmacies(status);
create unique index if not exists pharmacies_cnpj_key on public.pharmacies(cnpj) where cnpj is not null;

alter table public.profiles
  drop constraint if exists profiles_pharmacy_fk;
alter table public.profiles
  add constraint profiles_pharmacy_fk foreign key (pharmacy_id) references public.pharmacies(id) on delete set null;

-- ------------------------------------------------------------------
-- Unidades / filiais
-- ------------------------------------------------------------------
create table if not exists public.pharmacy_units (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  code text,
  name text not null,
  phone text,
  contact_name text,
  zip_code text,
  street text not null,
  number text,
  complement text,
  district text,
  city text not null,
  state text not null,
  latitude double precision,
  longitude double precision,
  pickup_instructions text,
  is_active boolean not null default true,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists units_pharmacy_idx on public.pharmacy_units(pharmacy_id);

-- ------------------------------------------------------------------
-- Entregadores
-- ------------------------------------------------------------------
create table if not exists public.couriers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  full_name text not null,
  cpf text,
  birth_date date,
  phone text not null,
  email text,
  cnh_number text,
  cnh_category text,
  vehicle_type text not null default 'MOTORCYCLE',
  vehicle_plate text,
  -- região de atuação
  base_city text,
  base_state text,
  service_zone text,
  status public.courier_status not null default 'PENDING',
  availability public.courier_availability not null default 'OFFLINE',
  -- última posição conhecida (somente quando o entregador autoriza)
  current_latitude double precision,
  current_longitude double precision,
  current_location_at timestamptz,
  location_sharing_enabled boolean not null default false,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists couriers_status_idx on public.couriers(status, availability);
create index if not exists couriers_zone_idx on public.couriers(base_city);

-- ------------------------------------------------------------------
-- Candidaturas de entregadores (público, via site)
-- ------------------------------------------------------------------
create table if not exists public.courier_applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  email text,
  cpf text,
  birth_date date,
  city text,
  state text,
  service_zone text,
  has_motorcycle boolean not null default false,
  vehicle_plate text,
  cnh_category text,
  experience text,
  message text,
  status public.lead_status not null default 'NEW',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- Leads comerciais (orçamentos + novas empresas)
-- ------------------------------------------------------------------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  type public.lead_type not null default 'QUOTE',
  name text not null,
  company_name text,
  cnpj text,
  email text not null,
  phone text not null,
  city text,
  state text,
  units_count integer,
  deliveries_per_day integer,
  message text,
  status public.lead_status not null default 'NEW',
  assigned_to uuid references public.profiles(id) on delete set null,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_status_idx on public.leads(status, type);

-- ------------------------------------------------------------------
-- Auditoria
-- ------------------------------------------------------------------
create table if not exists public.audit_logs (
  id bigserial primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_email text,
  actor_role public.user_role,
  action text not null,
  entity text not null,
  entity_id text,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_created_idx on public.audit_logs(created_at desc);
create index if not exists audit_entity_idx on public.audit_logs(entity, entity_id);

-- ------------------------------------------------------------------
-- Configurações gerais (chave/valor)
-- ------------------------------------------------------------------
create table if not exists public.settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  description text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- Notificações internas
-- ------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text,
  link text,
  kind text not null default 'INFO',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications(user_id, read_at);

-- ------------------------------------------------------------------
-- Triggers updated_at
-- ------------------------------------------------------------------
do $$ declare t text;
begin
  foreach t in array array['profiles','pharmacies','pharmacy_units','couriers','leads']
  loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format('create trigger touch_%1$s before update on public.%1$s for each row execute function app.touch_updated_at()', t);
  end loop;
end $$;

-- ------------------------------------------------------------------
-- Perfil automático ao criar usuário no Auth
-- ------------------------------------------------------------------
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_role public.user_role;
begin
  v_role := coalesce(
    (new.raw_user_meta_data->>'role')::public.user_role,
    'PHARMACY_STAFF'::public.user_role
  );
  insert into public.profiles (id, email, full_name, phone, role, pharmacy_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone',
    v_role,
    nullif(new.raw_user_meta_data->>'pharmacy_id','')::uuid
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function app.handle_new_user();
