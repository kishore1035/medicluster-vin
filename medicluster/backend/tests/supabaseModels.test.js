const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestDatabase } = require('./helpers/supabaseTestDb');
const { getConfig, request, rpc } = require('../db/supabase');
const { createId, isValidId } = require('../db/ids');
const User = require('../models/User');
const PatientProfile = require('../models/PatientProfile');
const PatientOtp = require('../models/PatientOtp');
const Reminder = require('../models/Reminder');
const IncidentPatient = require('../models/IncidentPatient');
const ClusterResult = require('../models/ClusterResult');
const SmsJob = require('../models/SmsJob');
const AlertAck = require('../models/AlertAck');

const rejectsValidation = operation => assert.rejects(async () => operation(), { name: 'ValidationError' });

test('Supabase repository over PostgreSQL RPCs', async t => {
  const database = await createTestDatabase(t);

  await t.test('defaults, string IDs, dates, credential projection and public accounts', async () => {
    const user = await User.create({ email: '  TEST@EXAMPLE.COM ', name: ' Clinician ', passwordHash: 'never-public' });
    assert.ok(isValidId(user._id));
    assert.equal(user.email, 'test@example.com');
    assert.equal(user.name, 'Clinician');
    assert.equal(user.role, null);
    assert.ok(user.createdAt instanceof Date);
    assert.equal(user.toPublic().onboarded, false);
    assert.deepEqual(User.ROLES, ['physician', 'nurse', 'analyst', 'dispatcher']);
    const hidden = await User.findById(user._id);
    assert.equal(hidden.passwordHash, undefined);
    assert.equal(hidden.toJSON().passwordHash, undefined);
    assert.equal((await User.findById(user._id).select('+passwordHash')).passwordHash, 'never-public');
    const included = await User.findById(user._id, { email: 1, passwordHash: 1, _id: 0 }).lean();
    assert.deepEqual(included, { email: 'test@example.com', passwordHash: 'never-public' });
    const excluded = await User.findById(user._id).select('-email -_id').lean();
    assert.equal(excluded.email, undefined);
    assert.equal(excluded._id, undefined);
    assert.equal(excluded.passwordHash, undefined);
    hidden.name = 'Changed';
    await hidden.save();
    assert.equal((await User.findById(user._id).select('+passwordHash')).passwordHash, 'never-public');
    assert.equal((await User.findById(user._id)).name, 'Changed');
  });

  await t.test('required fields, enums, nested ranges, casts, and nested date hydration', async () => {
    await rejectsValidation(() => User.create({ email: 'x@example.com' }));
    await rejectsValidation(() => User.create({ email: 'x@example.com', name: 'X', passwordHash: 'x', role: 'administrator' }));
    await rejectsValidation(() => IncidentPatient.create({ incident_id: 'i', patient_tag: 'bad', vitals: { gcs: 2 } }));
    await rejectsValidation(() => IncidentPatient.create({ incident_id: 'i', patient_tag: 'bad', pathway_flags: ['invalid'] }));
    const patient = await IncidentPatient.create({ incident_id: 'i', patient_tag: 'valid', vitals: { avpu: 'a', gcs: '15' } });
    const loaded = await IncidentPatient.findById(patient._id).lean();
    assert.equal(loaded.vitals.avpu, 'A');
    assert.equal(loaded.vitals.gcs, 15);
    assert.ok(loaded.vitals.recorded_at instanceof Date);
    const reminder = await Reminder.create({ patientId: 'p1', medicationName: 'A', doseLog: [{ date: '2026-10-18', time: '12:00' }] });
    assert.ok(reminder.doseLog[0].takenAt instanceof Date);
    const queried = await Reminder.findById(reminder._id).lean();
    assert.ok(queried.doseLog[0].takenAt instanceof Date);
    assert.equal(queried.doseLog[0]._id, undefined);
    await rejectsValidation(() => IncidentPatient.findByIdAndUpdate(patient._id, { vitals: { gcs: 20 } }, { new: true }));
  });

  await t.test('upsert defaults, nested save, hidden identity, uniqueness and count', async () => {
    const profile = await PatientProfile.findOneAndUpdate({ patientId: 'P1' }, { $set: { email: '  P1@EXAMPLE.COM ', googleSubject: 'secret-subject' } }, { upsert: true, new: true });
    assert.equal(profile.patientId, 'P1');
    assert.equal(profile.email, 'p1@example.com');
    assert.equal(profile.googleSubject, undefined);
    assert.equal(profile.nextVisit.at, null);
    profile.nextVisit.at = new Date('2026-11-01T12:00:00Z');
    profile.nextVisit.checklist.push({ label: 'Bring medicines' });
    await profile.save();
    const loaded = await PatientProfile.findOne({ patientId: 'P1' }).select('+googleSubject').lean();
    assert.equal(loaded.googleSubject, 'secret-subject');
    assert.ok(loaded.nextVisit.at instanceof Date);
    assert.equal(loaded.nextVisit.checklist[0].done, false);
    await assert.rejects(async () => PatientProfile.create({ patientId: 'P2', email: 'p1@example.com' }), { code: 11000 });
    assert.equal(await PatientProfile.countDocuments({ patientId: 'P1' }), 1);
    assert.deepEqual(await PatientProfile.exists({ patientId: 'P1' }), { _id: profile._id });
  });

  await t.test('sort, skip, limit, projections and update return semantics', async () => {
    await Reminder.insertMany([1, 2, 3].map(index => ({ patientId: 'paging', medicationName: String(index), pillsLeft: index })));
    const page = await Reminder.find({ patientId: 'paging' }, { medicationName: 1, _id: 0 }).sort({ pillsLeft: -1 }).skip(1).limit(1).lean();
    assert.deepEqual(page, [{ medicationName: '2' }]);
    const old = await Reminder.findOneAndUpdate({ patientId: 'paging' }, { $inc: { pillsLeft: 5 } }, { sort: { pillsLeft: 1 }, new: false });
    assert.equal(old.pillsLeft, 1);
    const updated = await Reminder.findByIdAndUpdate(old._id, { notes: 'changed' }, { new: true });
    assert.equal(updated.pillsLeft, 6);
    assert.equal(updated.notes, 'changed');
    const result = await Reminder.updateOne({ _id: old._id }, { $push: { doseLog: { date: '2026-10-18', time: '08:00' } } });
    assert.equal(result.matchedCount, 1);
    assert.ok((await Reminder.findById(old._id)).doseLog[0].takenAt instanceof Date);
    assert.equal((await Reminder.findByIdAndDelete(old._id))._id, old._id);
    assert.equal(await Reminder.findById(old._id), null);
    assert.equal((await Reminder.deleteMany({ patientId: 'paging' })).deletedCount, 2);
  });

  await t.test('compound sort prioritizes triage category before timestamp for reads and mutations', async () => {
    const incident_id = 'compound-triage';
    await IncidentPatient.insertMany([
      { incident_id, patient_tag: 'red-new', triage_category: 'RED', createdAt: new Date('2026-10-18T03:00:00Z') },
      { incident_id, patient_tag: 'yellow-old', triage_category: 'YELLOW', createdAt: new Date('2026-10-18T01:00:00Z') },
      { incident_id, patient_tag: 'red-old', triage_category: 'RED', createdAt: new Date('2026-10-18T02:00:00Z') },
    ]);
    const sort = { triage_category: 1, createdAt: 1 };
    const patients = await IncidentPatient.find({ incident_id }).sort(sort).lean();
    assert.deepEqual(patients.map(patient => patient.patient_tag), ['red-old', 'red-new', 'yellow-old']);
    const updated = await IncidentPatient.findOneAndUpdate({ incident_id }, { sector: 'B' }, { sort, new: true });
    assert.equal(updated.patient_tag, 'red-old');
    const deleted = await IncidentPatient.findOneAndDelete({ incident_id }).sort(sort).lean();
    assert.equal(deleted.patient_tag, 'red-old');
    const next = await IncidentPatient.findOne({ incident_id }).sort('triage_category -createdAt').lean();
    assert.equal(next.patient_tag, 'red-new');
  });

  await t.test('atomic OTP consumption and sorted claims preserve date and explicit ciphertext selection', async () => {
    const otp = await PatientOtp.create({ mobile: '9000000001', codeHash: 'hash', expiresAt: new Date(Date.now() + 60_000) });
    assert.ok((await PatientOtp.findById(otp._id)).expiresAt instanceof Date);
    const results = await Promise.all(Array.from({ length: 3 }, () => PatientOtp.findOneAndUpdate({ _id: otp._id, usedAt: null, expiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date() } })));
    assert.equal(results.filter(Boolean).length, 1);
    const job = await SmsJob.create({ otpId: otp._id, keyFingerprint: 'key', expiresAt: otp.expiresAt, encryptedPayload: 'ciphertext' });
    const claim = await SmsJob.findOneAndUpdate({ status: 'queued' }, { $set: { status: 'claimed', claimedAt: new Date() }, $unset: { encryptedPayload: 1 } }, { sort: { createdAt: 1 }, new: false }).select('+encryptedPayload').lean();
    assert.equal(claim.encryptedPayload, 'ciphertext');
    assert.equal((await SmsJob.findById(job._id).select('+encryptedPayload')).encryptedPayload, undefined);
  });

  await t.test('bulk upserts and clinical maps retain model behavior', async () => {
    const id = createId();
    const result = await AlertAck.bulkWrite(['alert-1', 'alert-1', 'alert-2'].map(alertId => ({ updateOne: { filter: { userId: id, alertId }, update: { $setOnInsert: { userId: id, alertId } }, upsert: true } })));
    assert.equal(result.acknowledged, true);
    assert.equal(await AlertAck.countDocuments({ userId: id }), 2);
    const run = await ClusterResult.create({ datasetId: createId(), algorithm: 'kmeans', patients: [{ patient_id: 'P1', gmm_probabilities: [0.5], numericFeatures: { glucose: '123' } }] });
    assert.equal(run.patients[0].numericFeatures.glucose, 123);
    assert.deepEqual(run.riskDistribution, { Low: 0, Moderate: 0, High: 0, Critical: 0, Noise: 0, Unknown: 0 });
    await run.deleteOne();
    assert.equal(await ClusterResult.findById(run._id), null);
  });

  await t.test('database and missing-schema errors are sanitized', async () => {
    await assert.rejects(() => rpc('missing_rpc', { secret: 'do-not-expose' }), error => error.status === 503 && !error.message.includes('do-not-expose'));
    await database.sql.exec('DROP FUNCTION public.mc_find(text,jsonb,jsonb,integer,integer)');
    await assert.rejects(() => User.findOne(), error => error.status === 503 && !error.message.includes('SELECT'));
  });
});

