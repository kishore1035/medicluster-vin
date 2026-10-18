import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createGoogleHandoff, consumeGoogleCallback, createGoogleCallbackTask, googleAuthError } from '../src/patient-app/patientAuth.js';
import * as patientAuth from '../src/patient-app/patientAuth.js';
import api, { getPatientAuthConfig, requestPatientEmailCode, verifyPatientEmailCode, exchangePatientGoogleCode } from '../src/api/apiClient.js';

function storageWith(value) {
  const items = new Map(value ? [['medicluster.patientGoogle.v1', JSON.stringify(value)]] : []);
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, val) => items.set(key, val), removeItem: (key) => items.delete(key) };
}

const verifier = '0123456789abcdef'.repeat(4);
const code = 'a'.repeat(64);

test('Google navigation sends only a SHA256 challenge and persists its verifier across browser switches', async () => {
  const storage = storageWith();
  const crypto = { getRandomValues: (bytes) => bytes.map((_, i) => i), subtle: webcrypto.subtle };
  const path = await createGoogleHandoff({ storage, crypto, now: 1000, platform: 'android' });
  assert.equal(path, '/api/patient-auth/google/start?handoff_challenge=bIbGqsX7JLz12ZOct9fVZFzjlBj0SeA7Ji3U-hS0uSs&platform=android');
  assert.deepEqual(JSON.parse(storage.getItem('medicluster.patientGoogle.v1')), {
    verifier: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f', createdAt: 1000,
  });
});

test('Google callback removes its one-time code before exchanging it and consumes stored proof', async () => {
  const storage = storageWith({ verifier, createdAt: 1000 });
  let cleaned = false;
  const session = { token: 'patient-session', patientId: 'patient-1', name: 'Asha' };
  const result = consumeGoogleCallback({
    location: { href: `https://clinic.example/app?keep=yes&patient_auth_code=${code}#today` },
    history: { state: { page: 1 }, replaceState: (state, _, path) => {
      assert.deepEqual(state, { page: 1 });
      assert.equal(path, '/app?keep=yes#today');
      cleaned = true;
    } }, storage, now: 2000,
    exchange: async (receivedCode, receivedVerifier) => {
      assert.equal(cleaned, true);
      assert.equal(receivedCode, code);
      assert.equal(receivedVerifier, verifier);
      assert.equal(storage.getItem('medicluster.patientGoogle.v1'), null);
      return session;
    },
  });
  assert.equal(cleaned, true);
  assert.deepEqual(await result, session);
});

test('expired, missing and malformed Google handoffs cannot exchange a code', async () => {
  for (const proof of [null, { verifier, createdAt: 0 }, { verifier: 'bad', createdAt: 601000 }, { verifier, createdAt: 700000 }]) {
    let calls = 0;
    await assert.rejects(consumeGoogleCallback({
      location: { href: `https://clinic.example/app?patient_auth_code=${code}` }, history: { replaceState() {} },
      storage: storageWith(proof), now: 601000, exchange: async () => { calls += 1; },
    }), /start.*Google.*again/i);
    assert.equal(calls, 0);
  }
});

test('Google cancellation clears the callback and proof and presents a readable message', async () => {
  const storage = storageWith({ verifier, createdAt: 1000 });
  let path;
  await assert.rejects(consumeGoogleCallback({
    location: { href: 'https://clinic.example/app?auth_error=google_cancelled' },
    history: { replaceState: (_, __, value) => { path = value; } }, storage,
    exchange: () => assert.fail('must not exchange cancelled login'),
  }), /cancelled/i);
  assert.equal(path, '/app');
  assert.equal(storage.getItem('medicluster.patientGoogle.v1'), null);
  for (const value of ['google_failed', 'patient_not_linked', 'google_email_unverified', 'google_email_not_authoritative', 'google_identity_conflict', 'google_not_configured', 'unexpected']) {
    assert.doesNotMatch(googleAuthError(value), /_/);
    assert.ok(googleAuthError(value).length > 20);
  }
});

test('ordinary patient URLs do not start an OAuth exchange', () => {
  assert.equal(consumeGoogleCallback({ location: { href: 'https://clinic.example/app?keep=yes' }, storage: storageWith() }), null);
});

