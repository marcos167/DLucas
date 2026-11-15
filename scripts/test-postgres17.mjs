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
  for (const file of [
    '20261115123622_authorization_hardening_007.sql',
    '20261115123630_direct_assignment_acceptance_008.sql',
    '20261115123637_offer_acceptance_contention_009.sql',
  ]) {
    await main.query(readFileSync(resolve('supabase/migrations', file), 'utf8'))
    log(`${file} aplicada no cluster local`)
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

  // ---------------------------------------------------------------
  // 010 · micro-rotas: reaplicação e disputas reais com duas conexões
  // ---------------------------------------------------------------
  const logistics = readFileSync(resolve('supabase/migrations/20261115150000_logistics_micro_routes_010.sql'), 'utf8')
  // privilégios padrão de um projeto Supabase: objeto novo nasce liberado
  await main.query(`
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  `)
  await main.query(logistics)
  await main.query(logistics)
  log('010 aplicada duas vezes sem erro')
  const open = (await main.query(`
    select count(*)::int as n from information_schema.role_table_grants
     where grantee = 'anon' and table_schema = 'public' and table_name in (
       'packages','delivery_routes','route_stops','route_packages','delivery_attempts','delivery_proofs',
       'package_scans','loading_manifests','package_assignments','distribution_batches',
       'postal_code_regions','postal_code_assignments','route_events','route_optimization_logs','manifest_items')`)).rows[0].n
  assert.equal(open, 0, 'visitante não pode ter privilégio em tabela do módulo')
  const callable = (await main.query(`
    select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('rider_day','register_delivery_attempt','distribute_batch','import_packages')
       and has_function_privilege('anon', p.oid, 'execute')`)).rows[0].n
  assert.equal(callable, 0, 'visitante não pode executar função do módulo')
  log('010: visitante sem acesso a tabelas e funções')

  const call = (userId, text, params = []) => transaction(userId, async (client) => (await client.query(text, params)).rows[0])
  const batchId = (await call(ids.admin, `
    with region as (
      insert into postal_code_regions(name, courier_id) values ('Zona PG17', '${ids.courierA}') returning id
    ), coverage as (
      insert into postal_code_assignments(region_id, zip_start, zip_end) select id, 2700000, 2799999 from region
    )
    insert into distribution_batches(batch_date, package_limit_override) values ('2026-11-15', 2) returning id`)).id
  const rows = [1, 2, 3, 4].map((n) => ({
    tracking_code: `PG${n}`, recipient_name: `Cliente ${n}`, zip_code: '02705-000', street: 'Rua PG', number: String(n),
  }))
  const imported = (await call(ids.admin, 'select import_packages($1, $2::jsonb) as r', [batchId, JSON.stringify(rows)])).r
  assert.equal(imported.inserted, 4)

  // dois cliques simultâneos em "distribuir": o limite do lote (2) vale para a soma
  const distributed = await Promise.all([1, 2].map(() => call(ids.admin, 'select distribute_batch($1) as r', [batchId])))
  assert.equal(distributed.reduce((sum, item) => sum + item.r.assigned, 0), 2)
  const spread = (await main.query(`
    select count(*) filter (where status = 'ASSIGNED')::int as assigned,
           count(*) filter (where status = 'EXCEPTION' and exception_reason = 'OVER_CAPACITY')::int as over,
           (select count(*)::int from package_assignments a where a.batch_id = $1 and a.ended_at is null) as current
      from packages where batch_id = $1`, [batchId])).rows[0]
  assert.deepEqual(spread, { assigned: 2, over: 2, current: 2 })
  log('010: distribuição simultânea respeita o limite e não duplica responsável')

  const mine = (await main.query(
    `select id, tracking_code from packages where batch_id = $1 and status = 'ASSIGNED' order by tracking_code`, [batchId])).rows
  const plan = mine.map((pkg) => ({ stops: [{ package_ids: [pkg.id] }] }))
  await call(ids.admin, 'select save_route_plan($1, $2, $3::jsonb) as r', [batchId, ids.courierA, JSON.stringify(plan)])
  const routeIds = (await main.query(
    'select r.id, rp.package_id from delivery_routes r join route_packages rp on rp.route_id = r.id where r.batch_id = $1 order by r.sequence',
    [batchId])).rows
  await call(ids.admin, `select set_routes_status($1::uuid[], 'RELEASE') as r`, [routeIds.map((route) => route.id)])
  const manifestId = (await call(ids.courierAUser, 'select open_manifest($1) as r', [batchId])).r.id

  // a mesma leitura enviada duas vezes ao mesmo tempo (dois aparelhos, ou aba duplicada)
  const scanId = '10000000-0000-4000-8000-000000000001'
  const scans = await Promise.all([1, 2].map(() => call(ids.courierAUser,
    `select register_package_scan($1, $2, 'LOAD', $3) as r`, [scanId, mine[1].tracking_code, manifestId])))
  assert.deepEqual(scans.map((item) => item.r.status).sort(), ['APPLIED', 'DUPLICATE'])
  assert.equal((await main.query('select count(*)::int as n from package_scans where id = $1', [scanId])).rows[0].n, 1)

  // a mesma baixa enviada duas vezes ao mesmo tempo
  const attemptId = '20000000-0000-4000-8000-000000000001'
  const attempts = await Promise.all([1, 2].map(() => call(ids.courierAUser,
    `select register_delivery_attempt($1, $2, 'DELIVERED') as r`, [attemptId, mine[0].id])))
  assert.deepEqual(attempts.map((item) => item.r.status).sort(), ['APPLIED', 'DUPLICATE'])
  const once = (await main.query(`select status, attempt_count,
    (select count(*)::int from delivery_attempts where package_id = p.id) as attempts from packages p where id = $1`, [mine[0].id])).rows[0]
  assert.deepEqual(once, { status: 'DELIVERED', attempt_count: 1, attempts: 1 })
  log('010: registro repetido em envio simultâneo é aplicado uma única vez')

  // Baixa e leitura do entregador disputando com a transferência do roteiro pelo
  // supervisor. Qualquer ordem de chegada é válida; travamento mútuo não é.
  const raceBatch = (await call(ids.admin,
    `insert into distribution_batches(batch_date) values ('2026-11-15') returning id`)).id
  const RACES = 10
  await call(ids.admin, 'select import_packages($1, $2::jsonb) as r', [raceBatch, JSON.stringify(
    Array.from({ length: RACES }, (_, n) => ({
      tracking_code: `RC${n}`, recipient_name: `Cliente ${n}`, zip_code: '02705-000', street: 'Rua da Disputa', number: String(n),
    })))])
  await call(ids.admin, 'select distribute_batch($1) as r', [raceBatch])
  const racers = (await main.query(
    `select id, tracking_code from packages where batch_id = $1 and status = 'ASSIGNED' order by tracking_code`, [raceBatch])).rows
  assert.equal(racers.length, RACES)
  await call(ids.admin, 'select save_route_plan($1, $2, $3::jsonb) as r',
    [raceBatch, ids.courierA, JSON.stringify(racers.map((pkg) => ({ stops: [{ package_ids: [pkg.id] }] })))])
  const raceRoutes = (await main.query(
    'select r.id, rp.package_id from delivery_routes r join route_packages rp on rp.route_id = r.id where r.batch_id = $1',
    [raceBatch])).rows
  await call(ids.admin, `select set_routes_status($1::uuid[], 'RELEASE') as r`, [raceRoutes.map((route) => route.id)])
  const raceManifest = (await call(ids.courierAUser, 'select open_manifest($1) as r', [raceBatch])).r.id
  for (const pkg of racers) {
    const loaded = (await call(ids.courierAUser, `select register_package_scan(gen_random_uuid(), $1, 'LOAD', $2) as r`,
      [pkg.tracking_code, raceManifest])).r
    assert.equal(loaded.result, 'OK')
  }
  const summary = []
  for (const [index, pkg] of racers.entries()) {
    const recordId = `30000000-0000-4000-8000-0000000000${String(index).padStart(2, '0')}`
    const routeId = raceRoutes.find((route) => route.package_id === pkg.id).id
    const field = index % 2 === 0
      ? call(ids.courierAUser, `select register_delivery_attempt($1, $2, 'DELIVERED') as r`, [recordId, pkg.id])
      : call(ids.courierAUser, `select register_package_scan($1, $2, 'RETURN', $3) as r`, [recordId, pkg.tracking_code, raceManifest])
    const transfer = call(ids.admin, `select transfer_route($1, $2, 'disputa') as r`, [routeId, ids.courierB])
    const race = await Promise.allSettled(index % 4 < 2 ? [field, transfer] : [transfer, field])
    const codes = race.map((item) => item.status === 'rejected' ? item.reason.code : 'ok')
    assert.ok(!codes.includes('40P01'), `travamento mútuo na disputa ${index}: ${codes.join(' / ')}`)
    const state = (await main.query(`select p.status, p.courier_id,
        (select count(*)::int from package_assignments a where a.package_id = p.id and a.ended_at is null) as current,
        (select count(*)::int from route_packages rp where rp.package_id = p.id and rp.released_at is null) as links,
        (select sync_status from delivery_attempts where id = $2) as attempt
      from packages p where p.id = $1`, [pkg.id, recordId])).rows[0]
    assert.equal(state.current, 1, 'um único responsável atual')
    assert.equal(state.links, 1, 'um único roteiro ativo')
    if (state.status === 'DELIVERED') {
      assert.equal(state.attempt, 'APPLIED')
      assert.equal(state.courier_id, ids.courierA)
    } else if (state.attempt !== null) {
      assert.equal(state.attempt, 'CONFLICT')
      assert.equal(state.courier_id, ids.courierB)
    }
    summary.push(`${state.status}${state.courier_id === ids.courierB ? '→B' : ''}`)
  }
  log(`010: ${RACES} disputas baixa/leitura x transferência sem travamento mútuo (${summary.join(', ')})`)
  log('homologação local concluída; nenhuma conexão ao Supabase foi feita')
} finally {
  try { await main.end() } catch { /* não conectado */ }
  if (started) await pg.stop()
  await rm(dir, { recursive: true, force: true })
}
