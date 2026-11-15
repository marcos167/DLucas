-- =====================================================================
-- DLucas Express · 010 · Micro-rotas por funcionário com distribuição por CEP
-- =====================================================================
-- Migração aditiva: não altera pedidos, contas nem dados existentes.
--
--   1. Cobertura territorial: regiões, faixas de CEP e responsável
--   2. Lotes diários, pacotes e responsável atual por pacote
--   3. Roteiros, paradas (um endereço, vários pacotes) e histórico
--   4. Leituras, tentativas de entrega, comprovantes e conferência
--   5. RLS: o entregador só enxerga o que é dele, e nenhuma tabela
--      deste módulo carrega valor financeiro
--
-- "Funcionário" é o cadastro já existente em public.couriers: mesma
-- identidade, mesmo login e mesmas regras de acesso do restante da
-- plataforma. Toda mutação operacional passa por função transacional.

-- ------------------------------------------------------------------
-- Auxiliares puros (sem acesso a dados)
-- ------------------------------------------------------------------
create or replace function app.only_digits(p text)
returns text language sql immutable as $$
  select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g');
$$;

-- CEP válido tem 8 dígitos; qualquer outra coisa vira NULL e é tratada
-- como exceção na distribuição, nunca "adivinhada" pelo banco.
create or replace function app.normalize_zip(p text)
returns text language sql immutable as $$
  select case when length(app.only_digits(p)) = 8 then app.only_digits(p) end;
$$;

create or replace function app.safe_int(p text)
returns integer language sql immutable as $$
  select case when p ~ '^[0-9]{1,9}$' then p::integer end;
$$;

-- Não depende do locale do servidor: acentos são trocados explicitamente.
create or replace function app.normalize_text(p text)
returns text language sql immutable as $$
  select btrim(regexp_replace(lower(translate(coalesce(p, ''),
    'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')), '[^a-z0-9]+', ' ', 'g'));
$$;

-- Chave do endereço físico: CEP + logradouro + número. Complemento fica de
-- fora de propósito: dois apartamentos do mesmo prédio são uma parada só.
create or replace function app.address_key(p_zip text, p_street text, p_number text)
returns text language sql immutable as $$
  select coalesce(app.normalize_zip(p_zip), '00000000') || '|' ||
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    regexp_replace(regexp_replace(regexp_replace(app.normalize_text(p_street),
      '^r ', 'rua '),
      '^(av|avda) ', 'avenida '),
      '^(al|alam) ', 'alameda '),
      '^(tv|trav) ', 'travessa '),
      '^(estr|est) ', 'estrada '),
      '^(pc|pca) ', 'praca '),
      '^rod ', 'rodovia ')
    || '|' || coalesce(nullif(replace(app.normalize_text(p_number), ' ', ''), ''), 'sn');
$$;

-- Prefixo comum dos CEPs de um roteiro (rótulo "027xx").
create or replace function app.common_zip_prefix(p_zips text[])
returns text language plpgsql immutable as $$
declare
  v_first text;
  v_len integer := 5;
  v_zip text;
begin
  select min(z) into v_first from unnest(p_zips) z where z is not null;
  if v_first is null then return null; end if;
  foreach v_zip in array p_zips loop
    continue when v_zip is null;
    while v_len > 0 and left(v_zip, v_len) <> left(v_first, v_len) loop
      v_len := v_len - 1;
    end loop;
  end loop;
  return nullif(left(v_first, v_len), '');
end $$;

-- O relógio do aparelho informa quando o fato ocorreu (necessário para o
-- trabalho sem internet), mas nunca no futuro nem em um passado absurdo.
create or replace function app.clamp_event_time(p timestamptz)
returns timestamptz language sql stable as $$
  select case when p is null then now()
              when p > now() + interval '5 minutes' then now()
              when p < now() - interval '14 days' then now()
              else p end;
$$;

-- Equipe que opera a distribuição (o financeiro consulta, mas não altera).
create or replace function app.is_dispatch_staff()
returns boolean language sql stable security definer set search_path = public, app as $$
  select coalesce((select is_active and role in ('SUPER_ADMIN','ADMIN','DISPATCHER')
                   from public.profiles where id = auth.uid()), false);
$$;

-- ------------------------------------------------------------------
-- Funcionário: limite diário configurável (NULL = usa o padrão)
-- ------------------------------------------------------------------
alter table public.couriers
  add column if not exists daily_package_limit integer;

do $$ begin
  alter table public.couriers add constraint couriers_daily_package_limit_check
    check (daily_package_limit is null or daily_package_limit > 0);
exception when duplicate_object then null; end $$;

-- O cadastro de entregadores já pode ser editado por toda a equipe; o limite
-- diário, que decide a distribuição, fica restrito a quem opera a distribuição.
create or replace function app.guard_courier_limit()
returns trigger language plpgsql set search_path = public, app as $$
begin
  if current_user <> 'authenticated' or app.is_dispatch_staff() then return new; end if;
  if (tg_op = 'INSERT' and new.daily_package_limit is not null)
     or (tg_op = 'UPDATE' and new.daily_package_limit is distinct from old.daily_package_limit) then
    raise exception 'Limite diário: ação restrita à equipe de distribuição' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_courier_limit on public.couriers;
create trigger guard_courier_limit before insert or update on public.couriers
  for each row execute function app.guard_courier_limit();

-- ------------------------------------------------------------------
-- Cobertura: regiões e faixas de CEP
-- ------------------------------------------------------------------
create table if not exists public.postal_code_regions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  description text,
  color text not null default '#0f766e',
  -- responsável padrão da região; uma faixa pode sobrescrever
  courier_id uuid references public.couriers(id) on delete set null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists postal_code_regions_name_key
  on public.postal_code_regions (lower(btrim(name)));
create index if not exists postal_code_regions_courier_idx
  on public.postal_code_regions (courier_id);

create table if not exists public.postal_code_assignments (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.postal_code_regions(id) on delete cascade,
  courier_id uuid references public.couriers(id) on delete set null,
  zip_start integer not null check (zip_start between 0 and 99999999),
  zip_end integer not null check (zip_end between 0 and 99999999),
  priority integer not null default 0,
  is_active boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint postal_code_assignments_range_check check (zip_start <= zip_end),
  constraint postal_code_assignments_unique_range unique (region_id, zip_start, zip_end)
);
create index if not exists postal_code_assignments_range_idx
  on public.postal_code_assignments (zip_start, zip_end) where is_active;
create index if not exists postal_code_assignments_courier_idx
  on public.postal_code_assignments (courier_id);

-- ------------------------------------------------------------------
-- Lotes diários de distribuição
-- ------------------------------------------------------------------
create sequence if not exists public.distribution_batch_seq start 1;

