const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const { createTestDatabase } = require('./helpers/supabaseTestDb');
const { createId } = require('../db/ids');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const PatientProfile = require('../models/PatientProfile');
const patientRoutes = require('../routes/patientAuthRoutes');
const { signToken, signPatientToken } = require('../middleware/auth');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const challenge = value => crypto.createHash('sha256').update(value).digest('base64url');

test('patient email and Google identity integration', async (t) => {
  const settings = {
    EMAILJS_SERVICE_ID: 'test-service', EMAILJS_TEMPLATE_ID: 'test-template', EMAILJS_PUBLIC_KEY: 'test-public',
    EMAILJS_PRIVATE_KEY: 'test-private', GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'test-google-secret', PATIENT_PUBLIC_ORIGIN: 'http://localhost:3000',
    JWT_SECRET: 'test-patient-secret-with-more-than-32-characters',
  };
  const previous = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  Object.assign(process.env, settings);
  const database = await createTestDatabase(t);
  t.after(async () => {
    for (const key of Object.keys(settings)) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  });
  await PatientProfile.create({ patientId: 'EMAIL-1', name: 'vinaygk', mobile: '9000000010', email: 'vinaygk219@gmail.com' });
  const app = express();
  app.use(express.json());
  app.use('/api/patient-auth', patientRoutes);
  app.use('/api/patient-app', require('../routes/patientAppRoutes'));
  app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}/api/patient-auth`;
  const post = async (route, body) => {
    const response = await fetch(origin + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const emails = [];
  let providerFailure = false;
  t.mock.method(axios, 'post', async (url, body) => {
    if (providerFailure) throw new Error('private-provider-secret-and-otp-must-not-leak');
    emails.push({ url, body }); return { status: 200, data: 'OK' };
  });

  const configResponse = await fetch(origin + '/config');
  assert.equal(configResponse.status, 200);
  const config = await configResponse.json();
  assert.equal(config.email, true);
  assert.equal(config.google, true);
  assert.equal(JSON.stringify(config).includes('test-private'), false);

  await t.test('SMS availability preserves local log-only mode while production rejects it', async () => {
    const keys = ['OTP_DELIVERY_MODE', 'OTP_DEV_LOG', 'NODE_ENV'];
    const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
    try {
      process.env.OTP_DELIVERY_MODE = 'disabled';
      process.env.OTP_DEV_LOG = 'true';
      process.env.NODE_ENV = 'development';
      assert.equal((await (await fetch(origin + '/config')).json()).sms, true);
      process.env.NODE_ENV = 'production';
      assert.equal((await (await fetch(origin + '/config')).json()).sms, false);
    } finally {
      for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
    }
  });

  await t.test('email code uses EmailJS template variables and a hashed one-use challenge', async () => {
    const result = await post('/request-email-code', { email: ' VINAYGK219@gmail.com ' });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(emails.length, 1);
    assert.equal(emails[0].url, 'https://api.emailjs.com/api/v1.0/email/send');
    const params = emails[0].body.template_params;
    assert.equal(params.email, 'vinaygk219@gmail.com');
    assert.match(params.passcode, /^\d{6}$/);
    assert.ok(params.time);
    assert.equal(emails[0].body.accessToken, 'test-private');
    assert.equal(result.body.code, undefined);
    const stored = await database.collection('patientemailotps').findOne({ email: 'vinaygk219@gmail.com' });
    assert.match(stored.codeHash, /^\$2/);
    assert.equal(stored.code, undefined);
    assert.ok(stored.expiresAt - stored.createdAt <= 5 * 60_000 + 1000);
    const results = await Promise.all(Array.from({ length: 2 }, () => post('/verify-email', { email: params.email, code: params.passcode })));
    assert.deepEqual(results.map(result => result.status).sort(), [200, 401]);
    const success = results.find(result => result.status === 200).body;
    assert.equal(success.patientId, 'EMAIL-1');
    assert.equal(jwt.verify(success.token, settings.JWT_SECRET).kind, 'patient');
  });

  await t.test('unknown addresses receive generic reply without sending email or creating patient', async () => {
    const count = emails.length;
    const result = await post('/request-email-code', { email: 'unlinked@gmail.com' });
    assert.equal(result.status, 200);
    assert.equal(emails.length, count);
    assert.equal(await PatientProfile.countDocuments({ email: 'unlinked@gmail.com' }), 0);
    assert.equal((await post('/request-email-code', { email: 'invalid-email' })).status, 400);
  });

  await t.test('concurrent email requests cannot bypass resend cooldown', async () => {
    await PatientProfile.create({ patientId: 'EMAIL-2', email: 'second@gmail.com' });
    const results = await Promise.all(Array.from({ length: 4 }, () => post('/request-email-code', { email: 'second@gmail.com' })));
    assert.deepEqual(results.map(result => result.status).sort(), [200, 429, 429, 429]);
  });

  await t.test('missing provider configuration fails honestly without logging or pretending to send', async () => {
    delete process.env.EMAILJS_SERVICE_ID;
    assert.equal((await post('/request-email-code', { email: 'vinaygk219@gmail.com' })).status, 503);
    process.env.EMAILJS_SERVICE_ID = settings.EMAILJS_SERVICE_ID;
  });

  await t.test('provider failure never reports success or leaves usable OTP', async () => {
    await PatientProfile.create({ patientId: 'EMAIL-FAILED', email: 'failure@gmail.com' });
    providerFailure = true;
    try {
      const result = await post('/request-email-code', { email: 'failure@gmail.com' });
      assert.equal(result.status, 502);
      assert.equal(JSON.stringify(result.body).includes('private-provider-secret'), false);
      assert.equal(await database.collection('patientemailotps').countDocuments({ email: 'failure@gmail.com' }), 0);
    } finally { providerFailure = false; }
  });

  await t.test('hourly request cap survives OTP expiration and cleanup', async () => {
    const now = Date.now();
    await database.collection('patientauthlimits').insertOne({ _id: `email:${hash('limited@gmail.com')}`,
      requests: [1, 2, 3, 4, 5].map(minutes => new Date(now - minutes * 60_000)), expiresAt: new Date(now + 60 * 60_000) });
    assert.equal((await post('/request-email-code', { email: 'limited@gmail.com' })).status, 429);
  });

  await t.test('expired email codes and codes with five wrong guesses cannot issue sessions', async () => {
    const EmailOtp = require('../models/PatientEmailOtp');
    const email = 'denials@gmail.com';
    await PatientProfile.create({ patientId: 'EMAIL-DENIAL', email });
    const codeHash = await bcrypt.hash('111222', 4);
    await EmailOtp.create({ email, codeHash, expiresAt: new Date(Date.now() - 1000) });
    assert.equal((await post('/verify-email', { email, code: '111222' })).status, 401);
    await EmailOtp.create({ email, codeHash, expiresAt: new Date(Date.now() + 60_000) });
    for (let attempt = 0; attempt < 5; attempt++) assert.equal((await post('/verify-email', { email, code: '000000' })).status, 401);
    const result = await post('/verify-email', { email, code: '111222' });
    assert.equal(result.status, 429);
    assert.equal(result.body.token, undefined);
  });

  let googleCalls = 0;
  let providerClaims;
  let expectedProviderVerifier;
  let rejectIdentity = false;
  t.mock.method(OAuth2Client.prototype, 'getToken', async options => {
    assert.equal(options.codeVerifier, expectedProviderVerifier);
    assert.equal(options.code, 'provider-code');
    googleCalls++; return { tokens: { id_token: 'verified-provider-token' } };
  });
  t.mock.method(OAuth2Client.prototype, 'verifyIdToken', async options => {
    if (rejectIdentity) throw new Error('Invalid ID token signature');
    assert.equal(options.audience, settings.GOOGLE_CLIENT_ID);
    assert.equal(options.idToken, 'verified-provider-token');
    return { getPayload: () => providerClaims };
  });

  async function beginGoogle(platform = 'web') {
    const verifier = crypto.randomBytes(32).toString('hex');
    const response = await fetch(`${origin}/google/start?platform=${platform}&handoff_challenge=${challenge(verifier)}`, { redirect: 'manual' });
    assert.equal(response.status, 302);
    const destination = new URL(response.headers.get('location'));
    assert.equal(destination.origin, 'https://accounts.google.com');
    assert.equal(destination.searchParams.get('redirect_uri'), 'http://localhost:3000/api/patient-auth/google/callback');
    assert.equal(destination.searchParams.get('code_challenge_method'), 'S256');
    const state = destination.searchParams.get('state');
    const flow = await database.collection('patientgoogleflows').findOne({ _id: hash(state) });
    assert.ok(flow);
    expectedProviderVerifier = flow.providerVerifier;
    providerClaims = { sub: 'google-subject-1', email: 'vinaygk219@gmail.com', email_verified: true, nonce: flow.nonce };
    return { verifier, state, cookie: response.headers.get('set-cookie').split(';')[0], flow };
  }

  await t.test('Google state is browser-bound and handoff requires proof then consumes ticket once', async () => {
    const flow = await beginGoogle();
    const foreign = await fetch(`${origin}/google/callback?state=${flow.state}&code=provider-code`, { redirect: 'manual' });
    assert.equal(new URL(foreign.headers.get('location')).searchParams.get('auth_error'), 'google_failed');
    assert.equal(googleCalls, 0);
    const callback = await fetch(`${origin}/google/callback?state=${flow.state}&code=provider-code`, { headers: { Cookie: flow.cookie }, redirect: 'manual' });
    const destination = new URL(callback.headers.get('location'));
    assert.equal(destination.origin, 'http://localhost:3000');
    assert.equal(destination.pathname, '/app');
    const code = destination.searchParams.get('patient_auth_code');
    assert.match(code, /^[a-f0-9]{64}$/);
    assert.equal(destination.searchParams.has('token'), false);
    assert.equal((await post('/google/exchange', { code, verifier: 'wrong'.repeat(16) })).status, 401);
    const results = await Promise.all(Array.from({ length: 2 }, () => post('/google/exchange', { code, verifier: flow.verifier })));
    assert.deepEqual(results.map(result => result.status).sort(), [200, 401]);
    assert.equal(results.find(result => result.status === 200).body.patientId, 'EMAIL-1');
    assert.equal((await PatientProfile.findOne({ patientId: 'EMAIL-1' }).select('+googleSubject')).googleSubject, 'google-subject-1');
    const replay = await fetch(`${origin}/google/callback?state=${flow.state}&code=provider-code`, { headers: { Cookie: flow.cookie }, redirect: 'manual' });
    assert.equal(new URL(replay.headers.get('location')).searchParams.get('auth_error'), 'google_failed');
  });

  await t.test('Google nonce mismatch never creates a patient session', async () => {
    const flow = await beginGoogle();
    providerClaims.nonce = 'wrong-nonce';
    const callback = await fetch(`${origin}/google/callback?state=${flow.state}&code=provider-code`, { headers: { Cookie: flow.cookie }, redirect: 'manual' });
    assert.equal(new URL(callback.headers.get('location')).searchParams.get('auth_error'), 'google_failed');
  });

  await t.test('Android callback contains only one-time code and maps to fixed app return', async () => {
    const flow = await beginGoogle('android');
    const callback = await fetch(`${origin}/google/callback?state=${flow.state}&code=provider-code`, { headers: { Cookie: flow.cookie }, redirect: 'manual' });
    const destination = new URL(callback.headers.get('location'));
    assert.equal(destination.protocol, 'mediclusterpatient:');
    assert.equal(destination.hostname, 'google-return');
    assert.match(destination.searchParams.get('code'), /^[a-f0-9]{64}$/);
    assert.equal(destination.searchParams.has('token'), false);
  });

  await t.test('unlinked or unverified Google identities never gain patient access', async () => {
    for (const [identity, reason] of [
      [{ sub: 'unlinked-sub', email: 'unlinked@gmail.com' }, 'patient_not_linked'],
      [{ sub: 'unverified-sub', email_verified: false }, 'google_email_unverified'],
      [{ sub: 'external-sub', email: 'patient@external.example' }, 'google_email_not_authoritative'],
    ]) {
      const flow = await beginGoogle();
      Object.assign(providerClaims, identity);
      const callback = await fetch(`${origin}/google/callback?state=${flow.state}&code=provider-code`, { headers: { Cookie: flow.cookie }, redirect: 'manual' });
      assert.equal(new URL(callback.headers.get('location')).searchParams.get('auth_error'), reason);
    }
  });

  await t.test('invalid provider token and expired handoff cannot issue session', async () => {
    const flow = await beginGoogle();
    rejectIdentity = true;
    const rejected = await fetch(`${origin}/google/callback?state=${flow.state}&code=provider-code`, { headers: { Cookie: flow.cookie }, redirect: 'manual' });
    rejectIdentity = false;
    assert.equal(new URL(rejected.headers.get('location')).searchParams.get('auth_error'), 'google_failed');
    const code = crypto.randomBytes(32).toString('hex');
    await database.collection('patientloginexchanges').insertOne({ _id: hash(code), patientId: 'EMAIL-1', challenge: challenge(flow.verifier), expiresAt: new Date(Date.now() - 1000) });
    assert.equal((await post('/google/exchange', { code, verifier: flow.verifier })).status, 401);
  });

  await t.test('only clinicians link patient email and relinking clears prior Google identity', async () => {
    const url = `http://127.0.0.1:${server.address().port}/api/patient-app/EMAIL-1/profile`;
    const save = async (token, email) => {
      const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ email }) });
      return { status: response.status, body: await response.json() };
    };
    await save(signPatientToken('EMAIL-1'), 'attacker@gmail.com');
    assert.equal((await PatientProfile.findOne({ patientId: 'EMAIL-1' })).email, 'vinaygk219@gmail.com');
    const clinician = signToken({ _id: createId() });
    const result = await save(clinician, 'changed@gmail.com');
    assert.equal(result.status, 200);
    assert.equal(result.body.email, 'changed@gmail.com');
    assert.equal((await PatientProfile.findOne({ patientId: 'EMAIL-1' }).select('+googleSubject')).googleSubject, undefined);
  });
});
