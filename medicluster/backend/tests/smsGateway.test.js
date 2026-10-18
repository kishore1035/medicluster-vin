const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const PatientProfile = require('../models/PatientProfile');
const PatientOtp = require('../models/PatientOtp');
const patientRoutes = require('../routes/patientAuthRoutes');

test('Android delivery queues an encrypted OTP that existing verification accepts', async (t) => {
  // Break caught: falling through to log-only delivery instead of enqueueing real SMS.
  const previous = { ...process.env };
  process.env.OTP_DELIVERY_MODE = 'android';
  process.env.OTP_DEV_LOG = 'false';
  process.env.SMS_GATEWAY_TOKEN = 'test-gateway-token-with-at-least-32-characters';
  process.env.JWT_SECRET = 'test-jwt-secret-with-at-least-32-characters';
  await mongoose.connect(`mongodb://127.0.0.1:27017/medicluster_sms_test_${process.pid}`, { serverSelectionTimeoutMS: 3000 });
  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    for (const key of ['OTP_DELIVERY_MODE', 'OTP_DEV_LOG', 'SMS_GATEWAY_TOKEN', 'JWT_SECRET']) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  });
  await PatientProfile.create({ patientId: 'TEST-OTP', name: 'Test Patient', mobile: '9000000001' });
  const key = crypto.createHash('sha256').update(process.env.SMS_GATEWAY_TOKEN).digest();
  const fingerprint = crypto.createHash('sha256').update(key).digest('hex');
  await mongoose.connection.collection('smsgatewaystates').insertOne({ _id: 'phone', keyFingerprint: fingerprint, lastSeenAt: new Date() });
  const app = express();
  app.use(express.json());
  app.use('/api/patient-auth', patientRoutes);
  app.use('/api/sms-gateway', require('../routes/smsGatewayRoutes'));
  app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${origin}/api/patient-auth/request-code`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mobile: '9000000001' }),
  });
  assert.equal(response.status, 200, JSON.stringify(await response.json()));
  const jobs = await mongoose.connection.collection('smsjobs').find().toArray();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].status, 'queued');
  assert.equal(jobs[0].message, undefined);
  assert.equal(jobs[0].code, undefined);
  assert.ok(jobs[0].encryptedPayload);
  const storedOtp = await PatientOtp.findOne({ mobile: '9000000001' }).lean();
  assert.ok(storedOtp);
  assert.match(storedOtp.codeHash, /^\$2/);
  assert.equal(jobs[0].expiresAt.getTime(), storedOtp.expiresAt.getTime());

  const post = async (path, body = {}, authorization = `Bearer ${process.env.SMS_GATEWAY_TOKEN}`) => {
    const res = await fetch(`${origin}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: authorization }, body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  await t.test('heartbeat keeps busy sender online without claiming another SMS', async () => {
    await mongoose.connection.collection('smsgatewaystates').updateOne({ _id: 'phone' }, { $set: { lastSeenAt: new Date(Date.now() - 60_000) } });
    assert.equal((await post('/api/sms-gateway/heartbeat')).status, 200);
    const state = await mongoose.connection.collection('smsgatewaystates').findOne({ _id: 'phone' });
    assert.ok(state.lastSeenAt.getTime() > Date.now() - 5000);
    assert.equal((await mongoose.connection.collection('smsjobs').findOne({ _id: jobs[0]._id })).status, 'queued');
    assert.equal((await post('/api/sms-gateway/heartbeat', {}, 'Bearer wrong-key')).status, 401);
  });
  await t.test('sender endpoints reject missing, wrong, or non-Bearer keys without exposing jobs', async () => {
    for (const credential of ['', 'Bearer wrong-key', process.env.SMS_GATEWAY_TOKEN]) {
      const result = await post('/api/sms-gateway/claim', {}, credential);
      assert.equal(result.status, 401);
      assert.equal(result.body.job, undefined);
    }
  });

  let claimed;
  await t.test('parallel claims return each SMS once and erase queued message contents', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => post('/api/sms-gateway/claim')));
    assert.ok(results.every(result => result.status === 200));
    const claimedJobs = results.map(result => result.body.job).filter(Boolean);
    assert.equal(claimedJobs.length, 1);
    claimed = claimedJobs[0];
    assert.equal(claimed.mobile, '+919000000001');
    const code = claimed.message.match(/\b(\d{6})\b/)[1];
    assert.equal(await bcrypt.compare(code, storedOtp.codeHash), true);
    const updated = await mongoose.connection.collection('smsjobs').findOne({ _id: jobs[0]._id });
    assert.equal(updated.status, 'claimed');
    assert.equal(updated.encryptedPayload, undefined);
    assert.equal((await post('/api/sms-gateway/claim')).body.job, null);
  });

  await t.test('result reports are idempotent and cannot overwrite completed results', async () => {
    assert.equal((await post(`/api/sms-gateway/jobs/${claimed.id}/result`, { status: 'sent' })).status, 200);
    assert.equal((await post(`/api/sms-gateway/jobs/${claimed.id}/result`, { status: 'sent' })).status, 200);
    assert.equal((await post(`/api/sms-gateway/jobs/${claimed.id}/result`, { status: 'failed' })).status, 409);
    assert.equal((await post('/api/sms-gateway/jobs/not-an-id/result', { status: 'sent' })).status, 400);
  });

  await t.test('parallel OTP verification issues only one session', async () => {
    const code = claimed.message.match(/\b(\d{6})\b/)[1];
    const results = await Promise.all(Array.from({ length: 2 }, () => post('/api/patient-auth/verify', { mobile: '9000000001', code })));
    assert.deepEqual(results.map(result => result.status).sort(), [200, 401]);
    const success = results.find(result => result.status === 200).body;
    assert.equal(success.patientId, 'TEST-OTP');
    assert.ok(success.token);
    assert.equal((await post('/api/patient-auth/verify', { mobile: '9000000001', code })).status, 401);
  });

  await t.test('expired or already-used codes are never sent', async () => {
    const source = { ...jobs[0] };
    delete source._id;
    await mongoose.connection.collection('smsjobs').insertMany([
      { ...source, status: 'queued', expiresAt: new Date(Date.now() - 1000) },
      { ...source, status: 'queued', expiresAt: new Date(Date.now() + 60_000) },
    ]);
    assert.equal((await post('/api/sms-gateway/claim')).body.job, null);
  });

  await t.test('offline sender fails without leaving an unusable OTP or SMS job', async () => {
    await PatientProfile.create({ patientId: 'TEST-OFFLINE', mobile: '9000000002' });
    await mongoose.connection.collection('smsgatewaystates').updateOne({ _id: 'phone' }, { $set: { lastSeenAt: new Date(Date.now() - 60_000) } });
    const countBefore = await mongoose.connection.collection('smsjobs').countDocuments();
    const result = await post('/api/patient-auth/request-code', { mobile: '9000000002' });
    assert.equal(result.status, 503);
    assert.match(result.body.error, /offline/);
    assert.equal(await PatientOtp.countDocuments({ mobile: '9000000002' }), 0);
    assert.equal(await mongoose.connection.collection('smsjobs').countDocuments(), countBefore);
  });

  await t.test('resend cooldown still applies when using Android delivery', async () => {
    const result = await post('/api/patient-auth/request-code', { mobile: '9000000001' });
    assert.equal(result.status, 429);
  });

  await t.test('tampered ciphertext is discarded without exposing or sending a message', async () => {
    const otp = await PatientOtp.create({ mobile: '9000000001', codeHash: storedOtp.codeHash, expiresAt: new Date(Date.now() + 120_000) });
    const corrupt = { ...jobs[0], otpId: otp._id, encryptedPayload: Buffer.from('invalid ciphertext').toString('base64'), expiresAt: otp.expiresAt };
    delete corrupt._id;
    const inserted = await mongoose.connection.collection('smsjobs').insertOne(corrupt);
    assert.equal((await post('/api/sms-gateway/claim')).body.job, null);
    assert.equal((await mongoose.connection.collection('smsjobs').findOne({ _id: inserted.insertedId })).status, 'failed');
  });

  await t.test('rotating sender key invalidates previous heartbeat, credentials, and queued payloads', async () => {
    const otp = await PatientOtp.create({ mobile: '9000000001', codeHash: storedOtp.codeHash, expiresAt: new Date(Date.now() + 120_000) });
    const oldJob = { ...jobs[0], otpId: otp._id, expiresAt: otp.expiresAt };
    delete oldJob._id;
    await mongoose.connection.collection('smsjobs').insertOne(oldJob);
    const previousToken = process.env.SMS_GATEWAY_TOKEN;
    process.env.SMS_GATEWAY_TOKEN = 'rotated-test-token-with-at-least-32-characters';
    await PatientProfile.create({ patientId: 'TEST-ROTATED', mobile: '9000000003' });
    assert.equal((await post('/api/patient-auth/request-code', { mobile: '9000000003' })).status, 503);
    assert.equal((await post('/api/sms-gateway/claim', {}, `Bearer ${previousToken}`)).status, 401);
    assert.equal((await post('/api/sms-gateway/claim')).body.job, null);
  });

  await t.test('production rejects log-only OTP delivery', async () => {
    const previousMode = process.env.OTP_DELIVERY_MODE;
    const previousLog = process.env.OTP_DEV_LOG;
    const previousNodeEnv = process.env.NODE_ENV;
    try {
      process.env.OTP_DELIVERY_MODE = 'disabled';
      process.env.OTP_DEV_LOG = 'true';
      process.env.NODE_ENV = 'production';
      assert.equal((await post('/api/patient-auth/request-code', { mobile: '9000000003' })).status, 503);
      assert.equal(await PatientOtp.countDocuments({ mobile: '9000000003' }), 0);
      assert.equal((await post('/api/sms-gateway/claim')).status, 503);
    } finally {
      process.env.OTP_DELIVERY_MODE = previousMode;
      process.env.OTP_DEV_LOG = previousLog;
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