create table if not exists public.distribution_batches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  -- data local da operação, sempre informada por quem cria (o servidor é UTC)
  batch_date date not null,
  name text,
  status text not null default 'OPEN' check (status in ('OPEN','CLOSED','CANCELLED')),
  notes text,
  -- limite por funcionário válido só para este lote ("por operação")
  package_limit_override integer check (package_limit_override is null or package_limit_override > 0),
  created_by uuid references public.profiles(id) on delete set null,
  closed_by uuid references public.profiles(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists distribution_batches_date_idx
  on public.distribution_batches (batch_date desc, created_at desc);

-- ------------------------------------------------------------------
-- Pacotes (uma etiqueta = um pacote). Sem colunas financeiras.
-- ------------------------------------------------------------------
create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.distribution_batches(id) on delete restrict,
  tracking_code text not null check (btrim(tracking_code) <> ''),
  external_ref text,
  manifest_ref text,
  pharmacy_id uuid references public.pharmacies(id) on delete set null,
  sender_name text,
  recipient_name text not null,
  recipient_phone text,
  recipient_document text,
  zip_code text check (zip_code is null or zip_code ~ '^[0-9]{8}$'),
  zip_raw text,
  street text not null,
  number text,
  complement text,
  district text,
  city text,
  state text,
  delivery_instructions text,
  latitude double precision check (latitude is null or abs(latitude) <= 90),
  longitude double precision check (longitude is null or abs(longitude) <= 180),
  geocode_source text,
  is_temperature_controlled boolean not null default false,
  address_key text generated always as (app.address_key(zip_code, street, number)) stored,
  status text not null default 'RECEIVED' check (status in (
    'RECEIVED',   -- importado, aguardando distribuição
    'EXCEPTION',  -- precisa de decisão do supervisor
    'ASSIGNED',   -- tem responsável, ainda sem roteiro
    'ROUTED',     -- está em um roteiro
    'LOADED',     -- conferido na saída
    'DELIVERED',
    'FAILED',     -- tentativa sem sucesso, ainda com o entregador
    'RETURNED',   -- conferido no retorno à central
    'CANCELLED')),
  exception_reason text check (exception_reason is null or exception_reason in (
    'INVALID_ZIP','NO_COVERAGE','NO_COURIER','COURIER_UNAVAILABLE','OVER_CAPACITY','MANUAL_REVIEW')),
  exception_detail text,
  -- cópia do responsável atual (a fonte é package_assignments)
  courier_id uuid references public.couriers(id) on delete set null,
  attempt_count integer not null default 0,
  delivered_at timestamptz,
  import_line integer,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Uma etiqueta só existe uma vez na operação; cancelar libera o código.
create unique index if not exists packages_tracking_code_key
  on public.packages (upper(btrim(tracking_code))) where status <> 'CANCELLED';
create index if not exists packages_batch_status_idx on public.packages (batch_id, status);
create index if not exists packages_courier_idx on public.packages (courier_id, batch_id, status);
create index if not exists packages_zip_idx on public.packages (zip_code);
create index if not exists packages_address_key_idx on public.packages (address_key);

-- ------------------------------------------------------------------
-- Responsável atual por pacote (histórico completo de trocas)
-- ------------------------------------------------------------------
create table if not exists public.package_assignments (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages(id) on delete cascade,
  batch_id uuid not null references public.distribution_batches(id) on delete cascade,
  courier_id uuid not null references public.couriers(id) on delete restrict,
  method text not null check (method in ('AUTO_CEP','MANUAL','TRANSFER')),
  region_id uuid references public.postal_code_regions(id) on delete set null,
  postal_assignment_id uuid references public.postal_code_assignments(id) on delete set null,
  reason text,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text
);
-- Garantia de banco: um pacote nunca tem dois responsáveis ao mesmo tempo.
create unique index if not exists package_assignments_current_key
  on public.package_assignments (package_id) where ended_at is null;
create index if not exists package_assignments_courier_idx
  on public.package_assignments (courier_id, batch_id) where ended_at is null;

-- ------------------------------------------------------------------
-- Roteiros, paradas e pacotes por parada
-- ------------------------------------------------------------------
create table if not exists public.delivery_routes (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.distribution_batches(id) on delete cascade,
  courier_id uuid not null references public.couriers(id) on delete restrict,
  route_date date not null,
  sequence integer not null check (sequence > 0),
  status text not null default 'DRAFT' check (status in (
    'DRAFT','RELEASED','IN_PROGRESS','COMPLETED','CANCELLED')),
  origin text not null default 'AUTO' check (origin in ('AUTO','MANUAL','TRANSFER')),
  zip_prefix text,
  stop_count integer not null default 0,
  package_count integer not null default 0,
  planned_distance_m integer,
  planned_duration_s integer,
  released_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  transferred_from uuid references public.couriers(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists delivery_routes_sequence_key
  on public.delivery_routes (batch_id, courier_id, sequence) where status <> 'CANCELLED';
create index if not exists delivery_routes_courier_date_idx
  on public.delivery_routes (courier_id, route_date, status);
create index if not exists delivery_routes_batch_idx
  on public.delivery_routes (batch_id, status);

create table if not exists public.route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.delivery_routes(id) on delete cascade,
  sequence integer not null check (sequence > 0),
  -- posição no planejamento original; reordenar não apaga este registro
  planned_sequence integer not null,
  address_key text not null,
  zip_code text,
  street text not null,
  number text,
  district text,
  city text,
  state text,
  latitude double precision,
  longitude double precision,
  leg_distance_m integer,
  leg_duration_s integer,
  status text not null default 'PENDING' check (status in ('PENDING','COMPLETED','PARTIAL','FAILED')),
  package_count integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- o mesmo endereço aparece uma única vez dentro de um roteiro
  constraint route_stops_address_key unique (route_id, address_key),
  constraint route_stops_sequence_key unique (route_id, sequence) deferrable initially deferred
);

create table if not exists public.route_packages (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.delivery_routes(id) on delete cascade,
  stop_id uuid not null references public.route_stops(id) on delete cascade,
  package_id uuid not null references public.packages(id) on delete cascade,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  release_reason text
);
-- Garantia de banco: um pacote nunca está em dois roteiros ativos.
create unique index if not exists route_packages_active_key
  on public.route_packages (package_id) where released_at is null;
create index if not exists route_packages_route_idx on public.route_packages (route_id);
create index if not exists route_packages_stop_idx on public.route_packages (stop_id);

create table if not exists public.route_events (
  id bigserial primary key,
  route_id uuid references public.delivery_routes(id) on delete cascade,
  batch_id uuid references public.distribution_batches(id) on delete cascade,
  courier_id uuid references public.couriers(id) on delete set null,
  package_id uuid references public.packages(id) on delete set null,
  event text not null,
  description text,
  actor_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists route_events_route_idx on public.route_events (route_id, created_at desc);
create index if not exists route_events_batch_idx on public.route_events (batch_id, created_at desc);

create table if not exists public.route_optimization_logs (
  id bigserial primary key,
  batch_id uuid references public.distribution_batches(id) on delete cascade,
  courier_id uuid references public.couriers(id) on delete set null,
  route_id uuid references public.delivery_routes(id) on delete set null,
  scope text not null check (scope in ('COURIER_DAY','ROUTE')),
  algorithm text not null,
  provider text not null,
  fallback_used boolean not null default false,
  params jsonb not null default '{}'::jsonb,
  stop_count integer,
  package_count integer,
  route_count integer,
  total_distance_m integer,
  total_duration_s integer,
  previous_plan jsonb,
  new_plan jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists route_optimization_logs_batch_idx
  on public.route_optimization_logs (batch_id, courier_id, created_at desc);

-- ------------------------------------------------------------------
-- Conferência de saída e retorno, leituras, tentativas e comprovantes
-- ------------------------------------------------------------------
create table if not exists public.loading_manifests (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.distribution_batches(id) on delete cascade,
  courier_id uuid not null references public.couriers(id) on delete restrict,
  trip_number integer not null default 1 check (trip_number > 0),
  status text not null default 'OPEN' check (status in ('OPEN','DEPARTED','CLOSED')),
  opened_by uuid references public.profiles(id) on delete set null,
  opened_at timestamptz not null default now(),
  departed_at timestamptz,
  closed_by uuid references public.profiles(id) on delete set null,
  closed_at timestamptz,
  loaded_count integer not null default 0,
  delivered_count integer not null default 0,
  returned_count integer not null default 0,
  transferred_count integer not null default 0,
  open_count integer not null default 0,
  divergence_note text,
  constraint loading_manifests_trip_key unique (batch_id, courier_id, trip_number)
);
-- Uma conferência em aberto por funcionário em cada lote.
create unique index if not exists loading_manifests_active_key
  on public.loading_manifests (batch_id, courier_id) where status <> 'CLOSED';

create table if not exists public.package_scans (
  -- o identificador nasce no aparelho: repetir o envio não duplica a leitura
  id uuid primary key default gen_random_uuid(),
  package_id uuid references public.packages(id) on delete set null,
  batch_id uuid references public.distribution_batches(id) on delete set null,
  courier_id uuid references public.couriers(id) on delete set null,
  manifest_id uuid references public.loading_manifests(id) on delete set null,
  scan_type text not null check (scan_type in ('LOAD','RETURN','TRANSFER','CHECK')),
  result text not null check (result in ('OK','UNKNOWN_CODE','NOT_ASSIGNED','WRONG_STATUS','DUPLICATE')),
  scanned_code text not null,
  detail text,
  scanned_by uuid references public.profiles(id) on delete set null,
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  latitude double precision,
  longitude double precision
);
create unique index if not exists package_scans_manifest_once
  on public.package_scans (manifest_id, package_id, scan_type)
  where result = 'OK' and manifest_id is not null;
create index if not exists package_scans_package_idx on public.package_scans (package_id, occurred_at desc);
create index if not exists package_scans_courier_idx on public.package_scans (courier_id, occurred_at desc);

create table if not exists public.delivery_attempts (
  -- identificador gerado no aparelho (idempotência da sincronização)
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages(id) on delete cascade,
  route_id uuid references public.delivery_routes(id) on delete set null,
  stop_id uuid references public.route_stops(id) on delete set null,
  batch_id uuid references public.distribution_batches(id) on delete set null,
  courier_id uuid not null references public.couriers(id) on delete restrict,
  outcome text not null check (outcome in ('DELIVERED','FAILED')),
  failure_reason public.occurrence_type,
  notes text,
  recipient_name text,
  recipient_document text,
  latitude double precision,
  longitude double precision,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  -- CONFLICT: o registro do campo foi guardado, mas não alterou o pacote
  sync_status text not null default 'APPLIED' check (sync_status in ('APPLIED','CONFLICT','DISCARDED')),
  conflict_reason text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  registered_by uuid references public.profiles(id) on delete set null,
  constraint delivery_attempts_reason_check check (outcome = 'DELIVERED' or failure_reason is not null)
);
create index if not exists delivery_attempts_package_idx on public.delivery_attempts (package_id, occurred_at desc);
create index if not exists delivery_attempts_courier_idx on public.delivery_attempts (courier_id, occurred_at desc);
create index if not exists delivery_attempts_route_idx on public.delivery_attempts (route_id);
create index if not exists delivery_attempts_conflict_idx
  on public.delivery_attempts (batch_id) where sync_status = 'CONFLICT';

create table if not exists public.delivery_proofs (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.delivery_attempts(id) on delete cascade,
  package_id uuid not null references public.packages(id) on delete cascade,
  courier_id uuid not null references public.couriers(id) on delete restrict,
  kind text not null default 'PHOTO' check (kind in ('PHOTO','SIGNATURE','DOCUMENT')),
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint delivery_proofs_attempt_path_key unique (attempt_id, storage_path)
);
create index if not exists delivery_proofs_package_idx on public.delivery_proofs (package_id);
create index if not exists delivery_proofs_path_idx on public.delivery_proofs (storage_path);

-- Ocorrências passam a poder apontar para um pacote ou roteiro.
alter table public.occurrences
  add column if not exists package_id uuid references public.packages(id) on delete cascade,
  add column if not exists route_id uuid references public.delivery_routes(id) on delete set null;
create index if not exists occurrences_package_idx on public.occurrences (package_id);

-- ------------------------------------------------------------------
-- Itens de cada conferência: o que saiu e que fim levou
-- ------------------------------------------------------------------
create or replace view public.manifest_items with (security_invoker = true) as
select
  s.manifest_id,
  s.package_id,
  s.courier_id,
  p.tracking_code,
  p.recipient_name,
  p.status as package_status,
  s.occurred_at as loaded_at,
  case
    when exists (select 1 from public.package_scans r
                  where r.manifest_id = s.manifest_id and r.package_id = s.package_id
                    and r.scan_type = 'RETURN' and r.result = 'OK') then 'RETURNED'
    when exists (select 1 from public.package_scans t
                  where t.manifest_id = s.manifest_id and t.package_id = s.package_id
                    and t.scan_type = 'TRANSFER' and t.result = 'OK') then 'TRANSFERRED'
    when p.status = 'DELIVERED' then 'DELIVERED'
    else 'OPEN'
  end as outcome
from public.package_scans s
join public.packages p on p.id = s.package_id
where s.scan_type = 'LOAD' and s.result = 'OK' and s.manifest_id is not null;

-- ------------------------------------------------------------------
-- Parâmetros operacionais (o limite de 49 é um padrão, não uma trava)
-- ------------------------------------------------------------------
insert into public.settings (key, value, description)
values ('distribution', jsonb_build_object(
    'default_daily_package_limit', 49,
    'vehicle_limits', jsonb_build_object(),
    'stops_per_route', 2,
    'packages_per_route', 4,
    'max_leg_km', 1.5,
    'service_minutes_per_stop', 4,
    'require_loading_scan', true,
    'hub', null),
  'Parâmetros da distribuição por CEP e dos roteiros')
on conflict (key) do nothing;

-- ------------------------------------------------------------------
-- Funções internas (schema app, não expostas pela API)
-- ------------------------------------------------------------------
create or replace function app.distribution_settings()
returns jsonb language sql stable security definer set search_path = public, app as $$
  select coalesce((select value from public.settings where key = 'distribution'), '{}'::jsonb);
$$;

-- Regra vencedora para um CEP: a faixa mais específica; no empate, a de
-- maior prioridade. O responsável da faixa sobrescreve o da região.
create or replace function app.match_postal_code(p_zip text)
returns table (assignment_id uuid, region_id uuid, courier_id uuid)
language sql stable security definer set search_path = public, app as $$
  select a.id, a.region_id, coalesce(a.courier_id, r.courier_id)
    from public.postal_code_assignments a
    join public.postal_code_regions r on r.id = a.region_id and r.is_active
   where a.is_active
     and app.normalize_zip(p_zip) is not null
     and app.normalize_zip(p_zip)::integer between a.zip_start and a.zip_end
   order by (a.zip_end - a.zip_start), a.priority desc, a.created_at desc, a.id
   limit 1;
$$;

-- Limite efetivo: funcionário > veículo > lote (operação) > padrão geral.
create or replace function app.courier_package_limit(p_courier_id uuid, p_batch_id uuid)
returns integer language sql stable security definer set search_path = public, app as $$
  select coalesce(
    c.daily_package_limit,
    app.safe_int(app.distribution_settings()->'vehicle_limits'->>c.vehicle_type),
    (select b.package_limit_override from public.distribution_batches b where b.id = p_batch_id),
    app.safe_int(app.distribution_settings()->>'default_daily_package_limit'),
    49)
  from public.couriers c where c.id = p_courier_id;
$$;

create or replace function app.courier_batch_load(p_courier_id uuid, p_batch_id uuid)
returns integer language sql stable security definer set search_path = public, app as $$
  select count(*)::integer from public.packages
   where courier_id = p_courier_id and batch_id = p_batch_id and status <> 'CANCELLED';
$$;

-- Troca o responsável atual. O índice único parcial em package_assignments
-- impede dois responsáveis simultâneos mesmo sob concorrência.
create or replace function app.assign_package(
  p_package_id uuid, p_courier_id uuid, p_method text,
  p_region_id uuid, p_rule_id uuid, p_reason text
) returns void language plpgsql security definer set search_path = public, app as $$
begin
  update public.package_assignments
     set ended_at = now(), end_reason = p_method
   where package_id = p_package_id and ended_at is null;
  insert into public.package_assignments (
    package_id, batch_id, courier_id, method, region_id, postal_assignment_id, reason, assigned_by)
  select p.id, p.batch_id, p_courier_id, p_method, p_region_id, p_rule_id, p_reason, auth.uid()
    from public.packages p where p.id = p_package_id;
  update public.packages
     set courier_id = p_courier_id,
         status = case when status in ('RECEIVED','EXCEPTION') then 'ASSIGNED' else status end,
         exception_reason = null,
         exception_detail = null,
         updated_at = now()
   where id = p_package_id;
end $$;

create or replace function app.refresh_stop(p_stop_id uuid)
returns void language plpgsql security definer set search_path = public, app as $$
declare
  v_total integer;
  v_done integer;
  v_failed integer;
  v_status text;
  v_last timestamptz;
begin
  if p_stop_id is null then return; end if;
  select count(*), count(*) filter (where p.status = 'DELIVERED'),
         count(*) filter (where p.status in ('FAILED','RETURNED'))
    into v_total, v_done, v_failed
    from public.route_packages rp
    join public.packages p on p.id = rp.package_id
   where rp.stop_id = p_stop_id and rp.released_at is null;
  v_status := case when v_total = 0 or v_done = v_total then 'COMPLETED'
                   when v_failed = v_total then 'FAILED'
                   when v_done + v_failed = v_total then 'PARTIAL'
                   else 'PENDING' end;
  select max(occurred_at) into v_last from public.delivery_attempts
   where stop_id = p_stop_id and sync_status = 'APPLIED';
  update public.route_stops
     set status = v_status,
         package_count = v_total,
         completed_at = case when v_status = 'PENDING' then null else coalesce(v_last, now()) end,
         updated_at = now()
   where id = p_stop_id;
end $$;

-- Recalcula totais e encerra o roteiro quando não resta parada pendente.
create or replace function app.refresh_route(p_route_id uuid)
returns void language plpgsql security definer set search_path = public, app as $$
declare
  v_status text;
  v_total integer;
  v_pending integer;
  v_packages integer;
  v_last timestamptz;
  v_zip text;
begin
  select status into v_status from public.delivery_routes where id = p_route_id for update;
  if not found then return; end if;
  select count(*), count(*) filter (where status = 'PENDING') into v_total, v_pending
    from public.route_stops where route_id = p_route_id;
  if v_total = 0 then
    if v_status = 'DRAFT' then
      delete from public.delivery_routes where id = p_route_id;
    elsif v_status in ('RELEASED','IN_PROGRESS') then
      update public.delivery_routes
         set status = 'CANCELLED', cancelled_at = now(), stop_count = 0, package_count = 0, updated_at = now()
       where id = p_route_id;
    end if;
    return;
  end if;
  select count(*) into v_packages from public.route_packages
   where route_id = p_route_id and released_at is null;
  select max(occurred_at) into v_last from public.delivery_attempts
   where route_id = p_route_id and sync_status = 'APPLIED';
  select app.common_zip_prefix(array_agg(zip_code)) into v_zip
    from public.route_stops where route_id = p_route_id;
  update public.delivery_routes
     set stop_count = v_total,
         package_count = v_packages,
         zip_prefix = v_zip,
         status = case when status = 'IN_PROGRESS' and v_pending = 0 then 'COMPLETED'
                       when status = 'COMPLETED' and v_pending > 0 then 'IN_PROGRESS'
                       else status end,
         completed_at = case when status in ('IN_PROGRESS','COMPLETED') and v_pending = 0
                             then coalesce(completed_at, v_last, now()) else null end,
         updated_at = now()
   where id = p_route_id;
end $$;

-- Tira o pacote do roteiro em que está (rascunho apaga; liberado preserva
-- o vínculo encerrado para histórico).
create or replace function app.unroute_package(p_package_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, app as $$
declare
  v_link record;
  v_route_status text;
begin
  select rp.id, rp.route_id, rp.stop_id into v_link
    from public.route_packages rp
   where rp.package_id = p_package_id and rp.released_at is null;
  if not found then return; end if;
  select status into v_route_status from public.delivery_routes where id = v_link.route_id;
  if v_route_status = 'DRAFT' then
    delete from public.route_packages where id = v_link.id;
  else
    update public.route_packages
       set released_at = now(), release_reason = p_reason
     where id = v_link.id;
  end if;
  update public.packages set status = 'ASSIGNED', updated_at = now()
   where id = p_package_id and status = 'ROUTED';
  if not exists (select 1 from public.route_packages
                  where stop_id = v_link.stop_id and released_at is null)
     and not exists (select 1 from public.delivery_attempts where stop_id = v_link.stop_id) then
    delete from public.route_stops where id = v_link.stop_id;
  else
    perform app.refresh_stop(v_link.stop_id);
  end if;
  perform app.refresh_route(v_link.route_id);
end $$;

-- Passagem de custódia: se o pacote já saiu com alguém, a conferência de
-- quem entrega registra a transferência e o novo responsável confere de novo.
create or replace function app.handover_package(p_package_id uuid, p_to_courier uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, app as $$
declare
  v_pkg public.packages%rowtype;
  v_manifest uuid;
begin
  select * into v_pkg from public.packages where id = p_package_id for update;
  if not found then return; end if;
  if v_pkg.status = 'LOADED' then
    select s.manifest_id into v_manifest
      from public.package_scans s
      join public.loading_manifests m on m.id = s.manifest_id and m.status <> 'CLOSED'
     where s.package_id = p_package_id and s.scan_type = 'LOAD' and s.result = 'OK'
     order by s.occurred_at desc
     limit 1;
    insert into public.package_scans (
      package_id, batch_id, courier_id, manifest_id, scan_type, result, scanned_code, detail, scanned_by)
    values (p_package_id, v_pkg.batch_id, v_pkg.courier_id, v_manifest, 'TRANSFER', 'OK',
            v_pkg.tracking_code, p_reason, auth.uid());
    update public.packages set status = 'ROUTED', updated_at = now() where id = p_package_id;
  end if;
  perform app.assign_package(p_package_id, p_to_courier, 'TRANSFER', null, null, p_reason);
end $$;

-- Aplica uma tentativa ao pacote, à parada e ao roteiro. É o único lugar
-- que dá baixa, tanto no envio normal quanto ao aceitar um conflito.
create or replace function app.apply_attempt(p_attempt_id uuid)
returns void language plpgsql security definer set search_path = public, app as $$
declare
  v_a public.delivery_attempts%rowtype;
  v_code text;
begin
  select * into v_a from public.delivery_attempts where id = p_attempt_id;
  if not found then return; end if;
  select tracking_code into v_code from public.packages where id = v_a.package_id for update;
  update public.delivery_routes
     set status = 'IN_PROGRESS', started_at = coalesce(started_at, v_a.occurred_at), updated_at = now()
   where id = v_a.route_id and status = 'RELEASED';
  if v_a.outcome = 'DELIVERED' then
    update public.packages
       set status = 'DELIVERED', delivered_at = v_a.occurred_at,
           attempt_count = attempt_count + 1, updated_at = now()
     where id = v_a.package_id;
  else
    update public.packages
       set status = 'FAILED', attempt_count = attempt_count + 1, updated_at = now()
     where id = v_a.package_id;
    insert into public.occurrences (courier_id, package_id, route_id, type, description, reported_by)
    values (v_a.courier_id, v_a.package_id, v_a.route_id, v_a.failure_reason,
            'Pacote ' || v_code || ': '
              || coalesce(nullif(btrim(v_a.notes), ''), 'tentativa de entrega sem sucesso'),
            auth.uid());
  end if;
  perform app.refresh_stop(v_a.stop_id);
  perform app.refresh_route(v_a.route_id);
  insert into public.route_events (route_id, batch_id, courier_id, package_id, event, description, actor_id, metadata)
  values (v_a.route_id, v_a.batch_id, v_a.courier_id, v_a.package_id,
          case when v_a.outcome = 'DELIVERED' then 'PACKAGE_DELIVERED' else 'DELIVERY_FAILED' end,
          'Pacote ' || v_code, auth.uid(),
          jsonb_build_object('attempt_id', v_a.id, 'occurred_at', v_a.occurred_at,
                             'failure_reason', v_a.failure_reason));
end $$;

-- ------------------------------------------------------------------
-- Triggers: código do lote, proteção de colunas e auditoria
-- ------------------------------------------------------------------
create or replace function app.set_batch_code()
returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  new.code := 'LT-' || to_char(new.batch_date, 'YYMMDD') || '-'
              || lpad(nextval('public.distribution_batch_seq')::text, 4, '0');
  return new;
end $$;
drop trigger if exists set_batch_code on public.distribution_batches;
create trigger set_batch_code before insert on public.distribution_batches
  for each row execute function app.set_batch_code();

-- RLS decide quem altera o lote; o trigger decide o que pode mudar.
create or replace function app.guard_batch_write()
returns trigger language plpgsql set search_path = public, app as $$
begin
  if current_user <> 'authenticated' then return new; end if;
  if not app.is_dispatch_staff() then
    raise exception 'Lote: ação restrita à equipe de distribuição' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.status := 'OPEN';
    new.created_by := auth.uid();
    new.closed_by := null;
    new.closed_at := null;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  if (to_jsonb(new) - array['name','notes','package_limit_override','status','closed_by','closed_at','updated_at'])
     is distinct from
     (to_jsonb(old) - array['name','notes','package_limit_override','status','closed_by','closed_at','updated_at']) then
    raise exception 'Lote: campos protegidos' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if old.status = 'CANCELLED' then
      raise exception 'Lote cancelado não pode ser reaberto' using errcode = 'P0001';
    end if;
    if new.status = 'CANCELLED' and exists (
         select 1 from public.packages where batch_id = old.id and status <> 'CANCELLED') then
      raise exception 'Cancele os pacotes antes de cancelar o lote' using errcode = 'P0001';
    end if;
    new.closed_at := case when new.status = 'CLOSED' then now() end;
    new.closed_by := case when new.status = 'CLOSED' then auth.uid() end;
  else
    new.closed_at := old.closed_at;
    new.closed_by := old.closed_by;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists guard_batch_write on public.distribution_batches;
create trigger guard_batch_write before insert or update on public.distribution_batches
  for each row execute function app.guard_batch_write();

-- A equipe corrige endereço e contato direto na tabela; situação, responsável,
-- lote e código só mudam pelas funções transacionais. address_key é coluna
-- gerada e ainda não foi recalculada neste ponto, por isso fica fora da comparação.
create or replace function app.guard_package_update()
returns trigger language plpgsql set search_path = public, app as $$
declare
  v_allowed text[] := array[
    'recipient_name','recipient_phone','recipient_document','zip_code','zip_raw','street','number',
    'complement','district','city','state','delivery_instructions','latitude','longitude',
    'geocode_source','is_temperature_controlled','external_ref','manifest_ref','sender_name',
    'pharmacy_id','address_key','updated_at'];
begin
  if current_user <> 'authenticated' then return new; end if;
  if not app.is_dispatch_staff() then
    raise exception 'Pacote: ação restrita à equipe de distribuição' using errcode = '42501';
  end if;
  if (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
    raise exception 'Pacote: campos protegidos' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists guard_package_update on public.packages;
create trigger guard_package_update before update on public.packages
  for each row execute function app.guard_package_update();

-- Ocorrência só pode apontar para pacote ou roteiro de quem a registra.
create or replace function app.guard_occurrence_links()
returns trigger language plpgsql set search_path = public, app as $$
begin
  if current_user <> 'authenticated' or app.is_staff() then return new; end if;
  if new.package_id is not null and not exists (
       select 1 from public.packages p
        where p.id = new.package_id and p.courier_id = app.current_courier_id()) then
    raise exception 'Ocorrência: pacote de outro responsável' using errcode = '42501';
  end if;
  if new.route_id is not null and not exists (
       select 1 from public.delivery_routes r
        where r.id = new.route_id and r.courier_id = app.current_courier_id()) then
    raise exception 'Ocorrência: roteiro de outro responsável' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_occurrence_links on public.occurrences;
create trigger guard_occurrence_links before insert or update on public.occurrences
  for each row execute function app.guard_occurrence_links();

create or replace function app.set_created_by()
returns trigger language plpgsql set search_path = public, app as $$
begin
  if current_user = 'authenticated' then
    new.created_by := auth.uid();
    new.created_at := now();
    new.updated_at := now();
  end if;
  return new;
end $$;

create or replace function app.audit_row_change()
returns trigger language plpgsql security definer set search_path = public, app as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_logs (actor_id, actor_email, actor_role, action, entity, entity_id, description, metadata)
  select auth.uid(), p.email, p.role, tg_op, tg_table_name, v_row->>'id',
         tg_op || ' em ' || tg_table_name,
         jsonb_build_object(
           'old', case when tg_op <> 'INSERT' then to_jsonb(old) end,
           'new', case when tg_op <> 'DELETE' then to_jsonb(new) end)
    from (select 1) one
    left join public.profiles p on p.id = auth.uid();
  return coalesce(new, old);
end $$;

do $$ declare t text;
begin
  foreach t in array array['postal_code_regions','postal_code_assignments'] loop
    execute format('drop trigger if exists set_created_by on public.%1$I', t);
    execute format('create trigger set_created_by before insert on public.%1$I
                      for each row execute function app.set_created_by()', t);
  end loop;
  foreach t in array array['postal_code_regions','postal_code_assignments','distribution_batches'] loop
    execute format('drop trigger if exists audit_row_change on public.%1$I', t);
    execute format('create trigger audit_row_change after insert or update or delete on public.%1$I
                      for each row execute function app.audit_row_change()', t);
  end loop;
  foreach t in array array['postal_code_regions','postal_code_assignments','delivery_routes','route_stops'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$I', t);
    execute format('create trigger touch_%1$s before update on public.%1$I
                      for each row execute function app.touch_updated_at()', t);
  end loop;
end $$;

-- ------------------------------------------------------------------
-- A. Distribuidor por CEP
-- ------------------------------------------------------------------
create or replace function public.resolve_postal_code(p_zip text)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare
  v_zip text := app.normalize_zip(p_zip);
  v_match record;
begin
  if not app.is_staff() then
    raise exception 'Acesso restrito à equipe' using errcode = '42501';
  end if;
  if v_zip is null then
    return jsonb_build_object('zip', p_zip, 'valid', false, 'matched', false);
  end if;
  select m.assignment_id, m.region_id, m.courier_id, r.name as region_name, r.color,
         a.zip_start, a.zip_end, c.full_name as courier_name, c.status::text as courier_status
    into v_match
    from app.match_postal_code(v_zip) m
    join public.postal_code_regions r on r.id = m.region_id
    join public.postal_code_assignments a on a.id = m.assignment_id
    left join public.couriers c on c.id = m.courier_id;
  if not found then
    return jsonb_build_object('zip', v_zip, 'valid', true, 'matched', false);
  end if;
  return jsonb_build_object(
    'zip', v_zip, 'valid', true, 'matched', true,
    'assignment_id', v_match.assignment_id, 'region_id', v_match.region_id,
    'region_name', v_match.region_name, 'color', v_match.color,
    'zip_start', v_match.zip_start, 'zip_end', v_match.zip_end,
    'courier_id', v_match.courier_id, 'courier_name', v_match.courier_name,
    'courier_status', v_match.courier_status);
end $$;

-- Importação de um romaneio. Códigos repetidos são devolvidos, nunca
-- sobrescritos; a validação fina do arquivo acontece antes, na tela.
create or replace function public.import_packages(p_batch_id uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare
  v_status text;
  v_row jsonb;
  v_line integer := 0;
  v_code text;
  v_lat double precision;
  v_lng double precision;
  v_rows integer;
  v_inserted integer := 0;
  v_duplicates jsonb := '[]'::jsonb;
  v_invalid jsonb := '[]'::jsonb;
begin
  if not app.is_dispatch_staff() then
    raise exception 'Importação restrita à equipe de distribuição' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Lista de pacotes inválida' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'Importe no máximo 5000 pacotes por vez' using errcode = 'P0001';
  end if;
  select status into v_status from public.distribution_batches where id = p_batch_id for update;
  if not found or v_status <> 'OPEN' then
    raise exception 'Lote indisponível para importação' using errcode = 'P0001';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_line := v_line + 1;
    v_code := upper(btrim(coalesce(v_row->>'tracking_code', '')));
    if v_code = '' or length(v_code) > 64
       or btrim(coalesce(v_row->>'recipient_name', '')) = ''
       or btrim(coalesce(v_row->>'street', '')) = '' then
      v_invalid := v_invalid || jsonb_build_object(
        'line', coalesce(app.safe_int(v_row->>'line'), v_line), 'tracking_code', v_code);
      continue;
    end if;
    v_lat := case when v_row->>'latitude' ~ '^-?[0-9]{1,2}(\.[0-9]+)?$' then (v_row->>'latitude')::double precision end;
    v_lng := case when v_row->>'longitude' ~ '^-?[0-9]{1,3}(\.[0-9]+)?$' then (v_row->>'longitude')::double precision end;
    if v_lat is null or v_lng is null or abs(v_lat) > 90 or abs(v_lng) > 180 then
      v_lat := null;
      v_lng := null;
    end if;
    insert into public.packages (
      batch_id, tracking_code, external_ref, manifest_ref, sender_name,
      recipient_name, recipient_phone, recipient_document,
      zip_code, zip_raw, street, number, complement, district, city, state,
      delivery_instructions, latitude, longitude, geocode_source,
      is_temperature_controlled, import_line, created_by)
    values (
      p_batch_id, v_code,
      nullif(btrim(v_row->>'external_ref'), ''), nullif(btrim(v_row->>'manifest_ref'), ''),
      nullif(btrim(v_row->>'sender_name'), ''),
      left(btrim(v_row->>'recipient_name'), 200),
      nullif(btrim(v_row->>'recipient_phone'), ''), nullif(btrim(v_row->>'recipient_document'), ''),
      app.normalize_zip(v_row->>'zip_code'), nullif(btrim(v_row->>'zip_code'), ''),
      left(btrim(v_row->>'street'), 200),
      nullif(btrim(v_row->>'number'), ''), nullif(btrim(v_row->>'complement'), ''),
      nullif(btrim(v_row->>'district'), ''), nullif(btrim(v_row->>'city'), ''),
      nullif(upper(btrim(v_row->>'state')), ''),
      nullif(btrim(v_row->>'delivery_instructions'), ''),
      v_lat, v_lng, case when v_lat is not null then 'IMPORT' end,
      coalesce(v_row->>'is_temperature_controlled', 'false') in ('true', 't', '1'),
      coalesce(app.safe_int(v_row->>'line'), v_line), auth.uid())
    on conflict (upper(btrim(tracking_code))) where status <> 'CANCELLED' do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 1 then
      v_inserted := v_inserted + 1;
    else
      v_duplicates := v_duplicates || to_jsonb(v_code);
    end if;
  end loop;

  perform app.audit('IMPORT', 'distribution_batch', p_batch_id::text,
    'Importou ' || v_inserted || ' pacote(s)',
    jsonb_build_object('inserted', v_inserted,
                       'duplicates', jsonb_array_length(v_duplicates),
                       'invalid', jsonb_array_length(v_invalid)));
  return jsonb_build_object('inserted', v_inserted, 'duplicates', v_duplicates, 'invalid', v_invalid);
end $$;

-- Distribuição automática. Reprocessa também as exceções automáticas, de
-- modo que corrigir a cobertura e distribuir de novo resolve as pendências.
-- O que foi marcado para revisão manual não é tocado.
create or replace function public.distribute_batch(p_batch_id uuid)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare
  v_status text;
  v_pkg record;
  v_match record;
  v_courier public.couriers%rowtype;
  v_limit integer;
  v_load integer;
  v_reason text;
  v_detail text;
  v_processed integer := 0;
  v_assigned integer := 0;
  v_exceptions jsonb := '{}'::jsonb;
begin
  if not app.is_dispatch_staff() then
    raise exception 'Distribuição restrita à equipe de distribuição' using errcode = '42501';
  end if;
  -- dois cliques simultâneos no mesmo lote são executados um depois do outro
  perform pg_advisory_xact_lock(hashtextextended('distribution:' || p_batch_id::text, 0));
  select status into v_status from public.distribution_batches where id = p_batch_id;
  if not found or v_status <> 'OPEN' then
    raise exception 'Lote indisponível para distribuição' using errcode = 'P0001';
  end if;

  for v_pkg in
    select id, zip_code from public.packages
     where batch_id = p_batch_id
       and (status = 'RECEIVED'
            or (status = 'EXCEPTION' and exception_reason is distinct from 'MANUAL_REVIEW'))
     order by zip_code nulls last, tracking_code
       for update
  loop
    v_processed := v_processed + 1;
    v_reason := null;
    v_detail := null;
    v_match := null;
    if v_pkg.zip_code is null then
      v_reason := 'INVALID_ZIP';
    else
      select * into v_match from app.match_postal_code(v_pkg.zip_code);
      if not found then
        v_reason := 'NO_COVERAGE';
      elsif v_match.courier_id is null then
        v_reason := 'NO_COURIER';
      else
        select * into v_courier from public.couriers where id = v_match.courier_id;
        if v_courier.status <> 'ACTIVE' then
          v_reason := 'COURIER_UNAVAILABLE';
          v_detail := v_courier.full_name;
        else
          v_limit := app.courier_package_limit(v_courier.id, p_batch_id);
          v_load := app.courier_batch_load(v_courier.id, p_batch_id);
          if v_load >= v_limit then
            v_reason := 'OVER_CAPACITY';
            v_detail := v_courier.full_name || ': ' || v_load || ' de ' || v_limit;
          end if;
        end if;
      end if;
    end if;

    if v_reason is null then
      perform app.assign_package(v_pkg.id, v_match.courier_id, 'AUTO_CEP',
                                 v_match.region_id, v_match.assignment_id, null);
      v_assigned := v_assigned + 1;
    else
      update public.packages
         set status = 'EXCEPTION', exception_reason = v_reason, exception_detail = v_detail,
             updated_at = now()
       where id = v_pkg.id;
      v_exceptions := jsonb_set(v_exceptions, array[v_reason],
        to_jsonb(coalesce((v_exceptions->>v_reason)::integer, 0) + 1));
    end if;
  end loop;

  perform app.audit('DISTRIBUTE', 'distribution_batch', p_batch_id::text,
    'Distribuiu ' || v_assigned || ' de ' || v_processed || ' pacote(s) por CEP',
    jsonb_build_object('assigned', v_assigned, 'exceptions', v_exceptions));
  return jsonb_build_object('processed', v_processed, 'assigned', v_assigned, 'exceptions', v_exceptions);
end $$;

-- Atribuição manual pelo supervisor (exceções e remanejamentos). Pode passar
-- do limite: o limite é parâmetro operacional, e o retorno avisa do excesso.
create or replace function public.assign_packages(p_package_ids uuid[], p_courier_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare
  v_courier public.couriers%rowtype;
  v_pkg record;
  v_assigned integer := 0;
  v_skipped integer := 0;
  v_batch uuid;
begin
  if not app.is_dispatch_staff() then
    raise exception 'Atribuição restrita à equipe de distribuição' using errcode = '42501';
  end if;
  select * into v_courier from public.couriers where id = p_courier_id;
  if not found or v_courier.status <> 'ACTIVE' then
    raise exception 'Funcionário indisponível para receber pacotes' using errcode = 'P0001';
  end if;
  for v_pkg in
    select p.id, p.status, p.batch_id, p.courier_id from public.packages p
     where p.id = any(p_package_ids) order by p.tracking_code for update
  loop
    -- Pacote devolvido à central pode ser reprogramado, inclusive para a mesma
    -- pessoa: sai do roteiro antigo e volta a aguardar roteiro.
    if v_pkg.status not in ('RECEIVED','EXCEPTION','ASSIGNED','ROUTED','RETURNED')
       or (v_pkg.status <> 'RETURNED' and v_pkg.courier_id is not distinct from p_courier_id)
       or (v_pkg.status = 'ROUTED' and exists (
             select 1 from public.route_packages rp
               join public.delivery_routes r on r.id = rp.route_id
              where rp.package_id = v_pkg.id and rp.released_at is null and r.status <> 'DRAFT')) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    perform app.unroute_package(v_pkg.id, 'REASSIGNED');
    if v_pkg.status = 'RETURNED' then
      update public.packages set status = 'ASSIGNED', updated_at = now() where id = v_pkg.id;
    end if;
    perform app.assign_package(v_pkg.id, p_courier_id, 'MANUAL', null, null, p_reason);
    v_assigned := v_assigned + 1;
    v_batch := v_pkg.batch_id;
  end loop;
  if v_assigned > 0 then
    perform app.audit('ASSIGN', 'package', null,
      'Atribuiu ' || v_assigned || ' pacote(s) a ' || v_courier.full_name,
      jsonb_build_object('courier_id', p_courier_id, 'reason', p_reason, 'packages', v_assigned));
  end if;
  return jsonb_build_object(
    'assigned', v_assigned, 'skipped', v_skipped,
    'load', case when v_batch is not null then app.courier_batch_load(p_courier_id, v_batch) end,
    'limit', case when v_batch is not null then app.courier_package_limit(p_courier_id, v_batch) end);
end $$;

-- Cancela pacotes que ainda não foram entregues nem estão na rua.
create or replace function public.cancel_packages(p_package_ids uuid[], p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare
  v_pkg record;
  v_cancelled integer := 0;
  v_skipped integer := 0;
begin
  if not app.is_dispatch_staff() then
    raise exception 'Cancelamento restrito à equipe de distribuição' using errcode = '42501';
  end if;
  for v_pkg in
    select id, status from public.packages where id = any(p_package_ids) order by tracking_code for update
  loop
    if v_pkg.status in ('DELIVERED','LOADED','FAILED','CANCELLED') then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    perform app.unroute_package(v_pkg.id, 'PACKAGE_CANCELLED');
    update public.route_packages set released_at = now(), release_reason = 'PACKAGE_CANCELLED'
     where package_id = v_pkg.id and released_at is null;
    update public.package_assignments set ended_at = now(), end_reason = 'CANCELLED'
     where package_id = v_pkg.id and ended_at is null;
    update public.packages
       set status = 'CANCELLED', courier_id = null, exception_reason = null,
           exception_detail = p_reason, updated_at = now()
     where id = v_pkg.id;
    v_cancelled := v_cancelled + 1;
  end loop;
  if v_cancelled > 0 then
    perform app.audit('CANCEL', 'package', null, 'Cancelou ' || v_cancelled || ' pacote(s)',
      jsonb_build_object('reason', p_reason, 'packages', v_cancelled));
  end if;
  return jsonb_build_object('cancelled', v_cancelled, 'skipped', v_skipped);
end $$;

-- Segura pacotes com o supervisor: saem do responsável e do roteiro em
-- rascunho e deixam de entrar na distribuição automática até serem
-- atribuídos à mão ou devolvidos à fila (p_hold = false).
create or replace function public.hold_packages(p_package_ids uuid[], p_hold boolean default true, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare
  v_pkg record;
  v_changed integer := 0;
  v_skipped integer := 0;
begin
  if not app.is_dispatch_staff() then
    raise exception 'Ação restrita à equipe de distribuição' using errcode = '42501';
  end if;
  for v_pkg in
    select id, status, exception_reason from public.packages
     where id = any(p_package_ids) order by tracking_code for update
  loop
    if coalesce(p_hold, true) then
      if v_pkg.status not in ('RECEIVED','EXCEPTION','ASSIGNED','ROUTED','RETURNED')
         or (v_pkg.status = 'EXCEPTION' and v_pkg.exception_reason = 'MANUAL_REVIEW')
         or (v_pkg.status = 'ROUTED' and exists (
               select 1 from public.route_packages rp
                 join public.delivery_routes r on r.id = rp.route_id
                where rp.package_id = v_pkg.id and rp.released_at is null and r.status <> 'DRAFT')) then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      perform app.unroute_package(v_pkg.id, 'HELD');
      update public.package_assignments set ended_at = now(), end_reason = 'HELD'
       where package_id = v_pkg.id and ended_at is null;
      update public.packages
         set status = 'EXCEPTION', exception_reason = 'MANUAL_REVIEW',
             exception_detail = nullif(btrim(p_note), ''), courier_id = null, updated_at = now()
       where id = v_pkg.id;
    else
      if v_pkg.status <> 'EXCEPTION' then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      update public.packages
         set status = 'RECEIVED', exception_reason = null, exception_detail = null, updated_at = now()
       where id = v_pkg.id;
    end if;
    v_changed := v_changed + 1;
  end loop;
  if v_changed > 0 then
    perform app.audit(case when coalesce(p_hold, true) then 'HOLD' else 'UNHOLD' end, 'package', null,
      case when coalesce(p_hold, true) then 'Segurou ' else 'Devolveu à distribuição ' end || v_changed || ' pacote(s)',
      jsonb_build_object('note', p_note, 'packages', v_changed));
  end if;
  return jsonb_build_object('changed', v_changed, 'skipped', v_skipped);
end $$;

-- ------------------------------------------------------------------
-- B. Organizador de roteiros
-- ------------------------------------------------------------------
-- Grava o plano de um funcionário no lote, substituindo apenas os roteiros
-- em rascunho. O agrupamento e a ordem vêm do organizador; aqui o banco
-- garante a integridade: pacote do lote, do funcionário, uma única vez,
-- e cada parada com um endereço só.
create or replace function public.save_route_plan(
  p_batch_id uuid, p_courier_id uuid, p_plan jsonb, p_meta jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = public, app as $$
declare
  v_batch public.distribution_batches%rowtype;
  v_route jsonb;
  v_stop jsonb;
  v_ids uuid[];
  v_route_id uuid;
  v_stop_id uuid;
  v_seq integer;
  v_stop_seq integer;
  v_ok integer;
  v_keys integer;
  v_routes integer := 0;
  v_stops integer := 0;
  v_packages integer := 0;
  v_previous jsonb;
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
begin
  if not app.is_dispatch_staff() then
    raise exception 'Roteirização restrita à equipe de distribuição' using errcode = '42501';
  end if;
  if jsonb_typeof(p_plan) is distinct from 'array' then
    raise exception 'Plano de roteiros inválido' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('routes:' || p_batch_id::text || ':' || p_courier_id::text, 0));
  select * into v_batch from public.distribution_batches where id = p_batch_id;
  if not found or v_batch.status <> 'OPEN' then
    raise exception 'Lote indisponível para roteirização' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.couriers where id = p_courier_id) then
    raise exception 'Funcionário não encontrado' using errcode = 'P0001';
  end if;

  -- o planejamento anterior fica registrado antes de ser substituído
  select coalesce(jsonb_agg(jsonb_build_object(
           'sequence', r.sequence,
           'stops', (select coalesce(jsonb_agg(jsonb_build_object(
                       'address_key', s.address_key,
                       'package_ids', (select coalesce(jsonb_agg(rp.package_id order by rp.package_id), '[]'::jsonb)
                                         from public.route_packages rp
                                        where rp.stop_id = s.id and rp.released_at is null))
                     order by s.sequence), '[]'::jsonb)
                       from public.route_stops s where s.route_id = r.id))
         order by r.sequence), '[]'::jsonb)
    into v_previous
    from public.delivery_routes r
   where r.batch_id = p_batch_id and r.courier_id = p_courier_id and r.status = 'DRAFT';

  update public.packages p
     set status = 'ASSIGNED', updated_at = now()
    from public.route_packages rp
    join public.delivery_routes r on r.id = rp.route_id
   where rp.package_id = p.id and rp.released_at is null
     and r.batch_id = p_batch_id and r.courier_id = p_courier_id and r.status = 'DRAFT'
     and p.status = 'ROUTED';
  delete from public.delivery_routes
   where batch_id = p_batch_id and courier_id = p_courier_id and status = 'DRAFT';

  select coalesce(max(sequence), 0) into v_seq
    from public.delivery_routes
   where batch_id = p_batch_id and courier_id = p_courier_id and status <> 'CANCELLED';

  for v_route in select value from jsonb_array_elements(p_plan) loop
    if jsonb_typeof(v_route->'stops') is distinct from 'array' then continue; end if;
    v_seq := v_seq + 1;
    insert into public.delivery_routes (
      batch_id, courier_id, route_date, sequence, status, origin,
      planned_distance_m, planned_duration_s, created_by)
    values (
      p_batch_id, p_courier_id, v_batch.batch_date, v_seq, 'DRAFT',
      case when v_route->>'origin' = 'MANUAL' then 'MANUAL' else 'AUTO' end,
      app.safe_int(v_route->>'distance_m'), app.safe_int(v_route->>'duration_s'), auth.uid())
    returning id into v_route_id;

    v_stop_seq := 0;
    for v_stop in select value from jsonb_array_elements(v_route->'stops') loop
      if jsonb_typeof(v_stop->'package_ids') is distinct from 'array' then continue; end if;
      select coalesce(array_agg(distinct x::uuid), '{}'::uuid[]) into v_ids
        from jsonb_array_elements_text(v_stop->'package_ids') x;
      if cardinality(v_ids) = 0 then continue; end if;
      if cardinality(v_ids) <> jsonb_array_length(v_stop->'package_ids') then
        raise exception 'Pacote repetido na mesma parada' using errcode = 'P0001';
      end if;
      -- trava os pacotes: uma atribuição manual simultânea espera ou é vista aqui
      select count(*), count(distinct q.address_key) into v_ok, v_keys
        from (select p.address_key from public.packages p
               where p.id = any(v_ids) and p.batch_id = p_batch_id
                 and p.courier_id = p_courier_id and p.status = 'ASSIGNED'
                 for update) q;
      if v_ok <> cardinality(v_ids) then
        raise exception 'Há pacote indisponível para o roteiro: já está em outro roteiro, pertence a outro funcionário ou saiu do lote'
          using errcode = 'P0001';
      end if;
      if v_keys <> 1 then
        raise exception 'Uma parada só pode reunir pacotes do mesmo endereço' using errcode = 'P0001';
      end if;

      v_stop_seq := v_stop_seq + 1;
      insert into public.route_stops (
        route_id, sequence, planned_sequence, address_key, zip_code, street, number,
        district, city, state, latitude, longitude, leg_distance_m, leg_duration_s, package_count)
      select v_route_id, v_stop_seq, v_stop_seq, p.address_key, p.zip_code, p.street, p.number,
             p.district, p.city, p.state,
             (select q.latitude from public.packages q
               where q.id = any(v_ids) and q.latitude is not null and q.longitude is not null
               order by q.tracking_code limit 1),
             (select q.longitude from public.packages q
               where q.id = any(v_ids) and q.latitude is not null and q.longitude is not null
               order by q.tracking_code limit 1),
             app.safe_int(v_stop->>'leg_distance_m'), app.safe_int(v_stop->>'leg_duration_s'),
             cardinality(v_ids)
        from public.packages p
       where p.id = any(v_ids)
       order by p.tracking_code
       limit 1
      returning id into v_stop_id;

      insert into public.route_packages (route_id, stop_id, package_id)
      select v_route_id, v_stop_id, unnest(v_ids);
      update public.packages set status = 'ROUTED', updated_at = now() where id = any(v_ids);
      v_stops := v_stops + 1;
      v_packages := v_packages + cardinality(v_ids);
    end loop;

    if v_stop_seq = 0 then
      delete from public.delivery_routes where id = v_route_id;
      v_seq := v_seq - 1;
      continue;
    end if;
    perform app.refresh_route(v_route_id);
    v_routes := v_routes + 1;
  end loop;

  insert into public.route_optimization_logs (
    batch_id, courier_id, scope, algorithm, provider, fallback_used, params,
    stop_count, package_count, route_count, total_distance_m, total_duration_s,
    previous_plan, new_plan, created_by)
  values (
    p_batch_id, p_courier_id, 'COURIER_DAY',
    coalesce(v_meta->>'algorithm', 'manual'), coalesce(v_meta->>'provider', 'none'),
    coalesce(v_meta->>'fallback_used', 'false') = 'true',
    coalesce(v_meta->'params', '{}'::jsonb),
    v_stops, v_packages, v_routes,
    app.safe_int(v_meta->>'total_distance_m'), app.safe_int(v_meta->>'total_duration_s'),
    v_previous, p_plan, auth.uid());
  insert into public.route_events (batch_id, courier_id, event, description, actor_id, metadata)
  values (p_batch_id, p_courier_id, 'PLAN_SAVED',
          v_routes || ' roteiro(s), ' || v_stops || ' parada(s), ' || v_packages || ' pacote(s)',
          auth.uid(), jsonb_build_object('routes', v_routes, 'stops', v_stops, 'packages', v_packages));
  return jsonb_build_object('routes', v_routes, 'stops', v_stops, 'packages', v_packages);
end $$;

-- Libera, devolve a rascunho ou cancela roteiros ainda não iniciados.
create or replace function public.set_routes_status(p_route_ids uuid[], p_action text)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare
  v_route record;
  v_changed integer := 0;
  v_skipped integer := 0;
  v_touched boolean;
begin
  if not app.is_dispatch_staff() then
    raise exception 'Ação restrita à equipe de distribuição' using errcode = '42501';
  end if;
  if p_action not in ('RELEASE','UNRELEASE','CANCEL') then
    raise exception 'Ação de roteiro inválida' using errcode = '22023';
  end if;
  for v_route in
    select * from public.delivery_routes where id = any(p_route_ids) order by sequence for update
  loop
    -- pacote já conferido na saída ou baixado prende o roteiro como está
    v_touched := exists (
      select 1 from public.route_packages rp
        join public.packages p on p.id = rp.package_id
       where rp.route_id = v_route.id and rp.released_at is null and p.status <> 'ROUTED');
    if p_action = 'RELEASE' and v_route.status = 'DRAFT' then
      update public.delivery_routes
         set status = 'RELEASED', released_at = now(), updated_at = now() where id = v_route.id;
      insert into public.route_events (route_id, batch_id, courier_id, event, actor_id)
      values (v_route.id, v_route.batch_id, v_route.courier_id, 'ROUTE_RELEASED', auth.uid());
      v_changed := v_changed + 1;
    elsif p_action = 'UNRELEASE' and v_route.status = 'RELEASED' and not v_touched then
      update public.delivery_routes
         set status = 'DRAFT', released_at = null, updated_at = now() where id = v_route.id;
      insert into public.route_events (route_id, batch_id, courier_id, event, actor_id)
      values (v_route.id, v_route.batch_id, v_route.courier_id, 'ROUTE_UNRELEASED', auth.uid());
      v_changed := v_changed + 1;
    elsif p_action = 'CANCEL' and v_route.status in ('DRAFT','RELEASED') and not v_touched then
      update public.packages p set status = 'ASSIGNED', updated_at = now()
        from public.route_packages rp
       where rp.package_id = p.id and rp.route_id = v_route.id
         and rp.released_at is null and p.status = 'ROUTED';
      if v_route.status = 'DRAFT' then
        delete from public.delivery_routes where id = v_route.id;
        insert into public.route_events (batch_id, courier_id, event, actor_id, metadata)
        values (v_route.batch_id, v_route.courier_id, 'ROUTE_CANCELLED', auth.uid(),
                jsonb_build_object('sequence', v_route.sequence, 'was', 'DRAFT'));
      else
        update public.route_packages
           set released_at = now(), release_reason = 'ROUTE_CANCELLED'
         where route_id = v_route.id and released_at is null;
        update public.delivery_routes
           set status = 'CANCELLED', cancelled_at = now(), updated_at = now() where id = v_route.id;
        insert into public.route_events (route_id, batch_id, courier_id, event, actor_id)
        values (v_route.id, v_route.batch_id, v_route.courier_id, 'ROUTE_CANCELLED', auth.uid());
      end if;
      v_changed := v_changed + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;
  return jsonb_build_object('changed', v_changed, 'skipped', v_skipped);
end $$;

-- Transfere um roteiro para outro funcionário. Roteiro não iniciado muda de
-- dono por inteiro; roteiro em andamento cede só o que ainda não foi
-- resolvido, em um roteiro novo, preservando o que já foi feito.
create or replace function public.transfer_route(p_route_id uuid, p_courier_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare
  v_route public.delivery_routes%rowtype;
  v_target public.couriers%rowtype;
  v_seq integer;
  v_new_route uuid;
  v_stop record;
  v_new_stop uuid;
  v_pkg record;
  v_moved integer := 0;
  v_stop_seq integer := 0;
begin
  if not app.is_dispatch_staff() then
    raise exception 'Transferência restrita à equipe de distribuição' using errcode = '42501';
  end if;
  select * into v_route from public.delivery_routes where id = p_route_id for update;
  if not found then
    raise exception 'Roteiro não encontrado' using errcode = 'P0001';
  end if;
  if v_route.status in ('COMPLETED','CANCELLED') then
    raise exception 'Roteiro encerrado não pode ser transferido' using errcode = 'P0001';
  end if;
  if v_route.courier_id = p_courier_id then
    raise exception 'O roteiro já pertence a este funcionário' using errcode = 'P0001';
  end if;
  select * into v_target from public.couriers where id = p_courier_id;
  if not found or v_target.status <> 'ACTIVE' then
    raise exception 'Funcionário de destino indisponível' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('routes:' || v_route.batch_id::text || ':' || p_courier_id::text, 0));
  select coalesce(max(sequence), 0) + 1 into v_seq
    from public.delivery_routes
   where batch_id = v_route.batch_id and courier_id = p_courier_id and status <> 'CANCELLED';

  if v_route.status in ('DRAFT','RELEASED') then
    for v_pkg in
      select rp.package_id from public.route_packages rp
       where rp.route_id = p_route_id and rp.released_at is null
    loop
      perform app.handover_package(v_pkg.package_id, p_courier_id, p_reason);
      v_moved := v_moved + 1;
    end loop;
    update public.delivery_routes
       set courier_id = p_courier_id, sequence = v_seq, origin = 'TRANSFER',
           transferred_from = v_route.courier_id, updated_at = now()
     where id = p_route_id;
    v_new_route := p_route_id;
  else
    insert into public.delivery_routes (
      batch_id, courier_id, route_date, sequence, status, origin, released_at, transferred_from, created_by)
    values (v_route.batch_id, p_courier_id, v_route.route_date, v_seq, 'RELEASED', 'TRANSFER',
            now(), v_route.courier_id, auth.uid())
    returning id into v_new_route;
    for v_stop in
      select s.* from public.route_stops s
       where s.route_id = p_route_id
         and exists (select 1 from public.route_packages rp
                       join public.packages p on p.id = rp.package_id
                      where rp.stop_id = s.id and rp.released_at is null
                        and p.status in ('ROUTED','LOADED'))
       order by s.sequence
    loop
      v_stop_seq := v_stop_seq + 1;
      insert into public.route_stops (
        route_id, sequence, planned_sequence, address_key, zip_code, street, number,
        district, city, state, latitude, longitude, leg_distance_m, leg_duration_s)
      values (v_new_route, v_stop_seq, v_stop_seq, v_stop.address_key, v_stop.zip_code, v_stop.street,
              v_stop.number, v_stop.district, v_stop.city, v_stop.state, v_stop.latitude,
              v_stop.longitude, v_stop.leg_distance_m, v_stop.leg_duration_s)
      returning id into v_new_stop;
      for v_pkg in
        select rp.id, rp.package_id from public.route_packages rp
          join public.packages p on p.id = rp.package_id
         where rp.stop_id = v_stop.id and rp.released_at is null and p.status in ('ROUTED','LOADED')
      loop
        update public.route_packages set route_id = v_new_route, stop_id = v_new_stop where id = v_pkg.id;
        perform app.handover_package(v_pkg.package_id, p_courier_id, p_reason);
        v_moved := v_moved + 1;
      end loop;
      perform app.refresh_stop(v_new_stop);
      if not exists (select 1 from public.route_packages where stop_id = v_stop.id) then
        delete from public.route_stops where id = v_stop.id;
      else
        perform app.refresh_stop(v_stop.id);
      end if;
    end loop;
    if v_moved = 0 then
      raise exception 'Não há pacotes pendentes para transferir neste roteiro' using errcode = 'P0001';
    end if;
    perform app.refresh_route(v_new_route);
    perform app.refresh_route(p_route_id);
  end if;

  insert into public.route_events (route_id, batch_id, courier_id, event, description, actor_id, metadata)
  values (v_new_route, v_route.batch_id, p_courier_id, 'ROUTE_TRANSFERRED', p_reason, auth.uid(),
          jsonb_build_object('from_courier', v_route.courier_id, 'to_courier', p_courier_id,
                             'source_route', p_route_id, 'packages', v_moved,
                             'partial', v_new_route <> p_route_id));
  perform app.audit('TRANSFER', 'delivery_route', v_new_route::text,
    'Transferiu roteiro com ' || v_moved || ' pacote(s) para ' || v_target.full_name,
    jsonb_build_object('from_courier', v_route.courier_id, 'to_courier', p_courier_id, 'reason', p_reason));
  return jsonb_build_object('route_id', v_new_route, 'packages', v_moved, 'sequence', v_seq,
                            'partial', v_new_route <> p_route_id);
end $$;

-- ------------------------------------------------------------------
-- C. Sequência das paradas pendentes
-- ------------------------------------------------------------------
-- Reordena somente o que ainda está pendente. planned_sequence não muda:
-- o planejamento original continua consultável.
create or replace function public.reorder_route_stops(p_route_id uuid, p_stop_ids uuid[], p_meta jsonb default null)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare
  v_route public.delivery_routes%rowtype;
  v_courier uuid := app.current_courier_id();
  v_staff boolean := app.is_dispatch_staff();
  v_pending uuid[];
  v_id uuid;
  v_pos integer := 0;
  v_leg jsonb;
begin
  select * into v_route from public.delivery_routes where id = p_route_id for update;
  if not found or not (v_staff or (v_courier is not null and v_route.courier_id = v_courier
                                   and v_route.status in ('RELEASED','IN_PROGRESS'))) then
    raise exception 'Roteiro indisponível' using errcode = '42501';
  end if;
  if v_route.status not in ('DRAFT','RELEASED','IN_PROGRESS') then
    raise exception 'Roteiro encerrado não pode ser reordenado' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(id order by sequence), '{}'::uuid[]) into v_pending
    from public.route_stops where route_id = p_route_id and status = 'PENDING';
  if cardinality(v_pending) = 0
     or cardinality(coalesce(p_stop_ids, '{}'::uuid[])) <> cardinality(v_pending)
     or (select count(distinct x) from unnest(p_stop_ids) x) <> cardinality(v_pending)
     or exists (select 1 from unnest(p_stop_ids) x where x <> all (v_pending)) then
    raise exception 'A nova ordem deve conter exatamente as paradas pendentes do roteiro'
      using errcode = 'P0001';
  end if;

  for v_id in
    select id from public.route_stops
     where route_id = p_route_id and status <> 'PENDING' order by sequence
  loop
    v_pos := v_pos + 1;
    update public.route_stops set sequence = v_pos where id = v_id;
  end loop;
  foreach v_id in array p_stop_ids loop
    v_pos := v_pos + 1;
    update public.route_stops set sequence = v_pos where id = v_id;
  end loop;

  if p_meta is not null and jsonb_typeof(p_meta->'legs') = 'array' then
    for v_leg in select value from jsonb_array_elements(p_meta->'legs') loop
      update public.route_stops
         set leg_distance_m = app.safe_int(v_leg->>'leg_distance_m'),
             leg_duration_s = app.safe_int(v_leg->>'leg_duration_s')
       where id = (v_leg->>'stop_id')::uuid and route_id = p_route_id;
    end loop;
    update public.delivery_routes
       set planned_distance_m = coalesce(app.safe_int(p_meta->>'distance_m'), planned_distance_m),
           planned_duration_s = coalesce(app.safe_int(p_meta->>'duration_s'), planned_duration_s)
     where id = p_route_id;
  end if;
  if p_meta is not null and p_meta ? 'algorithm' then
    insert into public.route_optimization_logs (
      batch_id, courier_id, route_id, scope, algorithm, provider, fallback_used, params,
      stop_count, total_distance_m, total_duration_s, previous_plan, new_plan, created_by)
    values (v_route.batch_id, v_route.courier_id, p_route_id, 'ROUTE',
            p_meta->>'algorithm', coalesce(p_meta->>'provider', 'none'),
            coalesce(p_meta->>'fallback_used', 'false') = 'true',
            coalesce(p_meta->'params', '{}'::jsonb), cardinality(v_pending),
            app.safe_int(p_meta->>'distance_m'), app.safe_int(p_meta->>'duration_s'),
            to_jsonb(v_pending), to_jsonb(p_stop_ids), auth.uid());
  end if;
  insert into public.route_events (route_id, batch_id, courier_id, event, actor_id, metadata)
  values (p_route_id, v_route.batch_id, v_route.courier_id, 'STOPS_REORDERED', auth.uid(),
          jsonb_build_object('before', to_jsonb(v_pending), 'after', to_jsonb(p_stop_ids),
                             'by_courier', not v_staff));
  return jsonb_build_object('status', 'APPLIED', 'stops', cardinality(v_pending));
end $$;

-- ------------------------------------------------------------------
-- Execução em campo (aplicativo dos entregadores)
-- ------------------------------------------------------------------
-- Estas funções respondem APPLIED, DUPLICATE ou CONFLICT em vez de falhar:
-- o aparelho pode estar reenviando o que registrou sem internet.
create or replace function public.start_route(p_route_id uuid, p_occurred_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare
  v_route public.delivery_routes%rowtype;
  v_courier uuid := app.current_courier_id();
  v_staff boolean := app.is_dispatch_staff();
begin
  if v_courier is null and not v_staff then
    raise exception 'Acesso restrito a entregadores ativos' using errcode = '42501';
  end if;
  select * into v_route from public.delivery_routes where id = p_route_id for update;
  if not found or (not v_staff and v_route.courier_id is distinct from v_courier) then
    return jsonb_build_object('status', 'CONFLICT', 'reason', 'ROUTE_NOT_ASSIGNED');
  end if;
  if v_route.status in ('IN_PROGRESS','COMPLETED') then
    return jsonb_build_object('status', 'DUPLICATE', 'route_status', v_route.status);
  end if;
  if v_route.status <> 'RELEASED' then
    return jsonb_build_object('status', 'CONFLICT', 'reason', 'ROUTE_NOT_RELEASED');
  end if;
  update public.delivery_routes
     set status = 'IN_PROGRESS', started_at = app.clamp_event_time(p_occurred_at), updated_at = now()
   where id = p_route_id;
  insert into public.route_events (route_id, batch_id, courier_id, event, actor_id)
  values (p_route_id, v_route.batch_id, v_route.courier_id, 'ROUTE_STARTED', auth.uid());
  return jsonb_build_object('status', 'APPLIED', 'route_status', 'IN_PROGRESS');
end $$;

-- Entrega ou tentativa sem sucesso. p_attempt_id nasce no aparelho.
-- Quando o registro contradiz o estado atual (pacote transferido, já baixado),
-- ele é guardado como CONFLICT para decisão do supervisor, sem se perder.
create or replace function public.register_delivery_attempt(
  p_attempt_id uuid, p_package_id uuid, p_outcome text,
  p_failure_reason text default null, p_notes text default null,
  p_recipient_name text default null, p_recipient_document text default null,
  p_latitude double precision default null, p_longitude double precision default null,
  p_occurred_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path = public, app as $$
declare
  v_courier uuid := app.current_courier_id();
  v_staff boolean := app.is_dispatch_staff();
  v_existing public.delivery_attempts%rowtype;
  v_pkg public.packages%rowtype;
  v_route_id uuid;
  v_stop_id uuid;
  v_route_status text;
  v_conflict text;
  v_reason public.occurrence_type;
  v_actor uuid;
  v_rows integer;
begin
  if v_courier is null and not v_staff then
    raise exception 'Acesso restrito a entregadores ativos' using errcode = '42501';
  end if;
  if p_attempt_id is null or p_outcome not in ('DELIVERED','FAILED') then
    raise exception 'Registro de entrega inválido' using errcode = '22023';
  end if;
  if p_outcome = 'FAILED' then
    if p_failure_reason is null then
      raise exception 'Informe o motivo da tentativa sem sucesso' using errcode = '22023';
    end if;
    v_reason := p_failure_reason::public.occurrence_type;
  end if;

  -- Ordem das travas: roteiro e depois pacote, a mesma da transferência de
  -- roteiro, para que a baixa do entregador e a ação do supervisor nunca se
  -- bloqueiem mutuamente. A busca pelo registro repetido vem depois das
  -- travas: de dois envios simultâneos do mesmo registro, o segundo já
  -- encontra o primeiro gravado.
  select rp.route_id into v_route_id
    from public.route_packages rp
   where rp.package_id = p_package_id and rp.released_at is null;
  if v_route_id is not null then
    perform 1 from public.delivery_routes where id = v_route_id for update;
  end if;
  select * into v_pkg from public.packages where id = p_package_id for update;
  select * into v_existing from public.delivery_attempts where id = p_attempt_id;
  if found then
    if not v_staff and v_existing.courier_id is distinct from v_courier then
      raise exception 'Registro de outro responsável' using errcode = '42501';
    end if;
    return jsonb_build_object('status', 'DUPLICATE', 'sync_status', v_existing.sync_status,
                              'reason', v_existing.conflict_reason);
  end if;
  if v_pkg.id is null then
    return jsonb_build_object('status', 'CONFLICT', 'reason', 'PACKAGE_NOT_FOUND');
  end if;
  v_actor := coalesce(v_courier, v_pkg.courier_id);
  if v_actor is null then
    return jsonb_build_object('status', 'CONFLICT', 'reason', 'NOT_ASSIGNED');
  end if;
  select rp.route_id, rp.stop_id, r.status into v_route_id, v_stop_id, v_route_status
    from public.route_packages rp
    join public.delivery_routes r on r.id = rp.route_id
   where rp.package_id = p_package_id and rp.released_at is null;

  v_conflict := case
    when v_courier is not null and v_pkg.courier_id is distinct from v_courier then 'NOT_ASSIGNED'
    when v_pkg.status = 'DELIVERED' then 'ALREADY_DELIVERED'
    when v_pkg.status not in ('ROUTED','LOADED','FAILED') then 'WRONG_STATUS'
    when v_route_id is null then 'NOT_IN_ROUTE'
    when v_route_status in ('DRAFT','CANCELLED') then 'ROUTE_NOT_RELEASED'
  end;

  insert into public.delivery_attempts (
    id, package_id, route_id, stop_id, batch_id, courier_id, outcome, failure_reason, notes,
    recipient_name, recipient_document, latitude, longitude, occurred_at,
    sync_status, conflict_reason, registered_by)
  values (
    p_attempt_id, p_package_id, v_route_id, v_stop_id, v_pkg.batch_id, v_actor, p_outcome, v_reason,
    nullif(btrim(p_notes), ''), nullif(btrim(p_recipient_name), ''),
    nullif(btrim(p_recipient_document), ''),
    case when abs(p_latitude) <= 90 and abs(p_longitude) <= 180 then p_latitude end,
    case when abs(p_latitude) <= 90 and abs(p_longitude) <= 180 then p_longitude end,
    app.clamp_event_time(p_occurred_at),
    case when v_conflict is null then 'APPLIED' else 'CONFLICT' end, v_conflict, auth.uid())
  on conflict (id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('status', 'DUPLICATE');
  end if;

  if v_conflict is not null then
    insert into public.route_events (route_id, batch_id, courier_id, package_id, event, description, actor_id, metadata)
    values (v_route_id, v_pkg.batch_id, v_actor, p_package_id, 'ATTEMPT_CONFLICT',
            'Pacote ' || v_pkg.tracking_code, auth.uid(),
            jsonb_build_object('attempt_id', p_attempt_id, 'reason', v_conflict, 'outcome', p_outcome));
    return jsonb_build_object('status', 'CONFLICT', 'reason', v_conflict, 'attempt_id', p_attempt_id);
  end if;

  perform app.apply_attempt(p_attempt_id);
  return jsonb_build_object(
    'status', 'APPLIED', 'attempt_id', p_attempt_id,
    'package_status', (select status from public.packages where id = p_package_id),
    'stop_status', (select status from public.route_stops where id = v_stop_id),
    'route_status', (select status from public.delivery_routes where id = v_route_id));
end $$;

-- Comprovante de uma tentativa. O arquivo precisa estar na pasta do próprio
-- entregador: assim ninguém ganha leitura de arquivo alheio ao registrá-lo.
create or replace function public.add_delivery_proof(
  p_proof_id uuid, p_attempt_id uuid, p_storage_path text,
  p_kind text default 'PHOTO', p_mime_type text default null, p_size_bytes bigint default null
) returns jsonb language plpgsql security definer set search_path = public, app as $$
declare
  v_courier uuid := app.current_courier_id();
  v_staff boolean := app.is_dispatch_staff();
  v_attempt public.delivery_attempts%rowtype;
begin
  if v_courier is null and not v_staff then
    raise exception 'Acesso restrito a entregadores ativos' using errcode = '42501';
  end if;
  if p_proof_id is null or p_kind not in ('PHOTO','SIGNATURE','DOCUMENT') then
    raise exception 'Comprovante inválido' using errcode = '22023';
  end if;
  if exists (select 1 from public.delivery_proofs where id = p_proof_id) then
    return jsonb_build_object('status', 'DUPLICATE');
  end if;
  select * into v_attempt from public.delivery_attempts where id = p_attempt_id;
  if not found or (not v_staff and v_attempt.courier_id is distinct from v_courier) then
    return jsonb_build_object('status', 'CONFLICT', 'reason', 'ATTEMPT_NOT_FOUND');
  end if;
  if p_storage_path is null
     or left(p_storage_path, length('couriers/' || v_attempt.courier_id::text || '/'))
        <> 'couriers/' || v_attempt.courier_id::text || '/' then
    raise exception 'Caminho do comprovante inválido' using errcode = '22023';
  end if;
  insert into public.delivery_proofs (
    id, attempt_id, package_id, courier_id, kind, storage_path, mime_type, size_bytes, uploaded_by)
  values (p_proof_id, p_attempt_id, v_attempt.package_id, v_attempt.courier_id, p_kind,
          p_storage_path, p_mime_type, p_size_bytes, auth.uid())
  on conflict do nothing;
  return jsonb_build_object('status', 'APPLIED');
end $$;

-- ------------------------------------------------------------------
-- Conferência de saída e retorno
-- ------------------------------------------------------------------
create or replace function public.open_manifest(p_batch_id uuid, p_courier_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare
  v_courier uuid := app.current_courier_id();
  v_staff boolean := app.is_dispatch_staff();
  v_owner uuid;
  v_manifest public.loading_manifests%rowtype;
begin
  if v_courier is null and not v_staff then
    raise exception 'Acesso restrito a entregadores ativos' using errcode = '42501';
  end if;
  v_owner := case when v_staff then coalesce(p_courier_id, v_courier) else v_courier end;
  if v_owner is null then
    raise exception 'Informe o funcionário da conferência' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('manifest:' || p_batch_id::text || ':' || v_owner::text, 0));
  select * into v_manifest from public.loading_manifests
   where batch_id = p_batch_id and courier_id = v_owner and status <> 'CLOSED';
  if not found then
    if not exists (select 1 from public.distribution_batches where id = p_batch_id and status = 'OPEN') then
      raise exception 'Lote indisponível para conferência' using errcode = 'P0001';
    end if;
    insert into public.loading_manifests (batch_id, courier_id, trip_number, opened_by)
    values (p_batch_id, v_owner,
            (select coalesce(max(trip_number), 0) + 1 from public.loading_manifests
              where batch_id = p_batch_id and courier_id = v_owner),
            auth.uid())
    returning * into v_manifest;
  end if;
  return to_jsonb(v_manifest);
end $$;

create or replace function public.depart_manifest(p_manifest_id uuid, p_occurred_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare
  v_courier uuid := app.current_courier_id();
  v_staff boolean := app.is_dispatch_staff();
  v_manifest public.loading_manifests%rowtype;
begin
  if v_courier is null and not v_staff then
    raise exception 'Acesso restrito a entregadores ativos' using errcode = '42501';
  end if;
  select * into v_manifest from public.loading_manifests where id = p_manifest_id for no key update;
  if not found or (not v_staff and v_manifest.courier_id is distinct from v_courier) then
    return jsonb_build_object('status', 'CONFLICT', 'reason', 'MANIFEST_UNAVAILABLE');
  end if;
  if v_manifest.status <> 'OPEN' then
    return jsonb_build_object('status', 'DUPLICATE', 'manifest_status', v_manifest.status);
  end if;
  update public.loading_manifests
     set status = 'DEPARTED', departed_at = app.clamp_event_time(p_occurred_at)
   where id = p_manifest_id;
  return jsonb_build_object('status', 'APPLIED', 'manifest_status', 'DEPARTED');
end $$;

-- Leitura de etiqueta. p_scan_id nasce no aparelho.
--   LOAD   pacote sai com o entregador
--   RETURN pacote volta para a central
--   CHECK  só consulta, não altera nada
create or replace function public.register_package_scan(
  p_scan_id uuid, p_code text, p_scan_type text, p_manifest_id uuid default null,
  p_occurred_at timestamptz default null,
  p_latitude double precision default null, p_longitude double precision default null
) returns jsonb language plpgsql security definer set search_path = public, app as $$
declare
  v_courier uuid := app.current_courier_id();
  v_staff boolean := app.is_dispatch_staff();
  v_existing public.package_scans%rowtype;
  v_manifest public.loading_manifests%rowtype;
  v_pkg public.packages%rowtype;
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_owner uuid;
  v_result text;
  v_detail text;
  v_stop uuid;
  v_route uuid;
  v_at timestamptz := app.clamp_event_time(p_occurred_at);
begin
  if v_courier is null and not v_staff then
    raise exception 'Acesso restrito a entregadores ativos' using errcode = '42501';
  end if;
  if p_scan_id is null or v_code = '' or p_scan_type not in ('LOAD','RETURN','CHECK') then
    raise exception 'Leitura inválida' using errcode = '22023';
  end if;

  select * into v_existing from public.package_scans where id = p_scan_id;
  if found then
    if not v_staff and v_existing.courier_id is distinct from v_courier then
      raise exception 'Leitura de outro responsável' using errcode = '42501';
    end if;
    return jsonb_build_object('status', 'DUPLICATE', 'result', v_existing.result,
                              'detail', v_existing.detail, 'package_id', v_existing.package_id);
  end if;

  v_owner := v_courier;
  if p_scan_type in ('LOAD','RETURN') then
    select * into v_manifest from public.loading_manifests where id = p_manifest_id for no key update;
    if not found or v_manifest.status = 'CLOSED'
       or (not v_staff and v_manifest.courier_id is distinct from v_courier) then
      return jsonb_build_object('status', 'CONFLICT', 'reason', 'MANIFEST_UNAVAILABLE');
    end if;
    if p_scan_type = 'LOAD' and v_manifest.status <> 'OPEN' then
      return jsonb_build_object('status', 'CONFLICT', 'reason', 'MANIFEST_DEPARTED');
    end if;
    v_owner := v_manifest.courier_id;
  end if;

  -- roteiro antes do pacote: mesma ordem de travas da transferência de roteiro
  select rp.route_id into v_route
    from public.packages p
    join public.route_packages rp on rp.package_id = p.id and rp.released_at is null
   where upper(btrim(p.tracking_code)) = v_code and p.status <> 'CANCELLED';
  if v_route is not null and p_scan_type <> 'CHECK' then
    perform 1 from public.delivery_routes where id = v_route for update;
  end if;
  select * into v_pkg from public.packages
   where upper(btrim(tracking_code)) = v_code and status <> 'CANCELLED'
     for update;

  -- envio simultâneo da mesma leitura: quem esperou a trava já a encontra gravada
  select * into v_existing from public.package_scans where id = p_scan_id;
  if found then
    return jsonb_build_object('status', 'DUPLICATE', 'result', v_existing.result,
                              'detail', v_existing.detail, 'package_id', v_existing.package_id);
  end if;

  if v_pkg.id is null then
    v_result := 'UNKNOWN_CODE';
  elsif v_owner is not null and v_pkg.courier_id is distinct from v_owner then
    v_result := 'NOT_ASSIGNED';
  elsif p_scan_type = 'CHECK' then
    v_result := 'OK';
  elsif p_scan_type = 'LOAD' then
    if v_pkg.status = 'LOADED' then
      v_result := 'DUPLICATE';
    elsif v_pkg.status not in ('ROUTED','RETURNED') then
      v_result := 'WRONG_STATUS';
      v_detail := v_pkg.status;
    elsif not exists (
            select 1 from public.route_packages rp
              join public.delivery_routes r on r.id = rp.route_id
             where rp.package_id = v_pkg.id and rp.released_at is null
               and r.status in ('RELEASED','IN_PROGRESS','COMPLETED')) then
      -- roteiro ainda em rascunho: o planejamento pode mudar, então nada sai da central
      v_result := 'WRONG_STATUS';
      v_detail := 'ROUTE_NOT_RELEASED';
    else
      v_result := 'OK';
    end if;
  else
    if v_pkg.status = 'RETURNED' then
      v_result := 'DUPLICATE';
    elsif v_pkg.status in ('LOADED','FAILED') then
      v_result := 'OK';
    else
      v_result := 'WRONG_STATUS';
      v_detail := v_pkg.status;
    end if;
  end if;

  if v_result = 'OK' and p_scan_type <> 'CHECK' then
    -- devolver sem ter apertado "sair" também registra a saída
    if p_scan_type = 'RETURN' and v_manifest.status = 'OPEN' then
      update public.loading_manifests
         set status = 'DEPARTED', departed_at = coalesce(departed_at, v_at) where id = v_manifest.id;
    end if;
    update public.packages
       set status = case when p_scan_type = 'LOAD' then 'LOADED' else 'RETURNED' end,
           updated_at = now()
     where id = v_pkg.id;
    select rp.stop_id, rp.route_id into v_stop, v_route
      from public.route_packages rp where rp.package_id = v_pkg.id and rp.released_at is null;
    perform app.refresh_stop(v_stop);
    perform app.refresh_route(v_route);
  end if;

  insert into public.package_scans (
    id, package_id, batch_id, courier_id, manifest_id, scan_type, result, scanned_code, detail,
    scanned_by, occurred_at, latitude, longitude)
  values (
    p_scan_id, v_pkg.id, coalesce(v_pkg.batch_id, v_manifest.batch_id), v_owner,
    case when p_scan_type = 'CHECK' then null else v_manifest.id end,
    p_scan_type, v_result, v_code, v_detail, auth.uid(), v_at,
    case when abs(p_latitude) <= 90 and abs(p_longitude) <= 180 then p_latitude end,
    case when abs(p_latitude) <= 90 and abs(p_longitude) <= 180 then p_longitude end)
  on conflict (id) do nothing;

  -- pacote de outro responsável: devolve só o resultado, sem os dados
  return jsonb_build_object(
    'status', 'APPLIED', 'result', v_result, 'detail', v_detail,
    'package_id', case when v_result <> 'NOT_ASSIGNED' then v_pkg.id end,
    'tracking_code', v_code,
    'recipient_name', case when v_result not in ('NOT_ASSIGNED','UNKNOWN_CODE') then v_pkg.recipient_name end,
    'package_status', case when v_result not in ('NOT_ASSIGNED','UNKNOWN_CODE')
                           then (select status from public.packages where id = v_pkg.id) end);
end $$;

-- Fecha a conferência. Tudo que saiu precisa ter sido entregue, devolvido
-- ou transferido; só a equipe pode fechar com divergência, e ela fica anotada.
create or replace function public.close_manifest(p_manifest_id uuid, p_force boolean default false, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare
  v_courier uuid := app.current_courier_id();
  v_staff boolean := app.is_dispatch_staff();
  v_manifest public.loading_manifests%rowtype;
  v_loaded integer;
  v_delivered integer;
  v_returned integer;
  v_transferred integer;
  v_open integer;
begin
  if v_courier is null and not v_staff then
    raise exception 'Acesso restrito a entregadores ativos' using errcode = '42501';
  end if;
  select * into v_manifest from public.loading_manifests where id = p_manifest_id for no key update;
  if not found or (not v_staff and v_manifest.courier_id is distinct from v_courier) then
    return jsonb_build_object('status', 'CONFLICT', 'reason', 'MANIFEST_UNAVAILABLE');
  end if;
  if v_manifest.status = 'CLOSED' then
    return jsonb_build_object('status', 'DUPLICATE', 'manifest_status', 'CLOSED');
  end if;
  select count(*), count(*) filter (where outcome = 'DELIVERED'),
         count(*) filter (where outcome = 'RETURNED'),
         count(*) filter (where outcome = 'TRANSFERRED'),
         count(*) filter (where outcome = 'OPEN')
    into v_loaded, v_delivered, v_returned, v_transferred, v_open
    from public.manifest_items where manifest_id = p_manifest_id;
  if v_open > 0 and not (v_staff and coalesce(p_force, false)) then
    return jsonb_build_object(
      'status', 'CONFLICT', 'reason', 'OPEN_ITEMS', 'open', v_open,
      'codes', (select coalesce(jsonb_agg(tracking_code order by tracking_code), '[]'::jsonb)
                  from public.manifest_items
                 where manifest_id = p_manifest_id and outcome = 'OPEN'));
  end if;
  update public.loading_manifests
     set status = 'CLOSED', closed_at = now(), closed_by = auth.uid(),
         departed_at = coalesce(departed_at, now()),
         loaded_count = v_loaded, delivered_count = v_delivered, returned_count = v_returned,
         transferred_count = v_transferred, open_count = v_open,
         divergence_note = nullif(btrim(p_note), '')
   where id = p_manifest_id;
  if v_open > 0 then
    perform app.audit('CLOSE_WITH_DIVERGENCE', 'loading_manifest', p_manifest_id::text,
      'Fechou conferência com ' || v_open || ' pacote(s) em aberto',
      jsonb_build_object('open', v_open, 'note', p_note));
  end if;
  return jsonb_build_object('status', 'APPLIED', 'manifest_status', 'CLOSED',
    'loaded', v_loaded, 'delivered', v_delivered, 'returned', v_returned,
    'transferred', v_transferred, 'open', v_open);
end $$;

-- ------------------------------------------------------------------
-- Supervisão
-- ------------------------------------------------------------------
create or replace function public.resolve_attempt_conflict(p_attempt_id uuid, p_accept boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare
  v_attempt public.delivery_attempts%rowtype;
  v_pkg public.packages%rowtype;
  v_route uuid;
  v_stop uuid;
begin
  if not app.is_dispatch_staff() then
    raise exception 'Ação restrita à equipe de distribuição' using errcode = '42501';
  end if;
  select * into v_attempt from public.delivery_attempts where id = p_attempt_id for update;
  if not found or v_attempt.sync_status <> 'CONFLICT' then
    raise exception 'Conflito não encontrado ou já resolvido' using errcode = 'P0001';
  end if;
  if p_accept then
    select * into v_pkg from public.packages where id = v_attempt.package_id for update;
    if v_pkg.status not in ('ASSIGNED','ROUTED','LOADED','FAILED') then
      raise exception 'O pacote não pode mais receber esta baixa (situação atual: %)', v_pkg.status
        using errcode = 'P0001';
    end if;
    select rp.route_id, rp.stop_id into v_route, v_stop
      from public.route_packages rp
     where rp.package_id = v_attempt.package_id and rp.released_at is null;
    update public.delivery_attempts
       set sync_status = 'APPLIED', route_id = v_route, stop_id = v_stop,
           resolved_by = auth.uid(), resolved_at = now(), resolution_note = nullif(btrim(p_note), '')
     where id = p_attempt_id;
    perform app.apply_attempt(p_attempt_id);
  else
    update public.delivery_attempts
       set sync_status = 'DISCARDED', resolved_by = auth.uid(), resolved_at = now(),
           resolution_note = nullif(btrim(p_note), '')
     where id = p_attempt_id;
  end if;
  perform app.audit(case when p_accept then 'ACCEPT_CONFLICT' else 'DISCARD_CONFLICT' end,
    'delivery_attempt', p_attempt_id::text, 'Resolveu conflito de sincronização',
    jsonb_build_object('package_id', v_attempt.package_id, 'reason', v_attempt.conflict_reason, 'note', p_note));
  return jsonb_build_object('status', case when p_accept then 'APPLIED' else 'DISCARDED' end);
end $$;

-- Painel do lote em uma única consulta (não depende do limite de linhas da API).
create or replace function public.batch_overview(p_batch_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare
  v_result jsonb;
begin
  if not app.is_staff() then
    raise exception 'Acesso restrito à equipe' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'batch', (select to_jsonb(b) from public.distribution_batches b where b.id = p_batch_id),
    'totals', jsonb_build_object(
      'packages', (select count(*) from public.packages where batch_id = p_batch_id and status <> 'CANCELLED'),
      'addresses', (select count(distinct address_key) from public.packages
                     where batch_id = p_batch_id and status <> 'CANCELLED'),
      'by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
                      from (select status, count(*) n from public.packages
                             where batch_id = p_batch_id group by status) s),
      'exceptions', (select coalesce(jsonb_object_agg(exception_reason, n), '{}'::jsonb)
                       from (select exception_reason, count(*) n from public.packages
                              where batch_id = p_batch_id and status = 'EXCEPTION'
                                and exception_reason is not null
                              group by exception_reason) e),
      'routes', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
                   from (select status, count(*) n from public.delivery_routes
                          where batch_id = p_batch_id group by status) r),
      'conflicts', (select count(*) from public.delivery_attempts
                     where batch_id = p_batch_id and sync_status = 'CONFLICT')),
    'couriers', coalesce((
      select jsonb_agg(q.item order by q.full_name)
        from (
          select c.full_name, jsonb_build_object(
            'courier_id', c.id,
            'full_name', c.full_name,
            'vehicle_type', c.vehicle_type,
            'status', c.status,
            'has_login', c.profile_id is not null,
            'limit', app.courier_package_limit(c.id, p_batch_id),
            'packages', (select count(*) from public.packages p
                          where p.batch_id = p_batch_id and p.courier_id = c.id and p.status <> 'CANCELLED'),
            'addresses', (select count(distinct p.address_key) from public.packages p
                           where p.batch_id = p_batch_id and p.courier_id = c.id and p.status <> 'CANCELLED'),
            'by_status', (select coalesce(jsonb_object_agg(x.status, x.n), '{}'::jsonb)
                            from (select p.status, count(*) n from public.packages p
                                   where p.batch_id = p_batch_id and p.courier_id = c.id
                                   group by p.status) x),
            'routes', (select coalesce(jsonb_object_agg(x.status, x.n), '{}'::jsonb)
                         from (select r.status, count(*) n from public.delivery_routes r
                                where r.batch_id = p_batch_id and r.courier_id = c.id
                                group by r.status) x),
            'last_activity_at', (select max(a.occurred_at) from public.delivery_attempts a
                                  where a.batch_id = p_batch_id and a.courier_id = c.id),
            'manifest', (select jsonb_build_object(
                           'id', m.id, 'status', m.status, 'trip_number', m.trip_number,
                           'departed_at', m.departed_at,
                           'loaded', (select count(*) from public.manifest_items i where i.manifest_id = m.id),
                           'open', (select count(*) from public.manifest_items i
                                     where i.manifest_id = m.id and i.outcome = 'OPEN'))
                           from public.loading_manifests m
                          where m.batch_id = p_batch_id and m.courier_id = c.id
                          order by m.trip_number desc limit 1),
            'conflicts', (select count(*) from public.delivery_attempts a
                           where a.batch_id = p_batch_id and a.courier_id = c.id
                             and a.sync_status = 'CONFLICT'),
            'delivered_without_load', (select count(*) from public.packages p
                                        where p.batch_id = p_batch_id and p.courier_id = c.id
                                          and p.status = 'DELIVERED'
                                          and not exists (select 1 from public.package_scans s
                                                           where s.package_id = p.id
                                                             and s.scan_type = 'LOAD' and s.result = 'OK'))
          ) as item
          from public.couriers c
         where exists (select 1 from public.packages p where p.batch_id = p_batch_id and p.courier_id = c.id)
            or exists (select 1 from public.delivery_routes r where r.batch_id = p_batch_id and r.courier_id = c.id)
        ) q), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

-- Parâmetros que o aplicativo do entregador precisa conhecer (nada sensível).
create or replace function public.logistics_client_config()
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare
  v_settings jsonb := app.distribution_settings();
begin
  if not (app.is_staff() or app.current_courier_id() is not null) then
    raise exception 'Acesso restrito' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'require_loading_scan', coalesce(v_settings->>'require_loading_scan', 'true') = 'true',
    'service_minutes_per_stop', coalesce(app.safe_int(v_settings->>'service_minutes_per_stop'), 4));
end $$;

-- ------------------------------------------------------------------
-- Consultas das telas (uma chamada por tela, sem limite de linhas da API)
-- ------------------------------------------------------------------
-- Pacotes de um lote com filtros. p_filter aceita: statuses (lista),
-- courier_id, search (código, destinatário ou início do CEP), limit e offset.
create or replace function public.list_packages(p_batch_id uuid, p_filter jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare
  v_filter jsonb := coalesce(p_filter, '{}'::jsonb);
  v_statuses text[];
  v_courier uuid := nullif(v_filter->>'courier_id', '')::uuid;
  v_search text := nullif(btrim(v_filter->>'search'), '');
  v_digits text;
  v_limit integer := least(greatest(coalesce(app.safe_int(v_filter->>'limit'), 200), 1), 1000);
  v_offset integer := greatest(coalesce(app.safe_int(v_filter->>'offset'), 0), 0);
  v_result jsonb;
begin
  if not app.is_staff() then
    raise exception 'Acesso restrito à equipe' using errcode = '42501';
  end if;
  if jsonb_typeof(v_filter->'statuses') = 'array' and jsonb_array_length(v_filter->'statuses') > 0 then
    select array_agg(x) into v_statuses from jsonb_array_elements_text(v_filter->'statuses') x;
  end if;
  v_digits := nullif(app.only_digits(v_search), '');
  with matched as (
    select p.*, c.full_name as courier_name
      from public.packages p
      left join public.couriers c on c.id = p.courier_id
     where p.batch_id = p_batch_id
       and (v_statuses is null or p.status = any(v_statuses))
       and (v_statuses is not null or p.status <> 'CANCELLED')
       and (v_courier is null or p.courier_id = v_courier)
       and (v_search is null
            or upper(p.tracking_code) like '%' || upper(v_search) || '%'
            or app.normalize_text(p.recipient_name) like '%' || app.normalize_text(v_search) || '%'
            or (v_digits is not null and length(v_digits) >= 3 and p.zip_code like v_digits || '%'))
  )
  select jsonb_build_object(
    'total', (select count(*) from matched),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'batch_id', m.batch_id, 'tracking_code', m.tracking_code,
        'external_ref', m.external_ref, 'manifest_ref', m.manifest_ref, 'sender_name', m.sender_name,
        'recipient_name', m.recipient_name, 'recipient_phone', m.recipient_phone,
        'zip_code', m.zip_code, 'zip_raw', m.zip_raw, 'street', m.street, 'number', m.number,
        'complement', m.complement, 'district', m.district, 'city', m.city, 'state', m.state,
        'delivery_instructions', m.delivery_instructions,
        'latitude', m.latitude, 'longitude', m.longitude,
        'is_temperature_controlled', m.is_temperature_controlled,
        'address_key', m.address_key, 'status', m.status,
        'exception_reason', m.exception_reason, 'exception_detail', m.exception_detail,
        'courier_id', m.courier_id, 'courier_name', m.courier_name,
        'attempt_count', m.attempt_count, 'delivered_at', m.delivered_at,
        'created_at', m.created_at, 'updated_at', m.updated_at)
        order by m.zip_code nulls first, m.address_key, m.tracking_code)
      from (select * from matched order by zip_code nulls first, address_key, tracking_code
             limit v_limit offset v_offset) m), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

-- Tudo sobre o dia de um funcionário em um lote: roteiros com paradas e
-- pacotes, pacotes ainda sem roteiro e conferências.
create or replace function public.courier_plan(p_batch_id uuid, p_courier_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare
  v_result jsonb;
begin
  if not app.is_staff() then
    raise exception 'Acesso restrito à equipe' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'courier', (select jsonb_build_object(
                  'id', c.id, 'full_name', c.full_name, 'status', c.status, 'vehicle_type', c.vehicle_type,
                  'has_login', c.profile_id is not null,
                  'limit', app.courier_package_limit(c.id, p_batch_id))
                  from public.couriers c where c.id = p_courier_id),
    'routes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'batch_id', r.batch_id, 'courier_id', r.courier_id, 'route_date', r.route_date,
        'sequence', r.sequence, 'status', r.status, 'origin', r.origin, 'zip_prefix', r.zip_prefix,
        'stop_count', r.stop_count, 'package_count', r.package_count,
        'planned_distance_m', r.planned_distance_m, 'planned_duration_s', r.planned_duration_s,
        'released_at', r.released_at, 'started_at', r.started_at, 'completed_at', r.completed_at,
        'transferred_from', r.transferred_from,
        'transferred_from_name', (select f.full_name from public.couriers f where f.id = r.transferred_from),
        'stops', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', s.id, 'route_id', s.route_id, 'sequence', s.sequence,
            'planned_sequence', s.planned_sequence, 'address_key', s.address_key,
            'zip_code', s.zip_code, 'street', s.street, 'number', s.number, 'district', s.district,
            'city', s.city, 'state', s.state, 'latitude', s.latitude, 'longitude', s.longitude,
            'leg_distance_m', s.leg_distance_m, 'leg_duration_s', s.leg_duration_s,
            'status', s.status, 'package_count', s.package_count, 'completed_at', s.completed_at,
            'packages', coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', p.id, 'tracking_code', p.tracking_code, 'recipient_name', p.recipient_name,
                'complement', p.complement, 'status', p.status, 'attempt_count', p.attempt_count,
                'delivered_at', p.delivered_at,
                'is_temperature_controlled', p.is_temperature_controlled)
                order by p.tracking_code)
                from public.route_packages rp
                join public.packages p on p.id = rp.package_id
               where rp.stop_id = s.id and rp.released_at is null), '[]'::jsonb))
            order by s.sequence)
            from public.route_stops s where s.route_id = r.id), '[]'::jsonb))
        order by r.sequence)
        from public.delivery_routes r
       where r.batch_id = p_batch_id and r.courier_id = p_courier_id and r.status <> 'CANCELLED'), '[]'::jsonb),
    'packages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'tracking_code', p.tracking_code, 'recipient_name', p.recipient_name,
        'address_key', p.address_key, 'zip_code', p.zip_code, 'street', p.street, 'number', p.number,
        'complement', p.complement, 'district', p.district, 'city', p.city,
        'latitude', p.latitude, 'longitude', p.longitude, 'status', p.status,
        'route_id', a.route_id, 'route_status', a.route_status)
        order by p.zip_code nulls first, p.address_key, p.tracking_code)
        from public.packages p
        left join lateral (
          select rp.route_id, r.status as route_status
            from public.route_packages rp
            join public.delivery_routes r on r.id = rp.route_id
           where rp.package_id = p.id and rp.released_at is null) a on true
       where p.batch_id = p_batch_id and p.courier_id = p_courier_id and p.status <> 'CANCELLED'), '[]'::jsonb),
    'manifests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'trip_number', m.trip_number, 'status', m.status, 'opened_at', m.opened_at,
        'departed_at', m.departed_at, 'closed_at', m.closed_at, 'divergence_note', m.divergence_note,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'package_id', i.package_id, 'tracking_code', i.tracking_code,
            'recipient_name', i.recipient_name, 'outcome', i.outcome, 'loaded_at', i.loaded_at)
            order by i.tracking_code)
            from public.manifest_items i where i.manifest_id = m.id), '[]'::jsonb))
        order by m.trip_number)
        from public.loading_manifests m
       where m.batch_id = p_batch_id and m.courier_id = p_courier_id), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

