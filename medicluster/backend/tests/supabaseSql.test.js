const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestDatabase } = require('./helpers/supabaseTestDb');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

test('conditional OTP consumption and sorted SMS claims each succeed once', async t => {
  const db = await createTestDatabase(t);
  await db.collection('patientotps').insertOne({ _id: 'otp', usedAt: null, attempts: 0, expiresAt: '2099-01-01T00:00:00.000Z' });
  const consumed = await Promise.all(Array.from({ length: 12 }, () => db.rpc('mc_write', {
    p_collection: 'patientotps', p_action: 'update', p_filter: { _id: 'otp', usedAt: null, attempts: { $lt: 5 }, expiresAt: { $gt: new Date() } },
    p_update: { $set: { usedAt: new Date() } },
  })));
  assert.equal(consumed.filter(Boolean).length, 1);
  await db.collection('smsjobs').insertMany([{ _id: 'later', status: 'queued', createdAt: '2026-01-02' }, { _id: 'first', status: 'queued', createdAt: '2026-01-01' }]);
  const claimed = await db.rpc('mc_write', { p_collection: 'smsjobs', p_action: 'update', p_filter: { status: 'queued' }, p_update: { $set: { status: 'claimed' } }, p_sort: { createdAt: 1 } });
  assert.equal(claimed._id, 'first');
  await db.collection('patientloginexchanges').insertOne({ _id: 'exchange', challenge: 'valid' });
  const exchanges = await Promise.all(Array.from({ length: 8 }, () => db.rpc('mc_write', { p_collection: 'patientloginexchanges', p_action: 'delete', p_filter: { _id: 'exchange', challenge: 'valid' } })));
  assert.equal(exchanges.filter(Boolean).length, 1);
});

test('nested document filters and updates preserve one dose per slot', async t => {
  const db = await createTestDatabase(t);
  const reminders = db.collection('reminders');
  await reminders.insertOne({ _id: 'dose', doseLog: [], count: 3 });
  const filter = { _id: 'dose', doseLog: { $not: { $elemMatch: { date: '2026-10-18', time: '08:00' } } } };
  const results = await Promise.all(Array.from({ length: 8 }, () => db.rpc('mc_write', { p_collection: 'reminders', p_action: 'update', p_filter: filter, p_update: { $push: { doseLog: { date: '2026-10-18', time: '08:00' } }, $inc: { count: -1 }, $set: { 'nested.value': 4 } } })));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal((await reminders.findOne({ 'nested.value': { $gte: 4 } })).count, 2);
  assert.equal(await reminders.countDocuments({ $or: [{ missing: null }, { count: 999 }] }), 1);
  assert.equal(await reminders.countDocuments({ missing: { $exists: true } }), 0);
  assert.equal(await reminders.countDocuments({ count: { $in: [1, 2] } }), 1);
  await reminders.updateOne({ _id: 'dose' }, { $unset: { 'nested.value': 1 }, $addToSet: { tags: { $each: ['x', 'x', 'y'] } } });
  assert.deepEqual((await reminders.findOne({ _id: 'dose' })).tags, ['x', 'y']);
  assert.equal(await reminders.countDocuments({ 'nested.value': null }), 1);
  await assert.rejects(db.rpc('mc_find', { p_collection: 'reminders', p_filter: { $where: 'true' } }), /Unsupported/);
  await assert.rejects(db.rpc('mc_write', { p_collection: 'reminders', p_action: 'update', p_filter: {}, p_update: { $rename: { count: 'x' } } }), /Unsupported/);
  await assert.rejects(db.rpc('mc_write', { p_collection: 'empty', p_action: 'update', p_filter: { a: 'absent', z: { $where: 'true' } }, p_update: { $set: { safe: true } }, p_upsert: true }), /Unsupported/);
  assert.equal(await reminders.countDocuments({ absent: { $not: { $exists: true } } }), 1);
  assert.equal(await reminders.countDocuments({ tags: { $eq: 'x' } }), 1);
  assert.equal(await reminders.countDocuments({ tags: { $ne: 'x' } }), 0);
});

