import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function listen(server, t) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('separate frontend forwards API bodies, credentials, redirects and binary downloads while serving client routes', async t => {
  const { createFrontendApp } = await import('../server.js');
  const distDir = await mkdtemp(path.join(tmpdir(), 'medicluster-frontend-'));
  t.after(() => rm(distDir, { recursive: true, force: true }));
  await writeFile(path.join(distDir, 'index.html'), '<html>Patient portal</html>');
  const backend = http.createServer(async (req, res) => {
    if (req.url === '/api/patient-auth/google/start?platform=web') {
      res.writeHead(302, { location: 'https://accounts.google.com/test', 'set-cookie': 'state=proof; HttpOnly; Secure; SameSite=Lax; Path=/api/patient-auth' });
      return res.end();
    }
    if (req.url === '/api/patient-installer' && req.method === 'POST') {
      res.writeHead(200, { 'content-type': 'application/vnd.android.package-archive' });
      return res.end(Buffer.from([0, 255, 12, 128]));
    }
    if (req.url === '/api/missing') {
      res.writeHead(404, { 'content-type': 'application/json' });
      return res.end('{"error":"missing"}');
    }
    let body = '';
    for await (const chunk of req) body += chunk;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ path: req.url, method: req.method, authorization: req.headers.authorization, cookie: req.headers.cookie, body }));
  });
  const backendUrl = await listen(backend, t);
  const frontendUrl = await listen(http.createServer(createFrontendApp({ backendUrl, distDir })), t);
  const result = await fetch(`${frontendUrl}/api/auth/login?from=web`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer staff-token', cookie: 'state=proof' },
    body: '{"email":"staff@example.com"}',
  });
  assert.deepEqual(await result.json(), {
    path: '/api/auth/login?from=web', method: 'POST', authorization: 'Bearer staff-token', cookie: 'state=proof', body: '{"email":"staff@example.com"}',
  });
  const google = await fetch(`${frontendUrl}/api/patient-auth/google/start?platform=web`, { redirect: 'manual' });
  assert.equal(google.status, 302);
  assert.equal(google.headers.get('location'), 'https://accounts.google.com/test');
  assert.match(google.headers.get('set-cookie'), /state=proof/);
  const apk = await fetch(`${frontendUrl}/api/patient-installer`, { method: 'POST' });
  assert.equal(apk.headers.get('content-type'), 'application/vnd.android.package-archive');
  assert.deepEqual(Buffer.from(await apk.arrayBuffer()), Buffer.from([0, 255, 12, 128]));
  const missing = await fetch(`${frontendUrl}/api/missing`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: 'missing' });
  assert.equal(await (await fetch(`${frontendUrl}/app`)).text(), '<html>Patient portal</html>');
});

test('unreachable backend returns JSON 502 rather than frontend HTML', async t => {
  const { createFrontendApp } = await import('../server.js');
  const closed = http.createServer();
  await new Promise(resolve => closed.listen(0, '127.0.0.1', resolve));
  const backendUrl = `http://127.0.0.1:${closed.address().port}`;
  await new Promise(resolve => closed.close(resolve));
  const frontendUrl = await listen(http.createServer(createFrontendApp({ backendUrl })), t);
  const response = await fetch(`${frontendUrl}/api/health`);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'Backend temporarily unavailable. Please try again shortly.' });
});