-- Histórico completo de um pacote (rastreabilidade para a supervisão).
create or replace function public.package_detail(p_package_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare
  v_result jsonb;
begin
  if not app.is_staff() then
    raise exception 'Acesso restrito à equipe' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'package', to_jsonb(p) || jsonb_build_object(
      'courier_name', (select c.full_name from public.couriers c where c.id = p.courier_id),
      'batch_code', (select b.code from public.distribution_batches b where b.id = p.batch_id)),
    'route', (select jsonb_build_object(
                'route_id', r.id, 'sequence', r.sequence, 'status', r.status,
                'stop_sequence', s.sequence, 'stop_status', s.status)
                from public.route_packages rp
                join public.delivery_routes r on r.id = rp.route_id
                join public.route_stops s on s.id = rp.stop_id
               where rp.package_id = p.id and rp.released_at is null),
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'courier_id', a.courier_id, 'courier_name', c.full_name, 'method', a.method,
        'region_name', (select g.name from public.postal_code_regions g where g.id = a.region_id),
        'reason', a.reason, 'assigned_at', a.assigned_at, 'ended_at', a.ended_at,
        'end_reason', a.end_reason,
        'assigned_by_name', (select u.full_name from public.profiles u where u.id = a.assigned_by))
        order by a.assigned_at desc, a.id)
        from public.package_assignments a
        join public.couriers c on c.id = a.courier_id
       where a.package_id = p.id), '[]'::jsonb),
    'attempts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'outcome', t.outcome, 'failure_reason', t.failure_reason, 'notes', t.notes,
        'recipient_name', t.recipient_name, 'recipient_document', t.recipient_document,
        'latitude', t.latitude, 'longitude', t.longitude,
        'occurred_at', t.occurred_at, 'received_at', t.received_at,
        'sync_status', t.sync_status, 'conflict_reason', t.conflict_reason,
        'resolution_note', t.resolution_note, 'courier_id', t.courier_id,
        'courier_name', (select c.full_name from public.couriers c where c.id = t.courier_id),
        'proofs', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', f.id, 'kind', f.kind, 'storage_path', f.storage_path, 'created_at', f.created_at)
            order by f.created_at)
            from public.delivery_proofs f where f.attempt_id = t.id), '[]'::jsonb))
        order by t.occurred_at desc, t.id)
        from public.delivery_attempts t where t.package_id = p.id), '[]'::jsonb),
    'scans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'scan_type', s.scan_type, 'result', s.result, 'detail', s.detail,
        'occurred_at', s.occurred_at,
        'courier_name', (select c.full_name from public.couriers c where c.id = s.courier_id))
        order by s.occurred_at desc, s.id)
        from public.package_scans s where s.package_id = p.id), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'event', e.event, 'description', e.description, 'created_at', e.created_at,
        'actor_name', (select u.full_name from public.profiles u where u.id = e.actor_id))
        order by e.created_at desc, e.id desc)
        from public.route_events e where e.package_id = p.id), '[]'::jsonb)
  ) into v_result
  from public.packages p where p.id = p_package_id;
  if v_result is null then
    raise exception 'Pacote não encontrado' using errcode = 'P0001';
  end if;
  return v_result;