test('unique identities and concurrent upserts are enforced in Postgres', async t => {
  const db = await createTestDatabase(t);
  const patients = db.collection('patientprofiles');
  await patients.insertMany([{ patientId: 'p1' }, { patientId: 'p2' }]);
  await patients.updateOne({ patientId: 'p1' }, { $set: { email: 'patient@example.com', googleSubject: 'google-1', mobile: '9876543210' } });
  for (const field of ['patientId', 'email', 'googleSubject', 'mobile']) {
    const existing = await patients.findOne({ patientId: 'p1' });
    await assert.rejects(patients.insertOne({ patientId: 'p3', [field]: existing[field] }), error => error.code === '23505');
  }
  for (const field of ['email', 'googleSubject', 'mobile']) {
    await patients.insertOne({ patientId: `null-${field}`, [field]: null });
    await assert.rejects(patients.insertOne({ patientId: `duplicate-null-${field}`, [field]: null }), error => error.code === '23505');
  }
  await Promise.all(Array.from({ length: 8 }, () => db.rpc('mc_write', { p_collection: 'alertacks', p_action: 'update', p_filter: { userId: 'u', alertId: 'a' }, p_update: { $setOnInsert: { userId: 'u', alertId: 'a' } }, p_upsert: true })));
  assert.equal(await db.collection('alertacks').countDocuments(), 1);
  await assert.rejects(db.rpc('mc_write', { p_collection: 'alertacks', p_action: 'update', p_filter: {}, p_update: { $set: { _id: 'other' } } }), /immutable/);
});

test('rolling email reservations enforce cooldown, hourly limit and isolation', async t => {
  const db = await createTestDatabase(t);
  const reserve = hash => db.rpc('mc_reserve_email', { p_hash: hash });
  const results = await Promise.all(Array.from({ length: 8 }, () => reserve('recipient')));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(await reserve('other'), true);
  await db.sql.query("UPDATE public.medicluster_records SET data = jsonb_build_object('_id', id, 'requests', jsonb_build_array(to_jsonb(now() - interval '5 minutes'), to_jsonb(now() - interval '4 minutes'), to_jsonb(now() - interval '3 minutes'), to_jsonb(now() - interval '2 minutes'), to_jsonb(now() - interval '1 minute'))) WHERE collection='patientauthlimits' AND id='email:recipient'");
  assert.equal(await reserve('recipient'), false);
  await db.sql.query("UPDATE public.medicluster_records SET data = jsonb_build_object('_id', id, 'requests', jsonb_build_array(to_jsonb(now() - interval '61 minutes'), to_jsonb(now() - interval '1 minute'))) WHERE collection='patientauthlimits' AND id='email:recipient'");
  assert.equal(await reserve('recipient'), true);
});

test('RLS and RPC grants deny both client roles and public helper execution', async t => {
  const { sql } = await createTestDatabase(t);
  const { rows } = await sql.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.medicluster_records'::regclass");
  assert.equal(rows[0].relrowsecurity, true);
  for (const role of ['anon', 'authenticated']) {
    await sql.exec(`SET ROLE ${role}`);
    await assert.rejects(sql.query('SELECT * FROM public.medicluster_records'), /permission denied/);
    await assert.rejects(sql.query("SELECT public.mc_find('patientprofiles')"), /permission denied/);
    await assert.rejects(sql.query("SELECT public.mc_matches('{}'::jsonb, '{}'::jsonb)"), /permission denied/);
    await sql.exec('RESET ROLE');
  }
  await sql.exec('SET ROLE service_role');
  assert.deepEqual((await sql.query("SELECT public.mc_find('patientprofiles') AS result")).rows[0].result, []);
  await sql.exec('RESET ROLE');
});

