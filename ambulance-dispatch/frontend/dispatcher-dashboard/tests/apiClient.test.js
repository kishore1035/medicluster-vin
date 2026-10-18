import test from 'node:test';
import assert from 'node:assert/strict';
import { AxiosError } from 'axios';
import { createApiClient, resolveApiUrl } from '../src/services/apiClient.js';

test('deployment URLs use same origin by default and reject unsafe production hosts', () => {
  assert.equal(resolveApiUrl(undefined, true), '/api');
  assert.equal(resolveApiUrl('https://dispatch.example/api/', true), 'https://dispatch.example/api');
  for (const url of ['http://localhost:3000/api', 'https://127.0.0.1/api', 'ftp://host/api', 'https://user:pass@host/api']) {
    assert.throws(() => resolveApiUrl(url, true));
  }
});

test('each API request obtains current Supabase access token', async () => {
  let token = 'first';
  const observed = [];
  const api = createApiClient({ baseURL: '/api', auth: {
    getSession: async () => ({ data: { session: { access_token: token } } }),
  }, adapter: async config => {
    observed.push(config.headers.Authorization);
    return { data: [], status: 200, headers: {}, config };
  } });
  await api.get('/incidents');
  token = 'refreshed';
  await api.get('/ambulances');
  assert.deepEqual(observed, ['Bearer first', 'Bearer refreshed']);
});

for (const status of [401, 403, 503]) {
  test(`API ${status} only invalidates authentication for 401`, async () => {
    let signouts = 0;
    const location = { hash: '#/dashboard' };
    const api = createApiClient({ baseURL: '/api', location, auth: {
      getSession: async () => ({ data: { session: { access_token: 'session' } } }),
      signOut: async options => { assert.equal(options.scope, 'local'); signouts++; },
    }, adapter: async config => { throw new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, { status }); } });
    await assert.rejects(api.get('/incidents'));
    assert.equal(signouts, status === 401 ? 1 : 0);
    assert.equal(location.hash, status === 401 ? '/login' : '#/dashboard');
  });
}

test('delayed 401 does not invalidate a newer session', async () => {
  let token = 'old';
  let signouts = 0;
  const api = createApiClient({ auth: {
    getSession: async () => ({ data: { session: { access_token: token } } }),
    signOut: async () => { signouts++; },
  }, adapter: async config => {
    token = 'new';
    throw new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, { status: 401 });
  } });
  await assert.rejects(api.get('/incidents'));
  assert.equal(signouts, 0);
});

test('missing Supabase session blocks network requests', async () => {
  let requested = false;
  const api = createApiClient({ auth: { getSession: async () => ({ data: { session: null } }) }, adapter: async () => { requested = true; } });
  await assert.rejects(api.get('/incidents'), /Sign in/);
  assert.equal(requested, false);
});