end $$;

-- Registros do campo que contradizem o estado atual e aguardam decisão.
create or replace function public.list_attempt_conflicts(p_batch_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.is_staff() then
    raise exception 'Acesso restrito à equipe' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'package_id', t.package_id, 'tracking_code', p.tracking_code,
      'recipient_name', p.recipient_name, 'package_status', p.status,
      'outcome', t.outcome, 'failure_reason', t.failure_reason, 'notes', t.notes,
      'attempt_recipient_name', t.recipient_name,
      'occurred_at', t.occurred_at, 'received_at', t.received_at,
      'conflict_reason', t.conflict_reason,
      'courier_id', t.courier_id,
      'courier_name', (select c.full_name from public.couriers c where c.id = t.courier_id),
      'holder_id', p.courier_id,
      'holder_name', (select c.full_name from public.couriers c where c.id = p.courier_id))
      order by t.received_at, t.id)
      from public.delivery_attempts t
      join public.packages p on p.id = t.package_id
     where t.batch_id = p_batch_id and t.sync_status = 'CONFLICT'), '[]'::jsonb);
end $$;

-- O dia do entregador em uma única resposta (é o que o aplicativo guarda
-- para trabalhar sem internet). Traz o que está liberado ou em andamento,
-- de qualquer data, o que foi concluído na data pedida e o que ainda tem
-- pacote a devolver. Somente dados operacionais do próprio entregador.
create or replace function public.rider_day(p_date date)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare
  v_courier uuid := app.current_courier_id();
  v_result jsonb;
