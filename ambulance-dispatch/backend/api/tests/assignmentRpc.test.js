const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const dispatcher = '11111111-1111-4111-8111-111111111111';
const driver = '22222222-2222-4222-8222-222222222222';
const migrationDir = path.resolve(__dirname, '../../../frontend/dispatcher-dashboard/supabase/migrations');

test('Supabase assignment persists shared CAD records atomically and restricts access', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
  `);
  const schema = await fs.readFile(path.join(migrationDir, '20260816_init_cad_schema.sql'), 'utf8');
  // PGlite has built-in gen_random_uuid; uuid-ossp is unused by this schema.
  await db.exec(schema.replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', ''));
  await db.exec(await fs.readFile(path.join(migrationDir, '20261018144157_dispatch_api_rpc.sql'), 'utf8'));
  await db.exec(`
    INSERT INTO auth.users VALUES ('${dispatcher}'), ('${driver}');
    INSERT INTO public.profiles (id,email,full_name,role) VALUES
      ('${dispatcher}','dispatcher@example.com','Dispatcher','DISPATCHER'),
      ('${driver}','driver@example.com','Driver','DRIVER');
    INSERT INTO public.incidents (id,incident_type,location_address,location_lat,location_lng)
      VALUES ('INC-A','Medical','Clinic',12.97,77.59), ('INC-B','Medical','Clinic',12.97,77.59),
      ('INC-C','Medical','Clinic',12.97,77.59), ('INC-D','Medical','Clinic',12.97,77.59);
  `);
  const assign = (incident, ambulance, hospital = 'H-001', user = dispatcher, role = 'authenticated') => db.transaction(async tx => {
    await tx.exec(`SET LOCAL ROLE ${role}`);
    await tx.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [user]);
    return (await tx.query('SELECT to_jsonb(public.dispatch_assign($1,$2,$3,$4)) AS assignment', [incident, ambulance, hospital, 'Dispatch from API'])).rows[0].assignment;
  });
  const setStatus = (incident, status, user = dispatcher) => db.transaction(async tx => {
    await tx.exec('SET LOCAL ROLE authenticated');
    await tx.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [user]);
    return (await tx.query('SELECT to_jsonb(public.dispatch_set_status($1,$2,$3)) AS incident', [incident,status,'Stage confirmed'])).rows[0].incident;
  });

  await t.test('drivers and anonymous callers cannot allocate even with known IDs', async () => {
    await assert.rejects(assign('INC-A','AMB-001','H-001',driver), /dispatcher|permission/i);
    await assert.rejects(assign('INC-A','AMB-001','H-001','', 'anon'), /permission denied/i);
    assert.equal((await db.query("SELECT status FROM public.incidents WHERE id='INC-A'")).rows[0].status, 'PENDING');
  });
  await t.test('anonymous health reveals only schema readiness, not operational rows', async () => {
    await db.transaction(async tx => {
      await tx.exec('SET LOCAL ROLE anon');
      assert.equal((await tx.query('SELECT public.dispatch_ready() AS ready')).rows[0].ready,true);
    });
    await assert.rejects(db.transaction(async tx => {
      await tx.exec('SET LOCAL ROLE anon');
      await tx.query('SELECT * FROM public.incidents');
    }), /permission denied/i);
  });
  await t.test('missing hospital leaves incident and ambulance untouched', async () => {
    await assert.rejects(assign('INC-A','AMB-001','missing'), /hospital/i);
    assert.equal((await db.query("SELECT status FROM public.ambulances WHERE id='AMB-001'")).rows[0].status,'AVAILABLE');
  });
  await t.test('successful assignment updates existing incident, fleet trigger and timeline together', async () => {
    const result = await assign('INC-A','AMB-001');
    assert.equal(result.id,'INC-A');
    assert.equal(result.status,'ASSIGNED');
    assert.equal(result.assigned_hospital_id,'H-001');
    const fleet = (await db.query("SELECT status,assigned_incident_id FROM public.ambulances WHERE id='AMB-001'")).rows[0];
    assert.deepEqual(fleet,{status:'ASSIGNED',assigned_incident_id:'INC-A'});
    const events = (await db.query("SELECT actor_id,stage,notes FROM public.incident_timeline_events WHERE incident_id='INC-A'")).rows;
    assert.deepEqual(events,[{actor_id:dispatcher,stage:'ASSIGNED',notes:'Dispatch from API'}]);
  });
  await t.test('retries are idempotent and competing incident cannot claim busy unit', async () => {
    await assign('INC-A','AMB-001');
    assert.equal((await db.query("SELECT count(*)::int AS count FROM public.incident_timeline_events WHERE incident_id='INC-A'")).rows[0].count,1);
    await assert.rejects(assign('INC-B','AMB-001'), /available|assigned/i);
    assert.equal((await db.query("SELECT assigned_ambulance_id FROM public.incidents WHERE id='INC-B'")).rows[0].assigned_ambulance_id,null);
  });
  await t.test('terminal incidents cannot be dispatched', async () => {
    await db.exec("UPDATE public.incidents SET status='RESOLVED' WHERE id='INC-C'");
    await assert.rejects(assign('INC-C','AMB-002'), /pending|assign/i);
    assert.equal((await db.query("SELECT status FROM public.ambulances WHERE id='AMB-002'")).rows[0].status,'AVAILABLE');
  });
  await t.test('lifecycle cannot skip stages or bypass resource allocation', async () => {
    await assert.rejects(setStatus('INC-D','ASSIGNED'), /transition|assignment/i);
    await assert.rejects(setStatus('INC-A','RESOLVED'), /transition/i);
    await assert.rejects(setStatus('INC-A','EN_ROUTE_TO_SCENE',driver), /permission|found|assigned/i);
    assert.equal((await db.query("SELECT status FROM public.incidents WHERE id='INC-A'")).rows[0].status,'ASSIGNED');
  });
  await t.test('valid lifecycle records notes and terminal incidents cannot free a reused ambulance', async () => {
    for (const status of ['EN_ROUTE_TO_SCENE','ON_SCENE','TRANSPORTING_TO_HOSPITAL','ARRIVED_AT_HOSPITAL','RESOLVED']) {
      assert.equal((await setStatus('INC-A',status)).status,status);
    }
    assert.equal((await db.query("SELECT count(*)::int AS count FROM public.incident_timeline_events WHERE incident_id='INC-A' AND notes='Stage confirmed'")).rows[0].count,5);
    const resolved=(await db.query("SELECT resolved_at FROM public.incidents WHERE id='INC-A'")).rows[0];
    assert.ok(resolved.resolved_at);
    await assign('INC-B','AMB-001');
    await assert.rejects(setStatus('INC-A','ASSIGNED'), /transition|terminal/i);
    await assert.rejects(setStatus('INC-A','CANCELLED'), /transition|terminal/i);
    assert.deepEqual((await db.query("SELECT status,assigned_incident_id FROM public.ambulances WHERE id='AMB-001'")).rows[0],{status:'ASSIGNED',assigned_incident_id:'INC-B'});
  });
  await t.test('migration can run again without losing records', async () => {
    await db.exec(await fs.readFile(path.join(migrationDir, '20261018144157_dispatch_api_rpc.sql'), 'utf8'));
    assert.equal((await db.query("SELECT assigned_ambulance_id FROM public.incidents WHERE id='INC-A'")).rows[0].assigned_ambulance_id,'AMB-001');
  });
});
