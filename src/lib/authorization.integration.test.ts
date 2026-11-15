// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

/**
 * PostgreSQL real em WASM, sem credenciais ou dados de produção. Simula o papel
 * autenticado do PostgREST com JWT local e aplica a migração de verdade.
 * Não é mock de RLS nem comparação por regex de arquivos SQL.
 */
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ADMIN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SUPER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const COURIER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const PHARMACY = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const OTHER = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const UNIT = '11111111-1111-4111-8111-111111111111'
const CONTRACT = '22222222-2222-4222-8222-222222222222'
const COURIER_ID = '33333333-3333-4333-8333-333333333333'
const SECOND_COURIER = 'aaaa1111-1111-4111-8111-111111111111'
const ORDER = '44444444-4444-4444-8444-444444444444'
const OTHER_ORDER = '55555555-5555-4555-8555-555555555555'
const OFFER = '66666666-6666-4666-8666-666666666666'
const EXPIRED_OFFER = '77777777-7777-4777-8777-777777777777'
const OTHER_OFFER = '88888888-8888-4888-8888-888888888888'
let db: PGlite

const schema = `
create role anon;
create role authenticated;
create role service_role;
create schema app;
create schema auth;
create type public.user_role as enum ('SUPER_ADMIN','ADMIN','DISPATCHER','FINANCE','PHARMACY_ADMIN','PHARMACY_STAFF','COURIER');
create type public.order_status as enum ('DRAFT','PENDING','OFFERED','ASSIGNED','ACCEPTED','PICKING_UP','COLLECTED','IN_TRANSIT','DELIVERED','FAILED','CANCELLED');
create type public.order_priority as enum ('NORMAL','HIGH','URGENT');
create type public.offer_status as enum ('PENDING','ACCEPTED','DECLINED','EXPIRED','CANCELLED');
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create table auth.users (
  id uuid primary key, email text, encrypted_password text, raw_user_meta_data jsonb default '{}'::jsonb
);
create table public.profiles (
  id uuid primary key, email text, full_name text default '', phone text, role public.user_role,
  pharmacy_id uuid, is_active boolean default true, must_change_password boolean default false,
  last_seen_at timestamptz, avatar_url text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.pharmacy_units (
  id uuid primary key, pharmacy_id uuid, is_active boolean default true,
  latitude double precision, longitude double precision, zip_code text, street text, number text,
  complement text, district text, city text, state text
);
create table public.contracts (
  id uuid primary key, pharmacy_id uuid, status text,
  base_price_cents integer, included_km numeric, price_per_extra_km_cents integer,
  courier_payout_cents integer, urgency_fee_cents integer, temperature_fee_cents integer
);
create table public.couriers (
  id uuid primary key, profile_id uuid, status text, availability text,
  phone text, location_sharing_enabled boolean default false, current_latitude double precision,
  current_longitude double precision, current_location_at timestamptz, notes text, updated_at timestamptz default now()
);
create table public.orders (
  id uuid primary key, code text not null, pharmacy_id uuid, unit_id uuid,
  created_by uuid, status public.order_status default 'PENDING', priority public.order_priority default 'NORMAL',
  courier_id uuid, contract_id uuid, quoted_price_cents integer default 0, courier_payout_cents integer default 0,
  pickup_latitude double precision, pickup_longitude double precision, is_temperature_controlled boolean default false,
  pickup_zip_code text, pickup_street text, pickup_number text, pickup_complement text,
  pickup_district text, pickup_city text, pickup_state text,
  delivery_latitude double precision, delivery_longitude double precision, estimated_distance_km numeric,
  assigned_at timestamptz, accepted_at timestamptz, collected_at timestamptz,
  delivered_at timestamptz, cancelled_at timestamptz, cancel_reason text, dispatch_notes text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.delivery_offers (
  id uuid primary key, order_id uuid, courier_id uuid, status public.offer_status default 'PENDING',
  expires_at timestamptz, responded_at timestamptz, message text, created_at timestamptz default now()
);
create table public.order_events (
  id bigserial primary key, order_id uuid, status public.order_status,
  event text, description text, actor_id uuid
);
create function app.set_order_code() returns trigger language plpgsql as $$
begin if new.code is null then new.code := 'TEST-' || substring(new.id::text,1,8); end if; return new; end $$;
create trigger set_order_code before insert on public.orders for each row execute function app.set_order_code();
alter table public.profiles enable row level security;
alter table public.couriers enable row level security;
alter table public.orders enable row level security;
alter table public.delivery_offers enable row level security;
create policy profiles_select on public.profiles for select using
  (id=auth.uid() or app.is_staff());
create policy profiles_update_self on public.profiles for update using (id=auth.uid())
  with check (id=auth.uid() and role=app.current_role());
create policy profiles_admin_all on public.profiles for all using (app.is_admin()) with check (app.is_admin());
create policy couriers_select on public.couriers for select using
  (profile_id=auth.uid() or app.is_staff());
create policy couriers_update_self on public.couriers for update using (profile_id=auth.uid())
  with check (profile_id=auth.uid());
create policy couriers_update_staff on public.couriers for update using (app.is_staff()) with check (app.is_staff());
create policy orders_select on public.orders for select using
  (app.is_staff() or pharmacy_id=app.current_pharmacy_id() or courier_id=app.current_courier_id());
create policy orders_insert on public.orders for insert with check
  (app.is_staff() or (app.is_pharmacy_user() and pharmacy_id=app.current_pharmacy_id()));
create policy offers_select on public.delivery_offers for select using
  (app.is_staff() or courier_id=app.current_courier_id());
create policy offers_insert on public.delivery_offers for insert with check (app.is_staff());
create policy offers_update on public.delivery_offers for update using
  (app.is_staff() or courier_id=app.current_courier_id())
  with check (app.is_staff() or courier_id=app.current_courier_id());
grant usage on schema public, app, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
grant execute on all functions in schema app, auth to authenticated;
`