begin
  if v_courier is null then
    raise exception 'Acesso restrito a entregadores ativos' using errcode = '42501';
  end if;
  with mine as (
    select r.* from public.delivery_routes r
     where r.courier_id = v_courier
       and (r.status in ('RELEASED','IN_PROGRESS')
            or (r.status = 'COMPLETED' and (
                  r.route_date = p_date
                  -- de outro dia, mas ainda com pacote não entregue a devolver
                  or exists (select 1 from public.route_packages rp
                               join public.packages p on p.id = rp.package_id
                              where rp.route_id = r.id and rp.released_at is null and p.status = 'FAILED'))))
  )
  select jsonb_build_object(
    'courier_id', v_courier,
    'date', p_date,
    'config', public.logistics_client_config(),
    'routes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'batch_id', r.batch_id, 'route_date', r.route_date, 'sequence', r.sequence,
        'status', r.status, 'zip_prefix', r.zip_prefix,
        'planned_distance_m', r.planned_distance_m, 'planned_duration_s', r.planned_duration_s,
        'started_at', r.started_at, 'completed_at', r.completed_at,
        'stops', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', s.id, 'route_id', s.route_id, 'sequence', s.sequence,
            'planned_sequence', s.planned_sequence,
            'zip_code', s.zip_code, 'street', s.street, 'number', s.number, 'district', s.district,
            'city', s.city, 'state', s.state, 'latitude', s.latitude, 'longitude', s.longitude,
            'leg_distance_m', s.leg_distance_m, 'leg_duration_s', s.leg_duration_s, 'status', s.status,
            'packages', coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', p.id, 'tracking_code', p.tracking_code, 'recipient_name', p.recipient_name,
                'recipient_phone', p.recipient_phone, 'complement', p.complement,
                'delivery_instructions', p.delivery_instructions,
                'is_temperature_controlled', p.is_temperature_controlled,
                'status', p.status, 'attempt_count', p.attempt_count, 'delivered_at', p.delivered_at)
                order by p.tracking_code)
                from public.route_packages rp
                join public.packages p on p.id = rp.package_id
               where rp.stop_id = s.id and rp.released_at is null), '[]'::jsonb))
            order by s.sequence)
            from public.route_stops s where s.route_id = r.id), '[]'::jsonb))
        order by r.route_date, r.sequence)
        from mine r), '[]'::jsonb),
    'manifests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'batch_id', m.batch_id, 'trip_number', m.trip_number, 'status', m.status,
        'opened_at', m.opened_at, 'departed_at', m.departed_at, 'closed_at', m.closed_at,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'package_id', i.package_id, 'tracking_code', i.tracking_code,
            'recipient_name', i.recipient_name, 'outcome', i.outcome)
            order by i.tracking_code)
            from public.manifest_items i where i.manifest_id = m.id), '[]'::jsonb))
        order by m.opened_at)
        from public.loading_manifests m
       where m.courier_id = v_courier
         and (m.status <> 'CLOSED' or m.batch_id in (select batch_id from mine))), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

