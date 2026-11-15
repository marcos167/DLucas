-- =====================================================================
-- D'Luca Connect — 02 · Operação: pedidos, despacho, rastreamento
-- =====================================================================

do $$ begin
  create type public.order_status as enum (
    'DRAFT',            -- rascunho (farmácia ainda editando)
    'PENDING',          -- aguardando despacho
    'OFFERED',          -- oferta enviada a entregador(es)
    'ASSIGNED',         -- entregador definido
    'ACCEPTED',         -- entregador aceitou
    'PICKING_UP',       -- a caminho da coleta
    'COLLECTED',        -- coletado na farmácia
    'IN_TRANSIT',       -- em rota para o destino
    'DELIVERED',        -- entregue
    'FAILED',           -- tentativa falhou
    'CANCELLED'         -- cancelado
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_priority as enum ('NORMAL','HIGH','URGENT');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.assignment_method as enum ('MANUAL','AUTO_SUGGESTION','REASSIGNMENT');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.offer_status as enum ('PENDING','ACCEPTED','DECLINED','EXPIRED','CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.occurrence_type as enum (
    'RECIPIENT_ABSENT','WRONG_ADDRESS','DAMAGED_PACKAGE','REFUSED','DELAY','ACCIDENT','OTHER'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.occurrence_status as enum ('OPEN','IN_REVIEW','RESOLVED','CANCELLED');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------------
-- Pedidos
-- ------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  pharmacy_id uuid not null references public.pharmacies(id) on delete restrict,
  unit_id uuid not null references public.pharmacy_units(id) on delete restrict,
  created_by uuid references public.profiles(id) on delete set null,
  status public.order_status not null default 'PENDING',
  priority public.order_priority not null default 'NORMAL',

  -- coleta
  pickup_zip_code text,
  pickup_street text not null,
  pickup_number text,
  pickup_complement text,
  pickup_district text,
  pickup_city text not null,
  pickup_state text not null,
  pickup_latitude double precision,
  pickup_longitude double precision,
  pickup_instructions text,

  -- destino
  recipient_name text not null,
  recipient_phone text not null,
  recipient_document text,
  delivery_zip_code text,
  delivery_street text not null,
  delivery_number text,
  delivery_complement text,
  delivery_district text,
  delivery_city text not null,
  delivery_state text not null,
  delivery_latitude double precision,
  delivery_longitude double precision,
  delivery_instructions text,

  -- carga
  package_count integer not null default 1 check (package_count > 0),
  package_description text,
  is_temperature_controlled boolean not null default false,
  requires_proof boolean not null default true,
  scheduled_for timestamptz,

  -- valores (snapshot do contrato no momento do pedido)
  quoted_price_cents integer not null default 0 check (quoted_price_cents >= 0),
  courier_payout_cents integer not null default 0 check (courier_payout_cents >= 0),
  contract_id uuid,

  -- operação
  courier_id uuid references public.couriers(id) on delete set null,
  assigned_at timestamptz,
  accepted_at timestamptz,
  collected_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  estimated_distance_km numeric(8,2),
  dispatch_notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_pharmacy_idx on public.orders(pharmacy_id, created_at desc);
create index if not exists orders_status_idx on public.orders(status, created_at desc);
create index if not exists orders_courier_idx on public.orders(courier_id, status);
create index if not exists orders_unit_idx on public.orders(unit_id);

-- ------------------------------------------------------------------
-- Sequência de código do pedido
-- ------------------------------------------------------------------
create sequence if not exists public.order_code_seq start 1001;

create or replace function app.set_order_code()
returns trigger language plpgsql as $$
begin
  if new.code is null or new.code = '' then
    new.code := 'DLC-' || to_char(now(), 'YYMM') || '-' || lpad(nextval('public.order_code_seq')::text, 5, '0');
  end if;
  return new;
end $$;

drop trigger if exists set_order_code on public.orders;
create trigger set_order_code before insert on public.orders
for each row execute function app.set_order_code();

-- ------------------------------------------------------------------
-- Eventos do pedido (timeline + histórico de alterações)
-- ------------------------------------------------------------------
create table if not exists public.order_events (
  id bigserial primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  status public.order_status,
  event text not null,
  description text,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role public.user_role,
  latitude double precision,
  longitude double precision,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists order_events_order_idx on public.order_events(order_id, created_at desc);

-- ------------------------------------------------------------------
-- Posições GPS (somente gravadas com consentimento do entregador)
-- ------------------------------------------------------------------
create table if not exists public.courier_locations (
  id bigserial primary key,
  courier_id uuid not null references public.couriers(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_m double precision,
  heading double precision,
  speed_mps double precision,
  recorded_at timestamptz not null default now()
);

create index if not exists courier_locations_courier_idx on public.courier_locations(courier_id, recorded_at desc);
create index if not exists courier_locations_order_idx on public.courier_locations(order_id, recorded_at desc);

-- ------------------------------------------------------------------
-- Ofertas de entrega
-- ------------------------------------------------------------------
create table if not exists public.delivery_offers (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  courier_id uuid not null references public.couriers(id) on delete cascade,
  status public.offer_status not null default 'PENDING',
  method public.assignment_method not null default 'MANUAL',
  score numeric(6,2),
  distance_to_pickup_km numeric(8,2),
  message text,
  expires_at timestamptz,
  responded_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists offers_unique_pending
  on public.delivery_offers(order_id, courier_id) where status = 'PENDING';
create index if not exists offers_courier_idx on public.delivery_offers(courier_id, status);

-- ------------------------------------------------------------------
-- Histórico de atribuições
-- ------------------------------------------------------------------
create table if not exists public.order_assignments (
  id bigserial primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  courier_id uuid references public.couriers(id) on delete set null,
  previous_courier_id uuid references public.couriers(id) on delete set null,
  method public.assignment_method not null,
  reason text,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists assignments_order_idx on public.order_assignments(order_id, created_at desc);

-- ------------------------------------------------------------------
-- Ocorrências
-- ------------------------------------------------------------------
create table if not exists public.occurrences (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  courier_id uuid references public.couriers(id) on delete set null,
  pharmacy_id uuid references public.pharmacies(id) on delete set null,
  type public.occurrence_type not null default 'OTHER',
  status public.occurrence_status not null default 'OPEN',
  description text not null,
  reported_by uuid references public.profiles(id) on delete set null,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolution text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists occurrences_status_idx on public.occurrences(status, created_at desc);

-- ------------------------------------------------------------------
-- Comprovantes (Supabase Storage)
-- ------------------------------------------------------------------
create table if not exists public.proofs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  kind text not null default 'DELIVERY', -- PICKUP | DELIVERY | SIGNATURE | OTHER
  storage_path text not null,
  file_name text,
  mime_type text,
  size_bytes bigint,
  recipient_name text,
  notes text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists proofs_order_idx on public.proofs(order_id);

-- ------------------------------------------------------------------
-- Triggers updated_at
-- ------------------------------------------------------------------
drop trigger if exists touch_orders on public.orders;
create trigger touch_orders before update on public.orders
for each row execute function app.touch_updated_at();

drop trigger if exists touch_occurrences on public.occurrences;
create trigger touch_occurrences before update on public.occurrences
for each row execute function app.touch_updated_at();

-- ------------------------------------------------------------------
-- Timeline automática
-- ------------------------------------------------------------------
create or replace function app.log_order_status_change()
returns trigger language plpgsql security definer set search_path = public, app as $$
declare v_actor uuid;
begin
  if tg_op = 'INSERT' then
    insert into public.order_events(order_id, status, event, description, actor_id)
    values (new.id, new.status, 'ORDER_CREATED', 'Pedido criado', new.created_by);
    return new;
  end if;

  if new.status is distinct from old.status then
    v_actor := coalesce(auth.uid(), new.created_by);
    insert into public.order_events(order_id, status, event, actor_id)
    values (new.id, new.status, 'STATUS_CHANGED', v_actor);
  end if;

  if new.courier_id is distinct from old.courier_id then
    insert into public.order_assignments(order_id, courier_id, previous_courier_id, method, actor_id)
    values (new.id, new.courier_id, old.courier_id, 'MANUAL', auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists log_order_changes on public.orders;
create trigger log_order_changes after insert or update on public.orders
for each row execute function app.log_order_status_change();

-- ------------------------------------------------------------------
-- Disponibilidade do entregador acompanha o status do pedido
-- ------------------------------------------------------------------
create or replace function app.sync_courier_availability()
returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  if new.courier_id is null then return new; end if;
  if new.status in ('ACCEPTED','PICKING_UP','COLLECTED','IN_TRANSIT') then
    update public.couriers set availability = 'ON_DELIVERY' where id = new.courier_id;
  elsif new.status in ('DELIVERED','FAILED','CANCELLED') then
    update public.couriers set availability = 'AVAILABLE'
      where id = new.courier_id and availability = 'ON_DELIVERY';
  end if;
  return new;
end $$;

drop trigger if exists sync_courier_availability on public.orders;
create trigger sync_courier_availability after update of status on public.orders
for each row execute function app.sync_courier_availability();