test('effect resubscription shares one Google exchange and receives its eventual session', async () => {
  let exchanges = 0;
  let finish;
  const consume = createGoogleCallbackTask({
    location: { href: `https://clinic.example/app?patient_auth_code=${code}` },
    history: { replaceState() {} }, storage: storageWith({ verifier, createdAt: 1000 }), now: 2000,
    exchange: () => { exchanges += 1; return new Promise((resolve) => { finish = resolve; }); },
  });
  const first = consume();
  let firstActive = true;
  let firstDelivered = false;
  first.then(() => { if (firstActive) firstDelivered = true; });
  firstActive = false; // StrictMode cleans up the first effect subscriber.
  const second = consume();
  assert.equal(second, first);
  const session = { token: 'patient-session', patientId: 'patient-1', name: 'Asha' };
  finish(session);
  assert.deepEqual(await second, session);
  assert.equal(exchanges, 1);
  assert.equal(firstDelivered, false);
});

test('blocked storage prevents Google navigation with a useful recovery message', async () => {
  await assert.rejects(createGoogleHandoff({
    storage: { setItem() { throw new Error('blocked'); } }, crypto: webcrypto,
  }), /allow browser storage/i);
});

test('resuming interrupted Google navigation unlocks sign-in without deleting callback proof', async () => {
  const target = new EventTarget();
  const storage = storageWith({ verifier, createdAt: 1000 });
  let phase = 'outbound';
  const unsubscribe = patientAuth.subscribeGoogleSignInRecovery((update) => { phase = update(phase); }, target);
  target.dispatchEvent(new Event('medicluster:patient-resumed'));
  assert.equal(phase, 'idle');
  assert.deepEqual(JSON.parse(storage.getItem('medicluster.patientGoogle.v1')), { verifier, createdAt: 1000 });
  const session = { token: 'patient-session', patientId: 'patient-1', name: 'Asha' };
  assert.deepEqual(await consumeGoogleCallback({
    location: { href: `https://clinic.example/app?patient_auth_code=${code}` },
    history: { replaceState() {} }, storage, now: 2000, exchange: async () => session,
  }), session);
  unsubscribe();
  phase = 'outbound';
  target.dispatchEvent(new Event('medicluster:patient-resumed'));
  assert.equal(phase, 'outbound');
});

test('resume events keep an active Google callback exchange busy', () => {
  const target = new EventTarget();
  let phase = 'exchange';
  const unsubscribe = patientAuth.subscribeGoogleSignInRecovery((update) => { phase = update(phase); }, target);
  for (const event of ['medicluster:patient-resumed', 'pageshow', 'focus']) {
    target.dispatchEvent(new Event(event));
    assert.equal(phase, 'exchange');
  }
  unsubscribe();
});

test('patient email and Google requests follow the patient-only API contract', async () => {
  const previousWindow = globalThis.window;
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: storageWith(), configurable: true });
  globalThis.window = { location: { pathname: '/app' } };
  const oldAdapter = api.defaults.adapter;
  const requests = [];
  api.defaults.adapter = async (config) => {
    requests.push({ method: config.method, url: config.url, data: config.data ? JSON.parse(config.data) : undefined });
    return { data: { accepted: true }, status: 200, statusText: 'OK', headers: {}, config };
  };
  try {
    await getPatientAuthConfig();
    await requestPatientEmailCode('asha@example.com');
    await verifyPatientEmailCode('asha@example.com', '123456');
    await exchangePatientGoogleCode(code, verifier);
    assert.deepEqual(requests, [
      { method: 'get', url: '/patient-auth/config', data: undefined },
      { method: 'post', url: '/patient-auth/request-email-code', data: { email: 'asha@example.com' } },
      { method: 'post', url: '/patient-auth/verify-email', data: { email: 'asha@example.com', code: '123456' } },
      { method: 'post', url: '/patient-auth/google/exchange', data: { code, verifier } },
    ]);
  } finally {
    api.defaults.adapter = oldAdapter;
    globalThis.window = previousWindow;
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  }
});