-- ------------------------------------------------------------------
-- Segurança por linha
-- ------------------------------------------------------------------
do $$ declare t text;
begin
  foreach t in array array[
    'postal_code_regions','postal_code_assignments','distribution_batches','packages',
    'package_assignments','delivery_routes','route_stops','route_packages','route_events',
    'route_optimization_logs','loading_manifests','package_scans','delivery_attempts','delivery_proofs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Cobertura: a equipe consulta; só a distribuição altera.
drop policy if exists postal_code_regions_select on public.postal_code_regions;
create policy postal_code_regions_select on public.postal_code_regions
  for select to authenticated using (app.is_staff());
drop policy if exists postal_code_regions_write on public.postal_code_regions;
create policy postal_code_regions_write on public.postal_code_regions
  for all to authenticated using (app.is_dispatch_staff()) with check (app.is_dispatch_staff());

drop policy if exists postal_code_assignments_select on public.postal_code_assignments;
create policy postal_code_assignments_select on public.postal_code_assignments
  for select to authenticated using (app.is_staff());
drop policy if exists postal_code_assignments_write on public.postal_code_assignments;
create policy postal_code_assignments_write on public.postal_code_assignments
  for all to authenticated using (app.is_dispatch_staff()) with check (app.is_dispatch_staff());

drop policy if exists distribution_batches_select on public.distribution_batches;
create policy distribution_batches_select on public.distribution_batches
  for select to authenticated using (app.is_staff());
drop policy if exists distribution_batches_insert on public.distribution_batches;
create policy distribution_batches_insert on public.distribution_batches
  for insert to authenticated with check (app.is_dispatch_staff());
drop policy if exists distribution_batches_update on public.distribution_batches;
create policy distribution_batches_update on public.distribution_batches
  for update to authenticated using (app.is_dispatch_staff()) with check (app.is_dispatch_staff());

-- Pacotes: o entregador lê apenas os que estão sob sua responsabilidade.
drop policy if exists packages_select on public.packages;
create policy packages_select on public.packages
  for select to authenticated
  using (app.is_staff() or courier_id = (select app.current_courier_id()));
drop policy if exists packages_update on public.packages;
create policy packages_update on public.packages
  for update to authenticated using (app.is_dispatch_staff()) with check (app.is_dispatch_staff());

drop policy if exists package_assignments_select on public.package_assignments;
create policy package_assignments_select on public.package_assignments
  for select to authenticated using (app.is_staff());

-- Roteiros: rascunho e cancelado não aparecem para o entregador.
drop policy if exists delivery_routes_select on public.delivery_routes;
create policy delivery_routes_select on public.delivery_routes
  for select to authenticated
  using (app.is_staff()
         or (courier_id = (select app.current_courier_id())
             and status in ('RELEASED','IN_PROGRESS','COMPLETED')));

-- Paradas e vínculos herdam a visibilidade do roteiro.
drop policy if exists route_stops_select on public.route_stops;
create policy route_stops_select on public.route_stops
  for select to authenticated
  using (exists (select 1 from public.delivery_routes r where r.id = route_stops.route_id));
drop policy if exists route_packages_select on public.route_packages;
create policy route_packages_select on public.route_packages
  for select to authenticated
  using (exists (select 1 from public.delivery_routes r where r.id = route_packages.route_id));

drop policy if exists route_events_select on public.route_events;
create policy route_events_select on public.route_events
  for select to authenticated using (app.is_staff());
drop policy if exists route_optimization_logs_select on public.route_optimization_logs;
create policy route_optimization_logs_select on public.route_optimization_logs
  for select to authenticated using (app.is_staff());

drop policy if exists loading_manifests_select on public.loading_manifests;
create policy loading_manifests_select on public.loading_manifests
  for select to authenticated
  using (app.is_staff() or courier_id = (select app.current_courier_id()));
drop policy if exists package_scans_select on public.package_scans;
create policy package_scans_select on public.package_scans
  for select to authenticated
  using (app.is_staff() or courier_id = (select app.current_courier_id()));
drop policy if exists delivery_attempts_select on public.delivery_attempts;
create policy delivery_attempts_select on public.delivery_attempts
  for select to authenticated
  using (app.is_staff() or courier_id = (select app.current_courier_id()));
drop policy if exists delivery_proofs_select on public.delivery_proofs;
create policy delivery_proofs_select on public.delivery_proofs
  for select to authenticated
  using (app.is_staff() or courier_id = (select app.current_courier_id()));

-- Arquivo de comprovante: legível por quem enxerga o registro correspondente.
drop policy if exists delivery_proofs_storage_select on storage.objects;
create policy delivery_proofs_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'proofs' and exists (
    select 1 from public.delivery_proofs dp where dp.storage_path = storage.objects.name));

