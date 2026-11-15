// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { distanceKm } from './utils'

/**
 * Executa os arquivos SQL 001–005 e 007 em PostgreSQL WASM, com constraints,
 * enums, triggers e RLS reais. As únicas simulações são as schemas geridas
 * pelo Supabase (auth/storage), o JWT e a publicação Realtime. A 006 altera
 * colunas internas do GoTrue e não participa dos fluxos sob teste.
 */
const PHARMACY = '11111111-1111-4111-8111-111111111111'
const OTHER_PHARMACY = '22222222-2222-4222-8222-222222222222'
const UNIT = '33333333-3333-4333-8333-333333333333'
const CONTRACT = '44444444-4444-4444-8444-444444444444'
const PHARMACY_USER = '55555555-5555-4555-8555-555555555555'
const ADMIN = '66666666-6666-4666-8666-666666666666'
const COURIER_USER = '77777777-7777-4777-8777-777777777777'
const OTHER_COURIER_USER = '88888888-8888-4888-8888-888888888888'
const INACTIVE = '99999999-9999-4999-8999-999999999999'
const COURIER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER_COURIER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ORDER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const OFFER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const OTHER_OFFER = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
let db: PGlite

async function asUser<T>(id: string, action: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`)
  try { return await action() } finally { await db.exec('reset role;') }
}

async function migration(filename: string) {
  let sql = readFileSync(resolve(`supabase/migrations/202611150${filename}.sql`), 'utf8')
  // As extensões não fazem parte do runtime WASM; gen_random_uuid já é nativa.
  if (filename.startsWith('00100_')) sql = sql.replace(/^create extension if not exists .*?;\s*$/gm, '')
  await db.exec(sql)
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
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
  for (const file of [
    '00100_core', '00200_operations', '00300_finance', '00400_security', '00500_offers',
  ]) await migration(file)
  // A instância efetiva protege também pharmacy_id na policy self (o arquivo
  // 004 não o faz). Reconstrói apenas essa divergência conhecida, sem tocar na
  // produção; a proteção por coluna adicional continua no trigger da 007.
  await db.exec(`drop policy profiles_update_self on public.profiles;
    create policy profiles_update_self on public.profiles for update using (id = auth.uid())
    with check (id = auth.uid() and role = app.current_role() and
      pharmacy_id is not distinct from (select p.pharmacy_id from profiles p where p.id = auth.uid()));
    grant usage on schema public, app, auth to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant usage on all sequences in schema public to authenticated;
    grant execute on all functions in schema auth to authenticated;
  `)
  await migration('00700_authorization_hardening')
  await migration('00700_authorization_hardening') // reinstalação idempotente
  await migration('00800_direct_assignment_acceptance')
  await migration('00900_offer_acceptance_contention')
  await db.exec(`
    insert into auth.users(id,email,encrypted_password) values
      ('${PHARMACY_USER}','farmacia@teste','old'),
      ('${ADMIN}','admin@teste','old'),
      ('${COURIER_USER}','entregador@teste','old'),
      ('${OTHER_COURIER_USER}','outro@teste','old'),
      ('${INACTIVE}','inativo@teste','old');
    insert into pharmacies(id,legal_name,trade_name) values
      ('${PHARMACY}','Farmácia Teste','Farmácia Teste'),
      ('${OTHER_PHARMACY}','Farmácia Alheia','Farmácia Alheia');
    update profiles set role='PHARMACY_ADMIN',pharmacy_id='${PHARMACY}',must_change_password=true
      where id='${PHARMACY_USER}';
    update profiles set role='ADMIN' where id='${ADMIN}';
    update profiles set role='COURIER' where id in ('${COURIER_USER}','${OTHER_COURIER_USER}');
    update profiles set role='ADMIN',is_active=false where id='${INACTIVE}';
    insert into pharmacy_units(id,pharmacy_id,name,street,city,state,latitude,longitude)
      values ('${UNIT}','${PHARMACY}','Unidade Teste','Rua verdadeira','São Paulo','SP',-23.55,-46.63);
    insert into contracts(id,pharmacy_id,name,base_price_cents,included_km,
      price_per_extra_km_cents,courier_payout_cents,urgency_fee_cents,temperature_fee_cents)
      values ('${CONTRACT}','${PHARMACY}','Contrato Teste',2000,10,100,1000,400,200);
    insert into couriers(id,profile_id,full_name,phone,status,availability) values
      ('${COURIER}','${COURIER_USER}','Entregador','11999999999','ACTIVE','AVAILABLE'),
      ('${OTHER_COURIER}','${OTHER_COURIER_USER}','Outro Entregador','11888888888','ACTIVE','AVAILABLE');
  `)
}, 30000)
afterAll(async () => { await db?.close() })

describe('esquema completo: autorização e integração de triggers', () => {
  it('bloqueia usuário inativo, promoção e alterações de campos protegidos', async () => {
    await asUser(INACTIVE, async () => {
      const { rows } = await db.query<{ permitted: boolean }>('select app.is_admin() as permitted')
      expect(rows[0].permitted).toBe(false)
      const { rowCount } = await db.query(`update profiles set full_name='Outro' where id='${ADMIN}'`)
      expect(rowCount).toBe(0)
    })
    await asUser(PHARMACY_USER, async () => {
      await expect(db.query(`update profiles set must_change_password=false where id='${PHARMACY_USER}'`)).rejects.toThrow()
      await expect(db.query(`update profiles set pharmacy_id='${OTHER_PHARMACY}' where id='${PHARMACY_USER}'`)).rejects.toThrow()
      await db.query(`update profiles set full_name='Nome permitido' where id='${PHARMACY_USER}'`)
    })
    await asUser(ADMIN, async () => {
      await expect(db.query(`update profiles set role='SUPER_ADMIN' where id='${PHARMACY_USER}'`)).rejects.toThrow()
    })
  })

  it('calcula preço, gera código e registra evento usando constraints/timeline reais', async () => {
    await asUser(PHARMACY_USER, async () => {
      const { rows } = await db.query<{
        id: string; code: string; quoted_price_cents: number; courier_payout_cents: number;
        pickup_street: string; created_by: string
      }>(`insert into orders(id,pharmacy_id,unit_id,contract_id,priority,
          pickup_street,pickup_city,pickup_state,recipient_name,recipient_phone,
          delivery_street,delivery_city,delivery_state,delivery_latitude,delivery_longitude,
          quoted_price_cents,courier_payout_cents,is_temperature_controlled)
        values ('${ORDER}','${PHARMACY}','${UNIT}','${CONTRACT}','URGENT',
          'Origem fraudada','São Paulo','SP','Cliente','11999999999',
          'Destino','São Paulo','SP',-23.55,-46.63,1,99999,true)
        returning id,code,quoted_price_cents,courier_payout_cents,pickup_street,created_by`)
      expect(rows[0]).toMatchObject({
        id: ORDER, quoted_price_cents: 2600, courier_payout_cents: 1000,
        pickup_street: 'Rua verdadeira', created_by: PHARMACY_USER,
      })
      expect(rows[0].code).toMatch(/^DLC-/)
      const { rows: events } = await db.query<{ event: string }>(
        `select event from order_events where order_id='${ORDER}'`,
      )
      expect(events.some((e) => e.event === 'ORDER_CREATED')).toBe(true)
      const { rowCount } = await db.query(`update orders set quoted_price_cents=1 where id='${ORDER}'`)
      expect(rowCount).toBe(0) // RLS remove pedidos da farmácia do escopo de UPDATE
    })
  })

  it('cobrança por distância usa km arredondados e ignora preço/repasse enviados', async () => {
    const id = '12341234-1234-4234-8234-123412341234'
    const km = Number(distanceKm({ lat: -23.55, lng: -46.63 }, { lat: -23.70, lng: -46.63 }).toFixed(2))
    await asUser(PHARMACY_USER, async () => {
      const { rows } = await db.query<{
        estimated_distance_km: string; quoted_price_cents: number; courier_payout_cents: number
      }>(`insert into orders(id,pharmacy_id,unit_id,contract_id,priority,
        pickup_street,pickup_city,pickup_state,recipient_name,recipient_phone,
        delivery_street,delivery_city,delivery_state,delivery_latitude,delivery_longitude,
        quoted_price_cents,courier_payout_cents)
        values ('${id}','${PHARMACY}','${UNIT}','${CONTRACT}','HIGH',
          'Rua verdadeira','São Paulo','SP','Cliente','11999999999',
          'Destino','São Paulo','SP',-23.70,-46.63,1,99999)
        returning estimated_distance_km,quoted_price_cents,courier_payout_cents`)
      expect(Number(rows[0].estimated_distance_km)).toBe(km)
      expect(rows[0].quoted_price_cents).toBe(2000 + Math.round((km - 10) * 100) + 200)
      expect(rows[0].courier_payout_cents).toBe(1000)
      await expect(db.query(`insert into orders(pharmacy_id,unit_id,contract_id,
        pickup_street,pickup_city,pickup_state,recipient_name,recipient_phone,
        delivery_street,delivery_city,delivery_state)
        values ('${OTHER_PHARMACY}','${UNIT}','${CONTRACT}',
          'Rua','São Paulo','SP','Cliente','11999999999',
          'Destino','São Paulo','SP')`)).rejects.toThrow()
    })
  })

  it('atribuição manual exige aceite do entregador antes do deslocamento', async () => {
    const id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
    await asUser(ADMIN, async () => {
      await db.query(`insert into orders(id,pharmacy_id,unit_id,pickup_street,pickup_city,pickup_state,
        recipient_name,recipient_phone,delivery_street,delivery_city,delivery_state)
        values ('${id}','${PHARMACY}','${UNIT}','Rua verdadeira','São Paulo','SP',
          'Cliente','11999999999','Destino','São Paulo','SP')`)
      await db.query(`update orders set courier_id='${COURIER}',status='ASSIGNED',assigned_at=now()
        where id='${id}'`)
    })
    await asUser(COURIER_USER, async () => {
      await expect(db.query(`update orders set status='PICKING_UP' where id='${id}'`)).rejects.toThrow()
      await db.query(`update orders set status='ACCEPTED' where id='${id}'`)
      const { rows } = await db.query<{ status: string; accepted_at: string | null }>(
        `select status,accepted_at from orders where id='${id}'`,
      )
      expect(rows[0].status).toBe('ACCEPTED')
      expect(rows[0].accepted_at).not.toBeNull()
    })
  })

  it('oferta, aceita uma vez, cancela concorrente e avança etapa sem alterar valores', async () => {
    await asUser(ADMIN, async () => {
      await db.query(`update orders set status='OFFERED' where id='${ORDER}'`)
      await db.query(`insert into delivery_offers(id,order_id,courier_id,expires_at) values
        ('${OFFER}','${ORDER}','${COURIER}',now()+interval '15 minutes'),
        ('${OTHER_OFFER}','${ORDER}','${OTHER_COURIER}',now()+interval '15 minutes')`)
    })
    await asUser(COURIER_USER, async () => {
      await expect(db.query(`update couriers set status='SUSPENDED' where id='${COURIER}'`)).rejects.toThrow()
      await db.query(`update delivery_offers set status='ACCEPTED' where id='${OFFER}'`)
      await expect(db.query(`update couriers set availability='AVAILABLE' where id='${COURIER}'`)).rejects.toThrow('Entrega em andamento')
      const { rows } = await db.query<{ status: string; courier_id: string }>(
        `select status,courier_id from orders where id='${ORDER}'`,
      )
      expect(rows[0]).toMatchObject({ status: 'ACCEPTED', courier_id: COURIER })
      await expect(db.query(`update orders set courier_payout_cents=99999 where id='${ORDER}'`)).rejects.toThrow()
      await db.query(`update orders set status='PICKING_UP' where id='${ORDER}'`)
    })
    const { rows } = await db.query<{ status: string }>(
      `select status from delivery_offers where id='${OTHER_OFFER}'`,
    )
    expect(rows[0].status).toBe('CANCELLED')
    await db.query(`update delivery_offers set status='PENDING' where id='${OTHER_OFFER}'`)
    await asUser(OTHER_COURIER_USER, async () => {
      await expect(db.query(`update delivery_offers set status='ACCEPTED' where id='${OTHER_OFFER}'`)).rejects.toThrow('Pedido indisponível')
    })
  })
})
