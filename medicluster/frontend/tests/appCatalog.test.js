import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAppCatalog } from '../src/data/appCatalog.js';

test('gives every role its own destination and patients and crews their own Android downloads', () => {
  const apps = buildAppCatalog('https://dispatch.example.com/');
  assert.deepEqual(apps.map(a => a.id), ['medicluster', 'patient', 'dispatch', 'crew']);
  assert.equal(apps[0].webHref, '/login');
  assert.equal(apps[1].webHref, '/app');
  assert.equal(apps[2].webHref, 'https://dispatch.example.com/#/login');
  assert.equal(apps[3].webHref, 'https://dispatch.example.com/#/driver/login');
  assert.deepEqual(apps.filter(a => a.android).map(a => a.id), ['patient', 'crew']);
});

test('production never directs visitors to localhost, insecure sites, or injected schemes', () => {
  for (const url of ['', undefined, 'http://localhost:5174', 'https://localhost', 'https://localhost.', 'https://clinic.localhost', 'https://[::1]', 'https://0.0.0.0', 'https://127.0.0.1', 'http://dispatch.example.com', 'javascript:alert(1)', 'https://user:pass@dispatch.example.com', 'broken']) {
    const apps = buildAppCatalog(url);
    assert.equal(apps[2].webHref, null, String(url));
    assert.equal(apps[3].webHref, null, String(url));
    assert.equal(apps[0].webHref, '/login');
  }
});

test('normalizes a pasted dispatch login URL and supports explicit local development', () => {
  const apps = buildAppCatalog('https://dispatch.example.com/#/login');
  assert.equal(apps[3].webHref, 'https://dispatch.example.com/#/driver/login');
  const local = buildAppCatalog('http://localhost:5174', { allowLocal: true });
  assert.equal(local[2].webHref, 'http://localhost:5174/#/login');
});
