-- =====================================================================
-- D'Luca Connect — 04 · Segurança: helpers, RLS, storage, auditoria
-- =====================================================================

-- ------------------------------------------------------------------
-- Helpers (SECURITY DEFINER para evitar recursão de RLS em profiles)
-- ------------------------------------------------------------------
create or replace function app.current_role()
returns public.user_role
language sql stable security definer set search_path = public, app as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function app.current_pharmacy_id()
returns uuid
language sql stable security definer set search_path = public, app as $$
  select pharmacy_id from public.profiles where id = auth.uid();
$$;

create or replace function app.current_courier_id()
returns uuid
language sql stable security definer set search_path = public, app as $$
  select id from public.couriers where profile_id = auth.uid();
$$;

create or replace function app.is_staff()
returns boolean
language sql stable security definer set search_path = public, app as $$
  select coalesce((select role from public.profiles where id = auth.uid())
    in ('SUPER_ADMIN','ADMIN','DISPATCHER','FINANCE'), false);
$$;

create or replace function app.is_admin()
returns boolean
language sql stable security definer set search_path = public, app as $$
  select coalesce((select role from public.profiles where id = auth.uid())
    in ('SUPER_ADMIN','ADMIN'), false);
$$;

create or replace function app.is_super_admin()
returns boolean
language sql stable security definer set search_path = public, app as $$
  select coalesce((select role from public.profiles where id = auth.uid())
    = 'SUPER_ADMIN', false);
$$;

create or replace function app.is_finance()
returns boolean
language sql stable security definer set search_path = public, app as $$
  select coalesce((select role from public.profiles where id = auth.uid())
    in ('SUPER_ADMIN','ADMIN','FINANCE'), false);
$$;

create or replace function app.is_pharmacy_user()
returns boolean
language sql stable security definer set search_path = public, app as $$
  select coalesce((select role from public.profiles where id = auth.uid())
    in ('PHARMACY_ADMIN','PHARMACY_STAFF'), false);
$$;

create or replace function app.is_courier_user()
returns boolean
language sql stable security definer set search_path = public, app as $$
  select coalesce((select role from public.profiles where id = auth.uid()) = 'COURIER', false);
$$;

-- auditoria central
create or replace function app.audit(
  p_action text, p_entity text, p_entity_id text, p_description text, p_metadata jsonb default '{}'::jsonb
) returns void language sql security definer set search_path = public, app as $$
  insert into public.audit_logs(actor_id, actor_email, actor_role, action, entity, entity_id, description, metadata)
  select auth.uid(), p.email, p.role, p_action, p_entity, p_entity_id, p_description, p_metadata
  from (select email, role from public.profiles where id = auth.uid()) p;
$$;

