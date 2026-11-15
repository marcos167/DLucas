// Ensaio independente do Supabase em PostgreSQL 17 nativo com duas conexões.
// Usa somente dados fictícios e um cluster temporário local (nunca produção).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import EmbeddedPostgres from 'embedded-postgres'

const ids = {
  pharmacy: '11111111-1111-4111-8111-111111111111',
  unit: '22222222-2222-4222-8222-222222222222',
  contract: '33333333-3333-4333-8333-333333333333',
  admin: '44444444-4444-4444-8444-444444444444',
  customer: '55555555-5555-4555-8555-555555555555',
  courierAUser: '66666666-6666-4666-8666-666666666666',
  courierBUser: '77777777-7777-4777-8777-777777777777',
  courierA: '88888888-8888-4888-8888-888888888888',
  courierB: '99999999-9999-4999-8999-999999999999',
  order: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  offerA: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  offerB: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  directOrder: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
}
const log = (message) => console.log(`PG17: ${message}`)
async function freePort() {
  const server = createServer()
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const { port } = server.address()
  await new Promise((done) => server.close(done))
  return port
}
const dir = await mkdtemp(join(tmpdir(), 'dluca-pg17-'))
const pg = new EmbeddedPostgres({
  databaseDir: join(dir, 'cluster'), port: await freePort(), user: 'postgres',
  password: 'local-test-only', persistent: false, autoRehydrateSymlinks: true,
  onLog: () => {}, onError: (err) => console.error(err),
})
let started = false
const main = pg.getPgClient()
async function actor(id) {
  const client = pg.getPgClient()
  await client.connect()
  await client.query('begin')
  await client.query('set local role authenticated')
  await client.query("select set_config('request.jwt.claim.sub',$1,true)", [id])
  await client.query("set local statement_timeout = '8s'")
  return client
}
async function transaction(id, action) {
  const client = await actor(id)
  try {
    const result = await action(client)
    await client.query('commit')
    return result
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    await client.end()
  }
}
try {
  await pg.initialise()
  await pg.start()
  started = true
  await main.connect()
  const version = (await main.query('show server_version')).rows[0].server_version
  assert.match(version, /^17\./)
  log(`servidor PostgreSQL ${version} iniciado (cluster isolado)`)
  await main.query(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    create table auth.users (
      id uuid primary key, email text, encrypted_password text,
      raw_user_meta_data jsonb default '{}'::jsonb,
      confirmation_token text, recovery_token text, email_change text,
      email_change_token_new text, email_change_token_current text,
      phone_change text, phone_change_token text, reauthentication_token text
    );
    create schema storage;
    create table storage.buckets(
      id text primary key, name text, public boolean, file_size_limit int,
      allowed_mime_types text[]
    );
    create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    create publication supabase_realtime;
  `)
  for (const name of [
    '00100_core', '00200_operations', '00300_finance', '00400_security',
    '00500_offers', '00600_auth_users_fix',
  ]) {
    await main.query(readFileSync(resolve(`supabase/migrations/202611150${name}.sql`), 'utf8'))
    log(`${name} aplicada no cluster local`)
  }
  // Na produção, a policy self também preserva o vínculo pharmacy_id; o
  // arquivo 004 não. Reproduzimos a diferença conhecida antes da 007.
  await main.query(`
    drop policy profiles_update_self on public.profiles;
    create policy profiles_update_self on public.profiles for update using (id=auth.uid())
      with check (id=auth.uid() and role=app.current_role() and
        pharmacy_id is not distinct from (select p.pharmacy_id from profiles p where p.id=auth.uid()));
    grant usage on schema public, app, auth to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant usage on all sequences in schema public to authenticated;
    grant execute on all functions in schema auth to authenticated;
  `)
  for (const name of [
    '00700_authorization_hardening', '00800_direct_assignment_acceptance',
    '00900_offer_acceptance_contention',
  ]) {
    await main.query(readFileSync(resolve(`supabase/migrations/202611150${name}.sql`), 'utf8'))
    log(`${name} aplicada no cluster local`)
  }
  await main.query(`
    insert into auth.users(id,email,encrypted_password) values
      ('${ids.admin}','admin@teste.local','hash'),
      ('${ids.customer}','farmacia@teste.local','hash'),
      ('${ids.courierAUser}','entregador-a@teste.local','hash'),
      ('${ids.courierBUser}','entregador-b@teste.local','hash');
    insert into pharmacies(id,legal_name,trade_name)
      values ('${ids.pharmacy}','Farmácia de Teste','Farmácia de Teste');
    update profiles set role='ADMIN' where id='${ids.admin}';
    update profiles set role='PHARMACY_ADMIN',pharmacy_id='${ids.pharmacy}' where id='${ids.customer}';
    update profiles set role='COURIER' where id in ('${ids.courierAUser}','${ids.courierBUser}');
    insert into pharmacy_units(id,pharmacy_id,name,street,city,state,latitude,longitude)
      values ('${ids.unit}','${ids.pharmacy}','Unidade','Rua verdadeira','São Paulo','SP',-23.55,-46.63);
    insert into contracts(id,pharmacy_id,name,base_price_cents,courier_payout_cents)
      values ('${ids.contract}','${ids.pharmacy}','Contrato',2000,1000);
    insert into couriers(id,profile_id,full_name,phone,status,availability) values
      ('${ids.courierA}','${ids.courierAUser}','Entregador A','11999999999','ACTIVE','AVAILABLE'),
      ('${ids.courierB}','${ids.courierBUser}','Entregador B','11888888888','ACTIVE','AVAILABLE');
  `)
  const baseOrder = (id) => `insert into orders(id,pharmacy_id,unit_id,contract_id,
    pickup_street,pickup_city,pickup_state,recipient_name,recipient_phone,
    delivery_street,delivery_city,delivery_state)
    values ('${id}','${ids.pharmacy}','${ids.unit}','${ids.contract}',
      'Rua verdadeira','São Paulo','SP','Destinatário','11999999999',
      'Rua destino','São Paulo','SP')`
  await transaction(ids.customer, (client) => client.query(baseOrder(ids.order)))
  await transaction(ids.admin, (client) => client.query(`
    update orders set status='OFFERED' where id='${ids.order}';
    insert into delivery_offers(id,order_id,courier_id,expires_at) values
      ('${ids.offerA}','${ids.order}','${ids.courierA}',now()+interval '15 minutes'),
      ('${ids.offerB}','${ids.order}','${ids.courierB}',now()+interval '15 minutes');
  `))
  const accept = (userId, offerId) => transaction(userId, (client) =>
    client.query("update delivery_offers set status='ACCEPTED' where id=$1 and status='PENDING' returning id", [offerId]),
  )
  const results = await Promise.allSettled([
    accept(ids.courierAUser, ids.offerA), accept(ids.courierBUser, ids.offerB),
  ])
  const winners = results.filter((r) => r.status === 'fulfilled' && r.value.rowCount === 1)
  assert.equal(winners.length, 1, `Deve existir exatamente um aceite: ${JSON.stringify(results.map((r) => r.status === 'rejected' ? r.reason.code : r.value.rowCount))}`)
  assert.equal(results.filter((r) => r.status === 'rejected').length, 1)
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'P0001',
    'Conflito esperado sem deadlock (40P01)')
  const offers = (await main.query('select id,status,courier_id from delivery_offers where order_id=$1', [ids.order])).rows
  const order = (await main.query('select status,courier_id,quoted_price_cents from orders where id=$1', [ids.order])).rows[0]
  const accepted = offers.filter((o) => o.status === 'ACCEPTED')
  assert.equal(accepted.length, 1)
  assert.equal(offers.filter((o) => o.status === 'CANCELLED').length, 1)
  assert.equal(order.status, 'ACCEPTED')
  assert.equal(order.courier_id, accepted[0].courier_id)
  assert.equal(order.quoted_price_cents, 2000)
  log(`aceite simultâneo: 1 vencedor, 1 recusado (${results.find((r) => r.status === 'rejected')?.reason.code ?? 'nenhuma exceção'}); pedido e ofertas consistentes`)

  // Atribuição direta também deve exigir aceite e registrar accepted_at.
  await transaction(ids.customer, (client) => client.query(baseOrder(ids.directOrder)))
  await transaction(ids.admin, (client) => client.query(`update orders set status='ASSIGNED',
    courier_id='${ids.courierB}',assigned_at=now() where id='${ids.directOrder}'`))
  const direct = await transaction(ids.courierBUser, (client) => client.query(`
    update orders set status='ACCEPTED' where id='${ids.directOrder}'
      returning status,accepted_at`))
  assert.equal(direct.rows[0].status, 'ACCEPTED')
  assert.ok(direct.rows[0].accepted_at)
  log('atribuição manual: aceite autorizado e data registrada pelo banco')
  log('homologação local concluída; nenhuma conexão ao Supabase foi feita')
} finally {
  try { await main.end() } catch { /* não conectado */ }
  if (started) await pg.stop()
  await rm(dir, { recursive: true, force: true })
}
