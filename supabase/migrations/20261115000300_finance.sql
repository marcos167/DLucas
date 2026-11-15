-- =====================================================================
-- D'Luca Connect — 03 · Financeiro: contratos, faturas, pagamentos
-- =====================================================================

do $$ begin
  create type public.contract_status as enum ('DRAFT','ACTIVE','SUSPENDED','ENDED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invoice_status as enum ('DRAFT','OPEN','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_method as enum ('PIX','TRANSFER','CASH','CARD','OTHER');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------------
-- Contratos comerciais
-- ------------------------------------------------------------------
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  name text not null,
  status public.contract_status not null default 'ACTIVE',
  base_price_cents integer not null default 0 check (base_price_cents >= 0),
  included_km numeric(8,2) not null default 10,
  price_per_extra_km_cents integer not null default 0 check (price_per_extra_km_cents >= 0),
  courier_payout_cents integer not null default 0 check (courier_payout_cents >= 0),
  urgency_fee_cents integer not null default 0 check (urgency_fee_cents >= 0),
  temperature_fee_cents integer not null default 0 check (temperature_fee_cents >= 0),
  billing_cycle text not null default 'MONTHLY', -- MONTHLY | BIWEEKLY | ON_DEMAND
  payment_terms_days integer not null default 15 check (payment_terms_days >= 0),
  starts_on date not null default current_date,
  ends_on date,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contracts_pharmacy_idx on public.contracts(pharmacy_id, status);

alter table public.orders drop constraint if exists orders_contract_fk;
alter table public.orders
  add constraint orders_contract_fk foreign key (contract_id) references public.contracts(id) on delete set null;

-- ------------------------------------------------------------------
-- Faturas
-- ------------------------------------------------------------------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  pharmacy_id uuid not null references public.pharmacies(id) on delete restrict,
  contract_id uuid references public.contracts(id) on delete set null,
  status public.invoice_status not null default 'OPEN',
  period_start date,
  period_end date,
  issue_date date not null default current_date,
  due_date date not null,
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  paid_cents integer not null default 0 check (paid_cents >= 0),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoices_pharmacy_idx on public.invoices(pharmacy_id, status);
create index if not exists invoices_due_idx on public.invoices(due_date);

create sequence if not exists public.invoice_number_seq start 1;

create or replace function app.set_invoice_number()
returns trigger language plpgsql as $$
begin
  if new.number is null or new.number = '' then
    new.number := 'FAT-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 4, '0');
  end if;
  return new;
end $$;

drop trigger if exists set_invoice_number on public.invoices;
create trigger set_invoice_number before insert on public.invoices
for each row execute function app.set_invoice_number();

-- ------------------------------------------------------------------
-- Itens da fatura
-- ------------------------------------------------------------------
create table if not exists public.invoice_items (
  id bigserial primary key,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  description text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price_cents integer not null default 0 check (unit_price_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0)
);

create index if not exists invoice_items_invoice_idx on public.invoice_items(invoice_id);

create unique index if not exists invoice_items_order_unique
  on public.invoice_items(order_id) where order_id is not null;

-- ------------------------------------------------------------------
-- Pagamentos (aceita pagamento parcial)
-- ------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  method public.payment_method not null default 'PIX',
  paid_at date not null default current_date,
  reference text,
  receipt_path text,
  notes text,
  registered_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists payments_invoice_idx on public.payments(invoice_id);

-- ------------------------------------------------------------------
-- Repasse a entregadores
-- ------------------------------------------------------------------
do $$ begin
  create type public.payout_status as enum ('PENDING','APPROVED','PAID','CANCELLED');
exception when duplicate_object then null; end $$;

create table if not exists public.courier_payouts (
  id uuid primary key default gen_random_uuid(),
  courier_id uuid not null references public.couriers(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  amount_cents integer not null check (amount_cents > 0),
  status public.payout_status not null default 'PENDING',
  reference_period date,
  paid_at date,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists payouts_courier_idx on public.courier_payouts(courier_id, status);

-- ------------------------------------------------------------------
-- Recalcular totais da fatura a partir de itens e pagamentos
-- ------------------------------------------------------------------
create or replace function app.recalc_invoice_totals(p_invoice uuid)
returns void language plpgsql security definer set search_path = public, app as $$
declare v_subtotal int; v_paid int; v_total int; v_due date; v_status public.invoice_status;
begin
  select coalesce(sum(total_cents),0) into v_subtotal from public.invoice_items where invoice_id = p_invoice;
  select coalesce(sum(amount_cents),0) into v_paid from public.payments where invoice_id = p_invoice;
  select greatest(v_subtotal - discount_cents, 0), due_date, status
    into v_total, v_due, v_status
    from public.invoices where id = p_invoice;

  if v_status = 'CANCELLED' then
    update public.invoices set subtotal_cents = v_subtotal, total_cents = v_total, paid_cents = v_paid where id = p_invoice;
    return;
  end if;

  update public.invoices set
    subtotal_cents = v_subtotal,
    total_cents = v_total,
    paid_cents = v_paid,
    status = case
      when v_paid >= v_total and v_total > 0 then 'PAID'::public.invoice_status
      when v_paid > 0 then 'PARTIALLY_PAID'::public.invoice_status
      when v_due < current_date then 'OVERDUE'::public.invoice_status
      else 'OPEN'::public.invoice_status
    end
  where id = p_invoice;
end $$;

create or replace function app.trg_recalc_invoice()
returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  perform app.recalc_invoice_totals(coalesce(new.invoice_id, old.invoice_id));
  return null;
end $$;

drop trigger if exists recalc_on_item on public.invoice_items;
create trigger recalc_on_item after insert or update or delete on public.invoice_items
for each row execute function app.trg_recalc_invoice();

drop trigger if exists recalc_on_payment on public.payments;
create trigger recalc_on_payment after insert or update or delete on public.payments
for each row execute function app.trg_recalc_invoice();

drop trigger if exists touch_invoices on public.invoices;
create trigger touch_invoices before update on public.invoices
for each row execute function app.touch_updated_at();

drop trigger if exists touch_contracts on public.contracts;
create trigger touch_contracts before update on public.contracts
for each row execute function app.touch_updated_at();