test('migration is repeatable and pagination, multi updates and deletion work', async t => {
  const db = await createTestDatabase(t);
  await db.sql.exec(await readFile(path.join(__dirname, '../supabase/migrations/20261018_medicluster_storage.sql'), 'utf8'));
  await db.collection('readings').insertMany([{ value: 2, patientId: 'p' }, { value: 10, patientId: 'p' }, { value: 1, patientId: 'other' }]);
  const result = await db.rpc('mc_find', { p_collection: 'readings', p_sort: { value: -1 }, p_limit: 1, p_skip: 1 });
  assert.equal(result[0].value, 2);
  assert.deepEqual(await db.rpc('mc_write', { p_collection: 'readings', p_action: 'update_many', p_filter: { patientId: 'p' }, p_update: { $inc: { value: 1 } } }), { matchedCount: 2, modifiedCount: 2 });
  assert.deepEqual(await db.rpc('mc_write', { p_collection: 'readings', p_action: 'delete_many', p_filter: { value: { $gte: 3 } } }), { deletedCount: 2 });
  await db.rpc('mc_find', { p_collection: 'readings', p_sort: { "value'); DROP TABLE public.medicluster_records; --": 1 } });
  assert.equal(await db.collection('readings').countDocuments(), 1);
});

test('bounded expiry cleanup removes only authentication and SMS documents', async t => {
  const db = await createTestDatabase(t);
  const expired = '2020-01-01T00:00:00.000Z';
  for (const collection of ['patientotps', 'patientemailotps', 'patientgoogleflows', 'patientloginexchanges', 'patientauthlimits', 'smsjobs', 'readings']) {
    await db.collection(collection).insertOne({ expiresAt: expired });
  }
  await db.collection('smsjobs').insertOne({ expiresAt: '2099-01-01T00:00:00.000Z' });
  assert.equal(await db.rpc('mc_cleanup_expired', { p_limit: 2 }), 2);
  assert.equal(await db.rpc('mc_cleanup_expired', { p_limit: 1000 }), 4);
  assert.equal(await db.collection('readings').countDocuments(), 1);
  assert.equal(await db.collection('smsjobs').countDocuments(), 1);
  await db.sql.exec('SET ROLE authenticated');
  await assert.rejects(db.sql.query('SELECT public.mc_cleanup_expired()'), /permission denied/);
  await db.sql.exec('RESET ROLE');
});

test('ordered compound sorts preserve triage and hospital priorities through JSONB', async t => {
  const db = await createTestDatabase(t);
  await db.collection('incidentpatients').insertMany([
    { _id: 'red-early', patient_tag: 'red-early', triage_category: 'RED', createdAt: '2026-01-01T00:00:00.000Z' },
    { _id: 'green-later', patient_tag: 'green-later', triage_category: 'GREEN', createdAt: '2026-01-03T00:00:00.000Z' },
    { _id: 'green-early', patient_tag: 'green-early', triage_category: 'GREEN', createdAt: '2026-01-02T00:00:00.000Z' },
  ]);
  const triage = await db.rpc('mc_find', { p_collection: 'incidentpatients', p_sort: [['triage_category', 1], ['createdAt', 1]] });
  assert.deepEqual(triage.map(doc => doc._id), ['green-early', 'green-later', 'red-early']);
  assert.deepEqual((await db.collection('incidentpatients').find().sort({ triage_category: 1, createdAt: 1 }).toArray()).map(doc => doc._id), ['green-early', 'green-later', 'red-early']);
  await db.collection('hospitals').insertMany([
    { hospitalId: 'A', trauma_level: 2 }, { hospitalId: 'Z', trauma_level: 1 }, { hospitalId: 'Y', trauma_level: 1 },
  ]);
  assert.deepEqual((await db.rpc('mc_find', { p_collection: 'hospitals', p_sort: [['trauma_level', 1], ['hospitalId', 1]] })).map(doc => doc.hospitalId), ['Y', 'Z', 'A']);
  const selected = await db.rpc('mc_write', { p_collection: 'hospitals', p_action: 'update', p_filter: {}, p_update: { $set: { selected: true } }, p_sort: [['trauma_level', 1], ['hospitalId', -1]] });
  assert.equal(selected.hospitalId, 'Z');
  await db.rpc('mc_find', { p_collection: 'hospitals', p_sort: [["value'); DROP TABLE public.medicluster_records; --", 1]] });
  assert.equal(await db.collection('hospitals').countDocuments(), 3);
  for (const invalid of [[['trauma_level', '1; DROP TABLE x']], [['trauma_level']], [['trauma_level', 1, 'extra']], [[1, 1]], { trauma_level: 1, hospitalId: 1 }]) {
    await assert.rejects(db.rpc('mc_find', { p_collection: 'hospitals', p_sort: invalid }), /Sort|sort/);
  }
});