-- ------------------------------------------------------------------
-- Privilégios
-- ------------------------------------------------------------------
-- No Supabase, tabela e função novas nascem liberadas para anon e
-- authenticated. Aqui isso é fechado: visitante não acessa nada, e as
-- tabelas operacionais só mudam pelas funções acima.
do $$ declare t text;
begin
  foreach t in array array[
    'postal_code_regions','postal_code_assignments','distribution_batches','packages',
    'package_assignments','delivery_routes','route_stops','route_packages','route_events',
    'route_optimization_logs','loading_manifests','package_scans','delivery_attempts',
    'delivery_proofs','manifest_items'
  ] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
grant insert, update, delete on public.postal_code_regions, public.postal_code_assignments to authenticated;
grant insert, update on public.distribution_batches to authenticated;
grant update on public.packages to authenticated;

revoke all on sequence public.distribution_batch_seq from anon, authenticated;
revoke all on sequence public.route_events_id_seq from anon, authenticated;
revoke all on sequence public.route_optimization_logs_id_seq from anon, authenticated;

-- Funções da API: somente usuários autenticados (a regra de quem pode o quê
-- está dentro de cada função).
do $$ declare f record;
begin
  for f in
    select p.oid::regprocedure as signature
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'resolve_postal_code','import_packages','distribute_batch','assign_packages','cancel_packages',
         'hold_packages',
         'save_route_plan','set_routes_status','transfer_route','reorder_route_stops','start_route',
         'register_delivery_attempt','add_delivery_proof','open_manifest','depart_manifest',
         'register_package_scan','close_manifest','resolve_attempt_conflict','batch_overview',
         'logistics_client_config','list_packages','courier_plan','package_detail',
         'list_attempt_conflicts','rider_day')
  loop
    execute format('revoke execute on function %s from public, anon', f.signature);
    execute format('grant execute on function %s to authenticated, service_role', f.signature);
  end loop;
  -- Funções internas: nunca chamadas diretamente por um usuário.
  for f in
    select p.oid::regprocedure as signature
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app'
       and p.proname in (
         'distribution_settings','match_postal_code','courier_package_limit','courier_batch_load',
         'assign_package','refresh_stop','refresh_route','unroute_package','handover_package',
         'apply_attempt','set_batch_code','guard_batch_write','guard_package_update',
         'guard_occurrence_links','set_created_by','audit_row_change','guard_courier_limit')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.signature);
  end loop;
end $$;
grant execute on function app.is_dispatch_staff() to authenticated, service_role;