-- ------------------------------------------------------------------
-- Habilitar RLS em todas as tabelas públicas
-- ------------------------------------------------------------------
do $$ declare t text;
begin
  foreach t in array array[
    'profiles','pharmacies','pharmacy_units','couriers','courier_applications','leads',
    'audit_logs','settings','notifications','orders','order_events','courier_locations',
    'delivery_offers','order_assignments','occurrences','proofs',
    'contracts','invoices','invoice_items','payments','courier_payouts'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ------------------------------------------------------------------
-- PROFILES
-- ------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (
  id = auth.uid()
  or app.is_staff()
  or (app.is_pharmacy_user() and pharmacy_id = app.current_pharmacy_id())
);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update using (id = auth.uid())
  with check (
    id = auth.uid()
    -- um usuário não pode escalar a própria função
    and role = (select p.role from public.profiles p where p.id = auth.uid())
  );

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles for all using (app.is_admin()) with check (app.is_admin());

-- ------------------------------------------------------------------
-- PHARMACIES
-- ------------------------------------------------------------------
drop policy if exists pharmacies_select on public.pharmacies;
create policy pharmacies_select on public.pharmacies for select using (
  app.is_staff() or id = app.current_pharmacy_id()
);
drop policy if exists pharmacies_write on public.pharmacies;
create policy pharmacies_write on public.pharmacies for insert with check (app.is_staff());
drop policy if exists pharmacies_update on public.pharmacies;
create policy pharmacies_update on public.pharmacies for update using (
  app.is_staff() or (app.current_role() = 'PHARMACY_ADMIN' and id = app.current_pharmacy_id())
) with check (
  app.is_staff() or (app.current_role() = 'PHARMACY_ADMIN' and id = app.current_pharmacy_id())
);

-- ------------------------------------------------------------------
-- PHARMACY UNITS
-- ------------------------------------------------------------------
drop policy if exists units_select on public.pharmacy_units;
create policy units_select on public.pharmacy_units for select using (
  app.is_staff()
  or pharmacy_id = app.current_pharmacy_id()
  or exists (select 1 from public.orders o where o.unit_id = pharmacy_units.id and o.courier_id = app.current_courier_id())
);
drop policy if exists units_write on public.pharmacy_units;
create policy units_write on public.pharmacy_units for insert with check (
  app.is_staff() or (app.current_role() = 'PHARMACY_ADMIN' and pharmacy_id = app.current_pharmacy_id())
);
drop policy if exists units_update on public.pharmacy_units;
create policy units_update on public.pharmacy_units for update using (
  app.is_staff() or (app.current_role() = 'PHARMACY_ADMIN' and pharmacy_id = app.current_pharmacy_id())
) with check (
  app.is_staff() or (app.current_role() = 'PHARMACY_ADMIN' and pharmacy_id = app.current_pharmacy_id())
);
drop policy if exists units_delete on public.pharmacy_units;
create policy units_delete on public.pharmacy_units for delete using (
  app.is_staff() or (app.current_role() = 'PHARMACY_ADMIN' and pharmacy_id = app.current_pharmacy_id())
);

-- ------------------------------------------------------------------
-- COURIERS
-- ------------------------------------------------------------------
drop policy if exists couriers_select on public.couriers;
create policy couriers_select on public.couriers for select using (
  app.is_staff()
  or profile_id = auth.uid()
  or (app.is_pharmacy_user() and exists (
        select 1 from public.orders o
         where o.courier_id = couriers.id and o.pharmacy_id = app.current_pharmacy_id()))
);
drop policy if exists couriers_write on public.couriers;
create policy couriers_write on public.couriers for insert with check (app.is_staff());
drop policy if exists couriers_update_staff on public.couriers;
create policy couriers_update_staff on public.couriers for update using (app.is_staff()) with check (app.is_staff());
-- entregador atualiza apenas o próprio perfil operacional
drop policy if exists couriers_update_self on public.couriers;
create policy couriers_update_self on public.couriers for update using (profile_id = auth.uid())
with check (profile_id = auth.uid());

-- ------------------------------------------------------------------
-- CANDIDATURAS / LEADS — escrita pública (site), leitura restrita
-- ------------------------------------------------------------------
drop policy if exists applications_insert_public on public.courier_applications;
create policy applications_insert_public on public.courier_applications for insert to anon, authenticated with check (true);
drop policy if exists applications_select on public.courier_applications;
create policy applications_select on public.courier_applications for select using (app.is_staff());
drop policy if exists applications_update on public.courier_applications;
create policy applications_update on public.courier_applications for update using (app.is_staff()) with check (app.is_staff());

drop policy if exists leads_insert_public on public.leads;
create policy leads_insert_public on public.leads for insert to anon, authenticated with check (true);
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads for select using (app.is_staff());
drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads for update using (app.is_staff()) with check (app.is_staff());

-- ------------------------------------------------------------------
-- ORDERS
-- ------------------------------------------------------------------
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders for select using (
  app.is_staff()
  or pharmacy_id = app.current_pharmacy_id()
  or courier_id = app.current_courier_id()
  or exists (select 1 from public.delivery_offers f
              where f.order_id = orders.id and f.courier_id = app.current_courier_id()
                and f.status in ('PENDING','ACCEPTED'))
);
drop policy if exists orders_insert on public.orders;
create policy orders_insert on public.orders for insert with check (
  app.is_staff() or (app.is_pharmacy_user() and pharmacy_id = app.current_pharmacy_id())
);
drop policy if exists orders_update on public.orders;
create policy orders_update on public.orders for update using (
  app.is_staff()
  or (app.is_pharmacy_user() and pharmacy_id = app.current_pharmacy_id() and status in ('DRAFT','PENDING','CANCELLED'))
  or (courier_id = app.current_courier_id())
) with check (
  app.is_staff()
  or (app.is_pharmacy_user() and pharmacy_id = app.current_pharmacy_id())
  or (courier_id = app.current_courier_id())
);
drop policy if exists orders_delete on public.orders;
create policy orders_delete on public.orders for delete using (
  app.is_admin() or (app.current_role() = 'PHARMACY_ADMIN' and pharmacy_id = app.current_pharmacy_id() and status = 'DRAFT')
);

-- ------------------------------------------------------------------
-- ORDER EVENTS
-- ------------------------------------------------------------------
drop policy if exists order_events_select on public.order_events;
create policy order_events_select on public.order_events for select using (
  exists (select 1 from public.orders o where o.id = order_events.order_id)
);
drop policy if exists order_events_insert on public.order_events;
create policy order_events_insert on public.order_events for insert with check (
  exists (select 1 from public.orders o where o.id = order_events.order_id)
);

-- ------------------------------------------------------------------
-- COURIER LOCATIONS — entregador grava; farmácia só vê com autorização
-- ------------------------------------------------------------------
drop policy if exists locations_insert on public.courier_locations;
create policy locations_insert on public.courier_locations for insert with check (
  courier_id = app.current_courier_id() or app.is_staff()
);
drop policy if exists locations_select on public.courier_locations;
create policy locations_select on public.courier_locations for select using (
  courier_id = app.current_courier_id()
  or app.is_staff()
  or (app.is_pharmacy_user() and exists (
        select 1 from public.orders o
          join public.couriers c on c.id = o.courier_id
         where o.id = courier_locations.order_id
           and o.pharmacy_id = app.current_pharmacy_id()
           and c.location_sharing_enabled = true
           and o.status in ('ACCEPTED','PICKING_UP','COLLECTED','IN_TRANSIT')))
);

-- ------------------------------------------------------------------
-- DELIVERY OFFERS
-- ------------------------------------------------------------------
drop policy if exists offers_select on public.delivery_offers;
create policy offers_select on public.delivery_offers for select using (
  app.is_staff() or courier_id = app.current_courier_id()
);
drop policy if exists offers_insert on public.delivery_offers;
create policy offers_insert on public.delivery_offers for insert with check (app.is_staff());
drop policy if exists offers_update on public.delivery_offers;
create policy offers_update on public.delivery_offers for update using (
  app.is_staff() or courier_id = app.current_courier_id()
) with check (
  app.is_staff() or courier_id = app.current_courier_id()
);

-- ------------------------------------------------------------------
-- ORDER ASSIGNMENTS
-- ------------------------------------------------------------------
drop policy if exists assignments_select on public.order_assignments;
create policy assignments_select on public.order_assignments for select using (app.is_staff());
drop policy if exists assignments_insert on public.order_assignments;
create policy assignments_insert on public.order_assignments for insert with check (app.is_staff());

-- ------------------------------------------------------------------
-- OCCURRENCES
-- ------------------------------------------------------------------
drop policy if exists occurrences_select on public.occurrences;
create policy occurrences_select on public.occurrences for select using (
  app.is_staff()
  or pharmacy_id = app.current_pharmacy_id()
  or courier_id = app.current_courier_id()
);
drop policy if exists occurrences_insert on public.occurrences;
create policy occurrences_insert on public.occurrences for insert with check (
  app.is_staff()
  or courier_id = app.current_courier_id()
  or (app.is_pharmacy_user() and pharmacy_id = app.current_pharmacy_id())
);
drop policy if exists occurrences_update on public.occurrences;
create policy occurrences_update on public.occurrences for update using (app.is_staff()) with check (app.is_staff());

-- ------------------------------------------------------------------
-- PROOFS
-- ------------------------------------------------------------------
drop policy if exists proofs_select on public.proofs;
create policy proofs_select on public.proofs for select using (
  exists (select 1 from public.orders o where o.id = proofs.order_id)
);
drop policy if exists proofs_insert on public.proofs;
create policy proofs_insert on public.proofs for insert with check (
  exists (select 1 from public.orders o where o.id = proofs.order_id)
);

-- ------------------------------------------------------------------
-- CONTRACTS
-- ------------------------------------------------------------------
drop policy if exists contracts_select on public.contracts;
create policy contracts_select on public.contracts for select using (
  app.is_staff() or pharmacy_id = app.current_pharmacy_id()
);
drop policy if exists contracts_write on public.contracts;
create policy contracts_write on public.contracts for all using (app.is_finance()) with check (app.is_finance());

-- ------------------------------------------------------------------
-- INVOICES / ITEMS / PAYMENTS
-- ------------------------------------------------------------------
drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices for select using (
  app.is_finance() or app.is_staff() or pharmacy_id = app.current_pharmacy_id()
);
drop policy if exists invoices_write on public.invoices;
create policy invoices_write on public.invoices for all using (app.is_finance()) with check (app.is_finance());

drop policy if exists invoice_items_select on public.invoice_items;
create policy invoice_items_select on public.invoice_items for select using (
  exists (select 1 from public.invoices i where i.id = invoice_items.invoice_id)
);
drop policy if exists invoice_items_write on public.invoice_items;
create policy invoice_items_write on public.invoice_items for all using (app.is_finance()) with check (app.is_finance());

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select using (
  exists (select 1 from public.invoices i where i.id = payments.invoice_id)
);
drop policy if exists payments_write on public.payments;
create policy payments_write on public.payments for all using (app.is_finance()) with check (app.is_finance());

drop policy if exists payouts_select on public.courier_payouts;
create policy payouts_select on public.courier_payouts for select using (
  app.is_finance() or app.is_staff() or courier_id = app.current_courier_id()
);
drop policy if exists payouts_write on public.courier_payouts;
create policy payouts_write on public.courier_payouts for all using (app.is_finance()) with check (app.is_finance());

-- ------------------------------------------------------------------
-- AUDIT LOGS — somente leitura para admin/super
-- ------------------------------------------------------------------
drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs for select using (app.is_admin());
drop policy if exists audit_insert on public.audit_logs;
create policy audit_insert on public.audit_logs for insert with check (app.is_staff());

-- ------------------------------------------------------------------
-- SETTINGS
-- ------------------------------------------------------------------
drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings for select using (app.is_staff());
drop policy if exists settings_write on public.settings;
create policy settings_write on public.settings for all using (app.is_admin()) with check (app.is_admin());

-- ------------------------------------------------------------------
-- NOTIFICATIONS
-- ------------------------------------------------------------------
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select using (user_id = auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ------------------------------------------------------------------
-- Realtime
-- ------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.delivery_offers;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.courier_locations;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.invoices;
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------------
-- Storage buckets
-- ------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs','proofs', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts','receipts', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

drop policy if exists proofs_storage_insert on storage.objects;
create policy proofs_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs');

drop policy if exists proofs_storage_select on storage.objects;
create policy proofs_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'proofs' and exists (
    select 1 from public.proofs p where p.storage_path = storage.objects.name
  ));

drop policy if exists receipts_storage_all on storage.objects;
create policy receipts_storage_all on storage.objects for all to authenticated
  using (bucket_id = 'receipts' and app.is_finance())
  with check (bucket_id = 'receipts' and app.is_finance());

-- ------------------------------------------------------------------
-- Permissões de execução
-- ------------------------------------------------------------------
grant usage on schema app to anon, authenticated, service_role;
grant execute on all functions in schema app to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;