test('Supabase rejects public credentials and IDs use a fixed opaque format', () => {
  assert.ok(isValidId(createId()));
  assert.equal(isValidId('not-an-id'), false);
  assert.equal(isValidId(null), false);
  const previous = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY };
  try {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    delete process.env.SUPABASE_SECRET_KEY;
    for (const url of ['http://example.supabase.co', 'https://example.supabase.co/credential-path', 'https://user:password@example.supabase.co']) {
      process.env.SUPABASE_URL = url;
      assert.throws(getConfig, error => error.status === 503);
    }
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_publishable_public';
    assert.throws(getConfig, error => error.status === 503);
    process.env.SUPABASE_SERVICE_ROLE_KEY = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.signature`;
    assert.throws(getConfig, error => error.status === 503);
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_backend';
    assert.equal(getConfig().serviceRoleKey, 'sb_secret_backend');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});


test('Supabase transport uses backend headers, rejects redirects and supports cancellation', async t => {
  const { createServer } = require('node:http');
  const requests = [];
  const server = createServer((req, res) => {
    requests.push({ path: req.url, headers: req.headers });
    if (req.url === '/redirect') { res.writeHead(302, { location: '/destination' }).end(); return; }
    if (req.url === '/slow') return;
    res.writeHead(200).end('ok');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const previous = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY };
  try {
    process.env.SUPABASE_URL = `http://127.0.0.1:${server.address().port}`;
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_backend';
    const response = await request('/headers', { method: 'POST', body: Buffer.from('file'), headers: { 'content-type': 'image/png' } });
    assert.equal(await response.text(), 'ok');
    assert.equal(requests[0].headers.apikey, 'sb_secret_backend');
    assert.equal(requests[0].headers.authorization, undefined);
    assert.equal(requests[0].headers['content-type'], 'image/png');
    delete process.env.SUPABASE_SECRET_KEY;
    const jwt = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = jwt;
    await request('/legacy');
    assert.equal(requests[1].headers.authorization, `Bearer ${jwt}`);
    await assert.rejects(() => request('/redirect'), error => error.status === 503);
    assert.equal(requests.some(item => item.path === '/destination'), false);
    await assert.rejects(() => request('/slow', { timeoutMs: 25 }), error => error.status === 503);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(() => request('/slow', { signal: controller.signal }), error => error.status === 503);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