async function asUser<T>(id: string, callback: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`)
  try { return await callback() } finally { await db.exec('reset role;') }
}

beforeAll(async () => {
  db = new PGlite()
  // Funções app.is_* das políticas são definidas pela migração. Crie apenas
  // tabelas e policies depois de aplicar os helpers, em duas passagens.
  const [tables, policies] = schema.split('alter table public.profiles enable row level security;')
  await db.exec(tables)
  const sql = readFileSync(resolve('supabase/migrations/20261115000700_authorization_hardening.sql'), 'utf8')
  // Os helpers precisam existir antes das policies de teste; a migração é
  // reaplicada ao final para cobrir a substituição da policy orders_update.
  const helpers = sql.slice(0, sql.indexOf('-- Proteção por coluna com OLD/NEW:'))
  await db.exec(helpers)
  await db.exec('alter table public.profiles enable row level security;' + policies)
  await db.exec(sql)
  await db.exec(`create trigger offer_response after insert or update of status on public.delivery_offers
    for each row execute function app.trg_offer_response();`)
  await db.exec(`
    insert into auth.users(id,email,encrypted_password) values
      ('${A}','farmacia@teste','old'),('${ADMIN}','admin@teste','old'),
      ('${SUPER}','super@teste','old'),('${COURIER}','entregador@teste','old'),
      ('${PHARMACY}','outra@teste','old'),('${OTHER}','outro@teste','old');
    insert into profiles(id,email,role,pharmacy_id,must_change_password) values
      ('${A}','farmacia@teste','PHARMACY_ADMIN','${PHARMACY}',true),
      ('${ADMIN}','admin@teste','ADMIN',null,false),
      ('${SUPER}','super@teste','SUPER_ADMIN',null,false),
      ('${COURIER}','entregador@teste','COURIER',null,false),
      ('${OTHER}','outro@teste','COURIER',null,false);
    insert into pharmacy_units(id,pharmacy_id,latitude,longitude,street,city,state) values
      ('${UNIT}','${PHARMACY}',-23.55,-46.63,'Rua verdadeira','São Paulo','SP');
    insert into contracts(id,pharmacy_id,status,base_price_cents,included_km,
      price_per_extra_km_cents,courier_payout_cents,urgency_fee_cents,temperature_fee_cents)
    values ('${CONTRACT}','${PHARMACY}','ACTIVE',2000,10,100,1000,400,200);
    insert into couriers(id,profile_id,status,availability,phone) values
      ('${COURIER_ID}','${COURIER}','ACTIVE','AVAILABLE','11999999999'),
      ('${SECOND_COURIER}','${OTHER}','ACTIVE','AVAILABLE','11888888888');
    insert into orders(id,code,pharmacy_id,unit_id,courier_id,status,quoted_price_cents)
    values ('${ORDER}','TEST-1','${PHARMACY}','${UNIT}',null,'OFFERED',2000),
           ('${OTHER_ORDER}','TEST-2','${PHARMACY}','${UNIT}',null,'OFFERED',2000);
    insert into delivery_offers(id,order_id,courier_id,expires_at) values
      ('${OFFER}','${ORDER}','${COURIER_ID}',now()+interval '15 minutes'),
      ('${OTHER_OFFER}','${ORDER}','${SECOND_COURIER}',now()+interval '15 minutes'),
      ('${EXPIRED_OFFER}','${OTHER_ORDER}','${COURIER_ID}',now()-interval '1 minute');
  `)
  await db.exec(`create trigger on_auth_user_created after insert on auth.users
    for each row execute function app.handle_new_user();`)
}, 30000)
afterAll(async () => { await db?.close() })

describe('autorização real do PostgreSQL (RLS + triggers)', () => {
  it('não concede papel ou farmácia informados em metadados de signup', async () => {
    const id = 'abababab-abab-4bab-8bab-abababababab'
    await db.query(`insert into auth.users(id,email,raw_user_meta_data) values
      ('${id}','forjado@teste','{"role":"SUPER_ADMIN","pharmacy_id":"${PHARMACY}"}')`)
    const { rows } = await db.query<{ role: string; pharmacy_id: string | null }>(
      `select role,pharmacy_id from profiles where id='${id}'`,
    )
    expect(rows[0]).toEqual({ role: 'PHARMACY_STAFF', pharmacy_id: null })
  })

  it('impede promoção e alteração de privilégios/flags próprios sem desativar conta alguma', async () => {
    await asUser(A, async () => {
      await expect(db.query(`update profiles set role='ADMIN' where id='${A}'`)).rejects.toThrow()
      await expect(db.query(`update profiles set pharmacy_id='${OTHER}' where id='${A}'`)).rejects.toThrow()
      await expect(db.query(`update profiles set is_active=false where id='${A}'`)).rejects.toThrow()
      await expect(db.query(`update profiles set must_change_password=false where id='${A}'`)).rejects.toThrow()
      await db.query(`update profiles set full_name='Nome permitido' where id='${A}'`)
    })
    await asUser(ADMIN, async () => {
      await expect(db.query(`update profiles set role='SUPER_ADMIN' where id='${OTHER}'`)).rejects.toThrow()
      await expect(db.query(`insert into profiles(id,email,role) values ('${PHARMACY}','new@teste','SUPER_ADMIN')`)).rejects.toThrow()
      await expect(db.query(`delete from profiles where id='${OTHER}'`)).rejects.toThrow()
    })
    const { rows } = await db.query<{ role: string; is_active: boolean; must_change_password: boolean }>(
      `select role,is_active,must_change_password from profiles where id='${A}'`,
    )
    expect(rows[0]).toEqual({ role: 'PHARMACY_ADMIN', is_active: true, must_change_password: true })
  })

  it('vincula a liberação de troca de senha ao evento real do Auth', async () => {
    await db.query(`update auth.users set encrypted_password='new-hash' where id='${A}'`)
    const { rows } = await db.query<{ must_change_password: boolean }>(
      `select must_change_password from profiles where id='${A}'`,
    )
    expect(rows[0].must_change_password).toBe(false)
  })

  it('não permite ao entregador aprovar o próprio cadastro ou alterar valor do pedido', async () => {
    await asUser(COURIER, async () => {
      await expect(db.query(`update couriers set status='SUSPENDED' where id='${COURIER_ID}'`)).rejects.toThrow()
      await db.query(`update couriers set phone='11888888888' where id='${COURIER_ID}'`)
      // O pedido ainda não está vinculado ao entregador; nenhum UPDATE permitido.
      const { rowCount } = await db.query(`update orders set quoted_price_cents=1 where id='${ORDER}'`)
      expect(rowCount).toBe(0)
    })
  })

  it('calcula preço/repasse no banco e valida unidade e contrato no INSERT', async () => {
    const newOrder = '99999999-9999-4999-8999-999999999999'
    await asUser(A, async () => {
      const { rows } = await db.query<{ quoted_price_cents: number; courier_payout_cents: number; created_by: string; pickup_latitude: number; pickup_street: string }>(`
        insert into orders(id,code,pharmacy_id,unit_id,contract_id,status,priority,
          quoted_price_cents,courier_payout_cents,pickup_latitude,pickup_street,delivery_latitude,delivery_longitude)
        values ('${newOrder}','FORGED','${PHARMACY}','${UNIT}','${CONTRACT}',
          'PENDING','URGENT',1,99999,0,'Rua falsa',-23.55,-46.63)
        returning quoted_price_cents,courier_payout_cents,created_by,pickup_latitude,pickup_street
      `)
      expect(rows[0]).toMatchObject({ quoted_price_cents: 2400, courier_payout_cents: 1000, created_by: A, pickup_latitude: -23.55, pickup_street: 'Rua verdadeira' })
      await expect(db.query(`insert into orders(id,code,pharmacy_id,unit_id,status)
        values (gen_random_uuid(),'X','${PHARMACY}','${OTHER}','PENDING')`)).rejects.toThrow()
      await expect(db.query(`insert into orders(id,code,pharmacy_id,unit_id,contract_id,status)
        values (gen_random_uuid(),'X','${PHARMACY}','${UNIT}','${OTHER}','PENDING')`)).rejects.toThrow()
    })
  })

  it('recusa oferta expirada, vínculo alterado e aceite duplicado; aceita oferta válida uma vez', async () => {
    await asUser(COURIER, async () => {
      await expect(db.query(`update delivery_offers set status='ACCEPTED' where id='${EXPIRED_OFFER}'`)).rejects.toThrow()
      await expect(db.query(`update delivery_offers set order_id='${OTHER_ORDER}',status='ACCEPTED' where id='${OFFER}'`)).rejects.toThrow()
      await db.query(`update delivery_offers set status='ACCEPTED' where id='${OFFER}'`)
      const { rows } = await db.query<{ status: string; courier_id: string }>(`select status,courier_id from orders where id='${ORDER}'`)
      expect(rows[0]).toMatchObject({ status: 'ACCEPTED', courier_id: COURIER_ID })
      await expect(db.query(`update delivery_offers set status='DECLINED' where id='${OFFER}'`)).rejects.toThrow()
    })
    const { rows: other } = await db.query<{ status: string }>(`select status from delivery_offers where id='${OTHER_OFFER}'`)
    expect(other[0].status).toBe('CANCELLED')
    // Uma resposta concorrente já iniciada pode ter lido a oferta antes do
    // CANCELLED. Mesmo se reobtiver uma versão PENDING, o pedido não pode
    // ganhar um segundo entregador (predicado do UPDATE atômico).
    await db.query(`update delivery_offers set status='PENDING' where id='${OTHER_OFFER}'`)
    await asUser(OTHER, async () => {
      await expect(db.query(`update delivery_offers set status='ACCEPTED' where id='${OTHER_OFFER}'`)).rejects.toThrow('Pedido indisponível')
    })
  })

  it('rejeita salto de etapas e alteração de repasse, permite próximo passo legítimo', async () => {
    await asUser(COURIER, async () => {
      await expect(db.query(`update orders set status='DELIVERED' where id='${ORDER}'`)).rejects.toThrow()
      await expect(db.query(`update orders set courier_payout_cents=99999 where id='${ORDER}'`)).rejects.toThrow()
      await db.query(`update orders set status='PICKING_UP' where id='${ORDER}'`)
    })
    const { rows } = await db.query<{ status: string; courier_payout_cents: number }>(
      `select status,courier_payout_cents from orders where id='${ORDER}'`,
    )
    expect(rows[0]).toMatchObject({ status: 'PICKING_UP', courier_payout_cents: 0 })
  })
})
